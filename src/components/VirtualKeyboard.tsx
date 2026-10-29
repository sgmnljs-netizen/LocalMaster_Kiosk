import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Delete, Globe, Smile, RotateCcw } from 'lucide-react';

interface VirtualKeyboardProps {
  value: string;
  onChange: (val: string) => void;
  onClose: () => void;
  anchorSelector?: string;
  docked?: boolean;
}

export interface VirtualKeyboardPlacementInput {
  anchorBottomPx: number;
  viewportHeightPx: number;
  keyboardHeightPx?: number;
  bottomNavReservePx?: number;
  minGapPx?: number;
}

/**
 * 입력창(anchorBottomPx)을 절대 가리지 않으면서 하단 네비게이션 바(KioskBottomBar, bottom: 24px + height: 84px = 108px)
 * 위에 최소 16px 이상의 여백(기본 124px)을 두고 가상 키보드를 배치하는 안전 top 좌표를 산출합니다.
 */
export function computeVirtualKeyboardTop({
  anchorBottomPx,
  viewportHeightPx,
  keyboardHeightPx = 395,
  bottomNavReservePx = 124,
  minGapPx = 14,
}: VirtualKeyboardPlacementInput): number {
  const minSafeTop = Math.max(16, Math.round(anchorBottomPx + minGapPx));
  const defaultBottomTop = Math.round(viewportHeightPx - bottomNavReservePx - keyboardHeightPx);
  return Math.max(minSafeTop, defaultBottomTop);
}

// 초성 19자
const CHO = [
  'ㄱ', 'ㄲ', 'ㄴ', 'ㄷ', 'ㄸ', 'ㄹ', 'ㅁ', 'ㅂ', 'ㅃ', 'ㅅ', 'ㅆ', 'ㅇ', 'ㅈ', 'ㅉ', 'ㅊ', 'ㅋ', 'ㅌ', 'ㅍ', 'ㅎ'
];
// 중성 21자
const JUNG = [
  'ㅏ', 'ㅐ', 'ㅑ', 'ㅒ', 'ㅓ', 'ㅔ', 'ㅕ', 'ㅖ', 'ㅗ', 'ㅘ', 'ㅙ', 'ㅚ', 'ㅛ', 'ㅜ', 'ㅝ', 'ㅞ', 'ㅟ', 'ㅠ', 'ㅡ', 'ㅢ', 'ㅣ'
];
// 종성 28자 (0번은 빈 종성)
const JONG = [
  '', 'ㄱ', 'ㄲ', 'ㄳ', 'ㄴ', 'ㄵ', 'ㄶ', 'ㄷ', 'ㄹ', 'ㄺ', 'ㄻ', 'ㄼ', 'ㄽ', 'ㄾ', 'ㄿ', 'ㅀ', 'ㅁ', 'ㅂ', 'ㅄ', 'ㅅ', 'ㅆ', 'ㅇ', 'ㅈ', 'ㅊ', 'ㅋ', 'ㅌ', 'ㅍ', 'ㅎ'
];

