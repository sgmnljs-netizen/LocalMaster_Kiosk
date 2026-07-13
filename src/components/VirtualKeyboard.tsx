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

function assembleHangul(chars: string[]): string {
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
      choIdx = -1; jungIdx = -1; jongIdx = 0;
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
        }
      } else {
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

function flushHangul(cho: number, jung: number, jong: number): string {
  if (cho === -1) return '';
  if (jung === -1) return CHO[cho];
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

  const updateValue = (buf: string[]) => {
    if (lang === 'KO') {
      onChange(assembleHangul(buf));
    } else {
      onChange(buf.join(''));
    }
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
      className="glass-panel" 
      style={{
        position: 'absolute', // 키오스크 프레임 내에 절대 위치 지정
        bottom: '10px', // 하단 여백 추가로 조작성 개선
        left: '50%',
        transform: 'translateX(-50%)', // 가로 중앙 정렬!
        width: '900px', // 회원가입 카드(900px)와 가로폭 일치시켜 잘림 방지!
        boxSizing: 'border-box',
        background: '#0c0f16',
        border: '1.5px solid var(--neon-indigo)',
        borderRadius: '20px',
        padding: '16px 20px',
        boxShadow: '0 10px 40px rgba(0,0,0,0.9)',
        zIndex: 99999, // 최상단 노출
        display: 'flex',
        flexDirection: 'column',
        gap: '8px'
      }}
      onClick={(e) => e.stopPropagation()}
    >
      {/* 텍스트 입력 가이드 */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0 10px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <Smile size={22} style={{ color: 'var(--neon-indigo)' }} />
          <span style={{ fontSize: '18px', color: 'var(--text-secondary)', fontWeight: 600 }}>가상 자판을 터치하여 입력하세요</span>
        </div>
        <button 
          className="kiosk-btn kiosk-btn-primary" 
          style={{ padding: '10px 32px', fontSize: '18px', borderRadius: '10px' }}
          onClick={onClose}
        >
          입력 완료
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

              return (
                <button
                  key={char}
                  onClick={() => handleKeyClick(char)}
                  style={{
                    width: '76px', // 900px 가로폭에 맞추기 위해 축소
                    height: '54px',
                    borderRadius: '8px',
                    fontSize: '22px', // 시인성을 위해 글자 크기 상향
                    fontWeight: 800, // 더 굵게 지정
                    color: isShift && displayChar !== char ? 'var(--neon-amber)' : '#ffffff', // 선명한 흰색 글자
                    background: '#1d2433', // 라이트 테마 영향을 받지 않는 선명한 다크 그레이 버튼 배경
                    border: '1px solid rgba(255, 255, 255, 0.15)', // 테두리 선명화
                    boxShadow: '0 3px 6px rgba(0,0,0,0.4)',
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
        <div style={{ display: 'flex', justifyContent: 'center', gap: '8px' }}>
          <button
            onClick={() => setLang(lang === 'KO' ? 'EN' : 'KO')}
            style={{
              width: '110px',
              height: '54px',
              borderRadius: '8px',
              background: '#1d2433',
              border: '1px solid var(--glass-border)',
              color: 'var(--neon-indigo)',
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
            onClick={() => setIsShift(!isShift)}
            style={{
              width: '110px',
              height: '54px',
              borderRadius: '8px',
              background: isShift ? 'rgba(245, 158, 11, 0.25)' : '#1d2433', // 활성 시 앰버 오버레이, 비활성 시 다크 그레이
              border: `1.5px solid ${isShift ? 'var(--neon-amber)' : 'rgba(255, 255, 255, 0.15)'}`,
              color: isShift ? 'var(--neon-amber)' : '#ffffff', // 글자색 흰색으로 변경하여 시인성 확보
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
            onClick={() => handleKeyClick(' ')}
            style={{
              width: '270px',
              height: '54px',
              borderRadius: '8px',
              background: '#1d2433', // 선명한 다크 그레이 배경
              border: '1px solid rgba(255, 255, 255, 0.15)',
              color: '#ffffff', // 선명한 흰색 글자
              fontSize: '17px',
              fontWeight: 800,
              cursor: 'pointer'
            }}
            className="keypad-btn"
          >
            스페이스 (Space)
          </button>

          <button
            onClick={handleDelete}
            style={{
              width: '130px',
              height: '54px',
              borderRadius: '8px',
              background: '#3a1f26',
              border: '1px solid rgba(239, 68, 68, 0.3)',
              color: 'var(--neon-red)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '6px',
              fontSize: '16px',
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
