import { test, expect } from '@playwright/test';

test.describe('Layer 1: 키오스크 스모크 크롤러 (Smoke Crawler)', () => {
  test('S1. 대기 화면(INTRO) 진입 및 터치하여 메인 대시보드 전환 검증', async ({ page }) => {
    const consoleErrors: string[] = [];
    page.on('console', msg => {
      if (msg.type() === 'error') {
        const text = msg.text();
        if (!text.includes('favicon') && !text.includes('net::ERR_CONNECTION_REFUSED')) {
          consoleErrors.push(text);
        }
      }
    });

    await page.goto('/');

    // 대기 화면 터치 유도 문구 확인
    await expect(page.locator('text=화면을 터치하여 시작하세요')).toBeVisible({ timeout: 10000 });

    // 화면 터치 (클릭)
    await page.locator('text=화면을 터치하여 시작하세요').click();

    // 메인 대시보드 6대 메뉴 확인
    await expect(page.locator('text=원하시는 서비스를 선택해 주세요')).toBeVisible({ timeout: 5000 });
    await expect(page.locator('text=연습타석 배정').first()).toBeVisible();
    await expect(page.locator('text=파3 코스 배정').first()).toBeVisible();
    await expect(page.locator('text=회원권/상품 구매').first()).toBeVisible();
    await expect(page.locator('text=라카 대여/연장').first()).toBeVisible();
    await expect(page.locator('text=타석 이동').first()).toBeVisible();
    await expect(page.locator('text=회원가입').first()).toBeVisible();

    expect(consoleErrors).toEqual([]);
  });

  test('S2. 연습타석 배정 진입 및 층별 전환 무결성 검증', async ({ page }) => {
    await page.goto('/');
    await page.locator('text=화면을 터치하여 시작하세요').click();

    // 연습타석 배정 카드 클릭
    await page.locator('text=연습타석 배정').first().click();

    // 층별 탭 및 필터 버튼 노출 확인
    await expect(page.getByRole('button', { name: '1F' })).toBeVisible({ timeout: 10000 });
    await expect(page.getByRole('button', { name: '전체' })).toBeVisible();

    // 층별 탭 전환 (2F -> 1F)
    const floor2Btn = page.getByRole('button', { name: '2F' });
    if (await floor2Btn.isVisible({ timeout: 3000 }).catch(() => false)) {
      await floor2Btn.click();
      await page.waitForTimeout(500);
      const floor1Btn = page.getByRole('button', { name: '1F' });
      await floor1Btn.click();
      await page.waitForTimeout(500);
    }

    // 처음으로/이전 단계 버튼으로 복귀
    const backBtn = page.locator('button:has-text("처음으로")').or(page.locator('button:has-text("이전 단계")')).or(page.locator('button:has-text("이전으로")'));
    await backBtn.first().click();
    await expect(page.locator('text=원하시는 서비스를 선택해 주세요')).toBeVisible({ timeout: 5000 });
  });

  test('S3. 회원가입 및 회원인증(구매진입) 화면 무결성 검증', async ({ page }) => {
    await page.goto('/');
    await page.locator('text=화면을 터치하여 시작하세요').click();

    // 1) 회원가입 메뉴 진입
    await page.locator('text=회원가입').first().click();
    await expect(page.getByRole('heading', { name: '무인 스튜디오 30초 즉석 회원가입' })).toBeVisible({ timeout: 5000 });

    // 취소/돌아가기
    const cancelBtn = page.locator('button:has-text("취소")').first();
    await cancelBtn.click();
    await expect(page.locator('text=원하시는 서비스를 선택해 주세요')).toBeVisible({ timeout: 5000 });

    // 2) 회원권/상품 구매 메뉴 진입 -> 비로그인 시 회원 인증(스마트폰 태그/안면 인식) 진입 확인
    await expect(page.locator('text=회원권/상품 구매').first()).toBeVisible({ timeout: 5000 });
    await page.locator('text=회원권/상품 구매').first().click();
    await expect(page.getByRole('heading', { name: /회원 인증/ })).toBeVisible({ timeout: 5000 });

    // 돌아가기
    const backBtnAuth = page.locator('button:has-text("돌아가기")').first();
    if (await backBtnAuth.isVisible()) {
      await backBtnAuth.click();
      await expect(page.locator('text=원하시는 서비스를 선택해 주세요')).toBeVisible({ timeout: 5000 });
    }
  });
});
