export type EncryptedSecretBoxV1 = {
  v: 1;
  alg: "AES-GCM";
  kdf: "PBKDF2";
  iter: number;
  saltB64: string;
  ivB64: string;
  ciphertextB64: string;
};

const DEFAULT_ITERATIONS = 210_000;

export async function encryptJsonWithPassphrase(
  value: unknown,
  passphrase: string,
): Promise<EncryptedSecretBoxV1> {
  if (!passphrase.trim()) {
    throw new Error("Missing passphrase.");
  }

  const plaintext = new TextEncoder().encode(JSON.stringify(value));
  // Allocate with ArrayBuffer (not SharedArrayBuffer) to satisfy TS BufferSource typing.
  const salt = new Uint8Array(new ArrayBuffer(16));
  crypto.getRandomValues(salt);
  const iv = new Uint8Array(new ArrayBuffer(12)); // AES-GCM recommended nonce length
  crypto.getRandomValues(iv);

  const key = await deriveAesKey(passphrase, salt, DEFAULT_ITERATIONS);
  const ciphertext = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv: Uint8Array.from(iv).buffer },
    key,
    Uint8Array.from(plaintext).buffer,
  );

  return {
    v: 1,
    alg: "AES-GCM",
    kdf: "PBKDF2",
    iter: DEFAULT_ITERATIONS,
    saltB64: bytesToB64(salt),
    ivB64: bytesToB64(iv),
    ciphertextB64: bytesToB64(new Uint8Array(ciphertext)),
  };
}

export async function decryptJsonWithPassphrase<T>(
  box: EncryptedSecretBoxV1,
  passphrase: string,
): Promise<T> {
  if (!passphrase.trim()) {
    throw new Error("Missing passphrase.");
  }
  if (!box || box.v !== 1 || box.alg !== "AES-GCM" || box.kdf !== "PBKDF2") {
    throw new Error("Unsupported secret format.");
  }

  const salt = b64ToBytes(box.saltB64);
  const iv = b64ToBytes(box.ivB64);
  const ciphertext = b64ToBytes(box.ciphertextB64);
  const key = await deriveAesKey(passphrase, salt, box.iter);
  const plaintextBytes = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: Uint8Array.from(iv).buffer },
    key,
    Uint8Array.from(ciphertext).buffer,
  );
  const json = new TextDecoder().decode(plaintextBytes);
  return JSON.parse(json) as T;
}

async function deriveAesKey(passphrase: string, salt: Uint8Array, iterations: number) {
  const baseKey = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(passphrase),
    { name: "PBKDF2" },
    false,
    ["deriveKey"],
  );

  return crypto.subtle.deriveKey(
    {
      name: "PBKDF2",
      hash: "SHA-256",
      // Copy into an ArrayBuffer to avoid TS SharedArrayBuffer typing.
      salt: Uint8Array.from(salt).buffer,
      iterations,
    },
    baseKey,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"],
  );
}

function bytesToB64(bytes: Uint8Array) {
  // Base64 for bytes only.
  let binary = "";
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary);
}

function b64ToBytes(b64: string) {
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}