export function assembleHangul(chars: string[]): string {
  let result = '';
  let state = 0; // 0: 빈 상태, 1: 자음 입력, 2: 모음 입력, 3: 자음 입력
  
  let choIdx = -1;
  let jungIdx = -1;
  let jongIdx = 0;
  let doubleJong = '';

  for (let i = 0; i < chars.length; i++) {
    const char = chars[i];
    const isJa = /[ㄱ-ㅎ]/.test(char);
    const isMo = /[ㅏ-ㅣ]/.test(char);
    
    if (!isJa && !isMo) {
      result += flushHangul(choIdx, jungIdx, jongIdx);
      result += char;
      state = 0;
      choIdx = -1; jungIdx = -1; jongIdx = 0; doubleJong = '';
      continue;
    }

    if (state === 0) {
      if (isJa) {
        choIdx = CHO.indexOf(char);
        if (choIdx !== -1) state = 1;
        else result += char;
      } else {
        result += char;
      }
    } else if (state === 1) {
      if (isMo) {
        jungIdx = JUNG.indexOf(char);
        state = 2;
      } else {
        result += CHO[choIdx];
        choIdx = CHO.indexOf(char);
        if (choIdx === -1) {
          result += char;
          state = 0;
          doubleJong = '';
        }
      }
    } else if (state === 2) {
      if (isJa) {
        const idx = JONG.indexOf(char);
        if (idx !== -1) {
          jongIdx = idx;
          state = 3;
        } else {
          result += flushHangul(choIdx, jungIdx, 0);
          choIdx = CHO.indexOf(char);
          state = 1;
          jungIdx = -1;
          jongIdx = 0;
          doubleJong = '';
        }
      } else {
        const combinedJung = combineJung(JUNG[jungIdx], char);
        if (combinedJung) {
          jungIdx = JUNG.indexOf(combinedJung);
        } else {
          result += flushHangul(choIdx, jungIdx, 0);
          result += char;
          state = 0;
          choIdx = -1; jungIdx = -1; jongIdx = 0; doubleJong = '';
        }
      }
    } else if (state === 3) {
      if (isMo) {
        if (doubleJong) {
          const parts = splitJong(JONG[jongIdx]);
          result += flushHangul(choIdx, jungIdx, JONG.indexOf(parts[0]));
          choIdx = CHO.indexOf(parts[1]);
          jungIdx = JUNG.indexOf(char);
          jongIdx = 0;
          doubleJong = '';
          state = 2;
        } else {
          const prevJong = JONG[jongIdx];
          result += flushHangul(choIdx, jungIdx, 0);
          choIdx = CHO.indexOf(prevJong);
          jungIdx = JUNG.indexOf(char);
          jongIdx = 0;
          doubleJong = '';
          state = 2;
        }
      } else {
        const combinedJong = combineJong(JONG[jongIdx], char);
        if (combinedJong) {
          jongIdx = JONG.indexOf(combinedJong);
          doubleJong = combinedJong;
        } else {
          result += flushHangul(choIdx, jungIdx, jongIdx);
          choIdx = CHO.indexOf(char);
          jungIdx = -1;
          jongIdx = 0;
          state = 1;
          doubleJong = '';
        }
      }
    }
  }

  result += flushHangul(choIdx, jungIdx, jongIdx);
  return result;
}

function combineJung(j1: string, j2: string): string | null {
  if (j1 === 'ㅗ' && j2 === 'ㅏ') return 'ㅘ';
  if (j1 === 'ㅗ' && j2 === 'ㅐ') return 'ㅙ';
  if (j1 === 'ㅗ' && j2 === 'ㅣ') return 'ㅚ';
  if (j1 === 'ㅜ' && j2 === 'ㅓ') return 'ㅝ';
  if (j1 === 'ㅜ' && j2 === 'ㅔ') return 'ㅞ';
  if (j1 === 'ㅜ' && j2 === 'ㅣ') return 'ㅟ';
  if (j1 === 'ㅡ' && j2 === 'ㅣ') return 'ㅢ';
  return null;
}

function combineJong(j1: string, j2: string): string | null {
  if (j1 === 'ㄱ' && j2 === 'ㅅ') return 'ㄳ';
  if (j1 === 'ㄴ' && j2 === 'ㅈ') return 'ㄵ';
  if (j1 === 'ㄴ' && j2 === 'ㅎ') return 'ㄶ';
  if (j1 === 'ㄹ' && j2 === 'ㄱ') return 'ㄺ';
  if (j1 === 'ㄹ' && j2 === 'ㅁ') return 'ㄻ';
  if (j1 === 'ㄹ' && j2 === 'ㅂ') return 'ㄼ';
  if (j1 === 'ㄹ' && j2 === 'ㅅ') return 'ㄽ';
  if (j1 === 'ㄹ' && j2 === 'ㅌ') return 'ㄾ';
  if (j1 === 'ㄹ' && j2 === 'ㅍ') return 'ㄿ';
  if (j1 === 'ㄹ' && j2 === 'ㅎ') return 'ㅀ';
  if (j1 === 'ㅂ' && j2 === 'ㅅ') return 'ㅄ';
  return null;
}

