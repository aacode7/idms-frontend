import { NextRequest } from "next/server";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

const apiOrigin = (
  process.env.IDMS_API_INTERNAL_URL ?? "http://api:8000"
).replace(/\/$/, "");
const requestTimeoutMs = 120_000;

function upstreamHeaders(request: NextRequest, requestId: string) {
  const headers = new Headers(request.headers);
  headers.delete("host");
  headers.delete("content-length");
  headers.delete("connection");
  // The API logs this ID, so a proxy failure and the API's log line can be matched.
  headers.set("x-request-id", requestId);
  return headers;
}

function logProxyFailure(fields: Record<string, string>) {
  // One JSON line, like the API's logs. Path only: query strings carry signed tokens.
  console.error(
    JSON.stringify({
      timestamp: new Date().toISOString(),
      level: "error",
      service: "idms-web",
      message: "api_proxy_failed",
      ...fields,
    }),
  );
}

function responseHeaders(upstream: Response) {
  const headers = new Headers(upstream.headers);
  headers.delete("content-encoding");
  headers.delete("content-length");
  headers.delete("transfer-encoding");
  headers.delete("connection");
  return headers;
}

function responseBody(upstream: Response): Promise<ArrayBuffer | null> {
  // The Fetch/Response contract forbids a body on these status codes. Passing
  // an empty ArrayBuffer for a successful DELETE (204) makes Next.js throw
  // while constructing the proxy response, which then looked like an API
  // outage even though the backend had already completed the deletion.
  if (
    upstream.status === 204 ||
    upstream.status === 205 ||
    upstream.status === 304
  ) {
    return Promise.resolve(null);
  }
  return upstream.arrayBuffer();
}

async function proxy(
  request: NextRequest,
  context: { params: Promise<{ path: string[] }> },
) {
  const { path } = await context.params;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), requestTimeoutMs);
  const url = `${apiOrigin}/api/v1/${path.map(encodeURIComponent).join("/")}${request.nextUrl.search}`;
  const method = request.method.toUpperCase();
  const requestId = request.headers.get("x-request-id") ?? crypto.randomUUID();

  try {
    const upstream = await fetch(url, {
      method,
      headers: upstreamHeaders(request, requestId),
      body:
        method === "GET" || method === "HEAD"
          ? undefined
          : await request.arrayBuffer(),
      cache: "no-store",
      redirect: "manual",
      signal: controller.signal,
    });
    return new Response(await responseBody(upstream), {
      status: upstream.status,
      headers: responseHeaders(upstream),
    });
  } catch (error) {
    const timedOut = error instanceof Error && error.name === "AbortError";
    logProxyFailure({
      request_id: requestId,
      method,
      path: `/api/v1/${path.join("/")}`,
      reason: timedOut ? "timeout" : "unreachable",
      error: error instanceof Error ? error.message : String(error),
      cause:
        error instanceof Error && error.cause
          ? String((error.cause as { code?: string }).code ?? error.cause)
          : "",
    });
    const message = timedOut
      ? "The IDMS API took longer than two minutes to respond."
      : "The IDMS API could not be reached.";
    return Response.json(
      { detail: message, request_id: requestId },
      { status: 504, headers: { "x-request-id": requestId } },
    );
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
