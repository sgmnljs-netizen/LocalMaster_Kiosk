import { describe, expect, it } from 'vitest';
import { normalizeVanProvider } from '../van_types';

describe('normalizeVanProvider', () => {
  it('normalizes *_VAN suffix and casing to canonical VanProviderType', () => {
    expect(normalizeVanProvider('KCP_VAN')).toBe('KCP');
    expect(normalizeVanProvider('nice_van')).toBe('NICE');
    expect(normalizeVanProvider('smartro')).toBe('SMARTRO');
    expect(normalizeVanProvider('KOCES')).toBe('KOCES');
    expect(normalizeVanProvider('KIS_VAN')).toBe('KIS');
    expect(normalizeVanProvider('MOCK')).toBe('MOCK');
  });

  it('falls back safely to KCP for empty or unknown provider strings', () => {
    expect(normalizeVanProvider('')).toBe('KCP');
    expect(normalizeVanProvider(undefined)).toBe('KCP');
    expect(normalizeVanProvider(null)).toBe('KCP');
    expect(normalizeVanProvider('UNKNOWN_PROVIDER')).toBe('KCP');
  });
});
