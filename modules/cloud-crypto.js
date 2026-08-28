const FORMAT = "moneyflow-encrypted-v1";
const ITERATIONS = 600000;

export function bytesToBase64(bytes) {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

export function base64ToBytes(value) {
  const binary = atob(value);
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}

export function isValidEncryptionKey(key) {
  try {
    return base64ToBytes(String(key || "")).byteLength === 32;
  } catch {
    return false;
  }
}

export async function deriveEncryptionKey(passphrase, salt) {
  if (!String(passphrase || "")) throw new Error("Укажите пароль-фразу шифрования в настройках редактора");
  const saltBytes = base64ToBytes(salt);
  if (saltBytes.byteLength !== 16) throw new Error("Некорректная соль шифрования");
  const material = await crypto.subtle.importKey("raw", new TextEncoder().encode(passphrase), "PBKDF2", false, ["deriveKey"]);
  const key = await crypto.subtle.deriveKey(
    { name: "PBKDF2", salt: saltBytes, iterations: ITERATIONS, hash: "SHA-256" },
    material,
    { name: "AES-GCM", length: 256 },
    true,
    ["encrypt", "decrypt"],
  );
  return bytesToBase64(new Uint8Array(await crypto.subtle.exportKey("raw", key)));
}

export async function encryptCloudPayload(payload, { encryptionKey, salt }) {
  if (!isValidEncryptionKey(encryptionKey)) throw new Error("В приложении нет ключа шифрования");
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const key = await crypto.subtle.importKey("raw", base64ToBytes(encryptionKey), { name: "AES-GCM" }, false, ["encrypt"]);
  const encrypted = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, new TextEncoder().encode(JSON.stringify(payload)));
  return {
    format: FORMAT,
    cipher: "AES-256-GCM",
    kdf: { name: "PBKDF2", hash: "SHA-256", iterations: ITERATIONS, salt },
    iv: bytesToBase64(iv),
    ciphertext: bytesToBase64(new Uint8Array(encrypted)),
  };
}

export async function decryptCloudPayload(encryptedPayload, encryptionKey) {
  if (Array.isArray(encryptedPayload?.operations) && Array.isArray(encryptedPayload?.categories)) return encryptedPayload;
  if (encryptedPayload?.format !== FORMAT) throw new Error("Файл не похож на зашифрованные данные MoneyFlow");
  if (!isValidEncryptionKey(encryptionKey)) throw new Error("В приложении нет ключа");
  const key = await crypto.subtle.importKey("raw", base64ToBytes(encryptionKey), { name: "AES-GCM" }, false, ["decrypt"]);
  const decrypted = await crypto.subtle.decrypt({ name: "AES-GCM", iv: base64ToBytes(encryptedPayload.iv) }, key, base64ToBytes(encryptedPayload.ciphertext));
  return JSON.parse(new TextDecoder().decode(decrypted));
}

export function createEncryptionSalt() {
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  return bytesToBase64(bytes);
}

export function isExpectedKdf(kdf) {
  return kdf?.name === "PBKDF2" && kdf?.hash === "SHA-256" && Number(kdf?.iterations) === ITERATIONS;
}