function splitJong(j: string): string[] {
  if (j === 'ㄳ') return ['ㄱ', 'ㅅ'];
  if (j === 'ㄵ') return ['ㄴ', 'ㅈ'];
  if (j === 'ㄶ') return ['ㄴ', 'ㅎ'];
  if (j === 'ㄺ') return ['ㄹ', 'ㄱ'];
  if (j === 'ㄻ') return ['ㄹ', 'ㅁ'];
  if (j === 'ㄼ') return ['ㄹ', 'ㅂ'];
  if (j === 'ㄽ') return ['ㄹ', 'ㅅ'];
  if (j === 'ㄾ') return ['ㄹ', 'ㅌ'];
  if (j === 'ㄿ') return ['ㄹ', 'ㅍ'];
  if (j === 'ㅀ') return ['ㄹ', 'ㅎ'];
  if (j === 'ㅄ') return ['ㅂ', 'ㅅ'];
  return [j, ''];
}

function splitJung(j: string): string[] {
  if (j === 'ㅘ') return ['ㅗ', 'ㅏ'];
  if (j === 'ㅙ') return ['ㅗ', 'ㅐ'];
  if (j === 'ㅚ') return ['ㅗ', 'ㅣ'];
  if (j === 'ㅝ') return ['ㅜ', 'ㅓ'];
  if (j === 'ㅞ') return ['ㅜ', 'ㅔ'];
  if (j === 'ㅟ') return ['ㅜ', 'ㅣ'];
  if (j === 'ㅢ') return ['ㅡ', 'ㅣ'];
  return [j];
}

export const Hangul = {
  disassemble(str: string): string[] {
    const out: string[] = [];
    for (const ch of str) {
      const code = ch.charCodeAt(0);
      if (code >= 0xAC00 && code <= 0xD7A3) {
        const offset = code - 0xAC00;
        const cho = Math.floor(offset / (21 * 28));
        const jung = Math.floor((offset % (21 * 28)) / 28);
        const jong = offset % 28;
        out.push(CHO[cho]);
        out.push(...splitJung(JUNG[jung]));
        if (jong > 0) {
          const [j1, j2] = splitJong(JONG[jong]);
          if (j1) out.push(j1);
          if (j2) out.push(j2);
        }
      } else {
        out.push(...splitJung(ch));
      }
    }
    return out;
  },
};

function flushHangul(cho: number, jung: number, jong: number): string {
  if (cho === -1) return '';
  if (jung === -1) return CHO[cho];
  const code = 0xAC00 + (cho * 21 * 28) + (jung * 28) + jong;
  return String.fromCharCode(code);
}

