// notes-backend: notes in SQLite (on a PersistentVolume), attachments in MinIO.
// Same shape as app3-backend: plain node:http, the signed-in GitHub user comes
// from the X-Auth-Request-User header that oauth2-proxy adds via Traefik.
import http from "node:http";
import { randomUUID } from "node:crypto";
import { DatabaseSync } from "node:sqlite";
import * as Minio from "minio";
import sharp from "sharp";

// Thumbnails: one image at a time and no in-memory cache, to keep RAM low
// on the EliteDesk. Big photos are shrunk while decoding, not after.
sharp.concurrency(1);
sharp.cache(false);
const THUMB_SIZE = 640; // px, longest side: sharp on a 2x phone screen, still small

const PORT = Number(process.env.PORT || 8080);
const MB = 1024 * 1024;
const MAX_FILE = Number(process.env.MAX_FILE_MB || 50) * MB;    // per upload
const QUOTA = Number(process.env.QUOTA_MB || 10240) * MB;       // per user, all files
const BUCKET = process.env.MINIO_BUCKET || "notes";

// ---------- MinIO (S3) client ----------
// MinIO runs in the same namespace; only this pod may reach it (NetworkPolicy).
const s3 = new Minio.Client({
  endPoint: process.env.MINIO_HOST || "notes-minio-svc",
  port: Number(process.env.MINIO_PORT || 9000),
  useSSL: false,
  accessKey: process.env.MINIO_ACCESS_KEY,
  secretKey: process.env.MINIO_SECRET_KEY,
});

let ready = false; // flips to true once the bucket exists
async function ensureBucket() {
  for (;;) {
    try {
      if (!(await s3.bucketExists(BUCKET))) await s3.makeBucket(BUCKET);
      ready = true;
      console.log(`bucket "${BUCKET}" ready`);
      return;
    } catch (err) {
      console.log(`waiting for MinIO: ${err.code || err.message}`);
      await new Promise((r) => setTimeout(r, 3000));
    }
  }
}
ensureBucket();

// ---------- SQLite ----------
const db = new DatabaseSync(process.env.DB_PATH || "/data/notes.db");
db.exec(`
  PRAGMA journal_mode = WAL;
  PRAGMA foreign_keys = ON;
  CREATE TABLE IF NOT EXISTS notes (
    id TEXT PRIMARY KEY, user TEXT NOT NULL,
    title TEXT NOT NULL DEFAULT '', body TEXT NOT NULL DEFAULT '',
    created TEXT NOT NULL, updated TEXT NOT NULL
  );
  CREATE INDEX IF NOT EXISTS notes_user ON notes (user, updated);
  -- One row per attachment. The bytes live in MinIO under "key".
  CREATE TABLE IF NOT EXISTS files (
    id TEXT PRIMARY KEY,
    note_id TEXT NOT NULL REFERENCES notes(id) ON DELETE CASCADE,
    user TEXT NOT NULL, key TEXT NOT NULL,
    name TEXT NOT NULL, type TEXT NOT NULL, size INTEGER NOT NULL, created TEXT NOT NULL,
    thumb INTEGER NOT NULL DEFAULT 0  -- 1 = a small preview exists at "<key>.thumb.webp"
  );
  CREATE INDEX IF NOT EXISTS files_note ON files (note_id);
  CREATE INDEX IF NOT EXISTS files_user ON files (user);
`);
// Databases created before thumbnails existed: add the column. Their old
// images keep thumb = 0 and previews fall back to the original.
if (!db.prepare("PRAGMA table_info(files)").all().some((c) => c.name === "thumb")) {
  db.exec("ALTER TABLE files ADD COLUMN thumb INTEGER NOT NULL DEFAULT 0");
}
const thumbKey = (key) => `${key}.thumb.webp`;

