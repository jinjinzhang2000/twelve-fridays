// Safari uses byte-range requests to start and seek within MP3 files.
function sliceStream(start, end) {
  let offset = 0;
  return new TransformStream({
    transform(chunk, controller) {
      const from = offset;
      offset += chunk.byteLength;
      if (offset <= start) return;
      const first = Math.max(0, start - from);
      const last = Math.min(chunk.byteLength, end + 1 - from);
      if (last > first) controller.enqueue(chunk.subarray(first, last));
      if (offset > end) controller.terminate();
    },
  });
}

async function serveAudio(request, assets) {
  const range = request.headers.get("Range");
  const full = await assets.fetch(range && request.method === "GET"
    ? new Request(request.url)
    : request);
  if (full.status !== 200) return full;

  const headers = new Headers(full.headers);
  headers.set("Accept-Ranges", "bytes");
  const match = /^bytes=(\d*)-(\d*)$/.exec(range?.trim() ?? "");
  const ifRange = request.headers.get("If-Range");
  if (request.method !== "GET" || !match || (!match[1] && !match[2]) ||
      (ifRange && ![headers.get("ETag"), headers.get("Last-Modified")].includes(ifRange))) {
    return new Response(full.body, { headers });
  }

  const statedSize = Number(headers.get("Content-Length"));
  const buffer = statedSize > 0 ? null : await full.arrayBuffer();
  const size = buffer?.byteLength ?? statedSize;
  const start = match[1] ? Number(match[1]) : Math.max(0, size - Number(match[2]));
  const end = match[1] && match[2] ? Math.min(Number(match[2]), size - 1) : size - 1;
  if (start >= size || end < start) {
    if (!buffer) await full.body.cancel();
    return new Response(null, {
      status: 416,
      headers: { "Content-Range": `bytes */${size}`, "Accept-Ranges": "bytes" },
    });
  }

  const length = end - start + 1;
  headers.set("Content-Range", `bytes ${start}-${end}/${size}`);
  headers.set("Content-Length", String(length));
  if (buffer) return new Response(buffer.slice(start, end + 1), { status: 206, headers });

  const stream = new FixedLengthStream(length);
  full.body.pipeThrough(sliceStream(start, end)).pipeTo(stream.writable).catch(() => {});
  return new Response(stream.readable, { status: 206, headers });
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname === "/singapore") {
      url.pathname += "/";
      return Response.redirect(url, 301);
    }
    if (url.pathname.startsWith("/singapore/audio/")) return serveAudio(request, env.ASSETS);
    return env.ASSETS.fetch(request);
  },
};
