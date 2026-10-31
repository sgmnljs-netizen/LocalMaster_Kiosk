import { describe, expect, it } from 'vitest';
import {
  CODE128_PATTERNS,
  encodeCode128B,
  normalizeCode128Text,
} from '../../utils/code128Barcode';
import {
  canAllocatePracticeBayImmediately,
  extractProductAllowedCategories,
} from '../../utils/kioskPurchaseEligibility';
import { resolveIntroSlides } from '../../components/IntroScreen';
import { api } from '../api';
import { saveKioskSettings, getKioskSettings } from '../../stores/kioskSettings';

describe('Phase 3 Hardening — [H-2] ISO/IEC 15417 Code128B Scannable Barcode Engine', () => {
  it('encodes ASCII payload with Start B(104), Modulo-103 checksum, 13-module Stop(106), and 10-module quiet zones', () => {
    // "RES-101":
    // Start B = 104
    // 'R'(82)->50*1=50, 'E'(69)->37*2=74, 'S'(83)->51*3=153, '-'(45)->13*4=52,
    // '1'(49)->17*5=85, '0'(48)->16*6=96, '1'(49)->17*7=119
    // Sum = 104 + 50 + 74 + 153 + 52 + 85 + 96 + 119 = 733 -> 733 % 103 = 12
    const encoded = encodeCode128B('RES-101', 10);
    expect(encoded.normalizedText).toBe('RES-101');
    expect(encoded.checksum).toBe(12);
    expect(encoded.symbolValues).toEqual([104, 50, 37, 51, 13, 17, 16, 17, 12, 106]);

    // Total modules: 10(left quiet) + 9 symbols * 11 modules + 13(stop) + 10(right quiet) = 132
    expect(encoded.totalModules).toBe(10 + 9 * 11 + 13 + 10);
    expect(encoded.bars[0].x).toBe(10);
    const lastBar = encoded.bars[encoded.bars.length - 1];
    expect(lastBar.x + lastBar.width).toBe(encoded.totalModules - 10);
    expect(CODE128_PATTERNS).toHaveLength(107);
  });

  it('falls back safely to GOLFOS when non-ASCII or empty text is passed', () => {
    expect(normalizeCode128Text('   ')).toBe('GOLFOS');
    expect(normalizeCode128Text('한글전용')).toBe('GOLFOS');
    expect(normalizeCode128Text('RES_20261031_01')).toBe('RES_20261031_01');
  });
});

describe('Phase 3 Hardening — [H-5] Immediate Practice Bay CTA Eligibility Filter', () => {
  const todayKst = '2026-10-31';

  it('allows immediate allocation for active practice-bay membership starting today or earlier', () => {
    expect(
      canAllocatePracticeBayImmediately(
        {
          purchaseType: 'MEMBERSHIP',
          memberNo: 'M001',
          logicType: 'PERIOD',
          productName: '전일 1개월 기간권',
          startDate: '2026-10-31',
          allowedCategories: ['BAY'],
        },
        todayKst
      )
    ).toBe(true);
  });

  it('blocks immediate allocation for chained future-dated period passes (startDate > today)', () => {
    expect(
      canAllocatePracticeBayImmediately(
        {
          purchaseType: 'MEMBERSHIP',
          memberNo: 'M001',
          logicType: 'PERIOD',
          productName: '전일 3개월 연장권',
          startDate: '2026-11-15',
          allowedCategories: ['BAY'],
        },
        todayKst
      )
    ).toBe(false);
  });

  it('blocks immediate practice-bay CTA for Par3, Lesson, Locker, or Goods purchases', () => {
    expect(
      canAllocatePracticeBayImmediately(
        {
          purchaseType: 'MEMBERSHIP',
          memberNo: 'M001',
          logicType: 'COUNT',
          productName: 'PAR3 18홀 10회권',
          startDate: '2026-10-31',
          allowedCategories: ['PAR3'],
        },
        todayKst
      )
    ).toBe(false);

    expect(
      canAllocatePracticeBayImmediately(
        {
          purchaseType: 'MEMBERSHIP',
          memberNo: 'M001',
          logicType: 'LESSON',
          productName: '프로 1:1 레슨 10회',
          startDate: '2026-10-31',
        },
        todayKst
      )
    ).toBe(false);

    expect(
      extractProductAllowedCategories({
        prod_nm: '파3 주중 10회권',
        logic_type: 'COUNT',
        access_rules: { allowed_categories: ['PAR3'] },
      })
    ).toEqual(['PAR3']);
  });
});

describe('Phase 3 Hardening — [M-2] Offline Intro Banner Zero External CDN Dependency', () => {
  it('uses local inline SVG data URIs with zero unsplash.com external dependencies when HQ banners are empty', () => {
    const slides = resolveIntroSlides([]);
    expect(slides.length).toBeGreaterThanOrEqual(3);
    for (const slide of slides) {
      expect(slide.url.startsWith('data:image/svg+xml;utf8,')).toBe(true);
      expect(slide.url.includes('unsplash.com')).toBe(false);
    }
  });
});

describe('Phase 3 Hardening — [H-4] BLE Hardware Bridge Port SSOT Isolation', () => {
  it('always targets hardware bridge port 18080 even when vcatPort is configured for Smartro/Koces VAN', () => {
    const storageMap = new Map<string, string>();
    const memoryStorage: Storage = {
      get length() {
        return storageMap.size;
      },
      clear: () => storageMap.clear(),
      getItem: (key: string) => storageMap.get(key) ?? null,
      key: (index: number) => Array.from(storageMap.keys())[index] ?? null,
      removeItem: (key: string) => {
        storageMap.delete(key);
      },
      setItem: (key: string, value: string) => {
        storageMap.set(key, String(value));
      },
    };
    const prevStorageDescriptor = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
    const prevWindowDescriptor = Object.getOwnPropertyDescriptor(globalThis, 'window');
    Object.defineProperty(globalThis, 'localStorage', {
      value: memoryStorage,
      configurable: true,
      writable: true,
    });
    Object.defineProperty(globalThis, 'window', {
      value: {
        localStorage: memoryStorage,
        location: {
          hostname: 'localhost',
          port: '5179',
          origin: 'http://localhost:5179',
        },
        dispatchEvent: () => true,
      },
      configurable: true,
      writable: true,
    });

    try {
      const prev = getKioskSettings();
      saveKioskSettings({ ...prev, providerType: 'SMARTRO_VAN', vcatPort: '8088' });
      expect(getKioskSettings().vcatPort).toBe('8088');
      expect(api.getLocalBleBridgeUrl()).toBe('http://127.0.0.1:18080');

      memoryStorage.setItem('LM_HW_BRIDGE_URL', 'http://127.0.0.1:18090/');
      expect(api.getLocalBleBridgeUrl()).toBe('http://127.0.0.1:18090');
    } finally {
      if (prevStorageDescriptor) {
        Object.defineProperty(globalThis, 'localStorage', prevStorageDescriptor);
      } else {
        Reflect.deleteProperty(globalThis, 'localStorage');
      }
      if (prevWindowDescriptor) {
        Object.defineProperty(globalThis, 'window', prevWindowDescriptor);
      } else {
        Reflect.deleteProperty(globalThis, 'window');
      }
    }
  });
});

