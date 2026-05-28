import React, { useState } from 'react';
import { Check, ShieldAlert, Sparkles, UserPlus, X } from 'lucide-react';
import { api, Member } from '../services/api';
import { VirtualKeyboard } from './VirtualKeyboard';

interface MemberRegisterProps {
  onRegisterSuccess: (member: Member) => void;
  onCancel: () => void;
}

export const MemberRegister: React.FC<MemberRegisterProps> = ({ onRegisterSuccess, onCancel }) => {
  const [name, setName] = useState('');
  const [hp, setHp] = useState('');
  const [email, setEmail] = useState('');
  const [agree, setAgree] = useState(false);

  // 입력 활성화 포커스 제어
  const [activeField, setActiveField] = useState<'NAME' | 'HP' | 'EMAIL' | null>(null);
  
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  // 휴대폰 번호 입력을 위한 텐키 콤팩트 키패드 클릭 핸들러
  const handleNumClick = (num: string) => {
    setErrorMsg('');
    if (hp.length >= 11) return;
    setHp(prev => prev + num);
  };

  const handleBackspace = () => {
    setHp(prev => prev.slice(0, -1));
  };

  const formatPhoneNumber = (num: string) => {
    const cleaned = num.replace(/[^0-9]/g, '');
    if (cleaned.length <= 3) return cleaned;
    if (cleaned.length <= 7) return `${cleaned.slice(0, 3)}-${cleaned.slice(3)}`;
    return `${cleaned.slice(0, 3)}-${cleaned.slice(3, 7)}-${cleaned.slice(7, 11)}`;
  };

  // 회원 등록 최종 제출
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg('');

    if (!name.trim()) {
      setErrorMsg('이름을 입력해 주세요.');
      return;
    }
    if (hp.length < 10) {
      setErrorMsg('올바른 휴대폰 번호를 입력해 주세요.');
      return;
    }
    if (!email.includes('@') || email.length < 5) {
      setErrorMsg('유효한 이메일 주소를 입력해 주세요.');
      return;
    }
    if (!agree) {
      setErrorMsg('개인정보 수집 및 키오스크 이용약관에 동의해 주세요.');
      return;
    }

    setLoading(true);
    try {
      const formattedHp = formatPhoneNumber(hp);
      const res = await api.registerMember(name, formattedHp, email);
      if (res.success && res.member) {
        onRegisterSuccess(res.member);
      } else {
        setErrorMsg(res.message);
      }
    } catch {
      setErrorMsg('회원가입 요청 처리 중 서버 통신 에러가 발생했습니다.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div 
      className="glass-panel glass-panel-glow" 
      style={{
        width: '900px',
        margin: '20px auto',
        padding: '40px 50px',
        display: 'flex',
        flexDirection: 'column',
        gap: '30px',
        border: '1px solid rgba(255,255,255,0.1)'
      }}
    >
      {/* 타이틀 헤더 */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <UserPlus size={34} style={{ color: 'var(--neon-green)' }} />
          <div>
            <h2 style={{ fontSize: '30px', fontWeight: 900 }}>무인 스튜디오 30초 즉석 회원가입</h2>
            <p style={{ fontSize: '15px', color: 'var(--text-secondary)', marginTop: '2px' }}>
              간단한 기본 정보 입력 후 정기권 회원 혜택과 타석 예약을 시작하세요.
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
            borderRadius: '10px',
            cursor: 'pointer'
          }}
        >
          취소
        </button>
      </div>

      {/* 에러 */}
      {errorMsg && (
        <div className="neon-border-red" style={{ background: 'rgba(239,68,68,0.1)', padding: '12px', borderRadius: '10px', display: 'flex', alignItems: 'center', gap: '8px' }}>
          <ShieldAlert size={18} style={{ color: 'var(--neon-red)' }} />
          <span style={{ fontSize: '15px', fontWeight: 700, color: '#fca5a5' }}>{errorMsg}</span>
        </div>
      )}

      {/* 회원가입 폼 그리드 (Data-Dense 2단 분리 배치) */}
      <form onSubmit={handleSubmit} style={{ display: 'grid', gridTemplateColumns: '1.2fr 1fr', gap: '40px' }}>
        
        {/* 좌측: 이름 / 휴대폰 / 이메일 등 입력 상자 */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
          
          {/* 이름 입력 필드 */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            <label style={{ fontSize: '16px', fontWeight: 700, color: 'var(--text-secondary)' }}>이름 (실명 입력)</label>
            <input
              type="text"
              readOnly
              onClick={() => setActiveField('NAME')}
              value={name}
              placeholder="여기를 터치하여 이름을 입력하세요"
              style={{
                width: '100%',
                height: '64px',
                borderRadius: '12px',
                border: `2px solid ${activeField === 'NAME' ? 'var(--neon-indigo)' : 'var(--bg-tertiary)'}`,
                background: '#0a0d14',
                color: '#fff',
                fontSize: '20px',
                fontWeight: 700,
                padding: '0 20px',
                boxShadow: activeField === 'NAME' ? '0 0 10px var(--neon-indigo-glow)' : 'none',
                cursor: 'pointer'
              }}
            />
          </div>

          {/* 이메일 입력 필드 */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            <label style={{ fontSize: '16px', fontWeight: 700, color: 'var(--text-secondary)' }}>이메일 주소</label>
            <input
              type="email"
              readOnly
              onClick={() => setActiveField('EMAIL')}
              value={email}
              placeholder="여기를 터치하여 이메일을 입력하세요"
              style={{
                width: '100%',
                height: '64px',
                borderRadius: '12px',
                border: `2px solid ${activeField === 'EMAIL' ? 'var(--neon-indigo)' : 'var(--bg-tertiary)'}`,
                background: '#0a0d14',
                color: '#fff',
                fontSize: '20px',
                fontWeight: 700,
                padding: '0 20px',
                boxShadow: activeField === 'EMAIL' ? '0 0 10px var(--neon-indigo-glow)' : 'none',
                cursor: 'pointer'
              }}
            />
          </div>

          {/* 개인정보 이용 동의 */}
          <div 
            onClick={() => setAgree(!agree)}
            className="glass-panel"
            style={{ 
              padding: '20px', 
              borderRadius: '12px', 
              display: 'flex', 
              alignItems: 'flex-start', 
              gap: '12px',
              cursor: 'pointer',
              border: `1.5px solid ${agree ? 'var(--neon-green)' : 'var(--glass-border)'}`,
              background: agree ? 'rgba(16, 185, 129, 0.03)' : 'transparent',
              transition: 'all 0.15s ease',
              marginTop: '10px'
            }}
          >
            <div 
              style={{ 
                width: '24px', 
                height: '24px', 
                borderRadius: '6px', 
                border: `2px solid ${agree ? 'var(--neon-green)' : 'var(--text-muted)'}`,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                backgroundColor: agree ? 'var(--neon-green)' : 'transparent',
                color: '#fff',
                marginTop: '2px'
              }}
            >
              {agree && <Check size={16} />}
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
              <span style={{ fontSize: '16px', fontWeight: 800, color: agree ? '#fff' : 'var(--text-secondary)' }}>
                [필수] 개인정보 수집 및 키오스크 이용약관 동의
              </span>
              <p style={{ fontSize: '13px', color: 'var(--text-muted)', lineHeight: '1.4' }}>
                무인 시설 입장 바코드 생성, 타석 배정 예약 정보의 알림톡 발송을 위해 이름과 연락처 수집에 동의해 주셔야 가입이 가능합니다.
              </p>
            </div>
          </div>
        </div>

        {/* 우측: 휴대폰 입력 전용 콤팩트 키패드 */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', alignItems: 'center' }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', width: '100%' }}>
            <label style={{ fontSize: '16px', fontWeight: 700, color: 'var(--text-secondary)', textAlign: 'center' }}>
              휴대폰 번호 입력
            </label>
            <div 
              style={{
                width: '100%',
                height: '64px',
                background: '#0a0d14',
                border: '2px solid var(--bg-tertiary)',
                borderRadius: '12px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: '26px',
                fontWeight: 800,
                color: hp ? '#fff' : 'var(--text-muted)',
                letterSpacing: '1px'
              }}
            >
              {hp ? formatPhoneNumber(hp) : '010-0000-0000'}
            </div>
          </div>

          {/* 콤팩트 텐키 그리드 */}
          <div 
            style={{ 
              display: 'grid', 
              gridTemplateColumns: 'repeat(3, 1fr)', 
              gap: '10px', 
              width: '100%' 
            }}
          >
            {['1', '2', '3', '4', '5', '6', '7', '8', '9'].map(n => (
              <button 
                type="button" 
                key={n} 
                onClick={() => handleNumClick(n)} 
                style={{ height: '64px', fontSize: '22px', borderRadius: '10px' }}
                className="keypad-btn"
              >
                {n}
              </button>
            ))}
            <button 
              type="button" 
              onClick={() => setHp('')} 
              style={{ height: '64px', fontSize: '15px', color: 'var(--neon-amber)', borderRadius: '10px' }} 
              className="keypad-btn"
            >
              지움
            </button>
            <button 
              type="button" 
              onClick={() => handleNumClick('0')} 
              style={{ height: '64px', fontSize: '22px', borderRadius: '10px' }}
              className="keypad-btn"
            >
              0
            </button>
            <button 
              type="button" 
              onClick={handleBackspace} 
              style={{ height: '64px', borderRadius: '10px', display: 'flex', alignItems: 'center', justifyItems: 'center', justifyContent: 'center' }} 
              className="keypad-btn"
            >
              ←
            </button>
          </div>

          {/* 가입 완료 최종 제출 버튼 */}
          <button
            type="submit"
            disabled={loading}
            className="kiosk-btn kiosk-btn-success animate-pulse-glow"
            style={{
              width: '100%',
              height: '75px',
              borderRadius: '12px',
              fontSize: '22px',
              fontWeight: 800,
              display: 'flex',
              gap: '8px',
              marginTop: '10px'
            }}
          >
            <Sparkles size={20} />
            {loading ? '가입 처리 중...' : '회원가입 완료 및 시작'}
          </button>
        </div>

      </form>

      {/* 하단 가상 키보드 영역 바인딩 (이름이나 이메일 입력 활성화 시 스르륵 올라옴) */}
      {(activeField === 'NAME' || activeField === 'EMAIL') && (
        <VirtualKeyboard
          value={activeField === 'NAME' ? name : email}
          onChange={(val) => {
            if (activeField === 'NAME') setName(val);
            else setEmail(val);
          }}
          onClose={() => setActiveField(null)}
        />
      )}
    </div>
  );
};
