/** @type {import('next').NextConfig} */
const nextConfig = {
  outputFileTracingIncludes: {
    "/api/chat": ["./src/data/rag-index.json"],
    "/api/info": ["./src/data/rag-index.json"],
  },
};

module.exports = nextConfig;