export const VirtualKeyboard: React.FC<VirtualKeyboardProps> = ({
  value,
  onChange,
  onClose,
  anchorSelector = '[data-testid="member-name-input"]',
  docked = true,
}) => {
  const [lang, setLang] = useState<'KO' | 'EN'>('KO');
  const [isShift, setIsShift] = useState(false);
  const [inputBuffer, setInputBuffer] = useState<string[]>(() => Hangul.disassemble(value || ''));
  const keyboardRef = useRef<HTMLDivElement | null>(null);
  const [computedTopPx, setComputedTopPx] = useState<number | null>(null);

  useEffect(() => {
    const currentAssembled = assembleHangul(inputBuffer);
    if (value !== currentAssembled) {
      setInputBuffer(value ? Hangul.disassemble(value) : []);
    }
  }, [value]);

  const recalcKeyboardPosition = useCallback(() => {
    if (docked) return;
    if (typeof document === 'undefined' || typeof window === 'undefined') return;
    const kbEl = keyboardRef.current;
    if (!kbEl) return;

    const parentEl = (kbEl.offsetParent as HTMLElement | null) || document.documentElement;
    const parentRect = parentEl.getBoundingClientRect();
    const viewportHeightPx = parentEl.clientHeight || window.innerHeight || 1080;
    const scale = viewportHeightPx > 0 && parentRect.height > 0 ? parentRect.height / viewportHeightPx : 1;

    const anchorEl = anchorSelector
      ? (document.querySelector(anchorSelector) as HTMLElement | null)
      : null;

    let anchorBottomPx = 280;
    if (anchorEl) {
      const anchorRect = anchorEl.getBoundingClientRect();
      anchorBottomPx = (anchorRect.bottom - parentRect.top) / (scale || 1);
    }

    const keyboardHeightPx = kbEl.offsetHeight || 395;
    const safeTop = computeVirtualKeyboardTop({
      anchorBottomPx,
      viewportHeightPx,
      keyboardHeightPx,
      bottomNavReservePx: 124,
      minGapPx: 14,
    });
    setComputedTopPx(safeTop);
  }, [anchorSelector, docked]);

  useEffect(() => {
    if (docked) return;
    recalcKeyboardPosition();
    const rafId = window.requestAnimationFrame(recalcKeyboardPosition);
    const t1 = window.setTimeout(recalcKeyboardPosition, 120);
    const t2 = window.setTimeout(recalcKeyboardPosition, 280);
    window.addEventListener('resize', recalcKeyboardPosition);
    return () => {
      window.cancelAnimationFrame(rafId);
      window.clearTimeout(t1);
      window.clearTimeout(t2);
      window.removeEventListener('resize', recalcKeyboardPosition);
    };
  }, [recalcKeyboardPosition, docked]);

  const handleKeyClick = (key: string) => {
    let finalKey = key;
    if (isShift) {
      if (lang === 'KO') {
        const shiftMap: Record<string, string> = {
          'ㅂ': 'ㅃ', 'ㅈ': 'ㅉ', 'ㄷ': 'ㄸ', 'ㄱ': 'ㄲ', 'ㅅ': 'ㅆ', 'ㅐ': 'ㅒ', 'ㅔ': 'ㅖ'
        };
        finalKey = shiftMap[key] || key;
      } else {
        finalKey = key.toUpperCase();
      }
      setIsShift(false);
    } else {
      finalKey = lang === 'EN' ? key.toLowerCase() : key;
    }

    const newBuffer = [...inputBuffer, finalKey];
    setInputBuffer(newBuffer);
    updateValue(newBuffer);
  };

  const handleDelete = () => {
    if (inputBuffer.length === 0) return;
    const newBuffer = inputBuffer.slice(0, -1);
    setInputBuffer(newBuffer);
    updateValue(newBuffer);
  };

  const handleClear = () => {
    setInputBuffer([]);
    onChange('');
  };

  const updateValue = (buf: string[]) => {
    onChange(assembleHangul(buf));
  };

  const KO_LAYOUT = [
    ['1', '2', '3', '4', '5', '6', '7', '8', '9', '0'],
    ['ㅂ', 'ㅈ', 'ㄷ', 'ㄱ', 'ㅅ', 'ㅛ', 'ㅕ', 'ㅑ', 'ㅐ', 'ㅔ'],
    ['ㅁ', 'ㄴ', 'ㅇ', 'ㄹ', 'ㅎ', 'ㅗ', 'ㅓ', 'ㅏ', 'ㅣ'],
    ['ㅋ', 'ㅌ', 'ㅊ', 'ㅍ', 'ㅠ', 'ㅜ', 'ㅡ', '@', '.', '_']
  ];

  const EN_LAYOUT = [
    ['1', '2', '3', '4', '5', '6', '7', '8', '9', '0'],
    ['Q', 'W', 'E', 'R', 'T', 'Y', 'U', 'I', 'O', 'P'],
    ['A', 'S', 'D', 'F', 'G', 'H', 'J', 'K', 'L'],
    ['Z', 'X', 'C', 'V', 'B', 'N', 'M', '@', '.', '_']
  ];

  const keys = lang === 'KO' ? KO_LAYOUT : EN_LAYOUT;

  return (
    <div 
      ref={keyboardRef}
      data-virtual-keyboard="true"
      style={{
        ...(docked
          ? {
              position: 'relative',
              width: '1000px',
              maxWidth: '100%',
              margin: '0 auto',
              animation: 'vkSlideDown 0.22s cubic-bezier(0.22, 1, 0.36, 1)',
            }
          : {
              position: 'absolute',
              ...(computedTopPx !== null
                ? { top: `${computedTopPx}px`, bottom: 'auto' }
                : { bottom: '124px' }),
              left: '50%',
              transform: 'translateX(-50%)',
              width: '920px',
              maxWidth: 'calc(100% - 32px)',
              transition: 'top 0.2s cubic-bezier(0.22, 1, 0.36, 1)',
            }),
        boxSizing: 'border-box',
        background: 'rgba(255, 255, 255, 0.98)',
        backdropFilter: 'blur(30px)',
        WebkitBackdropFilter: 'blur(30px)',
        border: '1.5px solid #e5e5ea',
        borderRadius: '28px',
        padding: '18px 24px 20px',
        boxShadow: '0 24px 60px rgba(0, 0, 0, 0.22), 0 1px 3px rgba(0, 0, 0, 0.06)',
        zIndex: 99999,
        display: 'flex',
        flexDirection: 'column',
        gap: '12px',
      }}
      onClick={(e) => e.stopPropagation()}
    >
      <style>{`
        @keyframes vkCursorBlink {
          0%, 49% { opacity: 1; }
          50%, 100% { opacity: 0; }
        }
        @keyframes vkSlideDown {
          from {
            opacity: 0;
            transform: translateY(-12px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }
      `}</style>
      {/* 실시간 타이핑 미리보기 바 (Live Input Echo Bar) + 입력 완료 버튼 */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '12px', padding: '0 2px' }}>
        <div
          data-testid="virtual-keyboard-preview"
          style={{
            flex: 1,
            minHeight: '52px',
            borderRadius: '16px',
            background: '#f5f5f7',
            border: value ? '1.5px solid #059669' : '1px solid rgba(0, 0, 0, 0.08)',
            padding: '6px 14px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: '12px',
            boxSizing: 'border-box'
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', minWidth: 0, flex: 1 }}>
            <div style={{
              padding: '5px 10px',
              borderRadius: '10px',
              background: value ? 'rgba(5, 150, 105, 0.12)' : '#e8e8ed',
              color: value ? '#047857' : '#515154',
              fontSize: '13px',
              fontWeight: 800,
              display: 'flex',
              alignItems: 'center',
              gap: '5px',
              flexShrink: 0
            }}>
              <Smile size={15} />
              <span>{lang === 'EN' ? 'NAME' : '입력 중인 이름'}</span>
            </div>

            {value ? (
              <div style={{ display: 'flex', alignItems: 'center', minWidth: 0, overflow: 'hidden' }}>
                <span style={{
                  fontSize: '22px',
                  color: '#1d1d1f',
                  fontWeight: 900,
                  letterSpacing: '0.4px',
                  whiteSpace: 'nowrap',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis'
                }}>
                  {value}
                </span>
                <span
                  aria-hidden="true"
                  style={{
                    display: 'inline-block',
                    width: '2.5px',
                    height: '24px',
                    background: '#059669',
                    marginLeft: '3px',
                    borderRadius: '2px',
                    animation: 'vkCursorBlink 1s infinite'
                  }}
                />
              </div>
            ) : (
              <span style={{ fontSize: '16px', color: '#86868b', fontWeight: 700 }}>
                {lang === 'EN' ? 'Touch keys below to enter your name' : '가상 자판을 터치하여 이름을 입력하세요'}
              </span>
            )}
          </div>

          {value && (
            <button
              type="button"
              data-testid="virtual-keyboard-clear"
              onClick={handleClear}
              style={{
                padding: '6px 12px',
                borderRadius: '999px',
                border: '1px solid rgba(0, 0, 0, 0.08)',
                background: '#ffffff',
                color: '#515154',
                fontSize: '13px',
                fontWeight: 800,
                display: 'flex',
                alignItems: 'center',
                gap: '4px',
                cursor: 'pointer',
                flexShrink: 0
              }}
            >
              <RotateCcw size={13} />
              <span>{lang === 'EN' ? 'Clear' : '초기화'}</span>
            </button>
          )}
        </div>

        <button 
          type="button"
          style={{
            height: '52px',
            padding: '0 28px',
            fontSize: '16px',
            fontWeight: 800,
            borderRadius: '999px',
            background: '#1d1d1f',
            color: '#ffffff',
            border: 'none',
            cursor: 'pointer',
            boxShadow: '0 4px 12px rgba(0, 0, 0, 0.14)',
            flexShrink: 0
          }}
          onClick={onClose}
        >
          {lang === 'EN' ? 'Done' : '입력 완료'}
        </button>
      </div>

      {/* 키보드 자판 영역 */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
        {keys.map((row, rowIdx) => (
          <div 
            key={rowIdx} 
            style={{ 
              display: 'flex', 
              justifyContent: 'center', 
              gap: '8px' 
            }}
          >
            {row.map((char) => {
              let displayChar = char;
              if (isShift) {
                if (lang === 'KO') {
                  const shiftMap: Record<string, string> = {
                    'ㅂ': 'ㅃ', 'ㅈ': 'ㅉ', 'ㄷ': 'ㄸ', 'ㄱ': 'ㄲ', 'ㅅ': 'ㅆ', 'ㅐ': 'ㅒ', 'ㅔ': 'ㅖ'
                  };
                  displayChar = shiftMap[char] || char;
                } else {
                  displayChar = char.toUpperCase();
                }
              } else {
                displayChar = lang === 'EN' ? char.toLowerCase() : char;
              }

              const isShiftedChar = isShift && displayChar !== char;

              return (
                <button
                  type="button"
                  key={char}
                  onClick={() => handleKeyClick(char)}
                  style={{
                    width: '78px',
                    height: '56px',
                    borderRadius: '14px',
                    fontSize: '22px',
                    fontWeight: 800,
                    color: isShiftedChar ? '#ffffff' : '#1d1d1f',
                    background: isShiftedChar ? '#1d1d1f' : '#f5f5f7',
                    border: isShiftedChar ? '1px solid #1d1d1f' : '1px solid #e5e5ea',
                    boxShadow: '0 2px 4px rgba(0,0,0,0.04)',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    transition: 'all 0.1s ease'
                  }}
                  className="keypad-btn"
                >
                  {displayChar}
                </button>
              );
            })}
          </div>
        ))}

        {/* 제어 키 라인 */}
        <div style={{ display: 'flex', justifyContent: 'center', gap: '8px', marginTop: '2px' }}>
          <button
            type="button"
            onClick={() => setLang(lang === 'KO' ? 'EN' : 'KO')}
            style={{
              width: '120px',
              height: '56px',
              borderRadius: '14px',
              background: '#f5f5f7',
              border: '1px solid #e5e5ea',
              color: '#1d1d1f',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '6px',
              fontSize: '16px',
              fontWeight: 800,
              cursor: 'pointer'
            }}
            className="keypad-btn"
          >
            <Globe size={18} />
            {lang === 'KO' ? '한글' : 'ENG'}
          </button>

          <button
            type="button"
            onClick={() => setIsShift(!isShift)}
            style={{
              width: '120px',
              height: '56px',
              borderRadius: '14px',
              background: isShift ? '#1d1d1f' : '#f5f5f7',
              border: `1.5px solid ${isShift ? '#1d1d1f' : '#e5e5ea'}`,
              color: isShift ? '#ffffff' : '#1d1d1f',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: '16px',
              fontWeight: 800,
              cursor: 'pointer'
            }}
            className="keypad-btn"
          >
            쌍자음 ⇧
          </button>

          <button
            type="button"
            onClick={() => handleKeyClick(' ')}
            style={{
              width: '280px',
              height: '56px',
              borderRadius: '14px',
              background: '#ffffff',
              border: '1.5px solid #d2d2d7',
              color: '#1d1d1f',
              fontSize: '16px',
              fontWeight: 800,
              cursor: 'pointer',
              boxShadow: '0 2px 4px rgba(0,0,0,0.03)'
            }}
            className="keypad-btn"
          >
            스페이스 (Space)
          </button>

          <button
            type="button"
            onClick={handleDelete}
            style={{
              width: '130px',
              height: '56px',
              borderRadius: '14px',
              background: '#fef2f2',
              border: '1px solid #fecaca',
              color: '#dc2626',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '6px',
              fontSize: '16px',
              fontWeight: 800,
              cursor: 'pointer'
            }}
            className="keypad-btn"
          >
            <Delete size={20} />
            지우기
          </button>
        </div>
      </div>
    </div>
  );
};
