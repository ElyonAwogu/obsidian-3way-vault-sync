export class VaultCipher {
  static async encrypt(key: CryptoKey, plaintext: string): Promise<ArrayBuffer> {
    const enc = new TextEncoder();
    const iv = window.crypto.getRandomValues(new Uint8Array(12));

    const ciphertext = await window.crypto.subtle.encrypt(
      { name: "AES-GCM", iv },
      key,
      enc.encode(plaintext)
    );

    const combined = new Uint8Array(iv.byteLength + ciphertext.byteLength);
    combined.set(iv, 0);
    combined.set(new Uint8Array(ciphertext), iv.byteLength);

    return combined.buffer;
  }

  static async decrypt(key: CryptoKey, combinedBuffer: ArrayBuffer): Promise<string> {
    const dec = new TextDecoder();
    const fullArray = new Uint8Array(combinedBuffer);

    const iv = fullArray.slice(0, 12);
    const ciphertext = fullArray.slice(12);

    const decryptedBuffer = await window.crypto.subtle.decrypt(
      { name: "AES-GCM", iv },
      key,
      ciphertext
    );

    return dec.decode(decryptedBuffer);
  }
}