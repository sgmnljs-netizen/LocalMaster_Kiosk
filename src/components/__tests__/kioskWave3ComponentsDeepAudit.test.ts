import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { assembleHangul, Hangul, computeVirtualKeyboardTop } from '../VirtualKeyboard';
import { isBayTrulyAvailableForKiosk } from '../../utils/bayStatusGuard';
import { sortFloorsDescending } from '../../utils/floorUtils';
import type { Bay } from '../../services/api';

describe('[Wave 3][Kiosk/Components] 타석 가용 판별 4대 뷰 일원화, UI 헌법 불변성 및 한글 오토마타 심층 검증', () => {
  it('TopTeeboxDashboard·TeeboxTileCard·MiniTeeboxMonitor·IntroScreen 모두 isBayTrulyAvailableForKiosk SSOT를 사용한다', () => {
    const compDir = path.resolve(process.cwd(), 'src/components');
    const targets = ['TopTeeboxDashboard.tsx', 'TeeboxTileCard.tsx', 'MiniTeeboxMonitor.tsx', 'IntroScreen.tsx'];
    for (const fileName of targets) {
      const content = fs.readFileSync(path.join(compDir, fileName), 'utf8');
      expect(content).toContain('isBayTrulyAvailableForKiosk');
    }

    // 볼회수 일시정지(is_paused / is_global_paused), 레슨 전용, 볼부족 타석은 status가 AVAILABLE이어도 배정 불가
    const baseBay: Bay = { bay_no: 7, status: 'AVAILABLE', is_active: true };
    expect(isBayTrulyAvailableForKiosk(baseBay)).toBe(true);
    expect(isBayTrulyAvailableForKiosk({ ...baseBay, is_paused: true })).toBe(false);
    expect(isBayTrulyAvailableForKiosk({ ...baseBay, is_global_paused: true })).toBe(false);
    expect(isBayTrulyAvailableForKiosk({ ...baseBay, is_lesson_only: true })).toBe(false);
    expect(isBayTrulyAvailableForKiosk({ ...baseBay, ball_box_status: 'EMPTY' })).toBe(false);
  });

  it('TeeboxTileCard 1:1.22 컴팩트 카드 비율, [우타] 시각적 소음 배제 및 물리 층수 내림차순 헌법을 준수한다', () => {
    const compDir = path.resolve(process.cwd(), 'src/components');
    const tileCardSrc = fs.readFileSync(path.join(compDir, 'TeeboxTileCard.tsx'), 'utf8');
    const topDashSrc = fs.readFileSync(path.join(compDir, 'TopTeeboxDashboard.tsx'), 'utf8');

    expect(tileCardSrc).toContain("aspectRatio: '1 / 1.22'");
    expect(tileCardSrc).not.toContain('[우타]');
    expect(topDashSrc).not.toContain('[우타]');
    expect(topDashSrc).toContain('sortFloorsDescending');
    expect(sortFloorsDescending(['B1F', '1F', '3F', '2F'])).toEqual(['3F', '2F', '1F', 'B1F']);
  });

  it('한글 오토마타가 쌍자음·복합모음·11종 겹받침 및 분해/재조합 왕복(Round-trip)을 무결하게 처리한다', () => {
    const complexWords = ['뽤갛다', '쓔웨덴', '밟다', '앉아', '끊어', '읊조리다', '희망찬'];
    for (const word of complexWords) {
      const jamo = Hangul.disassemble(word);
      expect(assembleHangul(jamo)).toBe(word);
    }
  });

  it('computeVirtualKeyboardTop은 극단적으로 작은 뷰포트/상단 입력창에서도 최소 안전 여백(16px)을 보장한다', () => {
    expect(
      computeVirtualKeyboardTop({
        anchorBottomPx: 0,
        viewportHeightPx: 400,
        keyboardHeightPx: 395,
        bottomNavReservePx: 124,
        minGapPx: 0,
      })
    ).toBe(16);
  });
});
