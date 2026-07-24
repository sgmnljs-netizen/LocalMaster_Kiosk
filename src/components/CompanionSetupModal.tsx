import React, { useState, useEffect } from 'react';
import { UserPlus, Timer, X, AlertCircle, UserCheck } from 'lucide-react';
import { api, Member, Bay } from '../services/api';

export interface CompanionTargetItem {
  bayNo: number;
  isLeader: boolean;
  memberNo?: string;
  memberName?: string;
  hp?: string;
  isGuest: boolean;
  ticketType: 'MEMBERSHIP' | 'DAILY';
  memberItemId?: number;
  ticketName?: string;
  durationMin: number;
  price: number;
}

interface CompanionSetupModalProps {
  selectedBayNos: number[];
  bays: Bay[];
  leaderMember: Member;
  lang: 'KO' | 'EN';
  selectedDurationMin?: number;
  onConfirm: (targets: CompanionTargetItem[]) => void;
  onCancel: () => void;
}

export const CompanionSetupModal: React.FC<CompanionSetupModalProps> = ({
  selectedBayNos,
  leaderMember,
  lang,
  selectedDurationMin = 60,
  onConfirm,
  onCancel
}) => {
  const [activeBayIdx, setActiveBayIdx] = useState<number>(0);
  const [countdown, setCountdown] = useState<number>(120); // 120초 락 확장
  const [searchHp, setSearchHp] = useState<string>('');
  const [searchLoading, setSearchLoading] = useState<boolean>(false);
  const [searchError, setSearchError] = useState<string>('');

  // 각 타석별 배정 설정 상태
  const [targets, setTargets] = useState<CompanionTargetItem[]>(() => {
    return selectedBayNos.map((bayNo, idx) => {
      if (idx === 0) {
        // 대표자 타석
        const validAsset = (leaderMember.assets || [])[0];
        const durMin = (validAsset as any)?.duration_min || selectedDurationMin;
        return {
          bayNo,
          isLeader: true,
          memberNo: leaderMember.member_no,
          memberName: leaderMember.member_name,
          hp: leaderMember.hp,
          isGuest: false,
          ticketType: validAsset ? 'MEMBERSHIP' : 'DAILY',
          memberItemId: validAsset ? parseInt(validAsset.member_item_id) : undefined,
          ticketName: validAsset ? validAsset.item_name : `일일 타석권 ${durMin}분`,
          durationMin: durMin,
          price: validAsset ? 0 : (durMin === 90 ? 20000 : 15000)
        };
      } else {
        // 동반자 타석 (디폴트: 비회원 일일권, 대표자와 동일 시간 상속)
        return {
          bayNo,
          isLeader: false,
          memberName: `동반자 ${idx}`,
          hp: '',
          isGuest: true,
          ticketType: 'DAILY',
          ticketName: `일일 타석권 ${selectedDurationMin}분`,
          durationMin: selectedDurationMin,
          price: selectedDurationMin === 90 ? 20000 : 15000
        };
      }
    });
  });

  // 120초 타이머 및 30초 주기 Heartbeat 락 갱신
  useEffect(() => {
    const timer = setInterval(() => {
      setCountdown(prev => {
        if (prev <= 1) {
          onCancel();
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    // 30초마다 preoccupyBays Heartbeat 백그라운드 갱신
    const hbInterval = setInterval(() => {
      api.preoccupyBays(selectedBayNos).catch(err => {
        console.error('Heartbeat lock extension failed:', err);
        setSearchError(lang === 'KO' ? '네트워크 상태 불안정으로 선점 락 갱신이 지연되고 있습니다.' : 'Network unstable. Lock extension delayed.');
      });
    }, 30000);

    return () => {
      clearInterval(timer);
      clearInterval(hbInterval);
    };
  }, [selectedBayNos, onCancel, lang]);

  // 특정 타석의 설정 값 업데이트
  const updateTarget = (idx: number, patch: Partial<CompanionTargetItem>) => {
    setTargets(prev => {
      const next = [...prev];
      next[idx] = { ...next[idx], ...patch };
      return next;
    });
  };

  // 동반자 회원 검색 (정규화 헬퍼 적용)
  const handleSearchCompanion = async () => {
    const cleanHp = searchHp.replace(/[^0-9]/g, '');
    if (!cleanHp || cleanHp.length < 4) {
      setSearchError(lang === 'KO' ? '전화번호 뒤 4자리 이상 입력해주세요.' : 'Enter at least 4 digits.');
      return;
    }
    setSearchError('');
    setSearchLoading(true);

    try {
      // 휴대폰번호 검색
      const member = await api.getMemberByHp(cleanHp);
      if (member) {
        const validAsset = (member.assets || [])[0];
        updateTarget(activeBayIdx, {
          isGuest: false,
          memberNo: member.member_no,
          memberName: member.member_name,
          hp: member.hp,
          ticketType: validAsset ? 'MEMBERSHIP' : 'DAILY',
          memberItemId: validAsset ? parseInt(validAsset.member_item_id) : undefined,
          ticketName: validAsset ? validAsset.item_name : '일일 타석권 60분',
          price: validAsset ? 0 : 15000
        });
        setSearchHp('');
      } else {
        setSearchError(lang === 'KO' ? '해당 정보의 회원을 찾을 수 없습니다. 비회원으로 진행됩니다.' : 'Member not found.');
      }
    } catch {
      setSearchError(lang === 'KO' ? '회원 검색 중 오류가 발생했습니다.' : 'Failed to search member.');
    } finally {
      setSearchLoading(false);
    }
  };

  const currentTarget = targets[activeBayIdx];
  const totalPrice = targets.reduce((sum, t) => sum + t.price, 0);

  return (
    <div 
      style={{
        position: 'fixed',
        top: 0, left: 0, right: 0, bottom: 0,
        backgroundColor: 'rgba(0, 0, 0, 0.75)',
        backdropFilter: 'blur(12px)',
        zIndex: 999,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '24px'
      }}
    >
      <div 
        style={{
          width: '100%',
          maxWidth: '920px',
          background: '#ffffff',
          borderRadius: '32px',
          boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25)',
          overflow: 'hidden',
          display: 'flex',
          flexDirection: 'column',
          maxHeight: '90vh',
          border: '1px solid rgba(255, 255, 255, 0.2)'
        }}
      >
        {/* Header */}
        <div 
          style={{
            background: 'linear-gradient(135deg, #031510 0%, #022c22 100%)',
            padding: '28px 36px',
            color: '#ffffff',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between'
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
            <div style={{ background: 'rgba(52, 199, 89, 0.2)', padding: '12px', borderRadius: '16px' }}>
              <UserPlus size={28} color="#34c759" />
            </div>
            <div>
              <h2 style={{ fontSize: '26px', fontWeight: 900, margin: 0 }}>
                {lang === 'KO' ? '👥 동반자 타석 동시 배정 설정' : '👥 Companion Bay Allocation Setup'}
              </h2>
              <p style={{ fontSize: '15px', color: '#a1a1aa', margin: '4px 0 0 0' }}>
                {lang === 'KO' ? `선택하신 ${selectedBayNos.length}개 타석의 사용 정보를 설정해주세요.` : `Configure details for ${selectedBayNos.length} selected teeboxes.`}
              </p>
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
            {/* Countdown Badge */}
            <div 
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                background: 'rgba(255, 255, 255, 0.1)',
                padding: '8px 16px',
                borderRadius: '20px',
                fontSize: '16px',
                fontWeight: 700
              }}
            >
              <Timer size={18} color="#34c759" />
              <span>{Math.floor(countdown / 60)}:{String(countdown % 60).padStart(2, '0')}</span>
            </div>
            <button 
              onClick={onCancel}
              style={{ background: 'none', border: 'none', color: '#ffffff', cursor: 'pointer', opacity: 0.8 }}
            >
              <X size={28} />
            </button>
          </div>
        </div>

        {/* Content Body */}
        <div style={{ padding: '32px 36px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '24px' }}>
          {/* 타석 선택 탭 */}
          <div style={{ display: 'flex', gap: '12px', overflowX: 'auto', paddingBottom: '4px' }}>
            {targets.map((t, idx) => {
              const isActive = idx === activeBayIdx;
              return (
                <button
                  key={t.bayNo}
                  onClick={() => setActiveBayIdx(idx)}
                  style={{
                    flex: 1,
                    minWidth: '140px',
                    padding: '16px 20px',
                    borderRadius: '20px',
                    border: isActive ? '2px solid #047857' : '1px solid #e5e7eb',
                    background: isActive ? '#ecfdf5' : '#f9fafb',
                    color: isActive ? '#047857' : '#4b5563',
                    fontWeight: 800,
                    fontSize: '18px',
                    cursor: 'pointer',
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    gap: '4px',
                    transition: 'all 0.2s ease'
                  }}
                >
                  <span style={{ fontSize: '13px', color: isActive ? '#059669' : '#9ca3af', fontWeight: 700 }}>
                    {t.isLeader ? '[대표자]' : `[동반자 ${idx}]`}
                  </span>
                  <span>{t.bayNo}번 타석</span>
                </button>
              );
            })}
          </div>

          {/* Active Bay Detail Form */}
          {currentTarget && (
            <div style={{ background: '#f8fafc', borderRadius: '24px', padding: '28px', border: '1px solid #e2e8f0', display: 'flex', flexDirection: 'column', gap: '20px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <h3 style={{ fontSize: '20px', fontWeight: 800, margin: 0, color: '#0f172a' }}>
                  📌 {currentTarget.bayNo}번 타석 설정 ({currentTarget.isLeader ? '대표자' : `동반자 ${activeBayIdx}`})
                </h3>
                {currentTarget.isLeader ? (
                  <span style={{ background: '#dcfce7', color: '#15803d', padding: '6px 14px', borderRadius: '12px', fontSize: '14px', fontWeight: 800 }}>
                    인증 회원 ({currentTarget.memberName})
                  </span>
                ) : (
                  <div style={{ display: 'flex', gap: '8px' }}>
                    <button
                      onClick={() => updateTarget(activeBayIdx, { isGuest: false, memberName: '동반자 회원' })}
                      style={{
                        padding: '8px 16px',
                        borderRadius: '12px',
                        fontSize: '14px',
                        fontWeight: 700,
                        border: !currentTarget.isGuest ? '2px solid #047857' : '1px solid #cbd5e1',
                        background: !currentTarget.isGuest ? '#ecfdf5' : '#ffffff',
                        color: !currentTarget.isGuest ? '#047857' : '#64748b',
                        cursor: 'pointer'
                      }}
                    >
                      <UserCheck size={16} style={{ display: 'inline', marginRight: '4px' }} /> 회원
                    </button>
                    <button
                      onClick={() => updateTarget(activeBayIdx, { isGuest: true, memberName: `비회원 ${activeBayIdx}`, ticketType: 'DAILY', price: 15000 })}
                      style={{
                        padding: '8px 16px',
                        borderRadius: '12px',
                        fontSize: '14px',
                        fontWeight: 700,
                        border: currentTarget.isGuest ? '2px solid #047857' : '1px solid #cbd5e1',
                        background: currentTarget.isGuest ? '#ecfdf5' : '#ffffff',
                        color: currentTarget.isGuest ? '#047857' : '#64748b',
                        cursor: 'pointer'
                      }}
                    >
                      비회원
                    </button>
                  </div>
                )}
              </div>

              {/* 회원 검색 폼 (동반자 회원 선택 시) */}
              {!currentTarget.isLeader && !currentTarget.isGuest && (
                <div style={{ background: '#ffffff', padding: '16px', borderRadius: '16px', border: '1px solid #e2e8f0', display: 'flex', gap: '12px', alignItems: 'center' }}>
                  <input 
                    type="text"
                    placeholder="휴대폰 번호 뒤 4자리 검색"
                    value={searchHp}
                    onChange={(e) => setSearchHp(e.target.value)}
                    style={{ flex: 1, padding: '12px 16px', borderRadius: '12px', border: '1px solid #cbd5e1', fontSize: '16px' }}
                  />
                  <button
                    onClick={handleSearchCompanion}
                    disabled={searchLoading}
                    style={{ padding: '12px 24px', background: '#047857', color: '#fff', border: 'none', borderRadius: '12px', fontWeight: 800, cursor: 'pointer' }}
                  >
                    {searchLoading ? '검색 중...' : '회원 조회'}
                  </button>
                </div>
              )}
              {searchError && (
                <div style={{ color: '#ef4444', fontSize: '14px', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <AlertCircle size={16} /> {searchError}
                </div>
              )}

              {/* 이용권 / 상품 지정 */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                <label style={{ fontSize: '15px', fontWeight: 800, color: '#334155' }}>배정 및 이용 방식 선택</label>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                  {/* 이용권 차감 옵션 */}
                  <button
                    onClick={() => updateTarget(activeBayIdx, { ticketType: 'MEMBERSHIP', price: 0, ticketName: '정기 회원권 / 잔여 횟수 차감' })}
                    style={{
                      padding: '20px',
                      borderRadius: '16px',
                      textAlign: 'left',
                      border: currentTarget.ticketType === 'MEMBERSHIP' ? '2px solid #047857' : '1px solid #cbd5e1',
                      background: currentTarget.ticketType === 'MEMBERSHIP' ? '#ffffff' : '#f8fafc',
                      cursor: 'pointer',
                      boxShadow: currentTarget.ticketType === 'MEMBERSHIP' ? '0 4px 12px rgba(4, 120, 87, 0.1)' : 'none'
                    }}
                  >
                    <div style={{ fontWeight: 800, fontSize: '17px', color: '#0f172a' }}>🎟️ 회원권 차감</div>
                    <div style={{ fontSize: '13px', color: '#64748b', marginTop: '4px' }}>보유 중인 회원 이용권으로 배정 (0원)</div>
                  </button>

                  {/* 일일 이용권 결제 옵션 */}
                  <button
                    onClick={() => updateTarget(activeBayIdx, { ticketType: 'DAILY', price: 15000, ticketName: '일일 타석권 60분' })}
                    style={{
                      padding: '20px',
                      borderRadius: '16px',
                      textAlign: 'left',
                      border: currentTarget.ticketType === 'DAILY' ? '2px solid #047857' : '1px solid #cbd5e1',
                      background: currentTarget.ticketType === 'DAILY' ? '#ffffff' : '#f8fafc',
                      cursor: 'pointer',
                      boxShadow: currentTarget.ticketType === 'DAILY' ? '0 4px 12px rgba(4, 120, 87, 0.1)' : 'none'
                    }}
                  >
                    <div style={{ fontWeight: 800, fontSize: '17px', color: '#0f172a' }}>💳 일일 타석권 결제</div>
                    <div style={{ fontSize: '13px', color: '#047857', fontWeight: 700, marginTop: '4px' }}>15,000 원 (60분 이용)</div>
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div 
          style={{
            padding: '24px 36px',
            borderTop: '1px solid #e2e8f0',
            background: '#ffffff',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between'
          }}
        >
          <div>
            <span style={{ fontSize: '14px', color: '#64748b', fontWeight: 600 }}>총 결제 필요 금액</span>
            <div style={{ fontSize: '28px', fontWeight: 900, color: '#047857' }}>
              {totalPrice.toLocaleString()} <span style={{ fontSize: '20px' }}>원</span>
            </div>
          </div>

          <div style={{ display: 'flex', gap: '16px' }}>
            <button
              onClick={onCancel}
              style={{
                padding: '16px 32px',
                borderRadius: '16px',
                border: '1px solid #cbd5e1',
                background: '#ffffff',
                color: '#475569',
                fontSize: '18px',
                fontWeight: 800,
                cursor: 'pointer'
              }}
            >
              이전으로
            </button>
            <button
              onClick={() => onConfirm(targets)}
              style={{
                padding: '16px 40px',
                borderRadius: '16px',
                border: 'none',
                background: 'linear-gradient(135deg, #064e3b 0%, #059669 100%)',
                color: '#ffffff',
                fontSize: '18px',
                fontWeight: 900,
                cursor: 'pointer',
                boxShadow: '0 10px 20px rgba(5, 150, 105, 0.3)'
              }}
            >
              {totalPrice > 0 ? '일괄 결제 진행' : '다중 배정 확정'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
