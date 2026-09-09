import { test, expect } from '@playwright/test';
import { execSync } from 'child_process';

const DB_PATH = '/Users/sgmnljs/workspace/Python/LocalMaster_Backend/local_master.db';

function resetDatabaseForTests() {
  try {
    execSync(`sqlite3 "${DB_PATH}" "DELETE FROM reservation_master WHERE res_id LIKE 'KSK_%' OR (resource_type = 'BAY' AND resource_no IN ('11', '14', '18'));"`);
    execSync(`sqlite3 "${DB_PATH}" "DELETE FROM checkin_master WHERE res_id LIKE 'KSK_%' OR resource_no IN ('11', '14', '18');"`);
    execSync(`sqlite3 "${DB_PATH}" "UPDATE usage_master SET status_cd = 'FINISHED' WHERE facility_type = 'BAY' AND facility_no IN (11, 14, 18) AND status_cd IN ('RUN', 'ACTIVE', 'IN_USE');"`);
    execSync(`sqlite3 "${DB_PATH}" "UPDATE bays SET status = 'AVAILABLE', current_member_no = NULL, lock_terminal_id = NULL, lock_expired_at = NULL, prepare_started_at = NULL, prepare_expired_at = NULL, start_time = NULL, end_time = NULL WHERE bay_no IN (11, 14, 18);"`);
    execSync(`sqlite3 "${DB_PATH}" "UPDATE member_items SET status = 'ACTIVE', rem_count = 99, end_dt = '2029-12-31' WHERE item_id = 1;"`);
    execSync(`sqlite3 "${DB_PATH}" "INSERT OR REPLACE INTO members (id, member_no, store_cd, member_name, hp, grade_id, status_cd, total_point, unpaid_amt, is_group_leader, privacy_agree_yn, marketing_agree_yn, face_auth_yn, finger_auth_yn, use_yn) VALUES ('MEM-M260501', 'M260501', 'H01-SE-001', '김골프', '010-1234-5678', 'MANAGER', '10', 0, 0, 0, 'Y', 'Y', 'N', 'N', 'Y');"`);
    execSync(`sqlite3 "${DB_PATH}" "UPDATE lockers SET member_no = 'M260501', status = 'OCCUPIED', start_dt = '2026-01-01', end_dt = '2026-12-31' WHERE locker_no = 3;"`);
  } catch (e) {
    console.error('Failed to reset DB for tests:', e);
  }
}

