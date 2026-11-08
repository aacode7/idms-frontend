import { NextRequest } from "next/server";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

const apiOrigin = (process.env.IDMS_API_INTERNAL_URL ?? "http://api:8000").replace(/\/$/, "");
const requestTimeoutMs = 120_000;

function upstreamHeaders(request: NextRequest) {
  const headers = new Headers(request.headers);
  headers.delete("host");
  headers.delete("content-length");
  headers.delete("connection");
  return headers;
}

function responseHeaders(upstream: Response) {
  const headers = new Headers(upstream.headers);
  headers.delete("content-encoding");
  headers.delete("content-length");
  headers.delete("transfer-encoding");
  headers.delete("connection");
  return headers;
}

async function proxy(request: NextRequest, context: { params: Promise<{ path: string[] }> }) {
  const { path } = await context.params;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), requestTimeoutMs);
  const url = `${apiOrigin}/api/v1/${path.map(encodeURIComponent).join("/")}${request.nextUrl.search}`;
  const method = request.method.toUpperCase();

  try {
    const upstream = await fetch(url, {
      method,
      headers: upstreamHeaders(request),
      body: method === "GET" || method === "HEAD" ? undefined : await request.arrayBuffer(),
      cache: "no-store",
      redirect: "manual",
      signal: controller.signal,
    });
    return new Response(await upstream.arrayBuffer(), {
      status: upstream.status,
      headers: responseHeaders(upstream),
    });
  } catch (error) {
    const message = error instanceof Error && error.name === "AbortError"
      ? "The IDMS API took longer than two minutes to respond."
      : "The IDMS API could not be reached.";
    return Response.json({ detail: message }, { status: 504 });
  } finally {
    clearTimeout(timeout);
  }
}

export const GET = proxy;
export const POST = proxy;
export const PUT = proxy;
export const PATCH = proxy;
export const DELETE = proxy;
export const OPTIONS = proxy;
