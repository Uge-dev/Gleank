import fs from "node:fs/promises";
import path from "node:path";
import net from "node:net";
import sharp from "sharp";
import zlib from "node:zlib";
import { db } from "../db/database.js";
import { env } from "../config/env.js";
import { HttpError } from "../lib/http-error.js";
import {
  isCloudinaryEnabled,
  uploadCloudinaryBuffer,
} from "../services/cloudinary.service.js";
import { id, now } from "./core.js";
export const privateRoot = path.resolve(
  process.env.SHARED_PRIVATE_STORAGE_PATH ||
    path.join(path.dirname(env.databasePath), "private-assets"),
);
async function scan(buffer) {
  if (env.nodeEnv === "test") return;
  const host = process.env.CLAMAV_HOST;
  if (!host)
    throw new HttpError(
      503,
      "File scanning is not configured. Uploads are temporarily unavailable.",
    );
  await new Promise((resolve, reject) => {
    const socket = net.createConnection({
      host,
      port: Number(process.env.CLAMAV_PORT || 3310),
    });
    let response = "";
    socket.setTimeout(30000, () =>
      socket.destroy(new Error("File scanner timeout.")),
    );
    socket.on("error", () =>
      reject(new HttpError(503, "File scanning is unavailable.")),
    );
    socket.on("data", (chunk) => {
      response += chunk.toString();
      if (response.length > 4096)
        socket.destroy(new Error("Invalid scanner response."));
      if (response.includes("\0")) {
        socket.end();
        if (/: OK\0/.test(response)) resolve();
        else
          reject(new HttpError(422, "This file did not pass the safety scan."));
      }
    });
    socket.on("end", () => {
      if (!response.includes("\0"))
        reject(new HttpError(503, "Incomplete file scan."));
    });
    socket.on("connect", () => {
      socket.write("zINSTREAM\0");
      for (let offset = 0; offset < buffer.length; offset += 65536) {
        const chunk = buffer.subarray(offset, offset + 65536),
          size = Buffer.alloc(4);
        size.writeUInt32BE(chunk.length);
        socket.write(size);
        socket.write(chunk);
      }
      socket.write(Buffer.alloc(4));
    });
  });
}
function detect(buffer, kind) {
  if (kind === "document" || kind === "digital") {
    if (buffer.subarray(0, 4).equals(Buffer.from([80, 75, 3, 4]))) {
      validateArchive(buffer);
      return { extension: "zip", mime: "application/zip" };
    }
    if (buffer.subarray(0, 5).toString() === "%PDF-")
      return { extension: "pdf", mime: "application/pdf" };
    // Keep the first production release narrow: no executable archives or macro Office files.
    if (
      buffer.length &&
      !buffer.includes(0) &&
      !buffer.toString("utf8").includes("\uFFFD") &&
      !/<(?:script|html|iframe)\b/i.test(buffer.toString("utf8"))
    )
      return { extension: "txt", mime: "text/plain" };
    throw new HttpError(
      415,
      "Use a PDF, plain text or ZIP/Office template archive.",
    );
  }
  if (buffer.length >= 16 && buffer.subarray(4, 8).toString() === "ftyp")
    return {
      extension: kind === "voice" ? "m4a" : "mp4",
      mime: kind === "voice" ? "audio/mp4" : "video/mp4",
    };
  if (
    kind === "voice" &&
    buffer.subarray(0, 4).toString() === "RIFF" &&
    buffer.subarray(8, 12).toString() === "WAVE"
  )
    return { extension: "wav", mime: "audio/wav" };
  throw new HttpError(
    415,
    "Choose a supported MP4 video or M4A/WAV recording.",
  );
}
export async function storeMedia(userId, file, kind) {
  if (!file?.buffer?.length) throw new HttpError(422, "Choose a file.");
  const max = ["video"].includes(kind) ? 50 * 1024 * 1024 : 15 * 1024 * 1024;
  if (file.buffer.length > max)
    throw new HttpError(413, "The selected file exceeds its size limit.");
  await scan(file.buffer);
  let buffer = file.buffer,
    detected;
  if (
    [
      "image",
      "review",
      "avatar",
      "cover",
      "receipt",
      "chat_image",
      "evidence",
    ].includes(kind)
  ) {
    try {
      const image = sharp(buffer, { limitInputPixels: 24000000 });
      const meta = await image.metadata();
      if (!["jpeg", "png", "webp"].includes(meta.format)) throw new Error();
      buffer = await image
        .rotate()
        .resize({
          width: 2400,
          height: 2400,
          fit: "inside",
          withoutEnlargement: true,
        })
        .webp({ quality: 88 })
        .toBuffer();
      detected = { extension: "webp", mime: "image/webp" };
    } catch {
      throw new HttpError(415, "Choose a valid JPEG, PNG or WebP image.");
    }
  } else detected = detect(buffer, kind);
  const mediaId = id("media");
  let publicUrl = "";
  const publicKind = ["image", "video", "avatar", "cover", "review"].includes(
    kind,
  );
  await fs.mkdir(privateRoot, { recursive: true, mode: 0o700 });
  const target = path.join(privateRoot, mediaId + "." + detected.extension);
  await fs.writeFile(target, buffer, { flag: "wx", mode: 0o600 });
  try {
    if (publicKind && isCloudinaryEnabled()) {
      const result = await uploadCloudinaryBuffer(buffer, {
        folder: env.cloudinaryFolder + "/shared",
        publicId: mediaId,
        resourceType: kind === "video" ? "video" : "image",
      });
      publicUrl = result.secure_url;
    } else if (publicKind) publicUrl = "/api/v2/media/" + mediaId + "/public";
    db.prepare(
      "INSERT INTO shared_media(id,owner_id,kind,mime_type,name,bytes,private_path,public_url,scan_status,created_at) VALUES(?,?,?,?,?,?,?,?,?,?)",
    ).run(
      mediaId,
      userId,
      kind,
      detected.mime,
      path
        .basename(file.originalname || "file")
        .replace(/[^a-zA-Z0-9 ._-]/g, "")
        .slice(0, 120) || "file",
      buffer.length,
      target,
      publicUrl,
      "clean",
      now(),
    );
  } catch (error) {
    await fs.rm(target, { force: true });
    throw error;
  }
  return {
    id: mediaId,
    kind,
    mimeType: detected.mime,
    bytes: buffer.length,
    url: publicUrl || null,
  };
}
export function ownedMedia(userId, ids, kinds) {
  return ids.map((mediaId) => {
    const row = db
      .prepare(
        "SELECT * FROM shared_media WHERE id=? AND owner_id=? AND scan_status=?",
      )
      .get(mediaId, userId, "clean");
    if (!row || !kinds.includes(row.kind))
      throw new HttpError(
        422,
        "A selected file is unavailable or does not belong to you.",
      );
    return row;
  });
}

