import type { NextConfig } from "next";

function backendApiBase(): string {
  const raw =
    process.env.BACKEND_INTERNAL_URL?.trim() ||
    process.env.NEXT_PUBLIC_API_BASE_URL?.trim() ||
    "http://127.0.0.1:4000/api";
  return raw.replace(/\/+$/, "");
}

const nextConfig: NextConfig = {
  reactCompiler: true,
  experimental: {
    // Windows: Turbopack's persistent `.next/dev` cache drops nested App
    // Router API routes after stop/restart, so `/api/db/preview` serves the
    // HTML 404 page and the DB UI fails with "Unexpected token '<'".
    turbopackFileSystemCacheForDev: false,
  },
  async rewrites() {
    const api = backendApiBase();
    // beforeFiles runs before App Router matching, so these still work when
    // Turbopack has not compiled (or has forgotten) the nested route files.
    return {
      beforeFiles: [
        { source: "/api/db/preview", destination: `${api}/db/preview` },
        { source: "/api/db/export", destination: `${api}/db/export` },
        { source: "/api/db/export-comb", destination: `${api}/db/export-comb` },
      ],
    };
  },
};

export default nextConfig;
