// Шифрование секретов, которые хранятся в БД (пароль DAV): AES-256-GCM,
// ключ выводится из APP_SECRET. Формат: `v1:<base64(iv | tag | ciphertext)>`.
import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from 'node:crypto';

const VERSION = 'v1';
const IV_BYTES = 12;
const TAG_BYTES = 16;
const keys = new Map<string, Buffer>();

function keyFor(appSecret: string): Buffer {
  let key = keys.get(appSecret);
  if (!key) {
    key = scryptSync(appSecret, 'webpricer:secrets:v1', 32);
    keys.set(appSecret, key);
  }
  return key;
}

export function encryptSecret(plain: string, appSecret: string): string {
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv('aes-256-gcm', keyFor(appSecret), iv);
  const ciphertext = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
  return `${VERSION}:${Buffer.concat([iv, cipher.getAuthTag(), ciphertext]).toString('base64')}`;
}

/** Бросает ошибку, если ключ не подходит или данные повреждены. */
export function decryptSecret(encrypted: string, appSecret: string): string {
  const [version, payload] = encrypted.split(':');
  if (version !== VERSION || !payload)
    throw new Error('Неизвестный формат зашифрованного значения');
  const data = Buffer.from(payload, 'base64');
  const decipher = createDecipheriv('aes-256-gcm', keyFor(appSecret), data.subarray(0, IV_BYTES));
  decipher.setAuthTag(data.subarray(IV_BYTES, IV_BYTES + TAG_BYTES));
  return Buffer.concat([
    decipher.update(data.subarray(IV_BYTES + TAG_BYTES)),
    decipher.final(),
  ]).toString('utf8');
}
