import React, { useState } from 'react';
import { Delete, Globe, Smile } from 'lucide-react';

interface VirtualKeyboardProps {
  value: string;
  onChange: (val: string) => void;
  onClose: () => void;
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

/**
 * 🛠️ 한글 자모 조립기 (Hangul Automata) - 초경량 음소 결합 엔진
 * 자음과 모음을 연속 입력하면 한국어 조합 규칙에 맞게 결합하여 출력합니다.
 */
function assembleHangul(chars: string[]): string {
  let result = '';
  let state = 0; // 0: 빈 상태, 1: 자음 입력(초성), 2: 모음 입력(중성), 3: 자음 입력(종성)
  
  let choIdx = -1;
  let jungIdx = -1;
  let jongIdx = 0;
  
  // 임시 변수
  let doubleJong = '';

  for (let i = 0; i < chars.length; i++) {
    const char = chars[i];
    
    // 한글 자모가 아니면 그대로 덧붙임
    const isJa = /[ㄱ-ㅎ]/.test(char);
    const isMo = /[ㅏ-ㅣ]/.test(char);
    
    if (!isJa && !isMo) {
      // 그동안 결합 중이던 글자 완성
      result += flushHangul(choIdx, jungIdx, jongIdx);
      result += char;
      state = 0;
      choIdx = -1; jungIdx = -1; jongIdx = 0;
      continue;
    }

    if (state === 0) {
      if (isJa) {
        choIdx = CHO.indexOf(char);
        if (choIdx !== -1) {
          state = 1;
        } else {
          result += char; // 단독 겹자음 등 예외
        }
      } else {
        result += char; // 단독 모음
      }
    } else if (state === 1) {
      if (isMo) {
        jungIdx = JUNG.indexOf(char);
        state = 2;
      } else {
        // 자음이 연달아 오면 기존 초성 글자 플러시 후 새로운 초성 시작
        result += CHO[choIdx];
        choIdx = CHO.indexOf(char);
        if (choIdx === -1) {
          result += char;
          state = 0;
        }
      }
    } else if (state === 2) {
      if (isJa) {
        // 종성 가능 여부 체크
        const idx = JONG.indexOf(char);
        if (idx !== -1) {
          jongIdx = idx;
          state = 3;
        } else {
          // 종성 불가 자음 (예: ㄸ, ㅃ, ㅉ)
          result += flushHangul(choIdx, jungIdx, 0);
          choIdx = CHO.indexOf(char);
          state = 1;
          jungIdx = -1;
          jongIdx = 0;
        }
      } else {
        // 모음이 연달아 오는 경우 (이중모음 조립)
        const combinedJung = combineJung(JUNG[jungIdx], char);
        if (combinedJung) {
          jungIdx = JUNG.indexOf(combinedJung);
        } else {
          result += flushHangul(choIdx, jungIdx, 0);
          result += char;
          state = 0;
          choIdx = -1; jungIdx = -1; jongIdx = 0;
        }
      }
    } else if (state === 3) {
      if (isMo) {
        // 겹종성이 들어온 상태에서 모음이 오면 분리 결합 (예: 닭 -> 달기)
        if (doubleJong) {
          // 복합 종성 분리
          const parts = splitJong(JONG[jongIdx]);
          result += flushHangul(choIdx, jungIdx, JONG.indexOf(parts[0]));
          choIdx = CHO.indexOf(parts[1]);
          jungIdx = JUNG.indexOf(char);
          jongIdx = 0;
          doubleJong = '';
          state = 2;
        } else {
          // 단일 종성 분리 (예: 강 -> 가이)
          const prevJong = JONG[jongIdx];
          result += flushHangul(choIdx, jungIdx, 0);
          choIdx = CHO.indexOf(prevJong);
          jungIdx = JUNG.indexOf(char);
          jongIdx = 0;
          state = 2;
        }
      } else {
        // 자음이 연달아 오면 겹종성(복합 종성) 조립 시도 (예: ㄱ + ㅅ = ㄳ)
        const combinedJong = combineJong(JONG[jongIdx], char);
        if (combinedJong) {
          jongIdx = JONG.indexOf(combinedJong);
          doubleJong = combinedJong;
        } else {
          // 겹종성 불가능 시 기존 글자 완성 후 새 초성 시작
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

  // 남은 자모 출력
  result += flushHangul(choIdx, jungIdx, jongIdx);
  return result;
}

// 이중모음 조립
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

// 겹받침 조립
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

// 겹받침 분해
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

function flushHangul(cho: number, jung: number, jong: number): string {
  if (cho === -1) return '';
  if (jung === -1) return CHO[cho];
  
  // 초성, 중성, 종성 유니코드 결합 공식
  // 한글 유니코드 시작점: 0xAC00 (가)
  const code = 0xAC00 + (cho * 21 * 28) + (jung * 28) + jong;
  return String.fromCharCode(code);
}

export const VirtualKeyboard: React.FC<VirtualKeyboardProps> = ({ value, onChange, onClose }) => {
  const [lang, setLang] = useState<'KO' | 'EN'>('KO');
  const [isShift, setIsShift] = useState(false);
  const [inputBuffer, setInputBuffer] = useState<string[]>(value.split(''));

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
      setIsShift(false); // 입력 후 자동 해제
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

  const updateValue = (buf: string[]) => {
    if (lang === 'KO') {
      onChange(assembleHangul(buf));
    } else {
      onChange(buf.join(''));
    }
  };

  // 키보드 자판 레이아웃 (QA 보완: 이메일 입력을 위한 숫자행 및 @, ., _ 특수키 전격 탑재)
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
      className="glass-panel" 
      style={{
        position: 'absolute',
        bottom: 0,
        left: 0,
        width: '100%',
        background: '#0c0f16',
        borderTop: '2px solid var(--neon-indigo)',
        padding: '30px 20px',
        boxShadow: '0 -15px 40px rgba(0,0,0,0.8)',
        zIndex: 1000,
        display: 'flex',
        flexDirection: 'column',
        gap: '16px'
      }}
      onClick={(e) => e.stopPropagation()} // 클릭 버블링 차단
    >
      {/* 텍스트 입력 가이드 */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0 10px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <Smile size={20} style={{ color: 'var(--neon-indigo)' }} />
          <span style={{ fontSize: '18px', color: 'var(--text-secondary)', fontWeight: 600 }}>가상 자판을 터치하여 입력하세요</span>
        </div>
        <button 
          className="kiosk-btn kiosk-btn-primary" 
          style={{ padding: '8px 24px', fontSize: '16px', borderRadius: '8px' }}
          onClick={onClose}
        >
          입력 완료
        </button>
      </div>

      {/* 키보드 자판 영역 */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
        {keys.map((row, rowIdx) => (
          <div 
            key={rowIdx} 
            style={{ 
              display: 'flex', 
              justifyContent: 'center', 
              gap: '10px' 
            }}
          >
            {row.map((char) => {
              // 쉬프트 모드일 때 변환 문자 미리보기 노출 (사용자 가이드 강화)
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

              return (
                <button
                  key={char}
                  onClick={() => handleKeyClick(char)}
                  style={{
                    width: '88px',
                    height: '75px',
                    borderRadius: '12px',
                    fontSize: '26px',
                    fontWeight: 700,
                    color: isShift && displayChar !== char ? 'var(--neon-amber)' : '#fff',
                    background: 'var(--bg-tertiary)',
                    border: '1px solid var(--glass-border)',
                    boxShadow: '0 4px 6px rgba(0,0,0,0.3)',
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

        {/* 특수 제어 키 라인 (스페이스, 지우기, 언어전환, 쉬프트) */}
        <div style={{ display: 'flex', justifyContent: 'center', gap: '10px' }}>
          <button
            onClick={() => setLang(lang === 'KO' ? 'EN' : 'KO')}
            style={{
              width: '120px',
              height: '75px',
              borderRadius: '12px',
              background: '#1d2433',
              border: '1px solid var(--glass-border)',
              color: 'var(--neon-indigo)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '6px',
              fontSize: '18px',
              fontWeight: 800,
              cursor: 'pointer'
            }}
            className="keypad-btn"
          >
            <Globe size={18} />
            {lang === 'KO' ? '한글' : 'ENG'}
          </button>

          <button
            onClick={() => setIsShift(!isShift)}
            style={{
              width: '120px',
              height: '75px',
              borderRadius: '12px',
              background: isShift ? 'rgba(245, 158, 11, 0.2)' : 'var(--bg-tertiary)',
              border: `1.5px solid ${isShift ? 'var(--neon-amber)' : 'var(--glass-border)'}`,
              color: isShift ? 'var(--neon-amber)' : 'var(--text-secondary)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: '18px',
              fontWeight: 800,
              cursor: 'pointer',
              boxShadow: isShift ? '0 0 12px var(--neon-amber-glow)' : 'none'
            }}
            className="keypad-btn"
          >
            쌍자음 ⇧
          </button>

          <button
            onClick={() => handleKeyClick(' ')}
            style={{
              width: '320px',
              height: '75px',
              borderRadius: '12px',
              background: 'var(--bg-tertiary)',
              border: '1px solid var(--glass-border)',
              color: '#fff',
              fontSize: '20px',
              fontWeight: 700,
              cursor: 'pointer'
            }}
            className="keypad-btn"
          >
            스페이스 (Space)
          </button>

          <button
            onClick={handleDelete}
            style={{
              width: '140px',
              height: '75px',
              borderRadius: '12px',
              background: '#3a1f26',
              border: '1px solid rgba(239, 68, 68, 0.3)',
              color: 'var(--neon-red)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '6px',
              fontSize: '20px',
              fontWeight: 700,
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
