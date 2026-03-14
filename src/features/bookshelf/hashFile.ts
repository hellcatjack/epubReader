import { sha256 } from "@noble/hashes/sha2.js";

function toHex(buffer: Uint8Array) {
  return Array.from(buffer, (value) => value.toString(16).padStart(2, "0")).join("");
}

export async function hashFile(file: File) {
  const bytes = new Uint8Array(await file.arrayBuffer());
  const subtle = globalThis.crypto?.subtle;

  if (subtle?.digest) {
    const digest = await subtle.digest("SHA-256", bytes);
    return toHex(new Uint8Array(digest));
  }

  return toHex(sha256(bytes));
}
