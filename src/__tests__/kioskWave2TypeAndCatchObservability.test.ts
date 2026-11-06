import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

function createMemoryStorage(): Storage {
  const store = new Map<string, string>();
  return {
    get length() {
      return store.size;
    },
    clear() {
      store.clear();
    },
    getItem(key: string) {
      return store.has(key) ? (store.get(key) as string) : null;
    },
    key(index: number) {
      return Array.from(store.keys())[index] ?? null;
    },
    removeItem(key: string) {
      store.delete(key);
    },
    setItem(key: string, value: string) {
      store.set(key, String(value));
    },
  };
}

if (typeof globalThis.localStorage === 'undefined') {
  Object.defineProperty(globalThis, 'localStorage', {
    value: createMemoryStorage(),
    configurable: true,
    writable: true,
  });
}

function collectProductionSourceFiles(dirPath: string): string[] {
  const entries = fs.readdirSync(dirPath, { withFileTypes: true });
  const collected: string[] = [];
  for (const entry of entries) {
    if (entry.name === '__tests__' || entry.name === 'node_modules') continue;
    const fullPath = path.join(dirPath, entry.name);
    if (entry.isDirectory()) {
      collected.push(...collectProductionSourceFiles(fullPath));
    } else if (entry.isFile() && /\.(ts|tsx)$/.test(entry.name) && !entry.name.endsWith('.d.ts')) {
      collected.push(fullPath);
    }
  }
  return collected;
}

describe('Wave 2 — Zero-Any Static Type Gate & Observability Hardening', () => {
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    globalThis.localStorage.clear();
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  it('enforces zero explicit any, as any, Record<string, any>, and @ts-ignore across production src files', () => {
    const srcRoot = path.resolve(__dirname, '..');
    const prodFiles = collectProductionSourceFiles(srcRoot);
    expect(prodFiles.length).toBeGreaterThan(20);

    const violations: string[] = [];
    const forbiddenPattern = /(:\s*any\b|<any>|:\s*any\[\]|Record<string,\s*any>|\bas\s+any\b|@ts-ignore\b)/;

    for (const filePath of prodFiles) {
      const rel = path.relative(srcRoot, filePath);
      const lines = fs.readFileSync(filePath, 'utf8').split('\n');
      lines.forEach((line, idx) => {
        const trimmed = line.trim();
        if (trimmed.startsWith('//') || trimmed.startsWith('*') || trimmed.startsWith('/*')) {
          return;
        }
        if (forbiddenPattern.test(line)) {
          violations.push(`${rel}:${idx + 1}: ${trimmed}`);
        }
      });
    }

    expect(violations).toEqual([]);
  });

  it('preserves member_no and prod_cd inside raw_approval_data fallback in reportGhostCharge', async () => {
    const { api } = await import('../services/api');
    const capturedBodies: Array<Record<string, unknown>> = [];

    globalThis.fetch = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
      if (init?.body && typeof init.body === 'string') {
        capturedBodies.push(JSON.parse(init.body) as Record<string, unknown>);
      }
      return new Response(JSON.stringify({ success: true, dlq_id: 'DLQ-W2-1' }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }) as typeof fetch;

    const res = await api.reportGhostCharge({
      store_cd: 'S_W2_TEST',
      member_no: 'M9901',
      prod_cd: 'PROD_DAILY_PASS',
      amount: 25000,
      authNo: 'APPR8877',
      backendErrorReason: 'Allocate timeout',
      reversalErrorReason: 'VCAT disconnected',
    });

    expect(res.success).toBe(true);
    expect(capturedBodies).toHaveLength(1);
    expect(capturedBodies[0].auth_no).toBe('APPR8877');
    expect(JSON.parse(String(capturedBodies[0].raw_approval_data))).toEqual({
      member_no: 'M9901',
      prod_cd: 'PROD_DAILY_PASS',
    });
  });

  it('records API_ERROR in Kiosk BlackBox when getMemberCoupons encounters a network failure', async () => {
    const { api } = await import('../services/api');
    const { clearKioskBlackBox, getRecentKioskBlackBoxLogs } = await import('../utils/kioskBlackBox');

    clearKioskBlackBox();
    globalThis.fetch = vi.fn(async () => {
      throw new Error('coupon endpoint unreachable');
    }) as typeof fetch;

    const list = await api.getMemberCoupons('M9901');
    expect(list).toEqual([]);

    const entries = getRecentKioskBlackBoxLogs();
    expect(entries.some((e) => e.category === 'API_ERROR' && e.actionName.includes('COUPON_LIST_WARN'))).toBe(true);
  });
});
