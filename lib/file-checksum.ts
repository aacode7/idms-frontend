/** Plain HTTP origins outside localhost do not expose Web Crypto's digest API. */
export async function fileSha256(file: File): Promise<string> {
  if (globalThis.crypto?.subtle) {
    const digest = await globalThis.crypto.subtle.digest(
      "SHA-256",
      await file.arrayBuffer(),
    );
    return Array.from(new Uint8Array(digest), (byte) =>
      byte.toString(16).padStart(2, "0"),
    ).join("");
  }
  const { sha256 } = await import("@noble/hashes/sha2.js");
  const hash = sha256.create();
  try {
    for (let offset = 0; offset < file.size; offset += 1024 * 1024) {
      hash.update(
        new Uint8Array(
          await file.slice(offset, offset + 1024 * 1024).arrayBuffer(),
        ),
      );
      await new Promise((resolve) => setTimeout(resolve, 0));
    }
    return Array.from(hash.digest(), (byte) =>
      byte.toString(16).padStart(2, "0"),
    ).join("");
  } finally {
    hash.destroy();
  }
}