function validateArchive(buffer) {
  let end = -1;
  for (let i = buffer.length - 22; i >= Math.max(0, buffer.length - 65557); i--)
    if (buffer.readUInt32LE(i) === 0x06054b50) {
      end = i;
      break;
    }
  if (end < 0 || buffer.readUInt16LE(end + 4) || buffer.readUInt16LE(end + 6))
    throw new HttpError(415, "Use a standard single-volume archive.");
  const entries = buffer.readUInt16LE(end + 10),
    central = buffer.readUInt32LE(end + 16);
  if (entries > 500 || !entries || central >= end)
    throw new HttpError(415, "Archive has too many entries or is invalid.");
  let cursor = central,
    total = 0;
  for (let i = 0; i < entries; i++) {
    if (cursor + 46 > end || buffer.readUInt32LE(cursor) !== 0x02014b50)
      throw new HttpError(415, "Invalid archive directory.");
    const flags = buffer.readUInt16LE(cursor + 8),
      method = buffer.readUInt16LE(cursor + 10),
      compressed = buffer.readUInt32LE(cursor + 20),
      expanded = buffer.readUInt32LE(cursor + 24),
      nameLength = buffer.readUInt16LE(cursor + 28),
      extra = buffer.readUInt16LE(cursor + 30),
      comment = buffer.readUInt16LE(cursor + 32),
      offset = buffer.readUInt32LE(cursor + 42),
      name = buffer
        .subarray(cursor + 46, cursor + 46 + nameLength)
        .toString("utf8")
        .replaceAll("\\", "/");
    if (
      flags & 1 ||
      ![0, 8].includes(method) ||
      name.startsWith("/") ||
      name.split("/").includes("..") ||
      name.includes("\0") ||
      /^[A-Za-z]:/.test(name) ||
      /\.(exe|dll|scr|com|bat|cmd|ps1|msi|docm|xlsm|pptm)$/i.test(name) ||
      ((buffer.readUInt32LE(cursor + 38) >>> 16) & 0xf000) === 0xa000
    )
      throw new HttpError(
        415,
        "Archive contains an unsupported or unsafe entry.",
      );
    total += expanded;
    if (
      total > 100 * 1024 * 1024 ||
      expanded > 16 * 1024 * 1024 ||
      expanded > Math.max(1024 * 1024, compressed * 200)
    )
      throw new HttpError(413, "Archive expansion exceeds the limit.");
    if (offset + 30 >= central || buffer.readUInt32LE(offset) !== 0x04034b50)
      throw new HttpError(415, "Invalid archive entry.");
    const start =
      offset +
      30 +
      buffer.readUInt16LE(offset + 26) +
      buffer.readUInt16LE(offset + 28);
    if (start + compressed > central)
      throw new HttpError(415, "Invalid archive size.");
    try {
      const output =
        method === 8
          ? zlib.inflateRawSync(buffer.subarray(start, start + compressed), {
              maxOutputLength: Math.max(1, expanded),
            })
          : buffer.subarray(start, start + compressed);
      if (output.length !== expanded) throw new Error();
    } catch {
      throw new HttpError(415, "Archive contents could not be validated.");
    }
    cursor += 46 + nameLength + extra + comment;
  }
  if (cursor > end) throw new HttpError(415, "Invalid archive directory.");
}
