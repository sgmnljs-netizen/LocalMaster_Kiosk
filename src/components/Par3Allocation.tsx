import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Calendar, User, Users, Clock, ArrowLeft, CreditCard, Check, HelpCircle, CreditCard as CardIcon, Loader2, RefreshCw, X, Plus, Ticket, UserCheck, UserPlus } from 'lucide-react';
import { api, Par3Slot, Product, KioskZone, Member, MemberAsset, KioskCompanionItem, STORE_CODE } from '../services/api';
import { ReceiptPrinter, ReceiptData } from './ReceiptPrinter';
import { MemberAuth } from './MemberAuth';
import { TimeMaster } from '../utils/timeMaster';
import { kioskVanClient } from '../services/van/van_client';
import { useKioskSettings } from '../stores/kioskSettings';

interface Par3AllocationProps {
  memberNo?: string;
  memberName?: string;
  faceTerminalEnabled?: boolean;
  selectedZoneIds?: (string | number)[];
  lang?: 'KO' | 'EN';
  onVanBusyChange?: (busy: boolean) => void;
  onBookingSelected?: (prod: Product) => void;
  onCancel: () => void;
}

type PaymentState = 'IDLE' | 'INSERT_WAIT' | 'READING' | 'DISPATCHING' | 'DONE';
type ModalState = 'NONE' | 'MEMBER_AUTH_MODAL' | 'ADD_MEMBER_PHONE' | 'ADD_GUEST_PHONE' | 'TICKET_SELECT';

const MIN_INSTALLMENT_AMOUNT = 50000;
const INSTALLMENT_MONTH_OPTIONS = [0, 2, 3, 4, 5, 6, 12] as const;

interface PlayerSlot {
  id: string; // unique key
  member_no?: string;
  guest_nm: string;
  hp_no: string;
  is_member: boolean;
  discount_rate?: number;
  use_ticket_id?: string;
  use_ticket_name?: string;
  ticket_allowed_categories?: string[];
}

