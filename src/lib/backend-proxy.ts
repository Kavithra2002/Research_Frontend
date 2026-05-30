import { NextRequest } from "next/server";

/**
 * When set (e.g. on Vercel), Python/SSE routes proxy to the Render backend
 * instead of spawning python locally.
 */
export function getBackendOrigin(): string | null {
  const explicit = process.env.BACKEND_PYTHON_URL?.trim();
  if (explicit) return explicit.replace(/\/$/, "");

  const api = process.env.BACKEND_INTERNAL_URL?.trim();
  if (api) return api.replace(/\/api\/?$/, "").replace(/\/$/, "");

  const pub = process.env.NEXT_PUBLIC_API_BASE_URL?.trim();
  if (pub) return pub.replace(/\/api\/?$/, "").replace(/\/$/, "");

  return null;
}

export function shouldProxyPythonToBackend(): boolean {
  if (process.env.PROXY_PYTHON_TO_BACKEND === "false") return false;
  if (process.env.PROXY_PYTHON_TO_BACKEND === "true") return true;
  // Default: proxy in production unless explicitly local-only
  return process.env.NODE_ENV === "production" && getBackendOrigin() !== null;
}

export async function proxyToBackend(
  request: NextRequest,
  backendPath: string,
): Promise<Response> {
  const origin = getBackendOrigin();
  if (!origin) {
    return new Response(
      JSON.stringify({
        error: "BACKEND_PYTHON_URL or NEXT_PUBLIC_API_BASE_URL is not configured",
      }),
      { status: 503, headers: { "Content-Type": "application/json" } },
    );
  }

  const url = new URL(backendPath, `${origin}/`);
  url.search = new URL(request.url).search;

  const headers = new Headers();
  const contentType = request.headers.get("content-type");
  if (contentType) headers.set("content-type", contentType);
  const cookie = request.headers.get("cookie");
  if (cookie) headers.set("cookie", cookie);

  const init: RequestInit = {
    method: request.method,
    headers,
    // @ts-expect-error duplex required for streaming body in Node 18+
    duplex: "half",
  };

  if (request.method !== "GET" && request.method !== "HEAD") {
    init.body = request.body;
  }

  return fetch(url, init);
}
