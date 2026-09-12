import { describe, it, expect } from 'vitest';
import { hashPassword, verifyPassword } from '../passwords.js';
import { generateApiKey, verifyApiKey } from '../api-keys.js';

describe('Auth — Passwords and API Keys', () => {
  it('hashes passwords with salt and verifies correctly', async () => {
    const password = 'SuperSecretBrewCMSPassword123!';
    const hash = await hashPassword(password);

    expect(hash).toContain(':');
    const valid = await verifyPassword(password, hash);
    expect(valid).toBe(true);

    const wrong = await verifyPassword('WrongPassword', hash);
    expect(wrong).toBe(false);
  });

  it('generates API keys and verifies constant-time SHA-256 hash', () => {
    const { plaintextKey, keyHash } = generateApiKey('agent');

    expect(plaintextKey.startsWith('brew_agent_')).toBe(true);
    expect(keyHash).toHaveLength(64);

    expect(verifyApiKey(plaintextKey, keyHash)).toBe(true);
    expect(verifyApiKey(plaintextKey + 'tampered', keyHash)).toBe(false);
  });
});