export const Par3Allocation: React.FC<Par3AllocationProps> = ({
  memberNo,
  memberName,
  faceTerminalEnabled = true,
  selectedZoneIds = [],
  lang = 'KO',
  onVanBusyChange,
  onCancel
}) => {
  const { settings } = useKioskSettings();
  const [zones, setZones] = useState<KioskZone[]>([]);
  const [course, setCourse] = useState<string>(''); // zone_code 매핑
  const [slots, setSlots] = useState<Par3Slot[]>([]);
  const [selectedSlot, setSelectedSlot] = useState<Par3Slot | null>(null);
  const [products, setProducts] = useState<Product[]>([]);
  const [storeInfo, setStoreInfo] = useState<{ store_nm: string; address: string; tel: string } | null>(null);

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
  const [installmentMonths, setInstallmentMonths] = useState<number>(0);

  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  // 동기식 중복 터치(Double-Tap) 방어 Ref
  const isSubmittingRef = useRef(false);
  const isPhoneSubmittingRef = useRef(false);

  // 스크롤 컨테이너 참조용 Ref
  const scrollContainerRef = useRef<HTMLDivElement>(null);

  // 0. 활성화된 구역(Zone) 목록 및 상품, 상점 정보 로드
  const [categoryUuid, setCategoryUuid] = useState<string>(''); // 실제 백엔드 카테고리 UUID 저장

  // [BUG-P3-04] 자체 VAN 카드 결제 진행 중 KioskApp 전역 Idle Timer 동작 차단
  useEffect(() => {
    const isBusy =
      paymentState === 'INSERT_WAIT' ||
      paymentState === 'READING' ||
      paymentState === 'DISPATCHING';
    onVanBusyChange?.(isBusy);
    return () => {
      onVanBusyChange?.(false);
    };
  }, [paymentState, onVanBusyChange]);

  useEffect(() => {
    const initData = async () => {
      try {
        const [kioskZones, kioskProducts, info] = await Promise.all([
          api.getKioskZones(),
          api.getProducts(),
          api.getStoreInfo()
        ]);
        
        setProducts(kioskProducts);
        setStoreInfo(info);

        // 1. 관리자 구역 매칭(selectedZoneIds) 우선 적용 + 파3 전용 코스 구역 필터링
        const mappedZones = selectedZoneIds.length > 0
          ? kioskZones.filter(z =>
              selectedZoneIds.some(zid => String(zid).toUpperCase() === z.zone_code.toUpperCase())
            )
          : [];

        const par3Zones = kioskZones.filter(z => 
          z.zone_name.includes('Par3') || 
          z.zone_name.includes('PAR3') || 
          z.zone_code.toUpperCase().includes('PAR3') ||
          z.zone_code === 'EAST' || 
          z.zone_code === 'WEST' || 
          z.zone_code === 'COMPLEX'
        );
        const displayZones = mappedZones.length > 0 ? mappedZones : (par3Zones.length > 0 ? par3Zones : kioskZones);
        
        const mainCategory =
          mappedZones[0] ||
          kioskZones.find(z => z.zone_code.toUpperCase() === 'PAR3') ||
          displayZones[0];
        setCategoryUuid(mainCategory ? mainCategory.zone_code : '');
        
        setZones(displayZones);
        if (displayZones.length > 0) {
          setCourse(displayZones[0].zone_code);
        }
      } catch {
        setErrorMsg('초기 설정 정보를 불러오는 데 실패했습니다.');
      }
    };
    initData();
  }, [selectedZoneIds]);

  const getTodayStr = () => {
    return TimeMaster.getKstYmd(TimeMaster.getSyncedDate()).replace(/-/g, '');
  };

  // 1. 슬롯 데이터 불러오기
  const fetchSlots = useCallback(async () => {
    const targetZone = course || categoryUuid;
    if (!targetZone) return;
    try {
      const res = await api.getPar3Slots(targetZone, getTodayStr());
      setSlots(res);
      setSelectedSlot(null); // 코스 전환 시 이전 선택 초기화
    } catch {
      setErrorMsg('시간 슬롯 정보를 불러오는 데 실패했습니다.');
    }
  }, [categoryUuid, course]);

  useEffect(() => {
    fetchSlots();
  }, [fetchSlots]);

  // [BUG-P3-06] 코스(course) 전환 시 특정 코스 전용 이용권이 새 코스와 호환되지 않으면 자동 해제
  useEffect(() => {
    if (!course) return;
    const curZoneUpper = course.toUpperCase();
    setPlayers(prev =>
      prev.map(p => {
        if (!p.use_ticket_id || !p.ticket_allowed_categories || p.ticket_allowed_categories.length === 0) {
          return p;
        }
        const allowedUpper = p.ticket_allowed_categories.map(c => String(c).toUpperCase());
        const isCompatible =
          allowedUpper.includes('PAR3') ||
          allowedUpper.includes('ALL') ||
          allowedUpper.includes('FACILITY') ||
          allowedUpper.includes('GOLF_PAR3') ||
          allowedUpper.includes(curZoneUpper);
        if (!isCompatible) {
          return {
            ...p,
            use_ticket_id: undefined,
            use_ticket_name: undefined,
            ticket_allowed_categories: undefined,
          };
        }
        return p;
      })
    );
  }, [course]);

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

  // 선점된 파3 예약 ID 추적 (결제 취소/거절 시 즉시 락 해제용)
  const currentHoldResIdRef = useRef<string | null>(null);

  // 언마운트 시 미완료 보류(HOLD) 예약 해제 및 VAN 단말기 요청 취소 클린업
  useEffect(() => {
    return () => {
      if (currentHoldResIdRef.current) {
        api.cancelHoldReservation(currentHoldResIdRef.current).catch(() => {});
        currentHoldResIdRef.current = null;
      }
      kioskVanClient.cancelCurrentRequest();
    };
  }, []);

  const getAssignableAssets = useCallback((m?: Member | null, isReplacingLeader = false): MemberAsset[] => {
    const usedCounts = new Map<string, number>();
    players.forEach((p, idx) => {
      if (isReplacingLeader && idx === 0) return;
      if (p.use_ticket_id) {
        usedCounts.set(p.use_ticket_id, (usedCounts.get(p.use_ticket_id) || 0) + 1);
      }
    });

    const curZoneUpper = (course || 'PAR3').toUpperCase();

    return (m?.assets || []).filter((a) => {
      if (a.is_assignable === false) return false;
      if (typeof a.remain_days === 'number' && a.remain_days < 0) return false;

      // [BUG-P3-02] 파3 이용 가능 카테고리 필터링 (일반 타석 전용 BAY 이용권 오노출 차단)
      if (Array.isArray(a.allowed_categories) && a.allowed_categories.length > 0) {
        const allowedUpper = a.allowed_categories.map(c => String(c).toUpperCase());
        const itemNmUpper = (a.item_name || '').toUpperCase();
        const isNamePar3 = itemNmUpper.includes('PAR3') || itemNmUpper.includes('파3');
        const isAllowedForPar3 =
          allowedUpper.includes('PAR3') ||
          allowedUpper.includes('ALL') ||
          allowedUpper.includes('FACILITY') ||
          allowedUpper.includes('GOLF_PAR3') ||
          allowedUpper.includes(curZoneUpper) ||
          isNamePar3;
        if (!isAllowedForPar3) return false;
      }

      const logicType = (a.logic_type || a.pass_type || '').toUpperCase();
      const alreadyUsed = usedCounts.get(a.member_item_id) || 0;

      if (logicType === 'PERIOD' || logicType === 'MEMBERSHIP') {
        return alreadyUsed === 0;
      }

      const rawRem = a.rem_count ?? a.remain_cnt;
      if (rawRem === null || rawRem === undefined) {
        return alreadyUsed === 0;
      }
      return rawRem - alreadyUsed > 0;
    });
  }, [players, course]);

  // 3. 대표자 마운트 세팅
  useEffect(() => {
    let cancelled = false;
    const setupLeader = async () => {
      // 로그인 회원인 경우 대표자로 즉시 자동 추가
      if (memberNo && memberName) {
        setLoading(true);
        try {
          const detail = await api.getMember(memberNo);
          if (cancelled) return;
          const leaderSlot: PlayerSlot = {
            id: 'LEADER',
            member_no: memberNo,
            guest_nm: memberName,
            hp_no: detail?.hp || '',
            is_member: true,
            discount_rate: detail?.discount_rate || 0,
            use_ticket_id: undefined,
            use_ticket_name: undefined
          };
          setPlayers(prev => (prev.length === 0 ? [leaderSlot] : [leaderSlot, ...prev.slice(1)]));
          
          // 만약 사용 가능한 이용권이 존재하면, 즉석에서 대표자 이용권 자동 매칭 팝업 작동 유도
          const assignable = getAssignableAssets(detail, true);
          if (detail && assignable.length > 0) {
            setSelectedMemberForTicket({ member: { ...detail, assets: assignable }, isLeader: true });
            setModalState('TICKET_SELECT');
          }
        } catch {
          if (cancelled) return;
          const fallbackSlot: PlayerSlot = {
            id: 'LEADER',
            member_no: memberNo,
            guest_nm: memberName,
            hp_no: '',
            is_member: true,
            discount_rate: 0
          };
          setPlayers(prev => (prev.length === 0 ? [fallbackSlot] : [fallbackSlot, ...prev.slice(1)]));
        } finally {
          if (!cancelled) setLoading(false);
        }
      } else {
        // 비회원 대표자 대기
        setPlayers([]);
      }
    };
    setupLeader();
    return () => {
      cancelled = true;
    };
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
    if (isPhoneSubmittingRef.current || loading) return;
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
      isPhoneSubmittingRef.current = true;
      setLoading(true);
      setModalError('');
      try {
        const member = await api.getMember(formatted);
        if (member) {
          const memberHpClean = (member.hp || '').replace(/[^0-9]/g, '');
          if (players.some(p => (memberHpClean && (p.hp_no || '').replace(/[^0-9]/g, '') === memberHpClean) || (p.member_no && p.member_no === member.member_no))) {
            setModalError('이미 배정 목록에 등록된 회원입니다.');
            return;
          }
          // 회원 조회 성공
          const isLeaderSlot = players.length === 0;
          const assignable = getAssignableAssets(member, isLeaderSlot);
          if (assignable.length > 0) {
            // 사용 가능한 이용권이 있는 경우 ➔ 이용권 선택 팝업 오픈
            setSelectedMemberForTicket({ member: { ...member, assets: assignable }, isLeader: isLeaderSlot });
            setModalState('TICKET_SELECT');
          } else {
            // 이용권이 없으면 ➔ 바로 추가
            addMemberSlot(member, isLeaderSlot);
          }
        } else {
          setModalError('등록된 회원 정보를 찾을 수 없습니다. 번호를 확인해 주세요.');
        }
      } catch (err: any) {
        if (err?.inactive || err?.status === 403 || err?.duplicate || err?.status === 409) {
          setModalError(err.message || '동일 번호 중복 또는 이용 제한 회원입니다.');
        } else {
          setModalError('회원 조회 중 서버 통신 에러가 발생했습니다.');
        }
      } finally {
        isPhoneSubmittingRef.current = false;
        setLoading(false);
      }
    }
  };

  // 4-3. 3종 통합 회원 인증(MemberAuth) 성공 처리 핸들러 (BUG-M09: 하이픈 유무 무관 숫자 정규화 대조)
  const handleMemberAuthSuccess = useCallback((member: Member) => {
    const memberHpClean = (member.hp || '').replace(/[^0-9]/g, '');
    if (
      players.some(
        p =>
          (memberHpClean && (p.hp_no || '').replace(/[^0-9]/g, '') === memberHpClean) ||
          (p.member_no && p.member_no === member.member_no)
      )
    ) {
      setErrorMsg('이미 배정 목록에 등록된 회원입니다.');
      setModalState('NONE');
      return;
    }

    const isLeaderSlot = players.length === 0;
    const assignable = getAssignableAssets(member, isLeaderSlot);

    if (assignable.length > 0) {
      // 사용 가능한 이용권이 있는 경우 ➔ 이용권 선택 팝업 오픈
      setSelectedMemberForTicket({ member: { ...member, assets: assignable }, isLeader: isLeaderSlot });
      setModalState('TICKET_SELECT');
    } else {
      // 이용권이 없으면 ➔ 바로 추가
      addMemberSlot(member, isLeaderSlot);
      setModalState('NONE');
    }
  }, [players, getAssignableAssets]);

  const addMemberSlot = (member: Member, isLeader: boolean, ticket?: MemberAsset) => {
    const slotId = isLeader ? 'LEADER' : `PLAYER_${Date.now()}`;
    const displayName = member.member_name;

    const newSlot: PlayerSlot = {
      id: slotId,
      member_no: member.member_no,
      guest_nm: displayName,
      hp_no: formatHp(member.hp),
      is_member: true,
      discount_rate: member.discount_rate || 0,
      use_ticket_id: ticket?.member_item_id,
      use_ticket_name: ticket?.item_name,
      ticket_allowed_categories: ticket?.allowed_categories
    };

    if (isLeader) {
      setPlayers(prev => (prev.length === 0 ? [newSlot] : [newSlot, ...prev.filter(p => p.id !== 'LEADER' && p.member_no !== member.member_no)]));
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

  // 선택된 코스에 매칭되는 파3 상품 엔티티 조회 (단가, prod_cd, vat_yn, 단말기 라우팅용)
  const getMatchedCourseProduct = useCallback((): Product | null => {
    const selectedZoneName = zones.find(z => z.zone_code === course)?.zone_name || course;
    const par3Products = products.filter(p =>
      p.prod_nm.includes('Par3') ||
      p.prod_nm.includes('파3') ||
      p.prod_nm.includes('PAR3') ||
      String(p.logic_type || '').toUpperCase() === 'PAR3'
    );
    if (par3Products.length === 0) return null;

    const matchedCourseProducts = par3Products.filter(p =>
      (selectedZoneName && p.prod_nm.includes(selectedZoneName)) ||
      (course && p.prod_nm.includes(course))
    );
    if (matchedCourseProducts.length > 0) {
      return matchedCourseProducts[matchedCourseProducts.length - 1];
    }
    return par3Products[par3Products.length - 1];
  }, [zones, course, products]);

  // 인당 코스 일반 기준 요금 산출
  const getCoursePriceLabel = () => {
    const matchedProd = getMatchedCourseProduct();
    if (matchedProd) {
      const price = (matchedProd.sale_price && matchedProd.sale_price > 0)
        ? matchedProd.sale_price
        : (matchedProd.standard_price || 0);
      if (price > 0) return price;
    }

    // 백엔드 상품 미등록 시 폴백 로직
    const isComplex =
      course.toLowerCase().includes('complex') ||
      (selectedSlot?.course_nm || '').includes('복합') ||
      (selectedSlot?.course_nm || '').includes('18');
    return isComplex ? 45000 : 30000;
  };

  // [BUG-P3-03] 개별 플레이어 결제 요금 계산 (이용권 사용 시 0원, 인증 회원 일반 결제 시 등급 할인 반영)
  const calculatePlayerPrice = (p: PlayerSlot, baseUnitPrice: number): number => {
    if (p.use_ticket_id) return 0;
    if (p.is_member && p.discount_rate && p.discount_rate > 0) {
      const rawRate = Number(p.discount_rate);
      const ratePct = rawRate > 0 && rawRate < 1 ? rawRate * 100 : rawRate;
      const clampedPct = Math.min(100, Math.max(0, ratePct));
      const discAmt = Math.floor((baseUnitPrice * clampedPct) / 100);
      return Math.max(0, baseUnitPrice - discAmt);
    }
    return baseUnitPrice;
  };

  // 최종 결제 금액 연산 (이용권 사용자는 요금 ₩0, 회원 등급 할인 반영)
  const calculateTotalAmount = () => {
    const unitPrice = getCoursePriceLabel();
    let sum = 0;
    players.forEach(p => {
      sum += calculatePlayerPrice(p, unitPrice);
    });
    return sum;
  };

  const calculateTotalGradeDiscount = () => {
    const unitPrice = getCoursePriceLabel();
    let discSum = 0;
    players.forEach(p => {
      if (!p.use_ticket_id) {
        discSum += Math.max(0, unitPrice - calculatePlayerPrice(p, unitPrice));
      }
    });
    return discSum;
  };

  const currentTotalAmount = calculateTotalAmount();

  useEffect(() => {
    if (currentTotalAmount < MIN_INSTALLMENT_AMOUNT && installmentMonths !== 0) {
      setInstallmentMonths(0);
    }
  }, [currentTotalAmount, installmentMonths]);

  // 파3 예약 최종 확정 및 결제창 전환
  const handleConfirmBooking = async () => {
    if (isSubmittingRef.current || loading) return;
    if (!selectedSlot) {
      setErrorMsg('원하시는 티오프 시간대를 선택해 주세요.');
      return;
    }
    if (players.length === 0) {
      setErrorMsg('최소 1명 이상의 대표자(또는 동반자)를 배정 인원 목록에 추가해 주세요.');
      return;
    }

    isSubmittingRef.current = true;
    setLoading(true);
    setErrorMsg('');

    const totalAmount = calculateTotalAmount();
    const matchedProd = getMatchedCourseProduct();

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
      const targetZone = course || categoryUuid;
      const res = await api.bookPar3Course(
        targetZone,
        getTodayStr(),
        selectedSlot.time,
        totalAmount,
        leaderPayload,
        companionsPayload,
        matchedProd?.prod_cd
      );

      if (res.success && res.res_id) {
        currentHoldResIdRef.current = res.res_id;
        // 예약 선점 성공 -> 서버가 확정 산출한 pay_amt(res.price)가 있으면 최우선 사용하여 실물 VAN 단말기 승인 진입
        const serverValidatedAmt = typeof (res as any).price === 'number' && (res as any).price >= 0 ? (res as any).price : totalAmount;
        await runRealCardPayment(res.res_id, serverValidatedAmt);
      } else {
        setErrorMsg(res.message);
        setLoading(false);
      }
    } catch {
      setErrorMsg('예약 처리 중 오류가 발생했습니다.');
      setLoading(false);
    } finally {
      isSubmittingRef.current = false;
    }
  };

  // 3단계 실물 VAN 카드 결제 승인 연동
  const runRealCardPayment = async (resId: string, amount: number) => {
    const matchedProd = getMatchedCourseProduct();
    const prodCd = matchedProd?.prod_cd;
    const isTaxFree = matchedProd?.vat_yn === 'N';
    const vat = isTaxFree ? 0 : Math.round(amount / 11);

    // 만약 전원 이용권 사용 등으로 최종 결제금액이 ₩0 이라면 카드 리더기 연출 생략하고 즉시 승인!
    if (amount === 0) {
      setPaymentState('DISPATCHING');
      setAuthProgress(50);
      setTimeout(async () => {
        setAuthProgress(100);
        await executeConfirmWebhook(resId, 0, 'MEMBERSHIP_TICKET', undefined, {
          prodCd,
          gradeDiscountAmount: calculateTotalGradeDiscount(),
        });
      }, 500);
      return;
    }

    setPaymentState('INSERT_WAIT');
    setAuthProgress(20);

    try {
      // [BUG-P3-03] 사업장/서브가맹점 단말기 라우팅(resolveTerminalRoute) 검증 연동
      let routedTerminalId: string | undefined = undefined;
      if (typeof (api as any).resolveTerminalRoute === 'function') {
        const routeRes = await api.resolveTerminalRoute(
          prodCd || `PAR3_${course || 'COURSE'}`,
          matchedProd?.business_unit_type,
          matchedProd?.business_merchant_id || undefined,
          matchedProd?.pro_id ? String(matchedProd.pro_id) : undefined
        );
        if (routeRes && routeRes.success === false) {
          await api.cancelHoldReservation(resId).catch(() => {});
          currentHoldResIdRef.current = null;
          fetchSlots();
          setErrorMsg(routeRes.message || '결제 단말기 가맹점 라우팅 설정 오류로 결제를 진행할 수 없습니다.');
          resetPaymentState();
          return;
        }
        routedTerminalId = routeRes?.terminal_id || undefined;
      }

      const effectiveInstallmentMonths = amount >= MIN_INSTALLMENT_AMOUNT ? installmentMonths : 0;

      const approval = await kioskVanClient.requestCardPayment(
        {
          amount,
          vat,
          isTaxFree,
          installmentMonths: effectiveInstallmentMonths,
          terminalId: routedTerminalId,
          timeoutSeconds: 30,
        } as any,
        (vanState) => {
          if (vanState === 'READY' || vanState === 'WAITING_CARD') {
            setPaymentState('INSERT_WAIT');
            setAuthProgress(20);
          } else if (vanState === 'REQUESTING') {
            setPaymentState('READING');
            setAuthProgress(60);
          } else if (vanState === 'APPROVED') {
            setPaymentState('DISPATCHING');
            setAuthProgress(90);
          }
        }
      );

      if (!approval.success) {
        await api.cancelHoldReservation(resId).catch(() => {});
        currentHoldResIdRef.current = null;
        fetchSlots();
        setErrorMsg(approval.error_message || '카드 결제가 거절되었습니다.');
        resetPaymentState();
        return;
      }

      setAuthProgress(100);
      await executeConfirmWebhook(
        resId,
        amount,
        approval.auth_code,
        approval.card_no_masked,
        {
          ...approval,
          prodCd,
          gradeDiscountAmount: calculateTotalGradeDiscount(),
        }
      );
    } catch (err: unknown) {
      await api.cancelHoldReservation(resId).catch(() => {});
      currentHoldResIdRef.current = null;
      fetchSlots();
      const errMsg = err instanceof Error ? err.message : '단말기 통신 오류가 발생했습니다.';
      setErrorMsg(`[결제 실패]: ${errMsg}`);
      resetPaymentState();
    }
  };

  const rollbackVanApprovalIfNeeded = async (resId: string, amount: number, vanResult?: any, reason?: string) => {
    const authCodeStr = String(vanResult?.auth_code || '');
    if (
      amount <= 0 ||
      !authCodeStr ||
      authCodeStr.startsWith('FREE-') ||
      authCodeStr.startsWith('POINT-') ||
      authCodeStr.startsWith('MEMBERSHIP') ||
      (vanResult?.amount !== undefined && vanResult.amount <= 0)
    ) {
      return;
    }
    const matchedProd = getMatchedCourseProduct();
    const isTaxFree = matchedProd?.vat_yn === 'N';
    const orgApprovedDate = (vanResult.approved_at || '').replace(/[^0-9]/g, '').slice(0, 8) || TimeMaster.getKstYmd(TimeMaster.getSyncedDate()).replace(/-/g, '');
    const cancelAmt = vanResult.amount || amount;
    const cancelVat = isTaxFree ? 0 : Math.round(cancelAmt / 11);
    const cancelInstallment = vanResult.installment_months || 0;
    const resolvedProdCd = vanResult?.prodCd || matchedProd?.prod_cd || `PAR3_${course || 'COURSE'}`;
    try {
      const cancelRes = await kioskVanClient.cancelCardPayment({
        amount: cancelAmt,
        vat: cancelVat,
        installmentMonths: cancelInstallment,
        orgAuthCode: vanResult.auth_code,
        orgApprovedDate,
        terminalId: vanResult.terminal_id,
        vanTrNo: vanResult.van_tr_no,
        ...({
          orgAuthNo: vanResult.auth_code,
          orgAuthDate: orgApprovedDate,
          orgVanTrNo: vanResult.van_tr_no,
          vatAmount: cancelVat,
        } as any)
      });
      if (!cancelRes || !cancelRes.success) {
        const backendReason = reason || 'Par3 webhook failed';
        const revReason = cancelRes?.error_message || 'Unknown';
        await api.reportGhostCharge({
          store_cd: STORE_CODE,
          member_no: players[0]?.member_no || memberNo,
          prod_cd: resolvedProdCd,
          amount: cancelAmt,
          auth_code: vanResult.auth_code,
          card_no_masked: vanResult.card_no_masked || '',
          issuer_name: vanResult.issuer_name || '',
          van_tr_no: vanResult.van_tr_no || '',
          approvedAt: vanResult.approved_at,
          terminal_id: vanResult.terminal_id || '',
          backendErrorReason: backendReason,
          reversalErrorReason: revReason,
          error_reason: `${backendReason} / Cancel failed: ${revReason}`
        });
      }
    } catch (cancelErr: any) {
      const backendReason = reason || `Par3 webhook failed (resId=${resId})`;
      const revReason = cancelErr?.message || String(cancelErr);
      await api.reportGhostCharge({
        store_cd: STORE_CODE,
        member_no: players[0]?.member_no || memberNo,
        prod_cd: resolvedProdCd,
        amount: cancelAmt,
        auth_code: vanResult.auth_code,
        card_no_masked: vanResult.card_no_masked || '',
        issuer_name: vanResult.issuer_name || '',
        van_tr_no: vanResult.van_tr_no || '',
        approvedAt: vanResult.approved_at,
        terminal_id: vanResult.terminal_id || '',
        backendErrorReason: backendReason,
        reversalErrorReason: revReason,
        error_reason: `${backendReason} / Cancel exception: ${revReason}`
      });
    }
  };

  const executeConfirmWebhook = async (
    resId: string,
    amount: number,
    authNo?: string,
    cardMasked?: string,
    vanResult?: any,
    usedPoints: number = 0
  ) => {
    try {
      const matchedProd = getMatchedCourseProduct();
      const webhookOptions = {
        ...(vanResult || {}),
        prodCd: vanResult?.prodCd || matchedProd?.prod_cd,
        gradeDiscountAmount: vanResult?.gradeDiscountAmount ?? calculateTotalGradeDiscount(),
        usedPoints: vanResult?.usedPoints ?? usedPoints ?? 0,
      };
      const confirmRes = await api.confirmKioskPaymentWebhook(
        resId,
        amount,
        amount === 0 ? 'TICKET' : 'CARD',
        webhookOptions
      );
      const isSuccess = typeof confirmRes === 'boolean' ? confirmRes : !!(confirmRes as any)?.success;

      if (isSuccess) {
        currentHoldResIdRef.current = null;
        const selectedZoneName = zones.find(z => z.zone_code === course)?.zone_name || course;
        const formattedDate = TimeMaster.formatKstDateTime(TimeMaster.getSyncedDate());
        const validApprNo = authNo || (amount === 0 ? 'MEMBERSHIP_TICKET' : `APPR_${Math.floor(10000000 + Math.random() * 90000000)}`);

        // [BUG-P3-06] 영수증 DTO 주입 (하드코딩 주소/전화번호 제거, api.getStoreInfo 동적 데이터 사용)
        setCreatedReceipt({
          branchNm: storeInfo?.store_nm || 'GOLFOS',
          address: storeInfo?.address || '',
          tel: storeInfo?.tel || '',
          tradeDate: formattedDate,
          apprNo: validApprNo,
          cardNo: cardMasked,
          cardIssuer: vanResult?.issuer_name,
          terminalId: vanResult?.terminal_id,
          installmentMonths: vanResult?.installment_months ?? 0,
          prodNm: `Par3 ${selectedZoneName} 코스 [${selectedSlot?.time}]`,
          partySize: players.length,
          totalAmount: amount,
          resId: resId
        });

        setPaymentState('DONE');
      } else {
        await rollbackVanApprovalIfNeeded(resId, amount, vanResult, (confirmRes as any)?.message || 'Par3 webhook returned false');
        await api.cancelHoldReservation(resId).catch(() => {});
        currentHoldResIdRef.current = null;
        fetchSlots();
        setErrorMsg('결제 웹훅 승인 처리에 실패하여 카드 승인이 자동 취소되었습니다.');
        resetPaymentState();
      }
    } catch (err: any) {
      await rollbackVanApprovalIfNeeded(resId, amount, vanResult, err?.message || 'Par3 webhook exception');
      await api.cancelHoldReservation(resId).catch(() => {});
      currentHoldResIdRef.current = null;
      fetchSlots();
      setErrorMsg('결제 서버 통신 중 오류가 발생하여 카드 승인이 자동 취소되었습니다.');
      resetPaymentState();
    }
  };

  const resetPaymentState = () => {
    setPaymentState('IDLE');
    setCreatedReceipt(null);
    setLoading(false);
  };

  // 모의 결제 실패 강제 트리거 (QA용) 및 단말기 요청 즉시 중단
  const handleSimulateFail = (reason: string) => {
    kioskVanClient.cancelCurrentRequest();
    if (currentHoldResIdRef.current) {
      api.cancelHoldReservation(currentHoldResIdRef.current).catch(() => {});
      currentHoldResIdRef.current = null;
      fetchSlots();
    }
    setErrorMsg(`[결제 실패 모의]: ${reason}`);
    resetPaymentState();
  };

  // 고객 직접 결제 대기 취소 (INSERT_WAIT 단계)
  const handleCancelInsertWait = () => {
    kioskVanClient.cancelCurrentRequest();
    if (currentHoldResIdRef.current) {
      api.cancelHoldReservation(currentHoldResIdRef.current).catch(() => {});
      currentHoldResIdRef.current = null;
      fetchSlots();
    }
    resetPaymentState();
  };

  // 영수증 인쇄 완료 후 최종 메인화면 이전 처리 (결제/인쇄 완료되었으므로 메인 복귀)
  const handleReceiptClose = () => {
    onCancel();
  };

  return (
    <div 
      className="kiosk-ultra-container" 
      data-layout="fixed"
      style={{
        width: '100%',
        flex: 1,
        minHeight: 0,
        maxHeight: '1920px', 
        boxSizing: 'border-box',
        padding: '30px 48px 140px 48px',
        display: 'flex',
        flexDirection: 'column',
        gap: '20px',
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
            background: '#f5f5f7',
            border: '1px solid #e5e5ea',
            padding: '12px',
            borderRadius: '18px'
          }}>
            <Calendar size={34} style={{ color: '#1d1d1f' }} />
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
            background: '#f5f5f7',
            border: '1px solid #e5e5ea',
            color: '#1d1d1f',
            padding: '10px 24px',
            fontSize: '16px',
            fontWeight: 800,
            borderRadius: '999px',
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
          flex: 1, 
          minHeight: '0',
          overflow: 'hidden',
          flexShrink: 1
        }}
      >
        {/* 좌측 Column: 1. 예약 시간대 선택 */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', height: '100%', minHeight: '0' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: '18px', fontWeight: 800, color: '#1d1d1f', letterSpacing: '0.5px' }}>1. 예약 시간대 선택</span>
            <span style={{ fontSize: '13px', color: '#86868b', fontWeight: 700 }}>※ 이동 준비시간(10분) 이내 마감</span>
          </div>
          <div 
            ref={scrollContainerRef}
            className="kiosk-ultra-scrollbar"
            style={{ 
              flex: 1, 
              minHeight: '0',
              overflowY: 'auto', 
              border: '1.5px solid #e5e5ea', 
              borderRadius: '24px', 
              background: '#ffffff',
              padding: '20px',
              display: 'grid',
              gridTemplateColumns: 'repeat(2, 1fr)',
              gap: '12px',
              alignContent: 'start'
            }}
          >
            {(() => {
              const kstNow = TimeMaster.getSyncedDate();
              const curHourMin = `${String(kstNow.getHours()).padStart(2, '0')}${String(kstNow.getMinutes()).padStart(2, '0')}`;
              
              // 준비시간 Cutoff (10분 이내) 계산 (프론트 2중 방어 - KST 서버 동기화 시각 기준)
              const cutoffNow = new Date(TimeMaster.getSyncedNowMs() + 10 * 60 * 1000);
              const cutoffHourMin = `${String(cutoffNow.getHours()).padStart(2, '0')}${String(cutoffNow.getMinutes()).padStart(2, '0')}`;

              // 현재시각 이전 과거 시각만 필터링하고, 준비시간(10분 이내) 슬롯은 목록에 표시하되 마감 처리
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
                const slotTimeClean = s.time.replace(':', '');
                const isImminentClosed = slotTimeClean < cutoffHourMin;
                const isReserved = s.status !== 'AVAILABLE' || isImminentClosed;
                
                const btnBg = isSelected 
                  ? '#1d1d1f' 
                  : (isReserved 
                    ? '#f5f5f7' 
                    : '#ffffff');
                const textCol = isSelected 
                  ? '#ffffff' 
                  : (isReserved ? '#c8c8cd' : '#1d1d1f');
                const borderCol = isSelected
                  ? '#1d1d1f'
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
                        ? '0 8px 18px rgba(0, 0, 0, 0.15)' 
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
          
          {/* 2. 코스 선택 */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
            <span style={{ fontSize: '16px', fontWeight: 800, color: '#1d1d1f', letterSpacing: '0.5px' }}>2. 코스 선택</span>
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
                      border: `1.5px solid ${isActive ? '#1d1d1f' : '#e5e5ea'}`,
                      background: isActive ? '#1d1d1f' : '#ffffff',
                      color: isActive ? '#ffffff' : '#1d1d1f',
                      fontSize: '18px',
                      fontWeight: 900,
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: '8px',
                      transition: 'all 0.15s ease',
                      boxShadow: isActive ? '0 8px 20px rgba(0, 0, 0, 0.12)' : 'none'
                    }}
                  >
                    <span>{z.zone_name}</span>
                    {isActive && <Check size={18} style={{ color: '#34c759' }} />}
                  </button>
                );
              })}
            </div>
          </div>

          {/* As-Built 4인 배정 인원 동적 목록 */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', flex: 1, minHeight: '0' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontSize: '16px', fontWeight: 800, color: '#1d1d1f', letterSpacing: '0.5px' }}>
                3. 배정 인원 목록 (최대 4인)
              </span>
              <span style={{ fontSize: '14px', color: '#1d1d1f', fontWeight: 800 }}>
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
                <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '8px', padding: '30px 0' }}>
                  <HelpCircle size={28} style={{ color: '#86868b' }} />
                  <span style={{ fontSize: '15px', color: '#1d1d1f', fontWeight: 800 }}>배정 목록이 비어 있습니다.</span>
                  <p style={{ fontSize: '13px', color: '#86868b', margin: 0, textAlign: 'center', lineHeight: 1.4, fontWeight: 600 }}>
                    하단의 단추를 누르면 대표자 및 동반자가 추가됩니다.
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
                      background: idx === 0 ? '#f5f5f7' : '#ffffff',
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
                          padding: '2px 8px',
                          borderRadius: '999px',
                          background: p.is_member ? '#1d1d1f' : '#e5e5ea',
                          color: p.is_member ? '#ffffff' : '#515154'
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
                        <div style={{ display: 'flex', alignItems: 'center', gap: '4px', color: '#059669', marginTop: '2px' }}>
                          <Ticket size={12} />
                          <span style={{ fontSize: '12px', fontWeight: 800 }}>
                            🎟️ {p.use_ticket_name} 사용 (결제액 면제)
                          </span>
                        </div>
                      )}

                      {/* 회원 등급 할인 배지 */}
                      {!p.use_ticket_id && p.is_member && (p.discount_rate || 0) > 0 && (
                        <div style={{ display: 'flex', alignItems: 'center', gap: '4px', color: '#059669', marginTop: '2px' }}>
                          <span style={{ fontSize: '12px', fontWeight: 800 }}>
                            👑 회원 등급 {p.discount_rate! < 1 ? Math.round(p.discount_rate! * 100) : p.discount_rate}% 할인 적용 (₩{calculatePlayerPrice(p, getCoursePriceLabel()).toLocaleString()})
                          </span>
                        </div>
                      )}
                    </div>

                    {/* 대표자 및 동반자 개별 삭제 허용 (오입력 수정 지원) */}
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
                  </div>
                ))
              )}
            </div>

            {/* 인원 추가 버튼 (4명 미만일 때만 활성화 - 애플 럭셔리 캡슐 CTA 디자인) */}
            {players.length < 4 && (
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px', flexShrink: 0 }}>
                {/* 1. 대표/동반 회원 인증 CTA (Primary) */}
                <button
                  onClick={() => {
                    setModalState('MEMBER_AUTH_MODAL');
                    setModalPhone('');
                  }}
                  style={{
                    height: '74px',
                    borderRadius: '18px',
                    border: 'none',
                    background: '#1d1d1f',
                    color: '#ffffff',
                    cursor: 'pointer',
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '4px',
                    padding: '8px 12px',
                    boxShadow: '0 6px 18px rgba(0, 0, 0, 0.14)',
                    transition: 'all 0.15s ease'
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <UserCheck size={18} style={{ color: '#34c759' }} />
                    <span style={{ fontSize: '16px', fontWeight: 900, letterSpacing: '-0.3px', color: '#ffffff', whiteSpace: 'nowrap' }}>
                      {players.length === 0 ? '대표 회원 인증' : '회원 동반자 추가'}
                    </span>
                  </div>
                  <span style={{ fontSize: '12px', color: '#a1a1a6', fontWeight: 600, whiteSpace: 'nowrap' }}>
                    회원 혜택 · 이용권 사용
                  </span>
                </button>
                
                {/* 2. 대표/동반 비회원 추가 CTA (Secondary) */}
                <button
                  onClick={() => {
                    setModalState('ADD_GUEST_PHONE');
                    setModalPhone('');
                  }}
                  style={{
                    height: '74px',
                    borderRadius: '18px',
                    border: '1.5px solid #d2d2d7',
                    background: '#f5f5f7',
                    color: '#1d1d1f',
                    cursor: 'pointer',
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '4px',
                    padding: '8px 12px',
                    transition: 'all 0.15s ease'
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <UserPlus size={18} style={{ color: '#1d1d1f' }} />
                    <span style={{ fontSize: '16px', fontWeight: 900, letterSpacing: '-0.3px', color: '#1d1d1f', whiteSpace: 'nowrap' }}>
                      {players.length === 0 ? '대표 비회원 추가' : '비회원 동반자 추가'}
                    </span>
                  </div>
                  <span style={{ fontSize: '12px', color: '#86868b', fontWeight: 600, whiteSpace: 'nowrap' }}>
                    일일권 · 현장 즉시 결제
                  </span>
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* 최종 요금 및 결제 패널 */}
      <div 
        style={{
          padding: '20px 36px',
          borderRadius: '24px',
          display: 'flex',
          flexDirection: 'column',
          gap: '14px',
          background: '#ffffff',
          border: '1px solid #e5e5ea',
          boxShadow: '0 8px 30px rgba(0,0,0,0.04)',
          minHeight: '130px',
          flexShrink: 0,
          boxSizing: 'border-box'
        }}
      >
        {currentTotalAmount >= MIN_INSTALLMENT_AMOUNT && (
          <div
            data-testid="par3-installment-selector-panel"
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: '12px',
              padding: '10px 16px',
              background: '#f5f5f7',
              border: '1px solid #e5e5ea',
              borderRadius: '14px',
              flexWrap: 'wrap'
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span style={{ fontSize: '14px', fontWeight: 900, color: '#1d1d1f' }}>
                💳 할부 개월 선택
              </span>
              <span style={{ fontSize: '12px', fontWeight: 700, color: '#059669', background: '#ecfdf5', padding: '2px 8px', borderRadius: '999px' }}>
                5만원 이상 할부 가능
              </span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
              {INSTALLMENT_MONTH_OPTIONS.map((months) => {
                const isSelected = installmentMonths === months;
                return (
                  <button
                    key={months}
                    type="button"
                    data-testid={`par3-installment-option-${months}`}
                    onClick={() => setInstallmentMonths(months)}
                    style={{
                      padding: '6px 14px',
                      borderRadius: '999px',
                      border: isSelected ? '1.5px solid #1d1d1f' : '1px solid #d2d2d7',
                      background: isSelected ? '#1d1d1f' : '#ffffff',
                      color: isSelected ? '#ffffff' : '#515154',
                      fontSize: '13px',
                      fontWeight: isSelected ? 900 : 700,
                      cursor: 'pointer'
                    }}
                  >
                    {months === 0 ? '일시불' : `${months}개월`}
                  </button>
                );
              })}
            </div>
          </div>
        )}

        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', width: '100%' }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', flex: 1, minWidth: '0' }}>
            <span style={{ fontSize: '15px', color: '#86868b', fontWeight: 800, letterSpacing: '0.5px' }}>최종 선택 내역</span>
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
              <span style={{ fontSize: '22px', fontWeight: 900, color: '#1d1d1f', whiteSpace: 'nowrap' }}>
                {selectedSlot ? `${selectedSlot.time} 티오프` : '시간대 미선택'} <span style={{ color: '#d2d2d7', margin: '0 6px' }}>|</span> 총 {players.length}명
              </span>
              {selectedSlot && players.length === 0 && (
                <span style={{ fontSize: '14px', color: '#ff3b30', background: '#fff2f2', padding: '4px 10px', borderRadius: '8px', fontWeight: 800, whiteSpace: 'nowrap' }}>
                  안내: 이용자 추가 필요
                </span>
              )}
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '32px' }}>
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '2px' }}>
              <span style={{ fontSize: '14px', color: '#86868b', fontWeight: 700 }}>
                총 결제 금액{calculateTotalGradeDiscount() > 0 ? ` (회원할인 -₩${calculateTotalGradeDiscount().toLocaleString()})` : ''}
                {currentTotalAmount >= MIN_INSTALLMENT_AMOUNT ? ` · ${installmentMonths === 0 ? '일시불' : `${installmentMonths}개월 할부`}` : ''}
              </span>
              <span style={{ 
                fontSize: '34px', 
                fontWeight: 950, 
                color: '#1d1d1f',
                letterSpacing: '-1px'
              }}>
                ₩{currentTotalAmount.toLocaleString()}
              </span>
            </div>

            <button
              onClick={handleConfirmBooking}
              disabled={loading || !selectedSlot || players.length === 0}
              style={{
                height: '68px',
                fontSize: '20px',
                fontWeight: 900,
                padding: '0 44px',
                borderRadius: '999px',
                display: 'flex',
                alignItems: 'center',
                gap: '10px',
                background: loading || !selectedSlot || players.length === 0 ? '#e5e5ea' : '#1d1d1f',
                color: loading || !selectedSlot || players.length === 0 ? '#86868b' : '#ffffff',
                border: 'none',
                cursor: loading || !selectedSlot || players.length === 0 ? 'not-allowed' : 'pointer',
                boxShadow: loading || !selectedSlot || players.length === 0 ? 'none' : '0 8px 24px rgba(0, 0, 0, 0.16)',
                transition: 'all 0.15s ease',
                flexShrink: 0
              }}
            >
              <CreditCard size={24} />
              {loading ? '예약 중...' : '선점 및 결제'}
            </button>
          </div>
        </div>
      </div>

      {/* 3종 통합 회원 인증 (안면 인식 / QR / 전화번호) 오버레이 모달 */}
      {modalState === 'MEMBER_AUTH_MODAL' && (
        <div 
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0, 0, 0, 0.75)',
            backdropFilter: 'blur(8px)',
            zIndex: 99999,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '20px',
            boxSizing: 'border-box'
          }}
          onClick={closeModal}
        >
          <div onClick={(e) => e.stopPropagation()} style={{ width: '100%', display: 'flex', justifyContent: 'center' }}>
            <MemberAuth
              isSubModal={true}
              initialAuthMode="SMART_TAG"
              faceTerminalEnabled={faceTerminalEnabled}
              onAuthSuccess={handleMemberAuthSuccess}
              onCancel={closeModal}
            />
          </div>
        </div>
      )}

      {/* 비회원 추가 텐키패드 오버레이 모달 */}
      {(modalState === 'ADD_MEMBER_PHONE' || modalState === 'ADD_GUEST_PHONE') && (
        <div 
          style={{
            position: 'fixed',
            inset: 0,
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
              borderRadius: '28px',
              padding: '32px',
              display: 'flex',
              flexDirection: 'column',
              gap: '24px',
              color: '#1d1d1f',
              boxShadow: '0 24px 80px rgba(0,0,0,0.5)',
              border: '1px solid rgba(255,255,255,0.4)'
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <h4 style={{ fontSize: '22px', fontWeight: 900, margin: 0, letterSpacing: '-0.5px' }}>
                {modalState === 'ADD_MEMBER_PHONE' ? '회원 전화번호 입력' : '비회원 연락처 입력'}
              </h4>
              <button 
                onClick={closeModal} 
                onMouseDown={(e) => e.currentTarget.style.transform = 'scale(0.9)'}
                onMouseUp={(e) => e.currentTarget.style.transform = 'scale(1)'}
                onMouseLeave={(e) => e.currentTarget.style.transform = 'scale(1)'}
                style={{ background: '#f5f5f7', border: 'none', color: '#86868b', cursor: 'pointer', width: '36px', height: '36px', borderRadius: '18px', display: 'flex', alignItems: 'center', justifyContent: 'center', transition: 'transform 0.1s ease' }}
              >
                <X size={20} />
              </button>
            </div>

            {/* 에러 문구 */}
            {modalError && (
              <span style={{ fontSize: '14px', color: '#ff3b30', fontWeight: 800, textAlign: 'center', marginTop: '-12px' }}>
                ⚠️ {modalError}
              </span>
            )}

            {/* 번호 표시창 */}
            <div 
              style={{
                height: '76px',
                background: '#f5f5f7',
                borderRadius: '16px',
                border: '1.5px solid #e5e5ea',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: '32px',
                fontWeight: 900,
                color: modalPhone ? '#1d1d1f' : '#d1d1d6',
                fontFamily: 'monospace',
                letterSpacing: '2px'
              }}
            >
              {modalPhone ? formatHp(modalPhone) : '010-0000-0000'}
            </div>

            {/* 텐키패드 */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '10px', height: 'auto', gridAutoRows: '64px' }}>
              {['1', '2', '3', '4', '5', '6', '7', '8', '9'].map(n => (
                <button
                  type="button"
                  key={n}
                  onClick={() => handleModalPhoneClick(n)}
                  onMouseDown={(e) => e.currentTarget.style.transform = 'scale(0.93)'}
                  onMouseUp={(e) => e.currentTarget.style.transform = 'scale(1)'}
                  onMouseLeave={(e) => e.currentTarget.style.transform = 'scale(1)'}
                  style={{ 
                    fontSize: '24px', fontWeight: 700, borderRadius: '16px', background: '#ffffff', 
                    border: '1.5px solid rgba(0,0,0,0.06)', color: '#1d1d1f', cursor: 'pointer',
                    boxShadow: '0 4px 10px rgba(0,0,0,0.03)',
                    transition: 'transform 0.1s cubic-bezier(0.4, 0, 0.2, 1)'
                  }}
                  className="kiosk-keypad-btn"
                >
                  {n}
                </button>
              ))}
              <button 
                type="button" 
                onClick={() => setModalPhone('')} 
                onMouseDown={(e) => e.currentTarget.style.transform = 'scale(0.93)'}
                onMouseUp={(e) => e.currentTarget.style.transform = 'scale(1)'}
                onMouseLeave={(e) => e.currentTarget.style.transform = 'scale(1)'}
                style={{ 
                  fontSize: '16px', fontWeight: 800, color: '#ff3b30', borderRadius: '16px', 
                  background: 'rgba(255, 59, 48, 0.05)', border: '1.5px solid rgba(255, 59, 48, 0.1)', cursor: 'pointer',
                  transition: 'transform 0.1s cubic-bezier(0.4, 0, 0.2, 1)'
                }}
              >
                지움
              </button>
              <button 
                type="button" 
                onClick={() => handleModalPhoneClick('0')} 
                onMouseDown={(e) => e.currentTarget.style.transform = 'scale(0.93)'}
                onMouseUp={(e) => e.currentTarget.style.transform = 'scale(1)'}
                onMouseLeave={(e) => e.currentTarget.style.transform = 'scale(1)'}
                style={{ 
                  fontSize: '24px', fontWeight: 700, borderRadius: '16px', background: '#ffffff', 
                  border: '1.5px solid rgba(0,0,0,0.06)', color: '#1d1d1f', cursor: 'pointer',
                  boxShadow: '0 4px 10px rgba(0,0,0,0.03)',
                  transition: 'transform 0.1s cubic-bezier(0.4, 0, 0.2, 1)'
                }}
              >
                0
              </button>
              <button 
                type="button" 
                onClick={handleModalPhoneBackspace} 
                onMouseDown={(e) => e.currentTarget.style.transform = 'scale(0.93)'}
                onMouseUp={(e) => e.currentTarget.style.transform = 'scale(1)'}
                onMouseLeave={(e) => e.currentTarget.style.transform = 'scale(1)'}
                style={{ 
                  fontSize: '22px', fontWeight: 'bold', borderRadius: '16px', background: 'rgba(0,0,0,0.03)', 
                  border: '1.5px solid rgba(0,0,0,0.05)', color: '#1d1d1f', cursor: 'pointer',
                  transition: 'transform 0.1s cubic-bezier(0.4, 0, 0.2, 1)'
                }}
              >
                ←
              </button>
            </div>

            <button
              onClick={handlePhoneModalSubmit}
              disabled={loading}
              style={{
                height: '64px',
                borderRadius: '999px',
                background: loading ? '#e5e5ea' : '#1d1d1f',
                color: loading ? '#86868b' : '#ffffff',
                border: 'none',
                fontSize: '19px',
                fontWeight: 900,
                cursor: loading ? 'not-allowed' : 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                boxShadow: loading ? 'none' : '0 8px 24px rgba(0, 0, 0, 0.16)',
                transition: 'all 0.15s ease',
                marginTop: '4px'
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
            inset: 0,
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
              borderRadius: '28px',
              padding: '32px',
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
              {getAssignableAssets(selectedMemberForTicket.member, selectedMemberForTicket.isLeader).map(ticket => {
                const logicType = (ticket.logic_type || ticket.pass_type || '').toUpperCase();
                const isPeriod = logicType === 'PERIOD' || logicType === 'MEMBERSHIP';
                const expDate = ticket.expiry_date || ticket.end_date || ticket.end_dt || '';
                const remCount = ticket.rem_count ?? ticket.remain_cnt ?? 0;
                return (
                  <button
                    key={ticket.member_item_id}
                    onClick={() => addMemberSlot(selectedMemberForTicket.member, selectedMemberForTicket.isLeader, ticket)}
                    style={{
                      padding: '16px 20px',
                      borderRadius: '16px',
                      border: '1.5px solid #1d1d1f',
                      background: '#f5f5f7',
                      color: '#1d1d1f',
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
                      <span style={{ fontSize: '13px', color: '#86868b' }}>
                        {isPeriod
                          ? `유효기간: ${expDate ? `~${expDate}` : '기간권 (일일 무제한)'}`
                          : `잔여 횟수: ${remCount}회`}
                      </span>
                    </div>
                    <Ticket size={24} style={{ color: '#059669' }} />
                  </button>
                );
              })}
            </div>

            {/* 일반 결제 옵션 제공 */}
            <button
              onClick={() => addMemberSlot(selectedMemberForTicket.member, selectedMemberForTicket.isLeader, undefined)}
              style={{
                height: '56px',
                borderRadius: '999px',
                background: '#f5f5f7',
                color: '#515154',
                border: '1px solid #e5e5ea',
                fontSize: '16px',
                fontWeight: 800,
                cursor: 'pointer'
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
            inset: 0,
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
            {/* 가상 QA 에러 모의 버튼 (모의 결제 모드 전용 노출) */}
            {(settings.providerType === 'MOCK_VAN' || import.meta.env.VITE_DEMO_MODE === 'true' || import.meta.env.DEV) && (
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
            )}

            {/* 메인 아이콘 */}
            <div style={{
              width: '90px',
              height: '90px',
              borderRadius: '50%',
              background: '#f5f5f7',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              border: '2px solid #e5e5ea'
            }}>
              {paymentState === 'INSERT_WAIT' ? (
                <CardIcon size={42} className="animate-bounce" style={{ color: '#1d1d1f' }} />
              ) : (
                <RefreshCw size={42} className="animate-spin" style={{ color: '#1d1d1f' }} />
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
                  background: '#1d1d1f', 
                  transition: 'width 0.5s ease-in-out',
                  borderRadius: '4px'
                }} 
              />
            </div>

            <div style={{ fontSize: '14px', color: '#86868b', fontWeight: 600 }}>
              결제 요청 금액 : <span style={{ color: '#1d1d1f', fontWeight: 900 }}>₩{calculateTotalAmount().toLocaleString()}</span>
            </div>

            {paymentState === 'INSERT_WAIT' && (
              <button
                onClick={handleCancelInsertWait}
                style={{
                  width: '100%',
                  padding: '14px 16px',
                  borderRadius: '999px',
                  border: '1.5px solid #e5e5ea',
                  background: '#f5f5f7',
                  color: '#1d1d1f',
                  fontSize: '15px',
                  fontWeight: 800,
                  cursor: 'pointer'
                }}
              >
                결제 취소
              </button>
            )}
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
