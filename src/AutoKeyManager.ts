export class AutoKeyManager {
  private static STATIC_SALT = new TextEncoder().encode("obsidian-3way-sync-salt-v1");

  static async deriveKeyFromUserId(userId: string): Promise<CryptoKey> {
    const enc = new TextEncoder();
    const baseKey = await window.crypto.subtle.importKey(
      "raw",
      enc.encode(userId),
      "PBKDF2",
      false,
      ["deriveKey"]
    );

    return await window.crypto.subtle.deriveKey(
      {
        name: "PBKDF2",
        salt: this.STATIC_SALT,
        iterations: 100000,
        hash: "SHA-256"
      },
      baseKey,
      { name: "AES-GCM", length: 256 },
      false,
      ["encrypt", "decrypt"]
    );
  }
}