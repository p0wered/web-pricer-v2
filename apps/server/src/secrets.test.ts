import { describe, expect, it } from 'vitest';
import { decryptSecret, encryptSecret } from './secrets.ts';

describe('secrets', () => {
  it('расшифровывает тем же ключом и не расшифровывает другим', () => {
    const encrypted = encryptSecret('пароль DAV', 'first-secret-0123456');
    expect(encrypted).toMatch(/^v1:/);
    expect(encrypted).not.toContain('пароль');
    expect(decryptSecret(encrypted, 'first-secret-0123456')).toBe('пароль DAV');
    expect(() => decryptSecret(encrypted, 'other-secret-0123456')).toThrow();
  });

  it('каждый раз даёт разный шифротекст', () => {
    expect(encryptSecret('x', 'first-secret-0123456')).not.toBe(
      encryptSecret('x', 'first-secret-0123456'),
    );
  });
});
