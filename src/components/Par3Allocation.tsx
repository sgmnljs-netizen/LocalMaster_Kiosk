import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Calendar, Compass, User, Users, Clock, ArrowLeft, CreditCard, Check } from 'lucide-react';
import { api, Par3Slot, Product } from '../services/api';
import { VirtualKeyboard } from './VirtualKeyboard';

interface Par3AllocationProps {
  memberNo?: string;
  memberName?: string;
  onBookingSelected: (prod: Product) => void;
  onCancel: () => void;
}

type CourseType = 'EAST' | 'WEST' | 'COMPLEX';

export const Par3Allocation: React.FC<Par3AllocationProps> = ({
  memberNo,
  memberName,
  onBookingSelected,
  onCancel
}) => {
  const [course, setCourse] = useState<CourseType>('EAST');
  const [partySize, setPartySize] = useState<number>(1);
  const [slots, setSlots] = useState<Par3Slot[]>([]);
  const [selectedSlot, setSelectedSlot] = useState<Par3Slot | null>(null);
  
  // 예약자 인적사항 입력 필드
  const [leaderName, setLeaderName] = useState(memberName || '');
  const [leaderHp, setLeaderHp] = useState('');
  const [activeField, setActiveField] = useState<'LEADER_NAME' | 'LEADER_HP' | null>(null);

  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  // 1. 슬롯 데이터 불러오기
  const fetchSlots = useCallback(async () => {
    try {
      const res = await api.getPar3Slots();
      // 선택한 코스에 해당하는 슬롯만 노출
      const filtered = res.filter(s => s.course_nm === course);
      setSlots(filtered);
      setSelectedSlot(null); // 코스 전환 시 이전 선택 초기화
    } catch {
      setErrorMsg('시간 슬롯 정보를 불러오는 데 실패했습니다.');
    }
  }, [course]);

  useEffect(() => {
    fetchSlots();
  }, [fetchSlots]);

  // 가상 텐키 번호 입력
  const handleHpClick = (num: string) => {
    if (leaderHp.length >= 11) return;
    setLeaderHp(prev => prev + num);
  };

  const handleHpBackspace = () => {
    setLeaderHp(prev => prev.slice(0, -1));
  };

  const formatHp = (num: string) => {
    const cleaned = num.replace(/[^0-9]/g, '');
    if (cleaned.length <= 3) return cleaned;
    if (cleaned.length <= 7) return `${cleaned.slice(0, 3)}-${cleaned.slice(3)}`;
    return `${cleaned.slice(0, 3)}-${cleaned.slice(3, 7)}-${cleaned.slice(7, 11)}`;
  };

  // 파3 예약 최종 확정 및 결제창 전환
  const handleConfirmBooking = async () => {
    if (!selectedSlot) {
      setErrorMsg('원하시는 티오프 시간대를 선택해 주세요.');
      return;
    }
    if (!leaderName.trim()) {
      setErrorMsg('예약자 성명을 입력해 주세요.');
      return;
    }
    if (leaderHp.replace(/[^0-9]/g, '').length < 10) {
      setErrorMsg('올바른 예약자 휴대폰 번호를 입력해 주세요.');
      return;
    }

    setLoading(true);
    setErrorMsg('');

    try {
      const formattedHp = formatHp(leaderHp);
      const res = await api.bookPar3Course(
        selectedSlot.slot_id,
        course,
        selectedSlot.time,
        partySize,
        leaderName,
        formattedHp,
        memberNo
      );

      if (res.success && res.price) {
        // 결제를 위한 가상 상품 정보 생성 후 전달
        const par3Product: Product = {
          prod_cd: `PAR3_${course}_${selectedSlot.time.replace(':', '')}`,
          prod_nm: `Par3 ${course === 'COMPLEX' ? '복합(18홀)' : course === 'EAST' ? '동코스(9홀)' : '서코스(9홀)'} [${selectedSlot.time}]`,
          standard_price: res.price,
          logic_type: 'FACILITY'
        };
        onBookingSelected(par3Product);
      } else {
        setErrorMsg(res.message);
      }
    } catch {
      setErrorMsg('예약 처리 중 오류가 발생했습니다.');
    } finally {
      setLoading(false);
    }
  };

  const getCourseTitle = (type: CourseType) => {
    if (type === 'EAST') return '동코스 Par3 (9홀)';
    if (type === 'WEST') return '서코스 Par3 (9홀)';
    return '복합코스 Par3 (18홀)';
  };

  return (
    <div 
      className="glass-panel glass-panel-glow" 
      style={{
        width: '960px',
        margin: '20px auto',
        padding: '36px 40px',
        display: 'flex',
        flexDirection: 'column',
        gap: '24px',
        border: '1px solid rgba(255,255,255,0.1)'
      }}
    >
      {/* 상단 타이틀 */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <Calendar size={32} style={{ color: 'var(--neon-indigo)' }} />
          <div>
            <h2 style={{ fontSize: '28px', fontWeight: 900 }}>파3 미니 라운딩 실시간 배정</h2>
            <p style={{ fontSize: '14px', color: 'var(--text-secondary)' }}>
              이용하실 코스와 예약 시간을 선택한 뒤 결제를 진행해 주세요.
            </p>
          </div>
        </div>
        <button 
          onClick={onCancel}
          style={{
            background: 'rgba(255,255,255,0.03)',
            border: '1px solid var(--glass-border)',
            color: 'var(--text-secondary)',
            padding: '8px 16px',
            borderRadius: '8px',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            gap: '6px'
          }}
        >
          <ArrowLeft size={16} />
          돌아가기
        </button>
      </div>

      {/* 에러 메시지 */}
      {errorMsg && (
        <div 
          className="neon-border-red"
          style={{ background: 'rgba(239,68,68,0.08)', padding: '12px', borderRadius: '10px', fontSize: '15px', color: '#fca5a5', fontWeight: 700 }}
        >
          {errorMsg}
        </div>
      )}

      {/* 3단 레이아웃 그리드 */}
      <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 1.3fr 1.1fr', gap: '30px' }}>
        
        {/* 1열: 코스 및 인원 선택 */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
          {/* 코스 선택 */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            <span style={{ fontSize: '15px', fontWeight: 800, color: 'var(--text-secondary)' }}>1. 코스 선택</span>
            {(['EAST', 'WEST', 'COMPLEX'] as CourseType[]).map(c => (
              <button
                key={c}
                onClick={() => setCourse(c)}
                style={{
                  height: '60px',
                  borderRadius: '12px',
                  border: `0.5px solid ${course === c ? 'var(--neon-indigo)' : 'var(--glass-border)'}`,
                  background: course === c ? 'rgba(16, 185, 129, 0.08)' : '#121419',
                  color: course === c ? '#fff' : 'var(--text-secondary)',
                  fontSize: '16px',
                  fontWeight: 800,
                  cursor: 'pointer',
                  textAlign: 'left',
                  padding: '0 16px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  transition: 'all 0.15s ease'
                }}
              >
                <span>{getCourseTitle(c)}</span>
                {course === c && <Check size={18} style={{ color: 'var(--neon-indigo)' }} />}
              </button>
            ))}
          </div>

          {/* 인원 선택 */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            <span style={{ fontSize: '15px', fontWeight: 800, color: 'var(--text-secondary)' }}>2. 플레이 인원 선택</span>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '8px' }}>
              {[1, 2, 3, 4].map(n => (
                <button
                  key={n}
                  onClick={() => setPartySize(n)}
                  style={{
                    height: '56px',
                    borderRadius: '10px',
                    border: `0.5px solid ${partySize === n ? 'var(--neon-cyan)' : 'var(--glass-border)'}`,
                    background: partySize === n ? 'rgba(142, 149, 165, 0.12)' : '#121419',
                    color: partySize === n ? '#fff' : 'var(--text-secondary)',
                    fontSize: '18px',
                    fontWeight: 800,
                    cursor: 'pointer',
                    transition: 'all 0.15s ease'
                  }}
                >
                  {n}명
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* 2열: 티업 슬롯 시간 선택 */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          <span style={{ fontSize: '15px', fontWeight: 800, color: 'var(--text-secondary)' }}>3. 예약 시간대 선택</span>
          
          <div 
            style={{ 
              height: '320px', 
              overflowY: 'auto', 
              border: '1.5px solid var(--bg-tertiary)', 
              borderRadius: '12px', 
              background: '#07090e',
              padding: '10px',
              display: 'grid',
              gridTemplateColumns: 'repeat(2, 1fr)',
              gap: '8px',
              alignContent: 'start'
            }}
          >
            {slots.length === 0 ? (
              <div style={{ gridColumn: 'span 2', padding: '30px', textAlign: 'center', color: 'var(--text-muted)' }}>
                예약 가능한 시간대가 없습니다.
              </div>
            ) : (
              slots.map(s => {
                const isSelected = selectedSlot?.slot_id === s.slot_id;
                const isReserved = s.status !== 'AVAILABLE';
                return (
                  <button
                    key={s.slot_id}
                    disabled={isReserved}
                    onClick={() => setSelectedSlot(s)}
                    style={{
                      height: '54px',
                      borderRadius: '8px',
                      border: `1.5px solid ${isSelected ? 'var(--neon-indigo)' : (isReserved ? 'transparent' : 'var(--glass-border)')}`,
                      background: isSelected 
                        ? 'rgba(99, 102, 241, 0.1)' 
                        : (isReserved ? 'rgba(255,255,255,0.01)' : '#0f121a'),
                      color: isSelected ? '#fff' : (isReserved ? 'var(--text-muted)' : 'var(--text-secondary)'),
                      fontSize: '15px',
                      fontWeight: 700,
                      cursor: isReserved ? 'not-allowed' : 'pointer',
                      opacity: isReserved ? 0.35 : 1,
                      textDecoration: isReserved ? 'line-through' : 'none',
                      transition: 'all 0.15s ease'
                    }}
                  >
                    {s.time} {isReserved && '(마감)'}
                  </button>
                );
              })
            )}
          </div>
        </div>

        {/* 3열: 대표자 정보 입력 및 키패드 */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '15px' }}>
          <span style={{ fontSize: '15px', fontWeight: 800, color: 'var(--text-secondary)' }}>4. 예약자 기본 정보</span>
          
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            <input
              type="text"
              readOnly
              placeholder="예약자 성함 터치 입력"
              value={leaderName}
              onClick={() => setActiveField('LEADER_NAME')}
              style={{
                width: '100%',
                height: '50px',
                borderRadius: '8px',
                border: `2px solid ${activeField === 'LEADER_NAME' ? 'var(--neon-indigo)' : 'var(--bg-tertiary)'}`,
                background: '#07090e',
                color: '#fff',
                fontSize: '15px',
                fontWeight: 700,
                padding: '0 12px'
              }}
            />
            <input
              type="text"
              readOnly
              placeholder="예약자 휴대폰 입력"
              value={leaderHp ? formatHp(leaderHp) : ''}
              onClick={() => setActiveField('LEADER_HP')}
              style={{
                width: '100%',
                height: '50px',
                borderRadius: '8px',
                border: `2px solid ${activeField === 'LEADER_HP' ? 'var(--neon-indigo)' : 'var(--bg-tertiary)'}`,
                background: '#07090e',
                color: '#fff',
                fontSize: '15px',
                fontWeight: 700,
                padding: '0 12px'
              }}
            />
          </div>

          {/* 콤팩트 키패드 (휴대폰 전용) */}
          {activeField === 'LEADER_HP' && (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '6px', width: '100%' }}>
              {['1', '2', '3', '4', '5', '6', '7', '8', '9'].map(n => (
                <button
                  type="button"
                  key={n}
                  onClick={() => handleHpClick(n)}
                  style={{ height: '42px', fontSize: '16px', borderRadius: '6px' }}
                  className="keypad-btn"
                >
                  {n}
                </button>
              ))}
              <button type="button" onClick={() => setLeaderHp('')} style={{ height: '42px', fontSize: '12px', color: 'var(--neon-amber)', borderRadius: '6px' }} className="keypad-btn">지움</button>
              <button type="button" onClick={() => handleHpClick('0')} style={{ height: '42px', fontSize: '16px', borderRadius: '6px' }} className="keypad-btn">0</button>
              <button type="button" onClick={handleHpBackspace} style={{ height: '42px', fontSize: '16px', borderRadius: '6px' }} className="keypad-btn">←</button>
            </div>
          )}
        </div>

      </div>

      {/* 가상의 상세 견적 및 예약 실행 영역 */}
      <div 
        className="glass-panel" 
        style={{
          marginTop: '10px',
          padding: '20px 24px',
          borderRadius: '16px',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          background: 'rgba(255,255,255,0.01)',
          border: '1.5px solid var(--glass-border)'
        }}
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
          <span style={{ fontSize: '14px', color: 'var(--text-secondary)' }}>최종 선택 내역 및 금액</span>
          <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
            <span style={{ fontSize: '20px', fontWeight: 800, color: '#fff' }}>
              {selectedSlot ? `${selectedSlot.time} 티오프` : '시간대 미선택'} | {partySize}인
            </span>
            <span style={{ fontSize: '22px', fontWeight: 900, color: 'var(--neon-green)' }}>
              ₩{((course === 'COMPLEX' ? 45000 : 25000) * partySize).toLocaleString()}
            </span>
          </div>
        </div>

        <button
          onClick={handleConfirmBooking}
          disabled={loading || !selectedSlot}
          className="kiosk-btn kiosk-btn-success animate-pulse-glow"
          style={{
            height: '60px',
            fontSize: '18px',
            fontWeight: 800,
            padding: '0 36px',
            borderRadius: '10px',
            display: 'flex',
            gap: '8px'
          }}
        >
          <CreditCard size={20} />
          {loading ? '예약 처리 중...' : '예약 선점 및 결제하기'}
        </button>
      </div>

      {/* 성명 기입용 가상 풀키보드 오버레이 */}
      {activeField === 'LEADER_NAME' && (
        <VirtualKeyboard
          value={leaderName}
          onChange={(val) => setLeaderName(val)}
          onClose={() => setActiveField(null)}
        />
      )}
    </div>
  );
};
