// Which files we accept, and how each may be served. The type reported by Meta is NOT trusted on
// its own: only these exact types are stored, and the browser is told to never guess (nosniff).

export interface MediaKind {
  ext: string;
  /** "image" | "audio" | "video" | "file": decides how the inbox shows it. */
  group: "image" | "audio" | "video" | "file";
}

const ALLOWED: Record<string, MediaKind> = {
  "image/jpeg": { ext: "jpg", group: "image" },
  "image/png": { ext: "png", group: "image" },
  "image/webp": { ext: "webp", group: "image" },
  "image/gif": { ext: "gif", group: "image" },
  "audio/ogg": { ext: "ogg", group: "audio" },
  "audio/mpeg": { ext: "mp3", group: "audio" },
  "audio/mp4": { ext: "m4a", group: "audio" },
  "audio/aac": { ext: "aac", group: "audio" },
  "audio/amr": { ext: "amr", group: "audio" },
  "audio/webm": { ext: "weba", group: "audio" },
  "video/mp4": { ext: "mp4", group: "video" },
  "video/3gpp": { ext: "3gp", group: "video" },
  "video/webm": { ext: "webm", group: "video" },
  "application/pdf": { ext: "pdf", group: "file" },
  "application/msword": { ext: "doc", group: "file" },
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": { ext: "docx", group: "file" },
  "application/vnd.ms-excel": { ext: "xls", group: "file" },
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": { ext: "xlsx", group: "file" },
  "application/vnd.ms-powerpoint": { ext: "ppt", group: "file" },
  "application/vnd.openxmlformats-officedocument.presentationml.presentation": { ext: "pptx", group: "file" },
  "text/plain": { ext: "txt", group: "file" },
};

/** "audio/ogg; codecs=opus" -> "audio/ogg". */
export function baseMime(mime: string | null | undefined): string | null {
  const m = (mime ?? "").split(";")[0].trim().toLowerCase();
  return m || null;
}

/** The allowed kind for a MIME type, or null when we must not store it (SVG, HTML, scripts, ...). */
export function kindOf(mime: string | null | undefined): MediaKind | null {
  const base = baseMime(mime);
  return base ? (ALLOWED[base] ?? null) : null;
}

/** Headers for serving a stored file: inline only for images/audio/video, a download for documents. */
export function serveHeaders(mime: string, fileName: string | null, size: number): Record<string, string> {
  const kind = kindOf(mime);
  const inline = !!kind && kind.group !== "file";
  const safeName = (fileName ?? `file.${kind?.ext ?? "bin"}`).replace(/[^\w.\- ]+/g, "_").slice(0, 100) || "file";
  return {
    "Content-Type": baseMime(mime) ?? "application/octet-stream",
    "Content-Length": String(size),
    "Content-Disposition": `${inline ? "inline" : "attachment"}; filename="${safeName}"`,
    "X-Content-Type-Options": "nosniff",
    // Even if a file were somehow rendered as a page, it could run nothing and load nothing.
    "Content-Security-Policy": "default-src 'none'; sandbox",
    "Cache-Control": "private, max-age=86400",
  };
}
