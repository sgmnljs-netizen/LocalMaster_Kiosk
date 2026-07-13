import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Calendar, User, Users, Clock, ArrowLeft, CreditCard, Check, HelpCircle, CreditCard as CardIcon, Loader2, RefreshCw, X, Plus, Ticket } from 'lucide-react';
import { api, Par3Slot, Product, KioskZone, Member, MemberAsset, KioskCompanionItem, STORE_CODE } from '../services/api';
import { ReceiptPrinter, ReceiptData } from './ReceiptPrinter';

interface Par3AllocationProps {
  memberNo?: string;
  memberName?: string;
  onBookingSelected: (prod: Product) => void;
  onCancel: () => void;
}

type PaymentState = 'IDLE' | 'INSERT_WAIT' | 'READING' | 'DISPATCHING' | 'DONE';
type ModalState = 'NONE' | 'ADD_MEMBER_PHONE' | 'ADD_GUEST_PHONE' | 'TICKET_SELECT';

interface PlayerSlot {
  id: string; // unique key
  member_no?: string;
  guest_nm: string;
  hp_no: string;
  is_member: boolean;
  use_ticket_id?: string;
  use_ticket_name?: string;
}

export const Par3Allocation: React.FC<Par3AllocationProps> = ({
  memberNo,
  memberName,
  onBookingSelected,
  onCancel
}) => {
  const [zones, setZones] = useState<KioskZone[]>([]);
  const [course, setCourse] = useState<string>(''); // zone_code 매핑
  const [slots, setSlots] = useState<Par3Slot[]>([]);
  const [selectedSlot, setSelectedSlot] = useState<Par3Slot | null>(null);

  // 배정 인원 동적 목록 (최대 4인)
  const [players, setPlayers] = useState<PlayerSlot[]>([]);
  
  // 모달 및 서브 다이어로그 제어
  const [modalState, setModalState] = useState<ModalState>('NONE');
  const [modalPhone, setModalPhone] = useState('');
  const [modalError, setModalError] = useState('');
  
  // 이용권 선택 시 임시 타겟 회원 데이터
  const [selectedMemberForTicket, setSelectedMemberForTicket] = useState<{ member: Member; isLeader: boolean } | null>(null);

  // 결제 시뮬레이션 상태
  const [paymentState, setPaymentState] = useState<PaymentState>('IDLE');
  const [createdReceipt, setCreatedReceipt] = useState<ReceiptData | null>(null);
  const [authProgress, setAuthProgress] = useState(0);

  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  // 스크롤 컨테이너 참조용 Ref
  const scrollContainerRef = useRef<HTMLDivElement>(null);

  // 0. 활성화된 구역(Zone) 목록 로드
  useEffect(() => {
    const fetchZones = async () => {
      try {
        const res = await api.getKioskZones();
        setZones(res);
        if (res.length > 0) {
          setCourse(res[0].zone_code); // 첫 번째 구역 기본 선택
        }
      } catch {
        setErrorMsg('코스 구역 정보를 불러오는 데 실패했습니다.');
      }
    };
    fetchZones();
  }, []);

  const getTodayStr = () => {
    const d = new Date();
    const yyyy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    return `${yyyy}${mm}${dd}`;
  };

  // 1. 슬롯 데이터 불러오기
  const fetchSlots = useCallback(async () => {
    if (!course) return;
    try {
      const res = await api.getPar3Slots(course, getTodayStr());
      setSlots(res);
      setSelectedSlot(null); // 코스 전환 시 이전 선택 초기화
    } catch {
      setErrorMsg('시간 슬롯 정보를 불러오는 데 실패했습니다.');
    }
  }, [course]);

  useEffect(() => {
    fetchSlots();
  }, [fetchSlots]);

  // 2. 예약 가능 최초 슬롯으로 자동 스크롤 포커싱
  useEffect(() => {
    if (slots.length > 0 && scrollContainerRef.current) {
      const container = scrollContainerRef.current;
      const firstAvailableButton = container.querySelector('button:not([disabled])') as HTMLButtonElement;
      if (firstAvailableButton) {
        firstAvailableButton.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      }
    }
  }, [slots]);

  // 3. 대표자 마운트 세팅
  useEffect(() => {
    const setupLeader = async () => {
      // 로그인 회원인 경우 대표자로 즉시 자동 추가
      if (memberNo && memberName) {
        setLoading(true);
        try {
          const detail = await api.getMember(memberNo);
          setPlayers([
            {
              id: 'LEADER',
              member_no: memberNo,
              guest_nm: memberName,
              hp_no: detail?.hp || '',
              is_member: true,
              use_ticket_id: undefined,
              use_ticket_name: undefined
            }
          ]);
          
          // 만약 사용 가능한 이용권이 존재하면, 즉석에서 대표자 이용권 자동 매칭 팝업 작동 유도
          if (detail && detail.assets && detail.assets.length > 0) {
            setSelectedMemberForTicket({ member: detail, isLeader: true });
            setModalState('TICKET_SELECT');
          }
        } catch {
          // Fallback
          setPlayers([
            {
              id: 'LEADER',
              member_no: memberNo,
              guest_nm: memberName,
              hp_no: '',
              is_member: true
            }
          ]);
        } finally {
          setLoading(false);
        }
      } else {
        // 비회원 대표자 대기
        setPlayers([]);
      }
    };
    setupLeader();
  }, [memberNo, memberName]);

  // 휴대폰 번호 포맷팅 (010-1234-5678)
  const formatHp = (num: string) => {
    const cleaned = num.replace(/[^0-9]/g, '');
    if (cleaned.length <= 3) return cleaned;
    if (cleaned.length <= 7) return `${cleaned.slice(0, 3)}-${cleaned.slice(3)}`;
    return `${cleaned.slice(0, 3)}-${cleaned.slice(3, 7)}-${cleaned.slice(7, 11)}`;
  };

  // 모달 텐키 클릭 핸들러
  const handleModalPhoneClick = (num: string) => {
    setModalError('');
    if (modalPhone.length >= 11) return;
    setModalPhone(prev => prev + num);
  };

  const handleModalPhoneBackspace = () => {
    setModalError('');
    setModalPhone(prev => prev.slice(0, -1));
  };

  // 4. 인원 추가 모달 서브밋
  const handlePhoneModalSubmit = async () => {
    if (modalPhone.length < 10) {
      setModalError('올바른 연락처 번호를 입력해 주세요.');
      return;
    }
    
    const formatted = formatHp(modalPhone);
    
    // 이미 등록된 연락처 중복 체크
    const isDup = players.some(p => p.hp_no.replace(/[^0-9]/g, '') === modalPhone);
    if (isDup) {
      setModalError('이미 배정 목록에 추가된 연락처입니다.');
      return;
    }

    if (modalState === 'ADD_GUEST_PHONE') {
      // 4-1. 비회원 동반자 추가
      const newIdx = players.length + 1;
      const companionName = newIdx === 1 ? '대표자' : `동반자${newIdx - 1}`;
      
      const newGuestSlot: PlayerSlot = {
        id: `PLAYER_${Date.now()}`,
        guest_nm: companionName,
        hp_no: formatted,
        is_member: false
      };
      
      setPlayers(prev => [...prev, newGuestSlot]);
      closeModal();
    } 
    else if (modalState === 'ADD_MEMBER_PHONE') {
      // 4-2. 회원 동반자 추가 (검색)
      setLoading(true);
      setModalError('');
      try {
        const member = await api.getMember(formatted);
        if (member) {
          // 회원 조회 성공
          const isLeaderSlot = players.length === 0;
          
          if (member.assets && member.assets.length > 0) {
            // 사용 가능한 이용권이 있는 경우 ➔ 이용권 선택 팝업 오픈
            setSelectedMemberForTicket({ member, isLeader: isLeaderSlot });
            setModalState('TICKET_SELECT');
          } else {
            // 이용권이 없으면 ➔ 바로 추가
            addMemberSlot(member, isLeaderSlot);
          }
        } else {
          setModalError('등록된 회원 정보를 찾을 수 없습니다. 번호를 확인해 주세요.');
        }
      } catch {
        setModalError('회원 조회 중 서버 통신 에러가 발생했습니다.');
      } finally {
        setLoading(false);
      }
    }
  };

  const addMemberSlot = (member: Member, isLeader: boolean, ticket?: MemberAsset) => {
    const slotId = isLeader ? 'LEADER' : `PLAYER_${Date.now()}`;
    const displayName = member.member_name;

    const newSlot: PlayerSlot = {
      id: slotId,
      member_no: member.member_no,
      guest_nm: displayName,
      hp_no: formatHp(member.hp),
      is_member: true,
      use_ticket_id: ticket?.member_item_id,
      use_ticket_name: ticket?.item_name
    };

    if (isLeader) {
      setPlayers([newSlot]);
    } else {
      setPlayers(prev => [...prev, newSlot]);
    }
    closeModal();
  };

  const closeModal = () => {
    setModalState('NONE');
    setModalPhone('');
    setModalError('');
    setSelectedMemberForTicket(null);
  };

  // 슬롯 인원 삭제
  const handleRemovePlayer = (id: string) => {
    setPlayers(prev => prev.filter(p => p.id !== id));
  };

  // 인당 코스 일반 요금 산출
  const getCoursePriceLabel = () => {
    const isComplex = course.toLowerCase().includes('complex') || (selectedSlot?.course_nm || '').includes('복합') || (selectedSlot?.course_nm || '').includes('18');
    return isComplex ? 45000 : 25000;
  };

  // 최종 결제 금액 연산 (이용권 사용자는 요금 ₩0)
  const calculateTotalAmount = () => {
    const unitPrice = getCoursePriceLabel();
    let sum = 0;
    players.forEach(p => {
      if (!p.use_ticket_id) {
        sum += unitPrice;
      }
    });
    return sum;
  };

  // 파3 예약 최종 확정 및 결제창 전환
  const handleConfirmBooking = async () => {
    if (!selectedSlot) {
      setErrorMsg('원하시는 티오프 시간대를 선택해 주세요.');
      return;
    }
    if (players.length === 0) {
      setErrorMsg('최소 1명 이상의 대표자(또는 동반자)를 배정 인원 목록에 추가해 주세요.');
      return;
    }

    setLoading(true);
    setErrorMsg('');

    const totalAmount = calculateTotalAmount();

    // 백엔드 preoccupy 페이로드 포맷 빌드
    const leaderSlot = players[0];
    const companionsSlots = players.slice(1);

    const leaderPayload: KioskCompanionItem = {
      member_no: leaderSlot.member_no || undefined,
      guest_nm: leaderSlot.guest_nm,
      hp_no: leaderSlot.hp_no,
      is_member: leaderSlot.is_member,
      use_ticket_id: leaderSlot.use_ticket_id || undefined
    };

    const companionsPayload: KioskCompanionItem[] = companionsSlots.map(c => ({
      member_no: c.member_no || undefined,
      guest_nm: c.guest_nm,
      hp_no: c.hp_no,
      is_member: c.is_member,
      use_ticket_id: c.use_ticket_id || undefined
    }));

    try {
      const res = await api.bookPar3Course(
        course,
        getTodayStr(),
        selectedSlot.time,
        totalAmount,
        leaderPayload,
        companionsPayload
      );

      if (res.success && res.res_id) {
        // 예약 선점 성공 -> 가상 단말기 승인 파이프라인 진입
        runPaymentSimulation(res.res_id, totalAmount);
      } else {
        setErrorMsg(res.message);
        setLoading(false);
      }
    } catch {
      setErrorMsg('예약 처리 중 오류가 발생했습니다.');
      setLoading(false);
    }
  };

  // 3단계 가상 결제 승인 시뮬레이션
  const runPaymentSimulation = (resId: string, amount: number) => {
    // 만약 전원 이용권 사용 등으로 최종 결제금액이 ₩0 이라면 카드 리더기 연출 생략하고 즉시 승인!
    if (amount === 0) {
      setPaymentState('DISPATCHING');
      setAuthProgress(50);
      setTimeout(async () => {
        setAuthProgress(100);
        await executeConfirmWebhook(resId, 0);
      }, 800);
      return;
    }

    setPaymentState('INSERT_WAIT');
    setAuthProgress(0);

    // 1단계: 카드 삽입 대기 (1.5초)
    setTimeout(() => {
      setPaymentState('READING');
      setAuthProgress(30);

      // 2단계: IC 칩 정보 리딩 (1.5초)
      setTimeout(() => {
        setPaymentState('DISPATCHING');
        setAuthProgress(70);

        // 3단계: 백엔드 승인 웹훅 처리 및 최종 RSV 변환 (1초)
        setTimeout(async () => {
          setAuthProgress(100);
          await executeConfirmWebhook(resId, amount);
        }, 1000);
      }, 1500);
    }, 1500);
  };

  const executeConfirmWebhook = async (resId: string, amount: number) => {
    try {
      const webhookRes = await fetch(`/api/v1/kiosk/payment-webhook?store_cd=${STORE_CODE}`, {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'x-store-cd': STORE_CODE
        },
        body: JSON.stringify({
          status: 'success',
          payment_method: amount === 0 ? 'TICKET' : 'OFFLINE_CARD',
          amount: amount,
          res_id: resId
        })
      });

      if (webhookRes.ok) {
        const selectedZoneName = zones.find(z => z.zone_code === course)?.zone_name || course;
        const formattedDate = new Date().toLocaleString('ko-KR', { hour12: false });
        const mockApprNo = amount === 0 ? 'MEMBERSHIP_TICKET' : `APPR_${Math.floor(10000000 + Math.random() * 90000000)}`;

        // 영수증 DTO 주입
        setCreatedReceipt({
          branchNm: 'JNGK 워커힐점 Golf Academy',
          address: '서울특별시 광진구 워커힐로 177',
          tel: '02-450-4500',
          tradeDate: formattedDate,
          apprNo: mockApprNo,
          prodNm: `Par3 ${selectedZoneName} 코스 [${selectedSlot?.time}]`,
          partySize: players.length,
          totalAmount: amount,
          resId: resId
        });

        setPaymentState('DONE');
      } else {
        setErrorMsg('결제 웹훅 승인 처리에 실패했습니다.');
        resetPaymentState();
      }
    } catch {
      setErrorMsg('결제 서버 통신 중 오류가 발생했습니다.');
      resetPaymentState();
    }
  };

  const resetPaymentState = () => {
    setPaymentState('IDLE');
    setCreatedReceipt(null);
    setLoading(false);
  };

  // 모의 결제 실패 강제 트리거 (QA용)
  const handleSimulateFail = (reason: string) => {
    setErrorMsg(`[결제 실패 모의]: ${reason}`);
    resetPaymentState();
  };

  // 영수증 인쇄 완료 후 최종 메인화면 이전 처리
  const handleReceiptClose = () => {
    if (createdReceipt) {
      const par3Product: Product = {
        prod_cd: `PAR3_${course}_${selectedSlot?.time.replace(':', '')}`,
        prod_nm: createdReceipt.prodNm,
        standard_price: createdReceipt.totalAmount,
        logic_type: 'FACILITY',
        res_id: createdReceipt.resId
      };
      onBookingSelected(par3Product);
    }
  };

  return (
    <div 
      className="kiosk-ultra-container" 
      data-layout="fixed"
      style={{
        width: '100%',
        height: '100vh', 
        maxHeight: '1920px', 
        boxSizing: 'border-box',
        padding: '40px 48px 120px 48px',
        display: 'flex',
        flexDirection: 'column',
        gap: '24px',
        background: 'linear-gradient(135deg, #f8f9fa 0%, #ffffff 100%)',
        color: '#1d1d1f',
        overflow: 'hidden', 
        position: 'relative'
      }}
    >
      {/* 상단 타이틀 영역 */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', height: '80px', flexShrink: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
          <div style={{
            background: 'rgba(46, 117, 89, 0.05)',
            border: '1px solid rgba(46, 117, 89, 0.15)',
            padding: '10px',
            borderRadius: '16px'
          }}>
            <Calendar size={36} style={{ color: '#2e7559' }} />
          </div>
          <div>
            <h2 style={{ fontSize: '30px', fontWeight: 900, letterSpacing: '-1px', color: '#1d1d1f', margin: 0 }}>파3 미니 라운딩 실시간 배정</h2>
            <p style={{ fontSize: '15px', color: '#86868b', fontWeight: 600, marginTop: '4px', margin: 0 }}>
              이용하실 코스와 티오프 타임을 선택하고 예약자 정보를 기입해 주십시오.
            </p>
          </div>
        </div>
        <button 
          onClick={onCancel}
          style={{
            background: '#ffffff',
            border: '1px solid #d2d2d7',
            color: '#1d1d1f',
            padding: '10px 24px',
            fontSize: '16px',
            fontWeight: 800,
            borderRadius: '12px',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            boxShadow: '0 2px 8px rgba(0,0,0,0.02)'
          }}
        >
          <ArrowLeft size={18} />
          돌아가기
        </button>
      </div>

      {/* 에러 메시지 */}
      {errorMsg && (
        <div 
          style={{ 
            background: '#fff2f2',
            border: '1px solid #ffb3b3',
            padding: '16px 20px', 
            borderRadius: '14px', 
            fontSize: '16px', 
            color: '#d12424', 
            fontWeight: 800,
            flexShrink: 0
          }}
        >
          {errorMsg}
        </div>
      )}

      {/* 2단 수직 레이아웃 */}
      <div 
        style={{ 
          display: 'grid', 
          gridTemplateColumns: '1.2fr 1fr', 
          gap: '30px', 
          height: 'calc(100% - 380px)', 
          minHeight: '0',
          overflow: 'hidden',
          flexShrink: 1
        }}
      >
        {/* 좌측 Column: 3. 예약 시간대 선택 */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', height: '100%', minHeight: '0' }}>
          <span style={{ fontSize: '18px', fontWeight: 800, color: '#1d1d1f', letterSpacing: '0.5px' }}>3. 예약 시간대 선택</span>
          <div 
            ref={scrollContainerRef}
            className="kiosk-ultra-scrollbar"
            style={{ 
              height: 'calc(100% - 40px)', 
              overflowY: 'auto', 
              border: '1.5px solid #e5e5ea', 
              borderRadius: '24px', 
              background: '#ffffff',
              padding: '20px',
              display: 'grid',
              gridTemplateColumns: 'repeat(2, 1fr)',
              gap: '12px',
              alignContent: 'start',
              minHeight: '0'
            }}
          >
            {(() => {
              const now = new Date();
              const curHourMin = `${String(now.getHours()).padStart(2, '0')}${String(now.getMinutes()).padStart(2, '0')}`;
              const displayedSlots = slots.filter(s => {
                const slotTimeClean = s.time.replace(':', '');
                return slotTimeClean >= curHourMin;
              });

              if (displayedSlots.length === 0) {
                return (
                  <div style={{ gridColumn: 'span 2', padding: '100px 10px', textAlign: 'center', color: '#86868b', fontSize: '18px', fontWeight: 600 }}>
                    예약 가능한 시간대가 없습니다.
                  </div>
                );
              }

              return displayedSlots.map(s => {
                const isSelected = selectedSlot?.slot_id === s.slot_id;
                const isReserved = s.status !== 'AVAILABLE';
                
                const btnBg = isSelected 
                  ? '#2e7559' 
                  : (isReserved 
                    ? '#f5f5f7' 
                    : '#ffffff');
                const textCol = isSelected 
                  ? '#ffffff' 
                  : (isReserved ? '#c8c8cd' : '#1d1d1f');
                const borderCol = isSelected
                  ? '#2e7559'
                  : (isReserved ? 'transparent' : '#e5e5ea');

                return (
                  <button
                    key={s.slot_id}
                    disabled={isReserved}
                    onClick={() => setSelectedSlot(s)}
                    style={{
                      height: '76px',
                      borderRadius: '14px',
                      border: `1.5px solid ${borderCol}`,
                      background: btnBg,
                      color: textCol,
                      fontSize: '18px',
                      fontWeight: 800,
                      cursor: isReserved ? 'not-allowed' : 'pointer',
                      opacity: isReserved ? 0.8 : 1,
                      transition: 'all 0.15s cubic-bezier(0.25, 0.8, 0.25, 1)',
                      boxShadow: isSelected 
                        ? '0 8px 18px rgba(46, 117, 89, 0.15)' 
                        : (isReserved ? 'none' : '0 2px 6px rgba(0,0,0,0.02)'),
                      transform: isSelected ? 'scale(0.98)' : 'none'
                    }}
                  >
                    {s.time} {isReserved && '(마감)'}
                  </button>
                );
              });
            })()}
          </div>
        </div>

        {/* 우측 Column: 코스 선택, 동반자 배정 목록 */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '20px', height: '100%', minHeight: '0', overflowY: 'auto' }} className="kiosk-ultra-scrollbar">
          
          {/* 1. 코스 선택 */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
            <span style={{ fontSize: '16px', fontWeight: 800, color: '#1d1d1f', letterSpacing: '0.5px' }}>1. 코스 선택</span>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '10px' }}>
              {zones.map(z => {
                const isActive = course === z.zone_code;
                return (
                  <button
                    key={z.zone_code}
                    onClick={() => setCourse(z.zone_code)}
                    style={{
                      height: '84px',
                      borderRadius: '16px',
                      border: `1.5px solid ${isActive ? '#2e7559' : '#e5e5ea'}`,
                      background: isActive ? '#2e7559' : '#ffffff',
                      color: isActive ? '#ffffff' : '#1d1d1f',
                      fontSize: '18px',
                      fontWeight: 900,
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: '8px',
                      transition: 'all 0.15s ease',
                      boxShadow: isActive ? '0 8px 20px rgba(46, 117, 89, 0.12)' : 'none'
                    }}
                  >
                    <span>{z.zone_name}</span>
                    {isActive && <Check size={18} style={{ color: '#ffffff' }} />}
                  </button>
                );
              })}
            </div>
          </div>

          {/* As-Built 4인 배정 인원 동적 목록 */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', flex: 1, minHeight: '0' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontSize: '16px', fontWeight: 800, color: '#1d1d1f', letterSpacing: '0.5px' }}>
                2. 배정 인원 목록 (최대 4인)
              </span>
              <span style={{ fontSize: '14px', color: '#2e7559', fontWeight: 800 }}>
                {players.length} / 4 명
              </span>
            </div>

            <div 
              style={{
                flex: 1,
                border: '1.5px solid #e5e5ea',
                borderRadius: '20px',
                background: '#ffffff',
                padding: '16px',
                boxSizing: 'border-box',
                display: 'flex',
                flexDirection: 'column',
                gap: '12px',
                overflowY: 'auto'
              }}
              className="kiosk-ultra-scrollbar"
            >
              {players.length === 0 ? (
                <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '8px', padding: '40px 0' }}>
                  <HelpCircle size={28} style={{ color: '#86868b' }} />
                  <span style={{ fontSize: '15px', color: '#86868b', fontWeight: 700 }}>배정 목록이 비어 있습니다.</span>
                  <p style={{ fontSize: '13px', color: '#aeaeb2', margin: 0, textAlign: 'center', lineHeight: 1.4 }}>
                    하단의 회원/비회원 추가 단추를 눌러<br />대표자 및 동반자를 추가해 주십시오.
                  </p>
                </div>
              ) : (
                players.map((p, idx) => (
                  <div 
                    key={p.id}
                    style={{
                      padding: '14px 20px',
                      borderRadius: '14px',
                      border: '1px solid #e5e5ea',
                      background: idx === 0 ? 'rgba(46, 117, 89, 0.03)' : '#fcfcfd',
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      position: 'relative'
                    }}
                  >
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <span style={{
                          fontSize: '11px',
                          fontWeight: 900,
                          padding: '2px 6px',
                          borderRadius: '6px',
                          background: p.is_member ? 'rgba(46, 117, 89, 0.1)' : '#f0f0f3',
                          color: p.is_member ? '#2e7559' : '#8e8e93'
                        }}>
                          {idx === 0 ? '대표' : '동반'} | {p.is_member ? '회원' : '비회원'}
                        </span>
                        <span style={{ fontSize: '16px', fontWeight: 800, color: '#1d1d1f' }}>
                          {p.guest_nm}
                        </span>
                        <span style={{ fontSize: '14px', color: '#86868b', fontFamily: 'monospace' }}>
                          ({p.hp_no})
                        </span>
                      </div>
                      
                      {/* 쿠폰/이용권 사용 배지 */}
                      {p.use_ticket_id && (
                        <div style={{ display: 'flex', alignItems: 'center', gap: '4px', color: '#2e7559', marginTop: '2px' }}>
                          <Ticket size={12} />
                          <span style={{ fontSize: '12px', fontWeight: 800 }}>
                            🎟️ {p.use_ticket_name} 사용 (결제액 면제)
                          </span>
                        </div>
                      )}
                    </div>

                    {/* 대표자가 아닌 동반자는 개별 삭제 허용 */}
                    {idx > 0 && (
                      <button
                        onClick={() => handleRemovePlayer(p.id)}
                        style={{
                          background: 'none',
                          border: 'none',
                          color: '#ff3b30',
                          cursor: 'pointer',
                          padding: '6px',
                          borderRadius: '50%',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center'
                        }}
                        title="제거"
                      >
                        <X size={20} />
                      </button>
                    )}
                  </div>
                ))
              )}
            </div>

            {/* 인원 추가 버튼 (4명 미만일 때만 활성화) */}
            {players.length < 4 && (
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', flexShrink: 0 }}>
                <button
                  onClick={() => {
                    setModalState(players.length === 0 ? 'ADD_MEMBER_PHONE' : 'ADD_MEMBER_PHONE');
                    setModalPhone('');
                  }}
                  style={{
                    height: '56px',
                    borderRadius: '12px',
                    border: '1.5px solid #2e7559',
                    background: '#ffffff',
                    color: '#2e7559',
                    fontSize: '16px',
                    fontWeight: 800,
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '6px'
                  }}
                >
                  <Plus size={16} />
                  {players.length === 0 ? '대표 회원 인증' : '회원 동반자 추가'}
                </button>
                
                <button
                  onClick={() => {
                    setModalState('ADD_GUEST_PHONE');
                    setModalPhone('');
                  }}
                  style={{
                    height: '56px',
                    borderRadius: '12px',
                    border: '1.5px solid #8e8e93',
                    background: '#ffffff',
                    color: '#8e8e93',
                    fontSize: '16px',
                    fontWeight: 800,
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '6px'
                  }}
                >
                  <Plus size={16} />
                  {players.length === 0 ? '대표 비회원 추가' : '비회원 동반자 추가'}
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* 최종 요금 및 결제 패널 */}
      <div 
        style={{
          padding: '24px 40px',
          borderRadius: '24px',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          background: '#ffffff',
          border: '1px solid #d2d2d7',
          boxShadow: '0 8px 30px rgba(0,0,0,0.04)',
          height: '130px',
          flexShrink: 0,
          boxSizing: 'border-box'
        }}
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
          <span style={{ fontSize: '15px', color: '#86868b', fontWeight: 800, letterSpacing: '0.5px' }}>최종 선택 내역 및 금액</span>
          <div style={{ display: 'flex', alignItems: 'center', gap: '20px' }}>
            <span style={{ fontSize: '22px', fontWeight: 900, color: '#1d1d1f' }}>
              {selectedSlot ? `${selectedSlot.time} 티오프` : '시간대 미선택'} | 총 {players.length}명
            </span>
            <span style={{ 
              fontSize: '32px', 
              fontWeight: 900, 
              color: '#2e7559'
            }}>
              ₩{calculateTotalAmount().toLocaleString()}
            </span>
          </div>
        </div>

        <button
          onClick={handleConfirmBooking}
          disabled={loading || !selectedSlot || players.length === 0}
          style={{
            height: '68px',
            fontSize: '20px',
            fontWeight: 900,
            padding: '0 48px',
            borderRadius: '16px',
            display: 'flex',
            alignItems: 'center',
            gap: '10px',
            background: loading || !selectedSlot || players.length === 0 ? '#d2d2d7' : '#2e7559',
            color: '#ffffff',
            border: 'none',
            cursor: loading || !selectedSlot || players.length === 0 ? 'not-allowed' : 'pointer',
            boxShadow: loading || !selectedSlot || players.length === 0 ? 'none' : '0 8px 24px rgba(46, 117, 89, 0.18)',
            transition: 'all 0.15s ease'
          }}
        >
          <CreditCard size={24} />
          {loading ? '예약 중...' : '선점 및 결제'}
        </button>
      </div>

      {/* 회원/비회원 추가 텐키패드 오버레이 모달 */}
      {(modalState === 'ADD_MEMBER_PHONE' || modalState === 'ADD_GUEST_PHONE') && (
        <div 
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            width: '1080px',
            height: '100vh',
            background: 'rgba(0, 0, 0, 0.75)',
            backdropFilter: 'blur(8px)',
            zIndex: 99999,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center'
          }}
          onClick={closeModal}
        >
          <div 
            style={{
              width: '460px',
              background: '#ffffff',
              borderRadius: '24px',
              padding: '30px',
              display: 'flex',
              flexDirection: 'column',
              gap: '20px',
              color: '#1d1d1f',
              boxShadow: '0 20px 60px rgba(0,0,0,0.4)',
              border: '1.5px solid #e5e5ea'
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <h4 style={{ fontSize: '20px', fontWeight: 900, margin: 0 }}>
                {modalState === 'ADD_MEMBER_PHONE' ? '회원 전화번호 입력' : '비회원 연락처 입력'}
              </h4>
              <button onClick={closeModal} style={{ background: 'none', border: 'none', color: '#86868b', cursor: 'pointer' }}>
                <X size={20} />
              </button>
            </div>

            {/* 에러 문구 */}
            {modalError && (
              <span style={{ fontSize: '13px', color: '#ff3b30', fontWeight: 800, textAlign: 'center' }}>
                ⚠️ {modalError}
              </span>
            )}

            {/* 번호 표시창 */}
            <div 
              style={{
                height: '70px',
                background: '#f5f5f7',
                borderRadius: '12px',
                border: '1.5px solid #e5e5ea',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: '28px',
                fontWeight: 900,
                color: modalPhone ? '#1d1d1f' : '#aeaeb2',
                fontFamily: 'monospace'
              }}
            >
              {modalPhone ? formatHp(modalPhone) : '010-0000-0000'}
            </div>

            {/* 텐키패드 */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '8px', height: '240px' }}>
              {['1', '2', '3', '4', '5', '6', '7', '8', '9'].map(n => (
                <button
                  type="button"
                  key={n}
                  onClick={() => handleModalPhoneClick(n)}
                  style={{ fontSize: '18px', fontWeight: 800, borderRadius: '8px', background: '#f5f5f7', border: '1px solid #e5e5ea', color: '#1d1d1f', cursor: 'pointer' }}
                  className="keypad-btn"
                >
                  {n}
                </button>
              ))}
              <button type="button" onClick={() => setModalPhone('')} style={{ fontSize: '14px', fontWeight: 800, color: '#ff9500', borderRadius: '8px', background: '#f5f5f7', border: '1px solid #e5e5ea', cursor: 'pointer' }} className="keypad-btn">지움</button>
              <button type="button" onClick={() => handleModalPhoneClick('0')} style={{ fontSize: '18px', fontWeight: 800, borderRadius: '8px', background: '#f5f5f7', border: '1px solid #e5e5ea', color: '#1d1d1f', cursor: 'pointer' }} className="keypad-btn">0</button>
              <button type="button" onClick={handleModalPhoneBackspace} style={{ fontSize: '18px', fontWeight: 'bold', borderRadius: '8px', background: '#f5f5f7', border: '1px solid #e5e5ea', color: '#1d1d1f', cursor: 'pointer' }} className="keypad-btn">←</button>
            </div>

            <button
              onClick={handlePhoneModalSubmit}
              disabled={loading}
              style={{
                height: '60px',
                borderRadius: '12px',
                background: '#2e7559',
                color: '#ffffff',
                border: 'none',
                fontSize: '18px',
                fontWeight: 900,
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                boxShadow: '0 4px 12px rgba(46, 117, 89, 0.15)'
              }}
            >
              {loading ? '검색 중...' : '입력 완료'}
            </button>
          </div>
        </div>
      )}

      {/* 이용권 선택 모달 팝업 */}
      {modalState === 'TICKET_SELECT' && selectedMemberForTicket && (
        <div 
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            width: '1080px',
            height: '100vh',
            background: 'rgba(0, 0, 0, 0.75)',
            backdropFilter: 'blur(8px)',
            zIndex: 99999,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center'
          }}
          onClick={closeModal}
        >
          <div 
            style={{
              width: '480px',
              background: '#ffffff',
              borderRadius: '24px',
              padding: '30px',
              display: 'flex',
              flexDirection: 'column',
              gap: '20px',
              color: '#1d1d1f',
              boxShadow: '0 20px 60px rgba(0,0,0,0.4)',
              border: '1.5px solid #e5e5ea'
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <h4 style={{ fontSize: '20px', fontWeight: 900, margin: 0 }}>
                🎟️ 사용 가능한 이용권 선택
              </h4>
              <button onClick={closeModal} style={{ background: 'none', border: 'none', color: '#86868b', cursor: 'pointer' }}>
                <X size={20} />
              </button>
            </div>

            <p style={{ fontSize: '14px', color: '#86868b', margin: 0, lineHeight: 1.4 }}>
              <strong>{selectedMemberForTicket.member.member_name}</strong> 회원이 보유한 이용권(회원권) 목록입니다. 사용하실 이용권을 터치 선택하면 해당 인원의 **결제 예정 요금이 ₩0** 면제 처리됩니다.
            </p>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', maxHeight: '240px', overflowY: 'auto' }} className="kiosk-ultra-scrollbar">
              {(selectedMemberForTicket.member.assets || []).map(ticket => (
                <button
                  key={ticket.member_item_id}
                  onClick={() => addMemberSlot(selectedMemberForTicket.member, selectedMemberForTicket.isLeader, ticket)}
                  style={{
                    padding: '16px 20px',
                    borderRadius: '12px',
                    border: '1.5px solid #2e7559',
                    background: 'rgba(46, 117, 89, 0.04)',
                    color: '#2e7559',
                    textAlign: 'left',
                    cursor: 'pointer',
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    transition: 'all 0.15s ease'
                  }}
                >
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                    <span style={{ fontSize: '16px', fontWeight: 800 }}>{ticket.item_name}</span>
                    <span style={{ fontSize: '13px', color: '#86868b' }}>잔여 횟수: {ticket.rem_count}회</span>
                  </div>
                  <Ticket size={24} />
                </button>
              ))}
            </div>

            {/* 일반 결제 옵션 제공 */}
            <button
              onClick={() => addMemberSlot(selectedMemberForTicket.member, selectedMemberForTicket.isLeader, undefined)}
              style={{
                height: '56px',
                borderRadius: '12px',
                background: '#8e8e93',
                color: '#ffffff',
                border: 'none',
                fontSize: '16px',
                fontWeight: 800,
                cursor: 'pointer',
                boxShadow: '0 4px 12px rgba(0,0,0,0.05)'
              }}
            >
              이용권 사용 안 함 (일반 카드 결제 추가)
            </button>
          </div>
        </div>
      )}

      {/* 3단계 고도화된 가상 카드 승인 모달 */}
      {paymentState !== 'IDLE' && paymentState !== 'DONE' && (
        <div 
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            width: '1080px',
            height: '100vh',
            background: 'rgba(7, 9, 14, 0.85)',
            backdropFilter: 'blur(8px)',
            zIndex: 999999,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            color: '#fff'
          }}
          onClick={(e) => e.stopPropagation()}
        >
          <div 
            style={{
              width: '460px',
              background: '#ffffff',
              borderRadius: '28px',
              padding: '40px',
              boxSizing: 'border-box',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              gap: '24px',
              color: '#1d1d1f',
              boxShadow: '0 30px 80px rgba(0,0,0,0.5)',
              border: '1.5px solid #e5e5ea',
              position: 'relative'
            }}
          >
            {/* 가상 QA 에러 모의 버튼 (우측 상단 콤팩트 배치) */}
            <div style={{ position: 'absolute', top: '16px', right: '16px', display: 'flex', gap: '8px' }}>
              <button
                onClick={() => handleSimulateFail('한도초과 에러')}
                style={{ fontSize: '11px', background: '#ffebeb', border: '1px solid #ffb3b3', color: '#d12424', padding: '4px 8px', borderRadius: '6px', cursor: 'pointer' }}
              >
                한도초과 모의
              </button>
              <button
                onClick={() => handleSimulateFail('칩 인식 실패')}
                style={{ fontSize: '11px', background: '#f5f5f7', border: '1px solid #d2d2d7', color: '#1d1d1f', padding: '4px 8px', borderRadius: '6px', cursor: 'pointer' }}
              >
                리더기 에러 모의
              </button>
            </div>

            {/* 메인 아이콘 */}
            <div style={{
              width: '90px',
              height: '90px',
              borderRadius: '50%',
              background: 'rgba(46, 117, 89, 0.06)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              border: '2px solid rgba(46, 117, 89, 0.2)'
            }}>
              {paymentState === 'INSERT_WAIT' ? (
                <CardIcon size={42} className="animate-bounce" style={{ color: '#2e7559' }} />
              ) : (
                <RefreshCw size={42} className="animate-spin" style={{ color: '#2e7559' }} />
              )}
            </div>

            <div style={{ textAlign: 'center', display: 'flex', flexDirection: 'column', gap: '8px' }}>
              <h4 style={{ fontSize: '24px', fontWeight: 900, margin: 0 }}>
                {paymentState === 'INSERT_WAIT' && '신용카드를 투입해 주십시오'}
                {paymentState === 'READING' && 'IC 칩 정보를 읽는 중...'}
                {paymentState === 'DISPATCHING' && '거래 승인을 요청하고 있습니다'}
              </h4>
              <p style={{ fontSize: '15px', color: '#86868b', margin: 0, fontWeight: 500 }}>
                {paymentState === 'INSERT_WAIT' && '단말기 입구에 카드를 끝까지 밀어 넣어 주세요.'}
                {paymentState === 'READING' && '카드 승인이 완료될 때까지 카드를 절대 빼지 마세요.'}
                {paymentState === 'DISPATCHING' && '승인 처리 및 예약 생성 웹훅을 동기화하고 있습니다.'}
              </p>
            </div>

            {/* 프로그레스 게이지 */}
            <div style={{ width: '100%', height: '8px', background: '#f5f5f7', borderRadius: '4px', overflow: 'hidden' }}>
              <div 
                style={{ 
                  width: `${authProgress}%`, 
                  height: '100%', 
                  background: '#2e7559', 
                  transition: 'width 0.5s ease-in-out',
                  borderRadius: '4px'
                }} 
              />
            </div>

            <div style={{ fontSize: '14px', color: '#86868b', fontWeight: 600 }}>
              결제 요청 금액 : <span style={{ color: '#2e7559', fontWeight: 800 }}>₩{calculateTotalAmount().toLocaleString()}</span>
            </div>
          </div>
        </div>
      )}

      {/* 영수증 롤아웃 프린터 컴포넌트 마운트 */}
      {paymentState === 'DONE' && createdReceipt && (
        <ReceiptPrinter 
          receiptData={createdReceipt}
          onClose={handleReceiptClose}
        />
      )}

      {/* 초슬림 스크롤바 인젝트 스타일 */}
      <style>{`
        .kiosk-ultra-scrollbar::-webkit-scrollbar {
          width: 8px;
        }
        .kiosk-ultra-scrollbar::-webkit-scrollbar-track {
          background: #f5f5f7;
          border-radius: 10px;
        }
        .kiosk-ultra-scrollbar::-webkit-scrollbar-thumb {
          background: #c8c8cd;
          border-radius: 10px;
          border: 2px solid #ffffff;
        }
        .kiosk-ultra-scrollbar::-webkit-scrollbar-thumb:hover {
          background: #86868b;
        }
        
        .keypad-btn:active {
          background: #d2d2d7 !important;
          transform: scale(0.95);
        }
        
        .animate-bounce {
          animation: bounce 1s infinite;
        }
        .animate-spin {
          animation: spin 1.5s linear infinite;
        }
        @keyframes bounce {
          0%, 100% { transform: translateY(0); }
          50% { transform: translateY(-10px); }
        }
        @keyframes spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  );
};