const q = {
  list: db.prepare(`
    SELECT n.id, n.title, substr(n.body, 1, 400) AS preview, n.updated,
           (SELECT COUNT(*) FROM files f WHERE f.note_id = n.id) AS files,
           -- first image attached to the note, shown on its card in the list
           (SELECT f.id FROM files f WHERE f.note_id = n.id
              AND f.type IN ('image/png', 'image/jpeg', 'image/gif', 'image/webp', 'image/avif')
              ORDER BY f.created LIMIT 1) AS cover
    FROM notes n WHERE n.user = ? ORDER BY n.updated DESC`),
  get: db.prepare("SELECT id, title, body, created, updated FROM notes WHERE id = ? AND user = ?"),
  add: db.prepare("INSERT INTO notes (id, user, title, body, created, updated) VALUES (?, ?, ?, ?, ?, ?)"),
  save: db.prepare("UPDATE notes SET title = ?, body = ?, updated = ? WHERE id = ? AND user = ?"),
  touch: db.prepare("UPDATE notes SET updated = ? WHERE id = ?"),
  del: db.prepare("DELETE FROM notes WHERE id = ? AND user = ?"),
  files: db.prepare("SELECT id, name, type, size, created FROM files WHERE note_id = ? ORDER BY created"),
  fileKeys: db.prepare("SELECT key, thumb FROM files WHERE note_id = ?"),
  file: db.prepare("SELECT id, note_id, key, name, type, size, thumb FROM files WHERE id = ? AND user = ?"),
  addFile: db.prepare(
    "INSERT INTO files (id, note_id, user, key, name, type, size, created, thumb) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)"
  ),
  delFile: db.prepare("DELETE FROM files WHERE id = ?"),
  used: db.prepare("SELECT COALESCE(SUM(size), 0) AS used FROM files WHERE user = ?"),
};

// ---------- helpers ----------
const now = () => new Date().toISOString();
const ID = "[0-9a-f-]{36}";

const json = (res, code, body) => {
  res.writeHead(code, { "Content-Type": "application/json", "Cache-Control": "no-store" });
  res.end(JSON.stringify(body));
};

const readJson = (req, limit = 300_000) =>
  new Promise((resolve, reject) => {
    let data = "";
    req.setEncoding("utf8");
    req.on("data", (c) => {
      data += c;
      if (data.length > limit) { reject(Object.assign(new Error("note too large"), { status: 413 })); req.destroy(); }
    });
    req.on("end", () => { try { resolve(JSON.parse(data || "{}")); } catch { reject(Object.assign(new Error("bad JSON"), { status: 400 })); } });
    req.on("error", reject);
  });

// Note text limits: generous, but stops someone filling the DB by accident.
function cleanNote(b) {
  const title = String(b.title ?? "").slice(0, 200);
  const body = String(b.body ?? "");
  if (body.length > 200_000) throw Object.assign(new Error("note text is limited to 200,000 characters"), { status: 413 });
  return { title, body };
}

// Turn whatever the browser sent into a safe display name.
function cleanName(raw) {
  let name = "file";
  try { name = decodeURIComponent(String(raw || "file")); } catch { /* keep default */ }
  name = name.replace(/[\u0000-\u001f\u007f/\\]/g, "_").trim().slice(0, 200);
  return name || "file";
}

// Only these are ever shown inline in the browser. Everything else (HTML, SVG,
// PDF, ...) is sent as a download so an uploaded file can never run script on
// notes.xtemplate.cc.
const INLINE_TYPES = new Set(["image/png", "image/jpeg", "image/gif", "image/webp", "image/avif"]);

// Read a whole upload into memory, refusing anything that doesn't match its declared size.
const readAll = (req, size) =>
  new Promise((resolve, reject) => {
    const chunks = [];
    let got = 0;
    req.on("data", (c) => {
      got += c.length;
      if (got > size) { reject(new Error("more data than declared")); req.destroy(); return; }
      chunks.push(c);
    });
    req.on("end", () => (got === size ? resolve(Buffer.concat(chunks, size)) : reject(new Error("upload cut short"))));
    req.on("error", reject);
  });

