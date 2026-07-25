#!/usr/bin/env python3
"""Construye un índice RAG estático (BM25 + TF-IDF disperso) para Vercel.

Uso:
  python scripts/build_rag_index.py --pdf-dir ../proyecto_ley --output src/data/rag-index.json

El índice se genera offline. En producción no se procesan PDFs ni se escriben archivos.
"""
from __future__ import annotations

import argparse
import csv
import json
import math
import re
import unicodedata
from collections import Counter, defaultdict
from pathlib import Path
from typing import Iterable

import fitz  # PyMuPDF

STOPWORDS = {
    "a", "al", "algo", "algun", "alguna", "algunas", "alguno", "algunos", "ante", "antes",
    "como", "con", "contra", "cual", "cuando", "de", "del", "desde", "donde", "durante",
    "e", "el", "ella", "ellas", "ello", "ellos", "en", "entre", "era", "es", "esa", "esas",
    "ese", "eso", "esos", "esta", "estas", "este", "esto", "estos", "fue", "ha", "han", "hasta",
    "hay", "la", "las", "le", "les", "lo", "los", "mas", "me", "mi", "mis", "muy", "no",
    "nos", "o", "para", "pero", "por", "porque", "que", "se", "segun", "ser", "si", "sin",
    "sobre", "son", "su", "sus", "tambien", "te", "tiene", "tu", "un", "una", "uno", "unos",
    "y", "ya", "proyecto", "ley", "congreso", "republica", "peru", "articulo", "senor", "senora",
}

ARTICLE_RE = re.compile(
    r"(?im)(?=^(?:ART[IÍ]CULO|Artículo|Art\.)\s+(?:\d+|[IVXLCDM]+|ÚNICO|UNICO)[º°\.\-:]?\s*)"
)
PAGE_NOISE = [
    re.compile(r"(?im)^\s*CONGRESO\s*$"),
    re.compile(r"(?im)^\s*REP[ÚU]BLICA\s*$"),
    re.compile(r"(?im)^\s*www\.congreso\.gob\.pe.*$"),
    re.compile(r"(?im)^\s*Palacio Legislativo.*$"),
    re.compile(r"(?im)^\s*Central Telef[oó]nica.*$"),
    re.compile(r"(?im)^\s*Esta es una copia aut[eé]ntica.*$"),
]


def strip_accents(text: str) -> str:
    return "".join(c for c in unicodedata.normalize("NFD", text) if unicodedata.category(c) != "Mn")


def stem_es(token: str) -> str:
    # Stemmer ligero y determinista, replicado en TypeScript.
    if len(token) <= 4 or token.isdigit():
        return token
    suffixes = (
        "amientos", "imientos", "aciones", "uciones", "adoras", "adores", "ancias", "encias",
        "amiento", "imiento", "acion", "ucion", "mente", "idades", "idad", "ismos", "istas",
        "adora", "ador", "antes", "ancia", "encia", "icos", "icas", "ico", "ica", "osos", "osas",
        "oso", "osa", "amientos", "es", "s",
    )
    for suffix in suffixes:
        if token.endswith(suffix) and len(token) - len(suffix) >= 4:
            return token[: -len(suffix)]
    return token


def tokenize(text: str) -> list[str]:
    text = strip_accents(text.lower())
    raw = re.findall(r"[a-z0-9]+", text)
    words = [stem_es(t) for t in raw if len(t) > 1 and t not in STOPWORDS]
    # Unigramas + bigramas dispersos para preservar frases como "educacion superior".
    bigrams = [f"__{words[i]}_{words[i+1]}" for i in range(len(words) - 1)]
    return words + bigrams


def clean_text(text: str) -> str:
    text = text.replace("\u00ad", "").replace("\ufeff", "")
    for pattern in PAGE_NOISE:
        text = pattern.sub("", text)
    # Repara guiones de final de línea y espacios excesivos sin destruir párrafos.
    text = re.sub(r"(?<=\w)-\n(?=\w)", "", text)
    text = re.sub(r"[ \t]+", " ", text)
    text = re.sub(r"\n[ \t]+", "\n", text)
    text = re.sub(r"\n{3,}", "\n\n", text)
    return text.strip()


def fixed_chunks(text: str, target: int = 1300, overlap: int = 180) -> list[str]:
    text = text.strip()
    if not text:
        return []
    paragraphs = [p.strip() for p in re.split(r"\n\s*\n", text) if p.strip()]
    chunks: list[str] = []
    current = ""
    for paragraph in paragraphs:
        if len(paragraph) > target * 1.8:
            sentences = re.split(r"(?<=[.!?;:])\s+", paragraph)
        else:
            sentences = [paragraph]
        for unit in sentences:
            unit = unit.strip()
            if not unit:
                continue
            candidate = f"{current}\n{unit}".strip() if current else unit
            if current and len(candidate) > target:
                chunks.append(current.strip())
                tail = current[-overlap:] if overlap else ""
                current = f"{tail} {unit}".strip()
            else:
                current = candidate
    if current:
        chunks.append(current.strip())
    return [c for c in chunks if len(c) >= 80]


