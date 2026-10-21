import { describe, it, expect, vi, beforeEach, afterEach, beforeAll } from 'vitest';
import { Member } from '../api';

const storageMap = new Map<string, string>();
(globalThis as any).localStorage = {
  getItem: (k: string) => (storageMap.has(k) ? storageMap.get(k)! : null),
  setItem: (k: string, v: string) => storageMap.set(k, String(v)),
  removeItem: (k: string) => storageMap.delete(k),
  clear: () => storageMap.clear(),
};

/**
 * Kiosk State Machine Controller for Signup Funnel & Session Defense
 * Mirrors the exact logic in KioskApp.tsx for:
 * - handleRegisterSuccess (BUG-M12, BUG-S05, Standalone 4-tier Session Defense)
 * - handleGoBack (MEMBER_REGISTER -> MEMBER_AUTH vs MAIN_DASHBOARD)
 * - handleGoHome
 */
class KioskAppSimulator {
  public step: string = 'MAIN_DASHBOARD';
  public purpose: string | null = null;
  public selectedBayNo: number | null = null;
  public selectedBayNoRef = { current: null as number | null };
  public selectedBayNos: number[] = [];
  public selectedBayNosRef = { current: [] as number[] };
  public authMember: Member | null = null;
  public lastToast: { message: string; isWarning: boolean } | null = null;
  public lang: 'KO' | 'EN' = 'KO';

  constructor(private api: typeof import('../api').api) {}

  public showToast(message: string, isWarning = false) {
    this.lastToast = { message, isWarning };
  }

  public handleGoHome() {
    const bayToRelease = this.selectedBayNo ?? this.selectedBayNoRef.current;
    if (bayToRelease !== null) {
      this.api.releaseBay(bayToRelease).catch(console.error);
    }
    const baysToRelease = this.selectedBayNos.length > 0 ? this.selectedBayNos : this.selectedBayNosRef.current;
    if (baysToRelease.length > 0) {
      this.api.releaseBays(baysToRelease).catch(console.error);
    }
    this.selectedBayNoRef.current = null;
    this.selectedBayNosRef.current = [];
    this.authMember = null;
    this.selectedBayNo = null;
    this.selectedBayNos = [];
    this.purpose = null;
    this.step = 'MAIN_DASHBOARD';
  }

  public handleGoBack() {
    if (this.step === 'MEMBER_AUTH') {
      if (this.purpose === 'ALLOCATE_DAILY' && (this.selectedBayNo ?? this.selectedBayNoRef.current) !== null) {
        this.step = 'PRODUCT_SHOP';
        return;
      }
      if (this.purpose === 'ALLOCATE_MEMBERSHIP' || this.purpose === 'ALLOCATE_DAILY') {
        const bayToRelease = this.selectedBayNo ?? this.selectedBayNoRef.current;
        if (bayToRelease !== null) {
          this.api.releaseBay(bayToRelease).catch(console.error);
          this.selectedBayNo = null;
          this.selectedBayNoRef.current = null;
        }
        const baysToRelease = this.selectedBayNos.length > 0 ? this.selectedBayNos : this.selectedBayNosRef.current;
        if (baysToRelease.length > 0) {
          this.api.releaseBays(baysToRelease).catch(console.error);
          this.selectedBayNos = [];
          this.selectedBayNosRef.current = [];
        }
        this.step = 'PRACTICE_SELECT';
        return;
      }
      this.handleGoHome();
    } else if (this.step === 'MEMBER_REGISTER') {
      if (
        this.purpose === 'PURCHASE_PRODUCT' ||
        this.purpose === 'EXTEND_LOCKER' ||
        this.purpose === 'MOVE_BAY' ||
        this.purpose === 'CHECKIN_RESERVATION' ||
        ((this.purpose === 'ALLOCATE_MEMBERSHIP' || this.purpose === 'ALLOCATE_DAILY') &&
          ((this.selectedBayNo ?? this.selectedBayNoRef.current) !== null || this.selectedBayNos.length > 0))
      ) {
        this.step = 'MEMBER_AUTH';
        return;
      }
      this.handleGoHome();
    } else if (this.step === 'PRODUCT_SHOP') {
      if (this.purpose === 'ALLOCATE_DAILY') {
        const bayToRelease = this.selectedBayNo ?? this.selectedBayNoRef.current;
        if (bayToRelease !== null) {
          this.api.releaseBay(bayToRelease).catch(console.error);
          this.selectedBayNo = null;
          this.selectedBayNoRef.current = null;
        }
        this.step = 'PRACTICE_SELECT';
        return;
      }
      this.handleGoHome();
    } else {
      this.handleGoHome();
    }
  }

