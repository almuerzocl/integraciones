import { describe, expect, it } from 'vitest';
import { randomBytes } from 'node:crypto';
import { credentialAad, decryptSecret, encryptSecret, parseKey } from './crypto';

const key = randomBytes(32);
const aad = credentialAad('r1', 'fudo');

describe('crypto', () => {
  it('descifra lo que cifra', () => {
    expect(decryptSecret(encryptSecret('{"k":"s"}', key, aad), key, aad)).toBe('{"k":"s"}');
  });
  it('cada cifrado es distinto (iv aleatorio)', () => {
    expect(encryptSecret('x', key, aad).equals(encryptSecret('x', key, aad))).toBe(false);
  });
  it('no contiene el texto original', () => {
    expect(encryptSecret('MI-SECRETO-123', key, aad).toString('utf8')).not.toContain('MI-SECRETO-123');
  });
  it('falla con otra clave', () => {
    expect(() => decryptSecret(encryptSecret('x', key, aad), randomBytes(32), aad)).toThrow();
  });
  it('falla si se copia a otra conexión (aad distinto)', () => {
    expect(() => decryptSecret(encryptSecret('x', key, aad), key, credentialAad('r2', 'fudo'))).toThrow();
  });
  it('falla si se altera un byte', () => {
    const c = encryptSecret('hola', key, aad);
    c[c.length - 1] ^= 1;
    expect(() => decryptSecret(c, key, aad)).toThrow();
  });
  it('rechaza datos truncados o de otra versión', () => {
    expect(() => decryptSecret(Buffer.from([1, 2, 3]), key, aad)).toThrow();
    const c = encryptSecret('x', key, aad); c[0] = 9;
    expect(() => decryptSecret(c, key, aad)).toThrow();
  });
  it('valida el largo de la clave', () => {
    expect(() => parseKey(Buffer.alloc(16).toString('base64'))).toThrow();
    expect(parseKey(key.toString('base64')).length).toBe(32);
  });
});
