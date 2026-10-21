import { describe, it, expect, vi, beforeEach, afterEach, beforeAll } from 'vitest';

const storageMap = new Map<string, string>();
(globalThis as any).localStorage = {
  getItem: (k: string) => (storageMap.has(k) ? storageMap.get(k)! : null),
  setItem: (k: string, v: string) => storageMap.set(k, String(v)),
  removeItem: (k: string) => storageMap.delete(k),
  clear: () => storageMap.clear(),
};

describe('Kiosk Signup Core & Validation Scenarios (R01 ~ R05)', () => {
  const originalFetch = global.fetch;
  let api: typeof import('../api').api;
  let validateMemberRegisterForm: typeof import('../../components/MemberRegister').validateMemberRegisterForm;

  beforeAll(async () => {
    const mod = await import('../api');
    api = mod.api;
    const regMod = await import('../../components/MemberRegister');
    validateMemberRegisterForm = regMod.validateMemberRegisterForm;
  });

  beforeEach(() => {
    vi.restoreAllMocks();
    storageMap.clear();
    vi.spyOn(api, 'checkConnection').mockResolvedValue(true);
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  // --------------------------------------------------------------------------
  // R01: 정상 신규 회원가입 및 기본 등급(할인율/적립률) 자동 부여
  // --------------------------------------------------------------------------
  it('R01 [정상 신규 회원가입 및 기본 등급(할인율/적립률) 자동 부여]: 200 OK 응답 및 마스킹/등급/캐시 영속화 검증', async () => {
    const mockCreatedMember = {
      member_no: 'M0101',
      member_name: '김골프',
      masked_name: '김*프',
      hp: '010-8888-9999',
      store_cd: 'STORE01',
      gender: 'M',
      grade_cd: 'GENERAL',
      discount_rate: 5.0,
      point_rate: 2.0,
      total_point: 0,
      use_yn: 'Y',
      face_registered: false,
      assets: [],
    };

    global.fetch = vi.fn().mockImplementation(async (url: string, opts?: any) => {
      const urlStr = String(url);
      if (urlStr.includes('/v1/kiosk/member') && opts?.method === 'POST') {
        const body = JSON.parse(opts.body);
        expect(body.member_name).toBe('김골프');
        expect(body.hp).toBe('010-8888-9999');
        expect(body.gender).toBe('M');
        expect(body.privacy_agree_yn).toBe('Y');
        return {
          ok: true,
          status: 200,
          json: async () => mockCreatedMember,
        };
      }
      return { ok: false, status: 404, json: async () => ({}) };
    });

    const res = await api.registerMember(
      '김골프',
      '010-8888-9999',
      '',
      false,
      null,
      'M',
      false,
      null,
      true
    );

    expect(res.success).toBe(true);
    expect(res.member).toBeDefined();
    expect(res.member?.member_name).toBe('김골프');
    expect(res.member?.masked_name).toBe('김*프');
    expect(res.member?.grade_cd).toBe('GENERAL');
    expect(res.member?.discount_rate).toBe(5.0);
    expect(res.member?.point_rate).toBe(2.0);

    // LocalStorage 캐시 동기화 확인
    const cachedMembers = JSON.parse(localStorage.getItem('LM_MEMBERS') || '[]');
    expect(cachedMembers.length).toBe(1);
    expect(cachedMembers[0].member_no).toBe('M0101');
    expect(cachedMembers[0].hp).toBe('010-8888-9999');
  });

  // --------------------------------------------------------------------------
  // R02: 이미 등록된 휴대폰 번호 중복 가입 선제 차단
  // --------------------------------------------------------------------------
  it('R02 [이미 등록된 휴대폰 번호 중복 가입 선제 차단]: getMember 조회 감지 및 백엔드 400 Bad Request 차단', async () => {
    // 1. 선제 중복 체크 단계: getMember가 기존 활성 회원을 반환하는 경우
    global.fetch = vi.fn().mockImplementation(async (url: string) => {
      const urlStr = String(url);
      if (urlStr.includes('/v1/kiosk/member') && urlStr.includes('query=01012345678')) {
        return {
          ok: true,
          status: 200,
          json: async () => ({
            member_no: 'M0099',
            member_name: '기존회원',
            masked_name: '기*원',
            hp: '010-1234-5678',
            status_cd: '10',
          }),
        };
      }
      return { ok: false, status: 404, json: async () => null };
    });

    const existing = await api.getMember('01012345678');
    expect(existing).not.toBeNull();
    expect(existing?.member_no).toBe('M0099');

    // 프론트엔드 검증 가드 로직 시뮬레이션
    let registerBlockedReason = '';
    if (existing) {
      registerBlockedReason = '이미 가입된 휴대폰 번호입니다. 회원 인증(로그인)을 이용해 주세요.';
    }
    expect(registerBlockedReason).toBe('이미 가입된 휴대폰 번호입니다. 회원 인증(로그인)을 이용해 주세요.');

    // 2. 백엔드 직접 POST 요청 시 400 거부 핸들링 검증
    global.fetch = vi.fn().mockImplementation(async (url: string, opts?: any) => {
      const urlStr = String(url);
      if (urlStr.includes('/v1/kiosk/member') && opts?.method === 'POST') {
        return {
          ok: false,
          status: 400,
          json: async () => ({ detail: '이미 등록된 휴대폰 번호입니다.' }),
        };
      }
      return { ok: false, status: 404, json: async () => ({}) };
    });

    const res = await api.registerMember(
      '신규회원',
      '010-1234-5678',
      '',
      false,
      null,
      'M',
      false,
      null,
      true
    );
    expect(res.success).toBe(false);
    expect(res.message).toBe('이미 등록된 휴대폰 번호입니다.');
  });

  // --------------------------------------------------------------------------
  // R03: 휴면/이용제한/탈퇴 계정 번호 재가입 차단 및 데스크 안내
  // --------------------------------------------------------------------------
  it('R03 [휴면/이용제한/탈퇴 계정 번호 재가입 차단 및 데스크 안내]: 403 inactive 플래그 전파 및 프런트 데스크 안내', async () => {
    // 1. 온라인 모드: 백엔드에서 403 반환 시
    global.fetch = vi.fn().mockImplementation(async (url: string) => {
      const urlStr = String(url);
      if (urlStr.includes('/v1/kiosk/member') && urlStr.includes('query=01055557777')) {
        return {
          ok: false,
          status: 403,
          json: async () => ({ detail: '현재 휴면 또는 이용 제한(일시정지/탈퇴) 상태인 회원입니다. 프런트 데스크에 문의해 주세요.' }),
        };
      }
      return { ok: false, status: 404, json: async () => null };
    });

    let detectedInactive = false;
    let deskNotice = '';
    try {
      await api.getMember('01055557777');
    } catch (err: any) {
      if (err?.status === 403 || err?.inactive) {
        detectedInactive = true;
        deskNotice = '이미 등록된 휴대폰 번호(휴면/탈퇴/이용제한 상태)입니다. 프런트 데스크에 문의해 주세요.';
      }
    }
    expect(detectedInactive).toBe(true);
    expect(deskNotice).toBe('이미 등록된 휴대폰 번호(휴면/탈퇴/이용제한 상태)입니다. 프런트 데스크에 문의해 주세요.');

    // 2. 오프라인 EdgeDB 모드: 캐시에 탈퇴/휴면 회원 존재 시 403/inactive 에러 throw 검증
    vi.spyOn(api, 'checkConnection').mockResolvedValue(false);
    localStorage.setItem('LM_MEMBERS', JSON.stringify([
      {
        member_no: 'M_DORMANT_01',
        member_name: '탈퇴회원',
        hp: '010-9999-0000',
        status_cd: '90',
        use_yn: 'N',
        deleted_at: 1772450000,
      }
    ]));

    let offlineInactive = false;
    try {
      await api.getMember('01099990000');
    } catch (err: any) {
      if (err?.status === 403 && err?.inactive) {
        offlineInactive = true;
      }
    }
    expect(offlineInactive).toBe(true);
  });

  // --------------------------------------------------------------------------
  // R04: 이름 및 전화번호 유효성 검증 가드 (미완성 자모음, 특수문자, 2자 미만, 10~11자리)
  // --------------------------------------------------------------------------
  describe('R04 [이름 및 전화번호 유효성 검증 가드]', () => {
    it('1글자 이름 ("김") 제출 시 2자 이상 에러 반환', () => {
      const res = validateMemberRegisterForm({
        name: '김',
        hp: '010-8888-9999',
        privacyAgree: true,
      });
      expect(res.isValid).toBe(false);
      expect(res.errorMsg).toBe('이름을 2글자 이상 정확히 입력해 주세요.');
    });

    it('미완성 자모음 이름 ("김ㄱ") 제출 시 완성형 한글 안내 반환', () => {
      const res = validateMemberRegisterForm({
        name: '김ㄱ',
        hp: '010-8888-9999',
        privacyAgree: true,
      });
      expect(res.isValid).toBe(false);
      expect(res.errorMsg).toBe('이름에 완성되지 않은 자음/모음이 포함되어 있습니다. 정확히 입력해 주세요.');
    });

    it('특수문자 및 숫자 포함 이름 ("John@123") 제출 시 한글/영문 전용 안내 반환', () => {
      const res = validateMemberRegisterForm({
        name: 'John@123',
        hp: '010-8888-9999',
        privacyAgree: true,
      });
      expect(res.isValid).toBe(false);
      expect(res.errorMsg).toBe('이름은 한글 또는 영문으로만 입력해 주세요.');
    });

    it('자릿수 부족 전화번호 ("010-123") 제출 시 10~11자리 안내 반환', () => {
      const res = validateMemberRegisterForm({
        name: '김골프',
        hp: '010-123',
        privacyAgree: true,
      });
      expect(res.isValid).toBe(false);
      expect(res.errorMsg).toBe('올바른 휴대폰 번호(010 등 10~11자리)를 입력해 주세요.');
    });

    it('일반 유선전화번호 ("02-123-4567") 제출 시 010 등 휴대폰 안내 반환', () => {
      const res = validateMemberRegisterForm({
        name: '김골프',
        hp: '02-123-4567',
        privacyAgree: true,
      });
      expect(res.isValid).toBe(false);
      expect(res.errorMsg).toBe('올바른 휴대폰 번호(010 등 10~11자리)를 입력해 주세요.');
    });

    it('정상 이름 및 11자리 휴대폰 번호 제출 시 통과 및 정규화 값 반환', () => {
      const res = validateMemberRegisterForm({
        name: ' 김골프 ',
        hp: '010-8888-9999',
        privacyAgree: true,
      });
      expect(res.isValid).toBe(true);
      expect(res.cleanName).toBe('김골프');
      expect(res.cleanHp).toBe('01088889999');
    });
  });

  // --------------------------------------------------------------------------
  // R05: 필수 개인정보 약관 미동의 시 가입 차단
  // --------------------------------------------------------------------------
  describe('R05 [필수 개인정보 약관 미동의 시 가입 차단]', () => {
    it('privacyAgree = false 상태 제출 시 즉각 차단 및 약관 동의 안내 반환', () => {
      const res = validateMemberRegisterForm({
        name: '김골프',
        hp: '010-8888-9999',
        privacyAgree: false,
      });
      expect(res.isValid).toBe(false);
      expect(res.errorMsg).toBe('필수 개인정보 수집 및 키오스크 이용약관에 동의해 주세요.');
    });

    it('오프라인 EdgeDB 가입 시에도 privacyAgree = false 차단 검증', async () => {
      vi.spyOn(api, 'checkConnection').mockResolvedValue(false);
      const res = await api.registerMember(
        '김골프',
        '010-8888-9999',
        '',
        false,
        null,
        'M',
        false,
        null,
        false // privacyAgree
      );
      expect(res.success).toBe(false);
      expect(res.message).toBe('필수 개인정보 수집 및 키오스크 이용약관에 동의해 주세요.');
    });
  });
});