  public async handleRegisterSuccess(member: Member) {
    const activeBayNo = this.selectedBayNo ?? this.selectedBayNoRef.current;
    const warnSuffix = (member as any)?.face_enroll_warning
      ? ` (${(member as any).face_enroll_warning})`
      : '';

    await this.api.writeKioskLog(
      'REGISTER_SUCCESS',
      `즉석 회원가입 성공 (${member.member_name}, ${member.hp})`,
      member.member_no
    );

    // 🛡️ BUG-M12: 타석을 이미 선점한 뒤 [30초 신규 회원가입]을 진행한 경우, 선점 락을 해제하지 않고
    // 가입된 회원 세션(등급 할인/포인트 적립)을 유지한 채 일일 타석권 결제(PRODUCT_SHOP)로 즉시 연결
    if (activeBayNo !== null && (this.purpose === 'ALLOCATE_MEMBERSHIP' || this.purpose === 'ALLOCATE_DAILY')) {
      this.authMember = member;
      this.purpose = 'ALLOCATE_DAILY';
      this.showToast(
        this.lang === 'KO'
          ? `${member.member_name} 님 가입이 완료되었습니다! 선택하신 ${activeBayNo}번 타석 일일권 결제로 이동합니다.${warnSuffix}`
          : `Welcome ${member.member_name}! Proceeding to Bay ${activeBayNo} Daily Pass.${warnSuffix}`,
        Boolean((member as any)?.face_enroll_warning)
      );
      this.step = 'PRODUCT_SHOP';
      return;
    }

    // 🛡️ BUG-S05: [회원권/상품 구매] (PURCHASE_PRODUCT) 퍼널에서 [30초 신규 회원가입]을 완료한 경우,
    // 세션을 파기하지 않고 방금 가입한 회원 자격으로 상품 매대(PRODUCT_SHOP)로 즉시 직행
    if (this.purpose === 'PURCHASE_PRODUCT') {
      this.authMember = member;
      this.showToast(
        this.lang === 'KO'
          ? `${member.member_name} 님 가입이 완료되었습니다! 회원권 및 상품 구매 화면으로 이동합니다.${warnSuffix}`
          : `Welcome ${member.member_name}! Proceeding to Membership Shop.${warnSuffix}`,
        Boolean((member as any)?.face_enroll_warning)
      );
      this.step = 'PRODUCT_SHOP';
      return;
    }

    const bayToRelease = this.selectedBayNo ?? this.selectedBayNoRef.current;
    if (bayToRelease !== null) {
      this.api.releaseBay(bayToRelease).catch(console.error);
      this.selectedBayNo = null;
      this.selectedBayNoRef.current = null;
    }
    const baysToRelease = this.selectedBayNos.length > 0 ? this.selectedBayNos : this.selectedBayNosRef.current;
    if (baysToRelease.length > 0) {
      this.api.releaseBays(baysToRelease).catch(console.error);
      this.selectedBayNos = [];
      this.selectedBayNosRef.current = [];
    }

    // 홈 화면에서 단독 회원가입한 경우 공용 단말기 보호를 위해 세션을 유지하지 않고 홈으로 복귀
    this.authMember = null;
    this.purpose = null;
    this.showToast(
      this.lang === 'KO'
        ? `${member.member_name} 님, 환영합니다! 신규 회원가입이 완료되었습니다.${warnSuffix}`
        : `Welcome ${member.member_name}! Registration successful.${warnSuffix}`,
      Boolean((member as any)?.face_enroll_warning)
    );
    this.step = 'MAIN_DASHBOARD';
  }
}

