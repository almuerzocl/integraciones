import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';

// Cifrado de credenciales del sistema externo: AES-256-GCM, formato  versión(1) | iv(12) | tag(16) | texto cifrado.
// `aad` (datos asociados) amarra el cifrado a su dueño (restaurante + proveedor): copiar el cifrado de una
// conexión a otra hace que descifrar falle, no que se usen credenciales ajenas.

const VERSION = 1;
const IV_LEN = 12;
const TAG_LEN = 16;

export function parseKey(base64: string): Buffer {
  const key = Buffer.from(base64, 'base64');
  if (key.length !== 32) throw new Error('CREDENTIALS_KEY debe ser de 32 bytes en base64');
  return key;
}

export function encryptSecret(plain: string, key: Buffer, aad: string): Buffer {
  const iv = randomBytes(IV_LEN);
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  cipher.setAAD(Buffer.from(aad, 'utf8'));
  const body = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
  return Buffer.concat([Buffer.from([VERSION]), iv, cipher.getAuthTag(), body]);
}

export function decryptSecret(data: Buffer, key: Buffer, aad: string): string {
  if (data.length < 1 + IV_LEN + TAG_LEN || data[0] !== VERSION) throw new Error('Credencial cifrada inválida');
  const iv = data.subarray(1, 1 + IV_LEN);
  const tag = data.subarray(1 + IV_LEN, 1 + IV_LEN + TAG_LEN);
  const body = data.subarray(1 + IV_LEN + TAG_LEN);
  const decipher = createDecipheriv('aes-256-gcm', key, iv);
  decipher.setAAD(Buffer.from(aad, 'utf8'));
  decipher.setAuthTag(tag);
  try {
    return Buffer.concat([decipher.update(body), decipher.final()]).toString('utf8');
  } catch {
    throw new Error('No se pudo descifrar la credencial (clave o dueño distinto)');
  }
}

export const credentialAad = (restaurantId: string, provider: string) => `${restaurantId}|${provider}`;
