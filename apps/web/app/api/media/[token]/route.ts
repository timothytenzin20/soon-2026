import { Readable } from "node:stream";
import { verifyAccess } from "@mb/storage";
import { route, store } from "@/lib/server";

/**
 * Serves private media only for a valid, unexpired HMAC token that was issued after a
 * server-side authorization check. Supports Range for video seeking. Never cached publicly.
 */
export const GET = route(async (req: Request, ctx: { params: Promise<{ token: string }> }) => {
  const { token } = await ctx.params;
  const access = verifyAccess(token);
  if (!access) return new Response("Link expired", { status: 403 });
  const size = await store().size(access.key);
  if (size == null) return new Response("Not found", { status: 404 });
  const headers: Record<string, string> = {
    "Content-Type": access.contentType,
    "Cache-Control": "private, max-age=240",
    "Accept-Ranges": "bytes",
    "Content-Disposition": "inline",
  };
  const m = /^bytes=(\d*)-(\d*)$/.exec(req.headers.get("range") ?? "");
  if (m && (m[1] || m[2])) {
    let start = m[1] ? Number(m[1]) : Math.max(0, size - Number(m[2]));
    let end = m[1] && m[2] ? Number(m[2]) : size - 1;
    end = Math.min(end, size - 1, start + 4 * 1024 * 1024 - 1);
    if (start > end || start >= size) return new Response(null, { status: 416, headers: { "Content-Range": `bytes */${size}` } });
    start = Math.max(0, start);
    const body = Readable.toWeb(store().readStream(access.key, { start, end })) as ReadableStream;
    return new Response(body, { status: 206, headers: { ...headers, "Content-Range": `bytes ${start}-${end}/${size}`, "Content-Length": String(end - start + 1) } });
  }
  const body = Readable.toWeb(store().readStream(access.key)) as ReadableStream;
  return new Response(body, { status: 200, headers: { ...headers, "Content-Length": String(size) } });
});