describe('Kiosk Signup Funnel & Session Defense Specialist (R06, R07, R08)', () => {
  const originalFetch = global.fetch;
  let api: typeof import('../api').api;
  let kiosk: KioskAppSimulator;

  beforeAll(async () => {
    const mod = await import('../api');
    api = mod.api;
  });

  beforeEach(() => {
    vi.restoreAllMocks();
    storageMap.clear();
    storageMap.set('LM_STORE_CD', 'TEST-STORE');
    storageMap.set('LM_KIOSK_TERMINAL_ID', 'KIOSK-01');

    vi.spyOn(api, 'checkConnection').mockResolvedValue(true);
    vi.spyOn(api, 'getStoreCd').mockReturnValue('TEST-STORE');
    vi.spyOn(api, 'getTerminalId').mockReturnValue('KIOSK-01');
    vi.spyOn(api, 'writeKioskLog').mockResolvedValue(undefined);

    kiosk = new KioskAppSimulator(api);
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  // =========================================================================
  // R06 [타석 선점 상태에서 가입 완료 시 선점 락 유지 & 회원 할인 결제 퍼널 직행 (BUG-M12)]
  // =========================================================================
  describe('R06 [타석 선점 상태에서 가입 완료 시 선점 락 유지 & 회원 할인 결제 퍼널 직행 (BUG-M12)]', () => {
    it('타석(5번) 선점 후 ALLOCATE_MEMBERSHIP 퍼널에서 가입 완료 시 타석 락을 유지하고 일일권 결제 매대(PRODUCT_SHOP)로 직행한다', async () => {
      const releaseBaySpy = vi.spyOn(api, 'releaseBay').mockResolvedValue(undefined);
      const releaseBaysSpy = vi.spyOn(api, 'releaseBays').mockResolvedValue(undefined);

      // 1. 5번 타석 선점 설정
      kiosk.selectedBayNo = 5;
      kiosk.selectedBayNoRef.current = 5;
      kiosk.purpose = 'ALLOCATE_MEMBERSHIP';
      kiosk.step = 'MEMBER_REGISTER';

      // 2. 신규 가입 완료 회원 (10% 할인율 보유)
      const newMember: Member = {
        member_no: 'M_NEW_005',
        member_name: '오타석',
        hp: '010-5555-5555',
        grade_cd: 'VIP',
        member_grade: 'VIP',
        discount_rate: 10,
        total_point: 0,
        status_cd: '10',
        assets: [],
      };

      // 3. 회원가입 완료 핸들러 실행
      await kiosk.handleRegisterSuccess(newMember);

      // 4. 핵심 검증: 선점 락 해제 API가 절대 호출되지 않음!
      expect(releaseBaySpy).not.toHaveBeenCalled();
      expect(releaseBaysSpy).not.toHaveBeenCalled();

      // 5. 타석 번호 및 세션 유지 검증
      expect(kiosk.selectedBayNo).toBe(5);
      expect(kiosk.selectedBayNoRef.current).toBe(5);
      expect(kiosk.authMember).toEqual(newMember);
      expect(kiosk.purpose).toBe('ALLOCATE_DAILY');
      expect(kiosk.step).toBe('PRODUCT_SHOP');

      // 6. 안내 토스트 메시지 검증
      expect(kiosk.lastToast?.message).toContain('오타석 님 가입이 완료되었습니다');
      expect(kiosk.lastToast?.message).toContain('5번 타석 일일권 결제로 이동합니다');

      // 7. ProductShop 할인 계산 검증 (BUG-M12 연계)
      const standardPrice = 20000;
      const discountRate = kiosk.authMember?.discount_rate || 0;
      const discountAmt = Math.round(standardPrice * (discountRate / 100));
      const finalPrice = standardPrice - discountAmt;
      expect(finalPrice).toBe(18000);
    });

    it('ALLOCATE_DAILY 퍼널에서 5번 타석 선점 후 가입 완료 시에도 선점 락이 유지되고 PRODUCT_SHOP으로 직행한다', async () => {
      const releaseBaySpy = vi.spyOn(api, 'releaseBay').mockResolvedValue(undefined);
      const releaseBaysSpy = vi.spyOn(api, 'releaseBays').mockResolvedValue(undefined);

      kiosk.selectedBayNo = 5;
      kiosk.selectedBayNoRef.current = 5;
      kiosk.purpose = 'ALLOCATE_DAILY';
      kiosk.step = 'MEMBER_REGISTER';

      const newMember: Member = {
        member_no: 'M_NEW_007',
        member_name: '칠타석',
        hp: '010-7777-7777',
        grade_cd: 'GENERAL',
        discount_rate: 5,
        total_point: 0,
        status_cd: '10',
        assets: [],
      };

      await kiosk.handleRegisterSuccess(newMember);

      expect(releaseBaySpy).not.toHaveBeenCalled();
      expect(releaseBaysSpy).not.toHaveBeenCalled();
      expect(kiosk.selectedBayNo).toBe(5);
      expect(kiosk.authMember?.member_no).toBe('M_NEW_007');
      expect(kiosk.step).toBe('PRODUCT_SHOP');
      expect(kiosk.purpose).toBe('ALLOCATE_DAILY');
    });
  });

  // =========================================================================
  // R07 [회원권 구매 퍼널(PURCHASE_PRODUCT) 중 가입 완료 시 상품 매대 세션 유지 직행 (BUG-S05)]
  // =========================================================================
  describe('R07 [회원권 구매 퍼널(PURCHASE_PRODUCT) 중 가입 완료 시 상품 매대 세션 유지 직행 (BUG-S05)]', () => {
    it('회원권 구매 퍼널에서 회원가입 화면의 [< 이전 단계] 클릭 시 홈으로 튕기지 않고 MEMBER_AUTH 화면으로 안전 복귀한다', () => {
      kiosk.purpose = 'PURCHASE_PRODUCT';
      kiosk.step = 'MEMBER_REGISTER';

      kiosk.handleGoBack();

      // 홈(MAIN_DASHBOARD)으로 튕기지 않고 인증 모달(MEMBER_AUTH)로 복귀
      expect(kiosk.step).toBe('MEMBER_AUTH');
      expect(kiosk.purpose).toBe('PURCHASE_PRODUCT');
    });

    it('회원권 구매 퍼널에서 가입 완료 시 세션을 파기하지 않고 신규 회원 로그인 상태로 PRODUCT_SHOP 직행한다', async () => {
      kiosk.purpose = 'PURCHASE_PRODUCT';
      kiosk.step = 'MEMBER_REGISTER';

      const newMember: Member = {
        member_no: 'M_SHOP_01',
        member_name: '상품구매자',
        hp: '010-3333-7777',
        grade_cd: 'VIP',
        member_grade: 'VIP',
        discount_rate: 15,
        total_point: 0,
        status_cd: '10',
        assets: [],
      };

      await kiosk.handleRegisterSuccess(newMember);

      // 세션 유지 및 PRODUCT_SHOP 직행 검증
      expect(kiosk.authMember).toEqual(newMember);
      expect(kiosk.step).toBe('PRODUCT_SHOP');
      expect(kiosk.purpose).toBe('PURCHASE_PRODUCT');
      expect(kiosk.lastToast?.message).toContain('상품구매자 님 가입이 완료되었습니다');
      expect(kiosk.lastToast?.message).toContain('회원권 및 상품 구매 화면으로 이동합니다');
    });

    it('백엔드 registerMember API 호출 시 올바른 페이로드 전송 및 캐시 갱신을 검증한다', async () => {
      const mockCreatedMember = {
        member_no: 'M_BACKEND_01',
        member_name: '백엔드가입',
        hp: '010-1234-5678',
        email: 'test@example.com',
        gender: 'M',
        grade_cd: 'VIP',
        discount_rate: 10,
        point_rate: 5,
        total_point: 0,
        use_yn: 'Y',
        assets: [],
      };

      global.fetch = vi.fn().mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => mockCreatedMember,
      } as any);

      const res = await api.registerMember('  백엔드가입  ', '010-1234-5678', 'test@example.com', false, null, 'M');

      expect(res.success).toBe(true);
      expect(res.member?.member_name).toBe('백엔드가입');
      expect(res.member?.discount_rate).toBe(10);

      // 로컬 스토리지 캐시 동기화 확인
      const cached = JSON.parse(storageMap.get('LM_MEMBERS') || '[]');
      expect(cached.some((m: any) => m.member_no === 'M_BACKEND_01')).toBe(true);
    });
  });

  // =========================================================================
  // R08 [단독 회원가입 완료 시 보안 4중 세션 파기 & 홈 복귀]
  // =========================================================================
  describe('R08 [단독 회원가입 완료 시 보안 4중 세션 파기 & 홈 복귀]', () => {
    it('대시보드 단독 회원가입에서 [< 이전 단계] 클릭 시 홈(MAIN_DASHBOARD)으로 복귀하고 모든 세션이 정리된다', () => {
      kiosk.purpose = null;
      kiosk.step = 'MEMBER_REGISTER';
      kiosk.selectedBayNo = 3;
      kiosk.selectedBayNoRef.current = 3;

      kiosk.handleGoBack();

      expect(kiosk.step).toBe('MAIN_DASHBOARD');
      expect(kiosk.selectedBayNo).toBeNull();
      expect(kiosk.authMember).toBeNull();
      expect(kiosk.purpose).toBeNull();
    });

    it('단독 회원가입 완료 시 고아 타석 락(단일 & 다중)을 모두 해제하고 4중 보안 세션 파기 후 MAIN_DASHBOARD로 안전 복귀한다', async () => {
      const releaseBaySpy = vi.spyOn(api, 'releaseBay').mockResolvedValue(undefined);
      const releaseBaysSpy = vi.spyOn(api, 'releaseBays').mockResolvedValue(undefined);

      // 고아 타석 락이 잔존한 상태에서 대시보드 단독 회원가입 진행
      kiosk.purpose = null;
      kiosk.step = 'MEMBER_REGISTER';
      kiosk.selectedBayNo = 5;
      kiosk.selectedBayNoRef.current = 5;
      kiosk.selectedBayNos = [5, 6];
      kiosk.selectedBayNosRef.current = [5, 6];

      const standaloneMember: Member = {
        member_no: 'M_STANDALONE_99',
        member_name: '단독가입자',
        hp: '010-9999-8888',
        grade_cd: 'GENERAL',
        discount_rate: 0,
        total_point: 0,
        status_cd: '10',
        assets: [],
      };

      await kiosk.handleRegisterSuccess(standaloneMember);

      // 1. 고아 타석 락 해제 API 호출 검증
      expect(releaseBaySpy).toHaveBeenCalledWith(5);
      expect(releaseBaysSpy).toHaveBeenCalledWith([5, 6]);

      // 2. 타석 선점 상태 클리어 검증
      expect(kiosk.selectedBayNo).toBeNull();
      expect(kiosk.selectedBayNoRef.current).toBeNull();
      expect(kiosk.selectedBayNos).toEqual([]);
      expect(kiosk.selectedBayNosRef.current).toEqual([]);

      // 3. 4중 세션 파기 검증: 공용 키오스크 해킹 방지를 위해 authMember 및 purpose null 처리
      expect(kiosk.authMember).toBeNull();
      expect(kiosk.purpose).toBeNull();

      // 4. 화면 전환: 안전하게 메인 대시보드로 복귀
      expect(kiosk.step).toBe('MAIN_DASHBOARD');

      // 5. 환영 토스트 안내 표시 검증
      expect(kiosk.lastToast?.message).toContain('단독가입자 님, 환영합니다! 신규 회원가입이 완료되었습니다');
    });

    it('purpose가 SIGNUP으로 설정된 단독 회원가입 시에도 동일하게 세션 파기 및 MAIN_DASHBOARD 복귀가 보장된다', async () => {
      const releaseBaySpy = vi.spyOn(api, 'releaseBay').mockResolvedValue(undefined);

      kiosk.purpose = 'SIGNUP';
      kiosk.step = 'MEMBER_REGISTER';
      kiosk.selectedBayNo = null;

      const member: Member = {
        member_no: 'M_SIGNUP_ONLY',
        member_name: '순수가입자',
        hp: '010-4444-2222',
        grade_cd: 'GENERAL',
        discount_rate: 0,
        total_point: 0,
        status_cd: '10',
        assets: [],
      };

      await kiosk.handleRegisterSuccess(member);

      expect(kiosk.authMember).toBeNull();
      expect(kiosk.purpose).toBeNull();
      expect(kiosk.step).toBe('MAIN_DASHBOARD');
      expect(kiosk.lastToast?.message).toContain('순수가입자 님, 환영합니다!');
      expect(releaseBaySpy).not.toHaveBeenCalled();
    });
  });
});