def article_aware_chunks(page_text: str) -> list[str]:
    parts = [p.strip() for p in ARTICLE_RE.split(page_text) if p.strip()]
    chunks: list[str] = []
    for part in parts:
        if len(part) <= 1700:
            chunks.append(part)
        else:
            chunks.extend(fixed_chunks(part))
    return [c for c in chunks if len(c) >= 80]


def load_index_csv(path: Path) -> dict[str, dict[str, str]]:
    rows: dict[str, dict[str, str]] = {}
    with path.open("r", encoding="utf-8-sig", newline="") as fh:
        for row in csv.DictReader(fh):
            numero = str(row.get("numero", "")).strip()
            rows[numero] = {k: (v or "").strip() for k, v in row.items()}
    return rows


def extract_pages(pdf_path: Path) -> list[str]:
    doc = fitz.open(pdf_path)
    pages: list[str] = []
    try:
        for page in doc:
            pages.append(clean_text(page.get_text("text", sort=True)))
    finally:
        doc.close()
    return pages


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--pdf-dir", required=True, type=Path)
    parser.add_argument("--output", required=True, type=Path)
    parser.add_argument("--processed-dir", type=Path)
    args = parser.parse_args()

    pdf_dir: Path = args.pdf_dir.resolve()
    metadata = load_index_csv(pdf_dir / "_indice.csv")
    chunks: list[dict] = []
    tf_by_chunk: list[Counter[str]] = []
    doc_frequency: Counter[str] = Counter()
    scanned_or_empty: list[str] = []

    processed_dir = args.processed_dir.resolve() if args.processed_dir else None
    if processed_dir:
        processed_dir.mkdir(parents=True, exist_ok=True)

    for pdf_path in sorted(pdf_dir.glob("PL_*.pdf")):
        numero = pdf_path.stem.replace("PL_", "")
        meta = metadata.get(numero, {})
        pages = extract_pages(pdf_path)
        extracted = "\n\n".join(p for p in pages if p).strip()

        page_chunks: list[tuple[int, str]] = []
        for page_no, page_text in enumerate(pages, start=1):
            if len(page_text) < 80:
                continue
            for piece in article_aware_chunks(page_text):
                page_chunks.append((page_no, piece))

        # Para PDFs escaneados o sin capa textual, conserva al menos metadata indexable.
        if not page_chunks:
            scanned_or_empty.append(f"PL_{numero}")
            fallback = "\n".join(
                x for x in [
                    meta.get("titulo", ""),
                    f"Autores: {meta.get('autores', '')}" if meta.get("autores") else "",
                    f"Estado: {meta.get('estado', '')}" if meta.get("estado") else "",
                ] if x
            )
            page_chunks = [(1, fallback or f"Proyecto de Ley {numero}")]
            extracted = fallback or f"Proyecto de Ley {numero}"

        if processed_dir:
            (processed_dir / f"PL_{numero}.txt").write_text(extracted, encoding="utf-8")

        for local_idx, (page_no, body) in enumerate(page_chunks, start=1):
            title = meta.get("titulo", "")
            authors = meta.get("autores", "")
            project = meta.get("proyecto", f"{numero}/2025-CR")
            # Título repetido 3 veces y autores 1 vez = boost de campo en el índice.
            indexable = f"{title} {title} {title} {authors} {meta.get('estado','')} {body}"
            terms = tokenize(indexable)
            tf = Counter(terms)
            chunk = {
                "id": f"PL_{numero}-p{page_no}-c{local_idx}",
                "numero": numero,
                "proyecto": project,
                "titulo": title,
                "fecha": meta.get("fecha", ""),
                "estado": meta.get("estado", ""),
                "autores": authors,
                "pagina": page_no,
                "texto": body[:2200],
                "length": max(1, len(terms)),
            }
            chunks.append(chunk)
            tf_by_chunk.append(tf)
            doc_frequency.update(tf.keys())

    n = len(chunks)
    avgdl = sum(c["length"] for c in chunks) / max(1, n)
    idf = {
        term: math.log(1 + (n - df + 0.5) / (df + 0.5))
        for term, df in doc_frequency.items()
    }

    postings: dict[str, list[list[int | float]]] = defaultdict(list)
    for idx, tf in enumerate(tf_by_chunk):
        norm_sq = 0.0
        for term, freq in tf.items():
            weight = (1 + math.log(freq)) * idf[term]
            norm_sq += weight * weight
            postings[term].append([idx, freq])
        chunks[idx]["norm"] = round(math.sqrt(norm_sq), 6)

    payload = {
        "version": 1,
        "retrieval": "BM25 + cosine TF-IDF disperso + boosts de metadata",
        "stats": {
            "documents": len(list(pdf_dir.glob("PL_*.pdf"))),
            "chunks": n,
            "avgdl": round(avgdl, 4),
            "scanned_or_empty": scanned_or_empty,
        },
        "chunks": chunks,
        "idf": {k: round(v, 7) for k, v in idf.items()},
        "postings": postings,
    }

    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(payload, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    print(json.dumps(payload["stats"], ensure_ascii=False, indent=2))
    print(f"Índice: {args.output} ({args.output.stat().st_size / 1024 / 1024:.2f} MB)")


if __name__ == "__main__":
    main()