// Small WebP preview, stored next to the original. rotate() applies the phone's
// orientation flag; metadata (EXIF, GPS location) is dropped from the preview.
// If the image can't be read, the upload still succeeds, just without a preview.
async function makeThumb(data, key) {
  try {
    const small = await sharp(data, { failOn: "none" })
      .rotate()
      .resize({ width: THUMB_SIZE, height: THUMB_SIZE, fit: "inside", withoutEnlargement: true })
      .webp({ quality: 72 })
      .toBuffer();
    await s3.putObject(BUCKET, thumbKey(key), small, small.length, { "Content-Type": "image/webp" });
    return 1;
  } catch (err) {
    console.error("thumbnail failed:", err.message);
    return 0;
  }
}

const contentDisposition = (kind, name) =>
  `${kind}; filename="${name.replace(/[^\x20-\x7e]|"/g, "_")}"; filename*=UTF-8''${encodeURIComponent(name)}`;

// ---------- routes ----------
async function handle(req, res, user, p) {
  let m;

  // usage bar in the UI
  if (req.method === "GET" && p === "/api/usage") {
    return json(res, 200, { used: q.used.get(user).used, quota: QUOTA, maxFile: MAX_FILE });
  }

  // list + create notes
  if (p === "/api/notes") {
    if (req.method === "GET") return json(res, 200, q.list.all(user));
    if (req.method === "POST") {
      const { title, body } = cleanNote(await readJson(req));
      const id = randomUUID();
      const t = now();
      q.add.run(id, user, title, body, t, t);
      return json(res, 201, { id, title, body, created: t, updated: t, files: [] });
    }
  }

  // one note
  if ((m = p.match(new RegExp(`^/api/notes/(${ID})$`)))) {
    const note = q.get.get(m[1], user);
    if (!note) return json(res, 404, { error: "note not found" });

    if (req.method === "GET") return json(res, 200, { ...note, files: q.files.all(note.id) });

    if (req.method === "PUT") {
      const { title, body } = cleanNote(await readJson(req));
      const t = now();
      q.save.run(title, body, t, note.id, user);
      return json(res, 200, { ok: true, updated: t });
    }

    if (req.method === "DELETE") {
      const keys = q.fileKeys.all(note.id).flatMap((r) => (r.thumb ? [r.key, thumbKey(r.key)] : [r.key]));
      if (keys.length) await s3.removeObjects(BUCKET, keys);
      q.del.run(note.id, user); // files rows go too (ON DELETE CASCADE)
      return json(res, 200, { ok: true });
    }
  }

  // upload an attachment: the raw file is the request body (no multipart),
  // name in X-File-Name, type in Content-Type. Streamed straight to MinIO.
  if (req.method === "POST" && (m = p.match(new RegExp(`^/api/notes/(${ID})/files$`)))) {
    const note = q.get.get(m[1], user);
    if (!note) return json(res, 404, { error: "note not found" });

    const size = Number(req.headers["content-length"]);
    if (!Number.isInteger(size) || size <= 0) return json(res, 411, { error: "missing file size" });
    if (size > MAX_FILE) return json(res, 413, { error: `files are limited to ${MAX_FILE / MB} MB` });
    if (q.used.get(user).used + size > QUOTA) return json(res, 413, { error: "storage quota reached" });

    const id = randomUUID();
    const key = `u/${encodeURIComponent(user)}/${id}`;
    const name = cleanName(req.headers["x-file-name"]);
    const type = String(req.headers["content-type"] || "application/octet-stream").split(";")[0].trim().slice(0, 100)
      || "application/octet-stream";

    let thumb = 0;
    try {
      if (INLINE_TYPES.has(type)) {
        // Images: keep the bytes in memory (max 50 MB) so we can also make a thumbnail.
        const data = await readAll(req, size);
        await s3.putObject(BUCKET, key, data, size, { "Content-Type": type });
        thumb = await makeThumb(data, key);
      } else {
        // Everything else streams straight through to MinIO.
        await s3.putObject(BUCKET, key, req, size, { "Content-Type": type });
      }
    } catch (err) {
      console.error("upload failed:", err.message);
      return json(res, 400, { error: "upload interrupted" });
    }
    const t = now();
    q.addFile.run(id, note.id, user, key, name, type, size, t, thumb);
    q.touch.run(t, note.id);
    return json(res, 201, { id, name, type, size, created: t });
  }

  // small preview of an image; falls back to the original for images
  // uploaded before thumbnails existed (or that couldn't be shrunk)
  if (req.method === "GET" && (m = p.match(new RegExp(`^/api/files/(${ID})/thumb$`)))) {
    const f = q.file.get(m[1], user);
    if (!f || !INLINE_TYPES.has(f.type)) return json(res, 404, { error: "no preview" });
    const key = f.thumb ? thumbKey(f.key) : f.key;
    const stream = await s3.getObject(BUCKET, key);
    res.writeHead(200, {
      "Content-Type": f.thumb ? "image/webp" : f.type,
      "Content-Disposition": "inline",
      "X-Content-Type-Options": "nosniff",
      "Content-Security-Policy": "default-src 'none'; img-src 'self'; sandbox",
      // a file never changes once uploaded, so the browser can keep it for a week
      "Cache-Control": "private, max-age=604800, immutable",
    });
    stream.on("error", (err) => { console.error("preview failed:", err.message); res.destroy(); });
    return stream.pipe(res);
  }

  // download / view or delete an attachment
  if ((m = p.match(new RegExp(`^/api/files/(${ID})$`)))) {
    const f = q.file.get(m[1], user);
    if (!f) return json(res, 404, { error: "file not found" });

    if (req.method === "GET") {
      const download = new URL(req.url, "http://x").searchParams.has("download");
      const inline = !download && INLINE_TYPES.has(f.type);
      const stream = await s3.getObject(BUCKET, f.key);
      res.writeHead(200, {
        "Content-Type": inline ? f.type : "application/octet-stream",
        "Content-Length": f.size,
        "Content-Disposition": contentDisposition(inline ? "inline" : "attachment", f.name),
        "X-Content-Type-Options": "nosniff",
        "Content-Security-Policy": "default-src 'none'; img-src 'self'; sandbox",
        "Cache-Control": "private, max-age=86400",
      });
      stream.on("error", (err) => { console.error("download failed:", err.message); res.destroy(); });
      return stream.pipe(res);
    }

    if (req.method === "DELETE") {
      await s3.removeObject(BUCKET, f.key);
      if (f.thumb) await s3.removeObject(BUCKET, thumbKey(f.key));
      q.delFile.run(f.id);
      q.touch.run(now(), f.note_id);
      return json(res, 200, { ok: true });
    }
  }

  return json(res, 404, { error: "not found" });
}

http
  .createServer(async (req, res) => {
    const p = new URL(req.url, "http://x").pathname;
    try {
      if (p === "/livez") { res.writeHead(200); return res.end("ok"); }
      if (p === "/healthz") { res.writeHead(ready ? 200 : 503); return res.end(ready ? "ok" : "waiting for minio"); }

      if (p.startsWith("/api/")) {
        // oauth2-proxy (via Traefik forwardAuth) sets this to the GitHub username.
        const user = req.headers["x-auth-request-user"];
        if (!user) return json(res, 401, { error: "not signed in" });
        if (!ready) return json(res, 503, { error: "storage is starting, try again shortly" });
        return await handle(req, res, user, p);
      }
      json(res, 404, { error: "not found" });
    } catch (err) {
      console.error(err);
      if (!res.headersSent) json(res, err.status || 500, { error: err.status ? err.message : "internal error" });
      else res.destroy();
    }
  })
  // Uploads can take a while on a slow connection; don't cut them off early.
  .setTimeout(10 * 60 * 1000)
  .listen(PORT, () => console.log(`notes-backend listening on ${PORT}`));