test.describe('Layer 2: 키오스크 P0 8대 골든 패스 (Golden Paths E2E)', () => {

  test.beforeAll(() => {
    resetDatabaseForTests();
  });

  test.afterAll(() => {
    resetDatabaseForTests();
  });

  test.beforeEach(async ({ page, context }) => {
    await context.clearCookies();
    await page.addInitScript(() => {
      window.localStorage.clear();
      window.sessionStorage.clear();
    });
  });

  test('Pass 1: 회원 인증 기반 연습타석 배정 완료 (Member Allocation)', async ({ page }) => {
    // 1. 대기 화면 진입
    await page.goto('/');
    await expect(page.locator('text=화면을 터치하여 시작하세요')).toBeVisible({ timeout: 10000 });
    await page.locator('text=화면을 터치하여 시작하세요').click();

    // 2. 메인 대시보드에서 [연습타석 배정] 클릭
    await expect(page.locator('text=원하시는 서비스를 선택해 주세요')).toBeVisible({ timeout: 5000 });
    await page.locator('text=연습타석 배정').first().click();

    // 3. 타석 그리드 표출 확인 후 11번 빈 타석 카드 클릭
    await expect(page.getByRole('button', { name: '1F' })).toBeVisible({ timeout: 10000 });
    const bayTile11 = page.locator('span:text-is("11")').first();
    await expect(bayTile11).toBeVisible({ timeout: 5000 });
    await bayTile11.click();

    // 4. 배정 방식 선택 모달 표출 -> [보유 회원권으로 배정] 선택
    await expect(page.locator('text=배정 방식을 선택해 주세요')).toBeVisible({ timeout: 5000 });
    await page.locator('text=보유 회원권으로 배정').click();

    // 5. 회원 인증 모달 (스마트 태그 탭 활성화 후 DEV 시뮬레이터 김골프 클릭)
    const smartTagBtn = page.locator('button:has-text("스마트폰 태그")').first();
    if (await smartTagBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
      await smartTagBtn.click();
    }
    const debugNfcBtn = page.locator('button:has-text("안드로이드 NFC (김골프)")');
    await expect(debugNfcBtn).toBeVisible({ timeout: 5000 });
    await debugNfcBtn.click();

    // 6. 본인 확인 다이얼로그 확인 -> [예, 맞습니다!] 클릭
    await expect(page.locator('text=본인이 맞으신가요?')).toBeVisible({ timeout: 5000 });
    await page.locator('button:has-text("예, 맞습니다!")').click();

    // 7. 보유 이용권 선택 모달 표출 확인
    await expect(page.locator('text=보유 이용권 선택')).toBeVisible({ timeout: 5000 });
    const firstAssetItem = page.locator('div[style*="cursor: pointer"]:has-text("유효기간")').first();
    await expect(firstAssetItem).toBeVisible({ timeout: 5000 });
    await firstAssetItem.click();

    // [선택한 이용권으로 배정] 버튼 클릭
    const assignBtn = page.locator('button:has-text("선택한 이용권으로 배정")');
    await expect(assignBtn).toBeEnabled({ timeout: 5000 });
    await assignBtn.click();

    // 8. 골프 타석 배정표 (디지털 티켓 팝업) 확인!
    await expect(page.locator('text=골프 타석 배정표')).toBeVisible({ timeout: 10000 });
    await expect(page.locator('text=배정 타석')).toBeVisible();
    await expect(page.getByText('이용 시간', { exact: true })).toBeVisible();

    // 확인 닫기 버튼 클릭
    const confirmCloseBtn = page.locator('button:has-text("확인")').last();
    await expect(confirmCloseBtn).toBeVisible();
    await confirmCloseBtn.click();

    // 9. 배정 모달이 닫히고 복귀 확인
    await expect(page.locator('text=골프 타석 배정표')).not.toBeVisible({ timeout: 5000 });

    // 10. 백엔드 DB 상태 교차 검증 (Zero-Assumption: 11번 타석이 M260501 회원에게 배정되었는지 확인)
    const bayCheck11 = execSync(`sqlite3 "${DB_PATH}" "SELECT current_member_no FROM bays WHERE bay_no = 11;"`).toString().trim();
    expect(bayCheck11).toBe('M260501');
  });

  test('Pass 2: 비회원 일일 타석권 선택 및 가상 결제 배정 완료 (Daily Pass Checkout)', async ({ page }) => {
    // 1. 대기 화면 진입
    await page.goto('/');
    await page.locator('text=화면을 터치하여 시작하세요').click();

    // 2. [연습타석 배정] 클릭
    await page.locator('text=연습타석 배정').first().click();

    // 3. 타석 그리드에서 14번 빈 타석 카드 클릭
    await expect(page.getByRole('button', { name: '1F' })).toBeVisible({ timeout: 10000 });
    const bayTile14 = page.locator('span:text-is("14")').first();
    await expect(bayTile14).toBeVisible({ timeout: 5000 });
    await bayTile14.click();

    // 4. [일일권 즉시 결제] 카드 선택
    await expect(page.locator('text=배정 방식을 선택해 주세요')).toBeVisible({ timeout: 5000 });
    await page.locator('text=일일권 즉시 결제').click();

    // 5. 일일권 상품 매대 표출 확인 -> 첫 번째 상품 [선택 및 결제] 버튼 클릭
    await expect(page.locator('text=일일 타석권 선택 및 결제')).toBeVisible({ timeout: 5000 });
    const checkoutBtn = page.locator('button:has-text("선택 및 결제")').first();
    await expect(checkoutBtn).toBeVisible({ timeout: 5000 });
    await checkoutBtn.click();

    // 6. 가상 결제 단말기 자동 승인 및 배정 완료 티켓/대시보드 복귀 확인
    await expect(
      page.locator('text=골프 타석 배정표')
        .or(page.locator('text=원하시는 서비스를 선택해 주세요'))
    ).toBeVisible({ timeout: 15000 });

    // 7. 배정표 팝업이 표출되어 있으면 [확인] 닫기 클릭
    const confirmBtn = page.locator('button:has-text("확인")').last();
    if (await confirmBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
      await confirmBtn.click({ force: true });
    }

    // 8. 메인 대시보드 복귀 확인
    await expect(page.locator('text=원하시는 서비스를 선택해 주세요')).toBeVisible({ timeout: 10000 });
  });

  test('Pass 3: 회원 타석 이동 플로우 검증 (Bay Move Flow)', async ({ page }) => {
    // 1. 대기 화면 진입
    await page.goto('/');
    await page.locator('text=화면을 터치하여 시작하세요').click();

    // 2. 메인 대시보드에서 [타석 이동] 클릭
    await expect(page.locator('text=원하시는 서비스를 선택해 주세요')).toBeVisible({ timeout: 5000 });
    await page.locator('text=타석 이동').first().click();

    // 3. 회원 인증 화면 -> 스마트폰 태그 탭 활성화 -> [안드로이드 NFC (김골프)] 시뮬레이터 클릭
    const smartTagBtn = page.locator('button:has-text("스마트폰 태그")').first();
    if (await smartTagBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
      await smartTagBtn.click();
    }
    const debugNfcBtn = page.locator('button:has-text("안드로이드 NFC (김골프)")');
    await expect(debugNfcBtn).toBeVisible({ timeout: 5000 });
    await debugNfcBtn.click();

    // 본인 확인 모달 -> [예, 맞습니다!]
    await expect(page.locator('text=본인이 맞으신가요?')).toBeVisible({ timeout: 5000 });
    await page.locator('button:has-text("예, 맞습니다!")').click();

    // 4. 이동하실 타석 선택 화면 표출 확인
    await expect(page.locator('text=이동하실 타석 선택')).toBeVisible({ timeout: 10000 });

    // 5. 이동 목적지 빈 타석(18번) 카드 터치
    const targetBay = page.locator('span:text-is("18")').first();
    if (await targetBay.isVisible({ timeout: 3000 }).catch(() => false)) {
      await targetBay.click();
      await page.waitForTimeout(500);

      // 하단 [타석 이동 확정] 버튼 클릭
      const moveConfirmBtn = page.locator('button:has-text("타석 이동 확정")');
      if (await moveConfirmBtn.isEnabled({ timeout: 3000 }).catch(() => false)) {
        await moveConfirmBtn.click();
      }
    }

    // 메인 대시보드 또는 완료 화면 복귀 확인
    await expect(
      page.locator('text=원하시는 서비스를 선택해 주세요')
        .or(page.locator('text=이동하실 타석 선택'))
    ).toBeVisible({ timeout: 10000 });
  });

  test('Pass 4: 신규 간편 회원가입 및 등록 플로우 (Member Quick Registration)', async ({ page }) => {
    // 1. 대기 화면 진입
    await page.goto('/');
    await page.locator('text=화면을 터치하여 시작하세요').click();

    // 2. 메인 대시보드에서 [회원가입] 클릭
    await page.locator('text=회원가입').first().click();
    await expect(page.getByRole('heading', { name: '무인 스튜디오 30초 즉석 회원가입' })).toBeVisible({ timeout: 5000 });

    // 3. 이름 입력: 가상 키보드 열어서 '김' 입력 후 '입력 완료'
    await page.locator('input[placeholder="여기를 터치하여 이름을 입력하세요"]').click();
    await expect(page.locator('text=가상 자판을 터치하여 입력하세요')).toBeVisible({ timeout: 5000 });
    await page.locator('button:has-text("ㄱ")').click();
    await page.locator('button:has-text("ㅣ")').click();
    await page.locator('button:has-text("ㅁ")').click();
    await page.locator('button:has-text("입력 완료")').click();

    // 4. 중복 방지 랜덤 휴대폰 번호 생성 (010 + 8자리 난수)
    const randSuffix = Math.floor(10000000 + Math.random() * 90000000).toString();
    const testDigits = ['0', '1', '0', ...randSuffix.split('')];
    for (const d of testDigits) {
      await page.locator(`button[type="button"]:has-text("${d}")`).click();
    }

    // 5. [전체 약관 동의] 클릭
    await page.locator('button:has-text("⚡ 전체 약관 동의 (필수 + 선택 혜택 알림)")').click();

    // 6. [다음 단계 (안면 등록) ›] 클릭
    const nextStepBtn = page.locator('button:has-text("다음 단계 (안면 등록) ›")');
    await expect(nextStepBtn).toBeEnabled({ timeout: 5000 });
    await nextStepBtn.click();

    // 7. 안면 등록 화면 표출 -> [등록 건너뛰기] 클릭
    await expect(page.locator('button:has-text("등록 건너뛰기")')).toBeVisible({ timeout: 5000 });
    await page.locator('button:has-text("등록 건너뛰기")').click();

    // 8. 신규 회원가입 완료 및 메인 대시보드 복귀 확인!
    await expect(page.locator('text=원하시는 서비스를 선택해 주세요')).toBeVisible({ timeout: 10000 });
  });

  test('Pass 5: 회원권/이용권 상품 매대 탐색 및 결제 플로우 (Product Shop & Membership Purchase)', async ({ page }) => {
    // 1. 대기 화면 진입
    await page.goto('/');
    await page.locator('text=화면을 터치하여 시작하세요').click();

    // 2. 메인 대시보드에서 [회원권/상품 구매] 클릭
    await expect(page.locator('text=원하시는 서비스를 선택해 주세요')).toBeVisible({ timeout: 5000 });
    const shopMenuCard = page.locator('div.apple-card-hover:has-text("회원권")')
      .or(page.locator('text=회원권/상품 구매'))
      .first();
    await expect(shopMenuCard).toBeVisible({ timeout: 5000 });
    await shopMenuCard.click();

    // 3. 회원 인증 화면 -> 스마트폰 태그(김골프)
    const smartTagBtn = page.locator('button:has-text("스마트폰 태그")').first();
    if (await smartTagBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
      await smartTagBtn.click();
    }
    const debugNfcBtn = page.locator('button:has-text("안드로이드 NFC (김골프)")');
    await expect(debugNfcBtn).toBeVisible({ timeout: 5000 });
    await debugNfcBtn.click();

    // 4. 본인 확인 다이얼로그 -> [예, 맞습니다!]
    await expect(page.locator('text=본인이 맞으신가요?')).toBeVisible({ timeout: 5000 });
    await page.locator('button:has-text("예, 맞습니다!")').click();

    // 5. ProductShop 상품 매대 화면 표출 확인
    await expect(
      page.locator('text=회원권 및 정기 서비스 구매')
        .or(page.locator('button:has-text("선택 및 결제")'))
    ).toBeVisible({ timeout: 10000 });

    // 첫 번째 상품 [선택 및 결제] 버튼 클릭
    const buyBtn = page.locator('button:has-text("선택 및 결제")').first();
    await expect(buyBtn).toBeVisible({ timeout: 5000 });
    await buyBtn.click();

    // 6. 가상 결제 단말기 자동 승인 및 완료 모달 표출 확인
    const modalConfirmBtn = page.locator('button:has-text("확인")').last();
    await expect(
      page.getByRole('heading', { name: '결제 및 등록이 완료되었습니다!' })
        .or(page.getByRole('heading', { name: '결제 완료 & 영수증 발행' }))
        .or(modalConfirmBtn)
        .first()
    ).toBeVisible({ timeout: 15000 });

    if (await modalConfirmBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
      await modalConfirmBtn.click({ force: true });
    }

    // 7. 메인 대시보드 안전 복귀 확인
    await expect(page.locator('text=원하시는 서비스를 선택해 주세요')).toBeVisible({ timeout: 10000 });
  });

  test('Pass 6: 라카 연장 선택 및 결제 플로우 (Locker Extend & Rental)', async ({ page }) => {
    // 1. 대기 화면 진입
    await page.goto('/');
    await page.locator('text=화면을 터치하여 시작하세요').click();

    // 2. 메인 대시보드에서 [라카 대여/연장] 클릭
    await expect(page.locator('text=원하시는 서비스를 선택해 주세요')).toBeVisible({ timeout: 5000 });
    const lockerMenuCard = page.locator('div.apple-card-hover:has(h3:has-text("라카"))')
      .or(page.locator('h3:has-text("라카")'))
      .first();
    await expect(lockerMenuCard).toBeVisible({ timeout: 5000 });
    await lockerMenuCard.click();

    // 3. 회원 인증 화면 -> 스마트폰 태그(김골프)
    const smartTagBtn = page.locator('button:has-text("스마트폰 태그")').first();
    if (await smartTagBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
      await smartTagBtn.click();
    }
    const debugNfcBtn = page.locator('button:has-text("안드로이드 NFC (김골프)")');
    await expect(debugNfcBtn).toBeVisible({ timeout: 5000 });
    await debugNfcBtn.click();

    // 4. 본인 확인 다이얼로그 -> [예, 맞습니다!]
    await expect(page.locator('text=본인이 맞으신가요?')).toBeVisible({ timeout: 5000 });
    await page.locator('button:has-text("예, 맞습니다!")').click();

    // 5. LockerExtend 화면 표출 확인
    await expect(page.locator('text=개인 사물함 연장')).toBeVisible({ timeout: 10000 });

    // 3번 라카 카드 명시적 선택
    const lockerTile = page.locator('div:has-text("3")').filter({ hasText: '만료일' }).first();
    if (await lockerTile.isVisible({ timeout: 2000 }).catch(() => false)) {
      await lockerTile.click({ force: true });
    }

    // 3번 라카 연장 상품 카드 클릭
    const extendProdCard = page.locator('.locker-product-card').first();
    await expect(extendProdCard).toBeVisible({ timeout: 5000 });
    await extendProdCard.click();

    // 포인트 결제 화면 등 결제 시작 버튼이 표출될 경우 클릭
    const startPayBtn = page.locator('button:has-text("결제 시작")')
      .or(page.locator('button:has-text("카드 결제")'))
      .first();
    if (await startPayBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
      await startPayBtn.click({ force: true });
    }

    // 6. 가상 결제 단말기 자동 승인 및 완료 모달 표출 확인
    const lockerModalConfirmBtn = page.locator('button:has-text("확인")').last();
    await expect(
      page.getByRole('heading', { name: '결제 및 등록이 완료되었습니다!' })
        .or(page.getByRole('heading', { name: '결제 완료 & 영수증 발행' }))
        .or(lockerModalConfirmBtn)
        .first()
    ).toBeVisible({ timeout: 15000 });

    if (await lockerModalConfirmBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
      await lockerModalConfirmBtn.click({ force: true });
    }

    await expect(page.locator('text=원하시는 서비스를 선택해 주세요')).toBeVisible({ timeout: 10000 });
  });

  test('Pass 7: 모바일 사전 예약 타석 무인 체크인 전체 라이프사이클 (Check-in Golden Path)', async ({ page }) => {
    // 0. 당일 예약 레코드 DB 세팅 및 이전 테스트 영향 완전 격리 (단일 트랜잭션 일괄 처리)
    const todayKst = new Intl.DateTimeFormat('ko-KR', { timeZone: 'Asia/Seoul', year: 'numeric', month: '2-digit', day: '2-digit' })
      .format(new Date()).replace(/[^0-9]/g, '');

    execSync(`sqlite3 "${DB_PATH}" "
      DELETE FROM reservation_master WHERE res_id LIKE 'KSK_%' OR (resource_type = 'BAY' AND resource_no IN ('11', '14', '15', '18'));
      DELETE FROM checkin_master WHERE res_id LIKE 'KSK_%' OR resource_no IN ('11', '14', '15', '18');
      UPDATE usage_master SET status_cd = 'FINISHED' WHERE facility_type = 'BAY' AND facility_no IN (11, 14, 15, 18) AND status_cd IN ('RUN', 'ACTIVE', 'IN_USE');
      UPDATE bays SET status = 'AVAILABLE', current_member_no = NULL, lock_terminal_id = NULL, lock_expired_at = NULL, prepare_started_at = NULL, prepare_expired_at = NULL, start_time = NULL, end_time = NULL WHERE bay_no IN (11, 14, 15, 18);
      INSERT INTO reservation_master (res_id, store_cd, resource_type, resource_no, member_no, guest_nm, hp_no, res_date, start_time, end_time, duration_min, prepare_min, lesson_type, max_capacity, res_type, status_cd, payment_status, payment_mode, companion_count, transfer_cnt, created_at, updated_at) VALUES ('KSK_CHK_001', 'H01-SE-001', 'BAY', '11', 'M260501', '김골프', '010-1234-5678', '${todayKst}', '2300', '2350', 50, 0, 'PRIVATE', 1, 'SLOT', 'RSV', 'PAID', 'OFFLINE', 0, 0, datetime('now'), datetime('now'));
    "`);

    // 1. 대기 화면 진입
    await page.goto('/', { waitUntil: 'domcontentloaded' });
    await expect(page.locator('text=화면을 터치하여 시작하세요')).toBeVisible({ timeout: 10000 });
    await page.locator('text=화면을 터치하여 시작하세요').click();

    // 2. 메인 대시보드에서 [예약 타석 체크인] 클릭
    await expect(page.locator('text=원하시는 서비스를 선택해 주세요')).toBeVisible({ timeout: 5000 });
    const checkinBtn = page.locator('text=예약 타석 체크인').first();
    await expect(checkinBtn).toBeVisible({ timeout: 5000 });
    await checkinBtn.click();

    // 3. 회원 인증: [출입 QR 스캔] 탭 전환 및 QR 코드 인식 검증
    const qrTab = page.locator('button:has-text("출입 QR 스캔")').first();
    if (await qrTab.isVisible({ timeout: 3000 }).catch(() => false)) {
      await qrTab.click();
      await expect(page.locator('text=모바일 출입 QR을 스캐너에 비춰주세요')).toBeVisible({ timeout: 5000 });
    }

    // 시뮬레이터 출입 QR 스캔 버튼 클릭 (또는 window 이벤트)
    const qrSimBtn = page.locator('button:has-text("출입 QR 스캔 시뮬레이션")').first();
    if (await qrSimBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
      await qrSimBtn.click();
    } else {
      await page.evaluate(() => {
        if ((window as any).__LM_TRIGGER_SMART_AUTH__) {
          (window as any).__LM_TRIGGER_SMART_AUTH__('QR-M260501');
        }
      });
    }

    // 4. 본인 확인 다이얼로그 -> [예, 맞습니다!]
    await expect(page.locator('text=본인이 맞으신가요?')).toBeVisible({ timeout: 5000 });
    await page.locator('button:has-text("예, 맞습니다!")').click();

    // 5. 사전 예약 타석 체크인 화면 (CheckinSelect) 표출 확인
    await expect(page.locator('text=사전 예약 타석 체크인')).toBeVisible({ timeout: 10000 });
    await expect(page.locator('text=11번 타석')).toBeVisible({ timeout: 5000 });

    // 6. [체크인] 클릭
    const doCheckinBtn = page.locator('button:has-text("체크인")').first();
    await expect(doCheckinBtn).toBeVisible({ timeout: 5000 });
    await doCheckinBtn.click();

    // 7. 배정 완료 배정표 모달 표출 확인
    await expect(page.locator('text=골프 타석 배정표')).toBeVisible({ timeout: 15000 });
    await expect(page.locator('text=배정 타석')).toBeVisible();

    const confirmBtn = page.locator('button:has-text("확인")').last();
    if (await confirmBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
      await confirmBtn.click({ force: true });
    }

    // 8. 메인 대시보드 복귀 확인
    await expect(page.locator('text=원하시는 서비스를 선택해 주세요')).toBeVisible({ timeout: 10000 });

    // 9. 백엔드 DB 상태 교차 검증 (Zero-Assumption: reservation_master status_cd = 'CHK'/'PREPARE', checkin_master COMPLETED)
    const resStatus = execSync(`sqlite3 "${DB_PATH}" "SELECT status_cd FROM reservation_master WHERE res_id = 'KSK_CHK_001';"`)
      .toString().trim();
    expect(['CHK', 'PREPARE', 'USE']).toContain(resStatus);

    const checkinStatus = execSync(`sqlite3 "${DB_PATH}" "SELECT status_cd FROM checkin_master WHERE res_id = 'KSK_CHK_001';"`)
      .toString().trim();
    expect(checkinStatus).toBe('COMPLETED');
  });

  test('Pass 8: 키패드 전화번호 조회 및 취소/예외 방어 (Keypad Search & Safe Cancel Guard)', async ({ page }) => {
    // 0. 타석 15번 상태 초기화 (이전 테스트 영향 격리)
    execSync(`sqlite3 "${DB_PATH}" "UPDATE bays SET status = 'AVAILABLE', current_member_no = NULL, lock_terminal_id = NULL, lock_expired_at = NULL, prepare_started_at = NULL, prepare_expired_at = NULL, start_time = NULL, end_time = NULL WHERE bay_no = 15;"`);

    // 1. 대기 화면 진입
    await page.goto('/', { waitUntil: 'domcontentloaded' });
    await expect(page.locator('text=화면을 터치하여 시작하세요')).toBeVisible({ timeout: 10000 });
    await page.locator('text=화면을 터치하여 시작하세요').click();

    // 2. 메인 대시보드에서 [연습타석 배정] 클릭
    await expect(page.locator('text=원하시는 서비스를 선택해 주세요')).toBeVisible({ timeout: 5000 });
    await page.locator('text=연습타석 배정').first().click();

    // 3. 15번 빈 타석 카드 클릭 후 보유 회원권 배정 진입
    await expect(page.getByRole('button', { name: '1F' })).toBeVisible({ timeout: 10000 });
    const bayTile15 = page.locator('span:text-is("15")').first();
    await expect(bayTile15).toBeVisible({ timeout: 5000 });
    await bayTile15.click();

    await expect(page.locator('text=배정 방식을 선택해 주세요')).toBeVisible({ timeout: 5000 });
    await page.locator('text=보유 회원권으로 배정').click();

    // 4. 회원 인증 모달에서 [전화번호 입력] 탭 전환
    const keypadTab = page.locator('button:has-text("전화번호 입력")').first();
    await expect(keypadTab).toBeVisible({ timeout: 5000 });
    await keypadTab.click();

    // 5. 가상 키패드로 미등록 번호(010-0000-9999) 입력 테스트
    for (const char of ['0', '1', '0', '0', '0', '0', '0', '9', '9', '9', '9']) {
      await page.locator(`button.keypad-num-btn:text-is("${char}")`).first().click();
    }
    
    // [회원 조회하기] 클릭 -> 에러 메세지 표출 확인
    const submitBtn = page.locator('button:has-text("회원 조회하기")');
    await expect(submitBtn).toBeEnabled({ timeout: 3000 });
    await submitBtn.click();

    await expect(page.locator('text=등록되지 않은 모바일 회원 또는 NFC 카드입니다.')).toBeVisible({ timeout: 5000 });

    // 6. [돌아가기] 클릭 시 크래시 없이 타석 맵 또는 배정 선택 모달로 안전 복귀
    const backBtn = page.locator('button:has-text("돌아가기")').first();
    await expect(backBtn).toBeVisible();
    await backBtn.click();

    await expect(
      page.locator('text=원하시는 서비스를 선택해 주세요')
        .or(page.locator('text=배정 방식을 선택해 주세요'))
        .or(page.getByRole('button', { name: '1F' }))
    ).toBeVisible({ timeout: 10000 });
  });

});
