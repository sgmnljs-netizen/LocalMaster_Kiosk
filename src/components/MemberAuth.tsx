import React, { useState, useEffect, useRef, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { Camera, User, X, Sparkles, Smartphone, QrCode, Delete, Hash } from 'lucide-react';
import { api, Member } from '../services/api';
import { useHardwareScanner } from '../services/hardware/hooks/useHardwareScanner';
import {
  useKioskSettings,
  resolveEnabledAuthModes,
  resolveEffectiveAuthMode,
  isKioskMenuEnabled,
} from '../stores/kioskSettings';

export type AuthMode = 'SMART_TAG' | 'PHONE_KEYPAD' | 'QR_SCAN' | 'FACE';

type MemberLookupEnvelope = Partial<Member> & {
  candidates?: Member[];
  duplicate?: boolean;
  error?: string;
};

interface LmNfcTagEventDetail {
  member_no?: string;
  token_or_uid?: string;
  tag_uid?: string;
  query?: string;
  hp?: string;
  rssi?: number;
  auth_type?: 'BLE' | 'NFC' | 'QR';
}

declare global {
  interface Window {
    __LM_TRIGGER_SMART_AUTH__?: (
      tokenOrUid: string,
      rssi?: number,
      authType?: 'BLE' | 'NFC' | 'QR'
    ) => Promise<void>;
  }
}

// [H-4] MemberAuth 언마운트 후 즉시 재진입 시에도 앞사람 BLE 시퀀스를 재소비하지 않도록 모듈 레벨 기억
let _lastGlobalHandledBleSeq = 0;

const AUTH_MODE_SHORT_LABELS: Record<AuthMode, string> = {
  SMART_TAG: '앱 스마트 체크인',
  PHONE_KEYPAD: '전화번호',
  QR_SCAN: 'QR 스캔',
  FACE: '안면 인식',
};

export function buildMaskedName(name?: string | null): string {
  const trimmed = String(name ?? '').trim();
  if (!trimmed) return '';
  const chars = Array.from(trimmed);
  if (chars.length < 2) return chars[0] || '';
  if (chars.length === 2) return `${chars[0]}*`;
  return `${chars[0]}${'*'.repeat(chars.length - 2)}${chars[chars.length - 1]}`;
}

export interface FaceScanResolutionGuardInput {
  aborted: boolean;
  isCurrentController: boolean;
  isMounted: boolean;
  hasDetectedMember: boolean;
  hasDuplicateCandidates: boolean;
  isAuthConfirmed: boolean;
}

export function shouldAcceptFaceScanResolution(input: FaceScanResolutionGuardInput): boolean {
  return (
    !input.aborted &&
    input.isCurrentController &&
    input.isMounted &&
    !input.hasDetectedMember &&
    !input.hasDuplicateCandidates &&
    !input.isAuthConfirmed
  );
}

export interface SmartTagTriggerGuardInput {
  isSearching: boolean;
  hasDetectedMember: boolean;
  hasDuplicateCandidates: boolean;
  isAuthConfirmed: boolean;
}

export function shouldAcceptSmartTagTrigger(input: SmartTagTriggerGuardInput): boolean {
  return (
    !input.isSearching &&
    !input.hasDetectedMember &&
    !input.hasDuplicateCandidates &&
    !input.isAuthConfirmed
  );
}

export function confirmDetectedMemberOnce<T>(
  lockRef: { current: boolean },
  target: T | null,
  onConfirm: (member: T) => void
): boolean {
  if (!target || lockRef.current) {
    return false;
  }
  lockRef.current = true;
  onConfirm(target);
  return true;
}

interface MemberAuthProps {
  initialAuthMode?: AuthMode;
  faceTerminalEnabled?: boolean;
  enabledAuthModes?: AuthMode[];
  defaultAuthMode?: AuthMode;
  disallowQrScan?: boolean;
  isSubModal?: boolean;
  selectedBayNo?: number | null;
  selectedBayNos?: number[];
  onAuthSuccess: (member: Member) => void;
  onCancel: () => void;
  onSignUpClick?: () => void;
  onAuthError?: (code: string, detail: string) => void;
}

export const MemberAuth: React.FC<MemberAuthProps> = ({ 
  initialAuthMode = 'SMART_TAG', 
  faceTerminalEnabled = true,
  enabledAuthModes,
  defaultAuthMode,
  disallowQrScan = false,
  isSubModal = false,
  selectedBayNo,
  selectedBayNos,
  onAuthSuccess, 
  onCancel, 
  onSignUpClick,
  onAuthError
}) => {
  const { settings } = useKioskSettings();
  const baseAuthModes: AuthMode[] =
    enabledAuthModes && enabledAuthModes.length > 0
      ? enabledAuthModes
      : resolveEnabledAuthModes(settings.authMethods, faceTerminalEnabled);
  const filteredAuthModes: AuthMode[] = disallowQrScan
    ? baseAuthModes.filter((m) => m !== 'QR_SCAN')
    : baseAuthModes;
  const activeAuthModes: AuthMode[] =
    filteredAuthModes.length > 0
      ? filteredAuthModes
      : (faceTerminalEnabled !== false ? ['SMART_TAG', 'FACE'] : ['SMART_TAG']);

  const effectiveInitialMode: AuthMode = resolveEffectiveAuthMode(
    initialAuthMode,
    defaultAuthMode ?? settings.defaultAuthMode,
    activeAuthModes
  );

  const [rawAuthMode, setAuthMode] = useState<AuthMode>(effectiveInitialMode);
  const authMode: AuthMode = activeAuthModes.includes(rawAuthMode) ? rawAuthMode : effectiveInitialMode;
  const isSignUpAllowed = Boolean(onSignUpClick) && isKioskMenuEnabled('SIGNUP', settings.menuOverrides, true);

  const [errorMsg, setErrorMsg] = useState('');
  const [isSearching, setIsSearching] = useState(false);
  const [phoneDigits, setPhoneDigits] = useState('');
  
  // 1초 본인 확인 팝업용 회원 감지 상태 (3번 방어책)
  const [detectedMember, setDetectedMember] = useState<Member | null>(null);
  // 동일 휴대폰 번호(가족 공용 등) 다중 회원 후보 선택 모달 상태 (BUG-M02)
  const [duplicateCandidates, setDuplicateCandidates] = useState<Member[]>([]);
  
  // 안면 인식 관련 추가 상태
  const [faceScanning, setFaceScanning] = useState(false);
  const [faceMatchResult, setFaceMatchResult] = useState<Member | null>(null);
  const [faceCountdown, setFaceCountdown] = useState<number>(15);

  // 🛡️ 비동기 타이머 및 네트워크 중단 제어용 refs
  const faceScanTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const faceTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const authTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const faceAbortControllerRef = useRef<AbortController | null>(null);
  const isMountedRef = useRef<boolean>(true);
  const authConfirmedRef = useRef<boolean>(false);
  const isSearchingRef = useRef<boolean>(false);
  const detectedMemberRef = useRef<Member | null>(null);
  const duplicateCandidatesCountRef = useRef<number>(0);
  isSearchingRef.current = isSearching;
  detectedMemberRef.current = detectedMember;
  duplicateCandidatesCountRef.current = duplicateCandidates.length;

  // 키오스크 ↔ 로컬 하드웨어 브릿지 NFC/BLE 시퀀스 및 WebSocket 연결 ref
  const nfcBleWsRef = useRef<WebSocket | null>(null);
  const lastHandledBleSeqRef = useRef<number>(_lastGlobalHandledBleSeq);
  const onAuthErrorRef = useRef(onAuthError);
  onAuthErrorRef.current = onAuthError;

  // [H-4] 인증 화면 언마운트(뒤로가기/홈/인증완료) 시 로컬 BLE 잔류 캐시 즉시 클리어
  useEffect(() => {
    isMountedRef.current = true;
    authConfirmedRef.current = false;
    return () => {
      isMountedRef.current = false;
      api.clearLocalBleCache();
    };
  }, []);

  // 🛡️ 안면 스캔 또는 서버 검색 등 능동 하드웨어/네트워크 진행 중에만 전역 비활동(Inactivity) 타이머 리셋 방어
  // (수동 입력 대기 모달인 detectedMember / duplicateCandidates 방치 시에는 전역 40초 초기화가 정상 작동해야 타인 계정 오인증 차단 가능)
  useEffect(() => {
    if (!faceScanning && !isSearching) return;
    const keepAlive = setInterval(() => {
      window.dispatchEvent(new Event('keydown'));
    }, 10000);
    return () => clearInterval(keepAlive);
  }, [faceScanning, isSearching]);

  // 🛡️ 본인 확인 팝업(detectedMember) 무응답 방치 시 20초 후 자동 파기 + 로컬 BLE 캐시 즉시 초기화 (C-2 계정 탈취 방어)
  useEffect(() => {
    if (!detectedMember) return;
    const dismissTimer = setTimeout(() => {
      setDetectedMember(null);
      setPhoneDigits('');
      api.clearLocalBleCache();
    }, 20000);
    return () => clearTimeout(dismissTimer);
  }, [detectedMember]);

  // 스마트 태그 (NFC/BLE/QR) 감지 시 회원 수신 처리 (3번 본인 확인 팝업 유도)
  const handleSmartTagDetected = useCallback(async (
    tokenOrUid: string,
    fallbackMember?: Member,
    rssi?: number,
    authType?: 'BLE' | 'NFC' | 'QR'
  ) => {
    if (
      !shouldAcceptSmartTagTrigger({
        isSearching: isSearchingRef.current,
        hasDetectedMember: detectedMemberRef.current !== null,
        hasDuplicateCandidates: duplicateCandidatesCountRef.current > 0,
        isAuthConfirmed: authConfirmedRef.current,
      })
    ) {
      return;
    }
    // 교차 채널 충돌 방어: 스마트태그/QR/전화번호 조회 진입 시 진행 중이던 안면 스캔 즉시 중단
    if (faceAbortControllerRef.current) {
      faceAbortControllerRef.current.abort();
      faceAbortControllerRef.current = null;
    }
    if (faceTimerRef.current) {
      clearInterval(faceTimerRef.current);
      faceTimerRef.current = null;
    }
    setFaceScanning(false);

    isSearchingRef.current = true;
    setIsSearching(true);
    setErrorMsg('');
    setDuplicateCandidates([]);
    try {
      const cleanToken = tokenOrUid.trim();
      const normalizedQuery = /^[0-9]{8}$/.test(cleanToken) ? `010${cleanToken}` : cleanToken;
      const isDirectKeypadPhone = /^[0-9]{8,11}$/.test(cleanToken) && !authType;
      const rawMember: Member | Member[] | MemberLookupEnvelope | null =
        !isDirectKeypadPhone && typeof api.authenticateSmartTag === 'function'
          ? await api.authenticateSmartTag(normalizedQuery, rssi, authType)
          : await api.getMember(normalizedQuery);
      const lookupObj = (!Array.isArray(rawMember) ? rawMember : null) as MemberLookupEnvelope | null;
      if (Array.isArray(rawMember) && rawMember.length > 1) {
        setDuplicateCandidates(rawMember);
      } else if (lookupObj?.candidates && Array.isArray(lookupObj.candidates) && lookupObj.candidates.length > 0) {
        setDuplicateCandidates(lookupObj.candidates);
      } else if (lookupObj?.duplicate || lookupObj?.error === 'DUPLICATE_PHONE') {
        setPhoneDigits('');
        setErrorMsg('동일한 번호를 사용하는 회원이 여러 명 있습니다. 프런트 데스크에 문의해 주세요.');
      } else if (rawMember) {
        const resolved = (Array.isArray(rawMember) ? rawMember[0] : rawMember) as Member;
        if (!resolved.masked_name && resolved.member_name) {
          resolved.masked_name = buildMaskedName(resolved.member_name);
        }
        if (authType === 'QR' && !resolved.auth_channel) {
          resolved.auth_channel = 'QR';
        }
        setDetectedMember(resolved);
      } else if (fallbackMember) {
        setDetectedMember(fallbackMember);
      } else {
        setErrorMsg('등록되지 않은 모바일 회원이거나 스마트 체크인 신호를 찾을 수 없습니다.');
      }
    } catch (err: unknown) {
      const lookupErr = err as {
        status?: number;
        inactive?: boolean;
        duplicate?: boolean;
        message?: string;
        candidates?: Member[];
        response?: { status?: number; data?: { detail?: string; candidates?: Member[] } };
      } | null;
      const status = lookupErr?.response?.status || lookupErr?.status;
      const detail = String(lookupErr?.response?.data?.detail || lookupErr?.message || '');
      const candidates = lookupErr?.candidates || lookupErr?.response?.data?.candidates;
      if (status === 403 || lookupErr?.inactive) {
        setErrorMsg(detail || '현재 휴면 또는 이용 제한(일시정지/탈퇴) 상태인 회원입니다. 프런트 데스크에 문의해 주세요.');
      } else if (Array.isArray(candidates) && candidates.length > 0) {
        setDuplicateCandidates(candidates);
        setErrorMsg('');
      } else if (status === 409 || lookupErr?.duplicate || detail.includes('DUPLICATE') || detail.includes('중복') || detail.includes('여러 명')) {
        setPhoneDigits('');
        setErrorMsg(detail || '동일한 번호를 사용하는 회원이 여러 명 있습니다. 본인 계정을 선택해 주세요.');
      } else if (status === 400) {
        setErrorMsg(detail || '유효하지 않은 인증 정보입니다.');
      } else if (fallbackMember) {
        setDetectedMember(fallbackMember);
      } else {
        setErrorMsg('스마트 인증 처리 중 서버 통신 에러가 발생했습니다.');
      }
    } finally {
      isSearchingRef.current = false;
      setIsSearching(false);
    }
  }, []);

  const isSmartTagEnabled = activeAuthModes.includes('SMART_TAG');
  const isQrScanEnabled = !disallowQrScan && activeAuthModes.includes('QR_SCAN');

  // 🛡️ E2E 테스트 및 외부 하드웨어 브릿지용 전역 헬퍼 및 이벤트 리스너 (BUG-M05)
  useEffect(() => {
    window.__LM_TRIGGER_SMART_AUTH__ = async (
      tokenOrUid: string,
      rssi?: number,
      authType?: 'BLE' | 'NFC' | 'QR'
    ) => {
      if (authType === 'QR' && !isQrScanEnabled) return;
      await handleSmartTagDetected(tokenOrUid, undefined, rssi, authType);
    };
    const handleCustomTagEvent = (e: Event) => {
      const detail = (e as CustomEvent<LmNfcTagEventDetail>).detail;
      const authType = detail?.auth_type;
      if (authType === 'QR') {
        if (!isQrScanEnabled) return;
      } else if (!isSmartTagEnabled) {
        return;
      }
      const target =
        detail?.member_no ||
        detail?.token_or_uid ||
        detail?.tag_uid ||
        detail?.query ||
        detail?.hp;
      const rssi = typeof detail?.rssi === 'number' ? detail.rssi : undefined;
      if (target) {
        handleSmartTagDetected(String(target), undefined, rssi, authType);
      }
    };
    window.addEventListener('lm-nfc-tag', handleCustomTagEvent);
    return () => {
      delete window.__LM_TRIGGER_SMART_AUTH__;
      window.removeEventListener('lm-nfc-tag', handleCustomTagEvent);
    };
  }, [handleSmartTagDetected, isSmartTagEnabled, isQrScanEnabled]);

  // 🛡️ 바코드/QR 하드웨어 스캐너 전역 자동 감지 (QR_SCAN 활성 및 목적 허용 시에만 동작, 모달/검색/라카/상품구매 중 차단)
  useHardwareScanner({
    onScan: (scanned) => {
      console.log('[MemberAuth] Hardware QR/Barcode scanned:', scanned);
      handleSmartTagDetected(scanned, undefined, undefined, 'QR');
    },
    enabled: isQrScanEnabled && !isSearching && !detectedMember && !faceMatchResult && duplicateCandidates.length === 0,
  });

  // 📡 로컬 하드웨어 브릿지(:18080/api/v1/ble/poll) WinRT BLE 근접 태그 실시간 감지 폴링
  useEffect(() => {
    const canPollBle =
      isSmartTagEnabled &&
      !isSearching &&
      !detectedMember &&
      !faceMatchResult &&
      duplicateCandidates.length === 0;
    if (!canPollBle) return;

    let cancelled = false;
    const pollBleBridge = async () => {
      try {
        const res = await fetch(
          `${api.getLocalBleBridgeUrl()}/api/v1/ble/poll?since_seq=${lastHandledBleSeqRef.current}`,
          {
            method: 'GET',
            signal: AbortSignal.timeout(800),
          }
        );
        if (!res.ok || cancelled) return;
        const data = await res.json();
        // 브릿지 데몬 재시작으로 seq가 낮아진 경우 기준 시퀀스 자동 리셋
        if (typeof data?.seq === 'number' && data.seq < lastHandledBleSeqRef.current) {
          lastHandledBleSeqRef.current = 0;
          _lastGlobalHandledBleSeq = 0;
        }
        if (
          !cancelled &&
          data?.detected &&
          data?.token &&
          typeof data?.seq === 'number' &&
          data.seq > lastHandledBleSeqRef.current
        ) {
          lastHandledBleSeqRef.current = data.seq;
          _lastGlobalHandledBleSeq = data.seq;
          api.clearLocalBleCache();
          const rssiVal = typeof data.rssi === 'number' ? data.rssi : undefined;
          handleSmartTagDetected(String(data.token), undefined, rssiVal, 'BLE');
        }
      } catch {
        // 로컬 브릿지 미구동/타임아웃 시 조용히 무시
      }
    };

    void pollBleBridge();
    const timer = setInterval(pollBleBridge, 600);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [
    isSmartTagEnabled,
    isSearching,
    detectedMember,
    faceMatchResult,
    duplicateCandidates.length,
    handleSmartTagDetected,
  ]);

  // 🛡️ [방안 B: 010- 상시 고정 + 뒷 8자리 입력 & 습관적 010 입력 자동 흡수]
  const extractPhoneSuffix8 = (raw: string): string => {
    const digitsOnly = raw.replace(/[^0-9]/g, '');
    if (digitsOnly.startsWith('010')) {
      return digitsOnly.slice(3, 11);
    }
    return digitsOnly.slice(0, 8);
  };

  const effectiveSuffix8 = extractPhoneSuffix8(phoneDigits);
  const isPhoneReadyToSubmit = effectiveSuffix8.length === 8;

  // 전화번호 키패드 입력 제어 핸들러
  const handleKeypadDigit = (digit: string) => {
    setPhoneDigits((prev) => {
      const currSuffix = extractPhoneSuffix8(prev);
      if (currSuffix.length >= 8) return currSuffix;
      const next = currSuffix + digit;
      // 고객이 화면의 '010-' 고정 표시를 보지 못하고 습관적으로 '0','1','0'을 먼저 친 경우 자동 흡수
      if (next === '010') {
        return '';
      }
      return next;
    });
    setErrorMsg('');
  };

  const handleKeypadClear = () => {
    setPhoneDigits('');
    setErrorMsg('');
  };

  const handleKeypadBackspace = () => {
    setPhoneDigits((prev) => extractPhoneSuffix8(prev).slice(0, -1));
    setErrorMsg('');
  };

  const handleKeypadSubmit = async () => {
    if (effectiveSuffix8.length < 8) {
      setErrorMsg('휴대폰 번호 뒷 8자리(010 제외)를 모두 입력해 주세요.');
      return;
    }
    await handleSmartTagDetected(`010${effectiveSuffix8}`);
  };

  const formatHpDisplay = (raw: string) => {
    const suffix = extractPhoneSuffix8(raw);
    if (!suffix) {
      return '010-';
    }
    if (suffix.length <= 4) {
      return `010-${suffix}`;
    }
    return `010-${suffix.slice(0, 4)}-${suffix.slice(4, 8)}`;
  };

  // 안면 인식 트리거 (15초 대기 타이머 & 백엔드 안면 식별 API 동기 연동)
  const triggerFaceScan = useCallback(async () => {
    setFaceScanning(true);
    setFaceMatchResult(null);
    setErrorMsg('');
    setFaceCountdown(15);

    if (faceScanTimeoutRef.current) clearTimeout(faceScanTimeoutRef.current);
    if (faceTimerRef.current) clearInterval(faceTimerRef.current);
    if (faceAbortControllerRef.current) {
      faceAbortControllerRef.current.abort();
    }
    const newController = new AbortController();
    faceAbortControllerRef.current = newController;

    // 15초 카운트다운 타이머 구동
    faceTimerRef.current = setInterval(() => {
      setFaceCountdown(prev => {
        if (prev <= 1) {
          if (faceTimerRef.current) {
            clearInterval(faceTimerRef.current);
            faceTimerRef.current = null;
          }
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    try {
      const member = await api.scanFace(undefined, newController.signal);
      if (faceTimerRef.current) {
        clearInterval(faceTimerRef.current);
        faceTimerRef.current = null;
      }

      const canApply = shouldAcceptFaceScanResolution({
        aborted: newController.signal.aborted,
        isCurrentController: faceAbortControllerRef.current === newController,
        isMounted: isMountedRef.current,
        hasDetectedMember: detectedMemberRef.current !== null,
        hasDuplicateCandidates: duplicateCandidatesCountRef.current > 0,
        isAuthConfirmed: authConfirmedRef.current,
      });

      if (!canApply) {
        return;
      }

      if (member) {
        if (!member.masked_name && member.member_name) {
          member.masked_name = buildMaskedName(member.member_name);
        }
        // 🛡️ BUG-M06 & 즉시 반응 최적화(0ms): 안면 인식 완료 시 700ms 중간 대기 배너를 생략하고 2차 본인 확인 모달(detectedMember)을 즉각 팝업
        setFaceMatchResult(null);
        setFaceScanning(false);
        detectedMemberRef.current = member;
        setDetectedMember(member);
      } else {
        setErrorMsg('등록된 안면 정보가 없습니다. 다른 인증 수단(전화번호·스마트태그 등)을 이용해 주세요.');
        setFaceScanning(false);
      }
    } catch {
      if (faceTimerRef.current) {
        clearInterval(faceTimerRef.current);
        faceTimerRef.current = null;
      }
      if (
        !newController.signal.aborted &&
        faceAbortControllerRef.current === newController &&
        isMountedRef.current &&
        !authConfirmedRef.current
      ) {
        setErrorMsg('안면인식 장치 응답 지연이 발생했습니다.');
        setFaceScanning(false);
        if (onAuthErrorRef.current) {
          onAuthErrorRef.current('ERR_HARDWARE_TIMEOUT', '안면인식 스캔 모듈로부터 데이터를 수신하는 데 실패했습니다. 응답 타임아웃.');
        }
      }
    }
  }, []);

  // 🛡️ 컴포넌트 언마운트 시 또는 authMode 전환 시 타이머 전면 클린업
  useEffect(() => {
    if (faceScanTimeoutRef.current) clearTimeout(faceScanTimeoutRef.current);
    if (faceTimerRef.current) clearInterval(faceTimerRef.current);
    if (authTimeoutRef.current) clearTimeout(authTimeoutRef.current);

    if (authMode === 'FACE') {
      triggerFaceScan();
    } else {
      if (faceAbortControllerRef.current) {
        faceAbortControllerRef.current.abort();
        faceAbortControllerRef.current = null;
      }
      setFaceScanning(false);
      setFaceMatchResult(null);
    }

    return () => {
      if (faceScanTimeoutRef.current) clearTimeout(faceScanTimeoutRef.current);
      if (faceTimerRef.current) clearInterval(faceTimerRef.current);
      if (authTimeoutRef.current) clearTimeout(authTimeoutRef.current);
      if (faceAbortControllerRef.current) {
        faceAbortControllerRef.current.abort();
        faceAbortControllerRef.current = null;
      }
    };
  }, [authMode, triggerFaceScan]);

  // 📡 SMART_TAG 탭 이탈 시 잔여 리소스 안전 정리 (NFC/BLE 이벤트는 전역 lm-nfc-tag 및 하드웨어 스캐너로 수신)
  useEffect(() => {
    if (authMode !== 'SMART_TAG') {
      nfcBleWsRef.current?.close();
      nfcBleWsRef.current = null;
    }
    return () => {
      nfcBleWsRef.current?.close();
      nfcBleWsRef.current = null;
    };
  }, [authMode]);

  return (
    <div
      style={{
        width: '100%',
        flex: isSubModal ? undefined : 1,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: isSubModal ? 'flex-start' : 'flex-start',
        paddingTop: isSubModal ? '20px' : '180px',
        paddingBottom: 0,
        boxSizing: 'border-box',
      }}
    >
    <div 
      className="premium-glass-card" 
      style={{
        width: isSubModal ? '880px' : '1000px',
        maxWidth: 'calc(100% - 32px)',
        height: isSubModal ? 'auto' : '1040px',
        minHeight: isSubModal ? 'auto' : '1040px',
        boxSizing: 'border-box',
        margin: '0 auto',
        padding: isSubModal ? '34px 36px' : '40px 44px',
        background: '#ffffff',
        borderRadius: '36px',
        border: '1.5px solid #e2e8f0',
        boxShadow: '0 28px 70px rgba(0, 0, 0, 0.09), 0 4px 18px rgba(0, 0, 0, 0.04)',
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'space-between',
        gap: '20px',
      }}
    >
      {/* 상단 타이틀 바 (스페이스 블랙 원형 아이콘 배지 + 36px 타이틀 + 우측 돌아가기 솔리드 캡슐) */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
          <div style={{ position: 'relative', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
            <div
              style={{
                width: '56px',
                height: '56px',
                borderRadius: '50%',
                background: '#111827',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                boxShadow: '0 8px 20px rgba(17, 24, 39, 0.16)',
              }}
            >
              <User size={28} strokeWidth={2.5} style={{ color: '#ffffff' }} />
            </div>
            <div
              style={{
                position: 'absolute',
                top: 2,
                right: 2,
                width: '14px',
                height: '14px',
                borderRadius: '50%',
                background: '#10b981',
                border: '2.5px solid #ffffff',
              }}
            />
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '3px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
              <h2 style={{ fontSize: isSubModal ? '30px' : '36px', fontWeight: 900, color: '#111827', margin: 0, letterSpacing: '-0.8px', lineHeight: 1.15 }}>
                회원 본인 인증
              </h2>
              {(selectedBayNos && selectedBayNos.length > 0 ? true : Boolean(selectedBayNo)) && (
                <div
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '6px',
                    padding: '5px 16px',
                    borderRadius: '999px',
                    background: 'rgba(0, 113, 227, 0.08)',
                    border: '1.5px solid rgba(0, 113, 227, 0.35)',
                    color: '#0071e3',
                    fontSize: '18px',
                    fontWeight: 900,
                    letterSpacing: '-0.4px',
                    boxShadow: '0 2px 8px rgba(0, 113, 227, 0.12)',
                  }}
                >
                  <span style={{ fontSize: '18px' }}>⛳</span>
                  <span>
                    {selectedBayNos && selectedBayNos.length > 0
                      ? `${selectedBayNos.map((n) => String(n).padStart(2, '0')).join(', ')}번 타석 배정`
                      : `${String(selectedBayNo).padStart(2, '0')}번 타석 배정`}
                  </span>
                </div>
              )}
            </div>
            <span style={{ fontSize: '16px', fontWeight: 700, color: '#64748b', letterSpacing: '-0.2px' }}>
              {`원하시는 인증 수단을 선택해 주세요 (${activeAuthModes.map((m) => AUTH_MODE_SHORT_LABELS[m]).join(' · ')})`}
            </span>
          </div>
        </div>
        <button 
          onClick={onCancel}
          className="keypad-num-btn"
          style={{
            height: '52px',
            background: '#f1f5f9',
            border: '1px solid #cbd5e1',
            color: '#1e293b',
            padding: '0 24px',
            borderRadius: '999px',
            cursor: 'pointer',
            fontSize: '18px',
            fontWeight: 800,
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            flexShrink: 0,
          }}
        >
          <X size={20} strokeWidth={2.6} />
          돌아가기
        </button>
      </div>

      {/* 인증 모드 전환 탭 (스페이스 블랙 솔리드 활성 탭 + 에메랄드 아이콘 포인트) */}
      <div style={{ 
        display: 'grid', 
        gridTemplateColumns: `repeat(${activeAuthModes.length}, 1fr)`, 
        gap: '12px',
        background: '#f1f5f9',
        padding: '8px',
        borderRadius: '22px',
        border: '1px solid #e2e8f0',
      }}>
        {activeAuthModes.includes('SMART_TAG') && (
          <button
            onClick={() => { setAuthMode('SMART_TAG'); setErrorMsg(''); }}
            style={{
              height: isSubModal ? '62px' : '72px',
              padding: '0 14px',
              fontSize: isSubModal ? '19px' : '22px',
              fontWeight: 800,
              borderRadius: '16px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '10px',
              border: authMode === 'SMART_TAG' ? '1px solid #111827' : '1px solid transparent',
              cursor: 'pointer',
              transition: 'all 0.2s cubic-bezier(0.4, 0, 0.2, 1)',
              color: authMode === 'SMART_TAG' ? '#ffffff' : '#64748b',
              background: authMode === 'SMART_TAG' ? '#111827' : 'transparent',
              boxShadow: authMode === 'SMART_TAG' ? '0 8px 20px rgba(17, 24, 39, 0.2)' : 'none',
              letterSpacing: '-0.4px',
            }}
          >
            <Smartphone size={26} strokeWidth={2.5} style={{ color: authMode === 'SMART_TAG' ? '#34d399' : '#64748b' }} />
            앱 스마트 체크인
          </button>
        )}

        {activeAuthModes.includes('PHONE_KEYPAD') && (
          <button
            onClick={() => { setAuthMode('PHONE_KEYPAD'); setErrorMsg(''); }}
            style={{
              height: isSubModal ? '62px' : '72px',
              padding: '0 14px',
              fontSize: isSubModal ? '19px' : '22px',
              fontWeight: 800,
              borderRadius: '16px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '10px',
              border: authMode === 'PHONE_KEYPAD' ? '1px solid #111827' : '1px solid transparent',
              cursor: 'pointer',
              transition: 'all 0.2s cubic-bezier(0.4, 0, 0.2, 1)',
              color: authMode === 'PHONE_KEYPAD' ? '#ffffff' : '#64748b',
              background: authMode === 'PHONE_KEYPAD' ? '#111827' : 'transparent',
              boxShadow: authMode === 'PHONE_KEYPAD' ? '0 8px 20px rgba(17, 24, 39, 0.2)' : 'none',
              letterSpacing: '-0.4px',
            }}
          >
            <Hash size={26} strokeWidth={2.5} style={{ color: authMode === 'PHONE_KEYPAD' ? '#34d399' : '#64748b' }} />
            전화번호 입력
          </button>
        )}

        {activeAuthModes.includes('QR_SCAN') && (
          <button
            onClick={() => { setAuthMode('QR_SCAN'); setErrorMsg(''); }}
            style={{
              height: isSubModal ? '62px' : '72px',
              padding: '0 14px',
              fontSize: isSubModal ? '19px' : '22px',
              fontWeight: 800,
              borderRadius: '16px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '10px',
              border: authMode === 'QR_SCAN' ? '1px solid #111827' : '1px solid transparent',
              cursor: 'pointer',
              transition: 'all 0.2s cubic-bezier(0.4, 0, 0.2, 1)',
              color: authMode === 'QR_SCAN' ? '#ffffff' : '#64748b',
              background: authMode === 'QR_SCAN' ? '#111827' : 'transparent',
              boxShadow: authMode === 'QR_SCAN' ? '0 8px 20px rgba(17, 24, 39, 0.2)' : 'none',
              letterSpacing: '-0.4px',
            }}
          >
            <QrCode size={26} strokeWidth={2.5} style={{ color: authMode === 'QR_SCAN' ? '#34d399' : '#64748b' }} />
            출입 QR 스캔
          </button>
        )}

        {activeAuthModes.includes('FACE') && (
          <button
            onClick={() => { setAuthMode('FACE'); setErrorMsg(''); }}
            style={{
              height: isSubModal ? '62px' : '72px',
              padding: '0 14px',
              fontSize: isSubModal ? '19px' : '22px',
              fontWeight: 800,
              borderRadius: '16px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '10px',
              border: authMode === 'FACE' ? '1px solid #111827' : '1px solid transparent',
              cursor: 'pointer',
              transition: 'all 0.2s cubic-bezier(0.4, 0, 0.2, 1)',
              color: authMode === 'FACE' ? '#ffffff' : '#64748b',
              background: authMode === 'FACE' ? '#111827' : 'transparent',
              boxShadow: authMode === 'FACE' ? '0 8px 20px rgba(17, 24, 39, 0.2)' : 'none',
              letterSpacing: '-0.4px',
            }}
          >
            <Camera size={26} strokeWidth={2.5} style={{ color: authMode === 'FACE' ? '#34d399' : '#64748b' }} />
            안면 인식
          </button>
        )}
      </div>

      {/* 탭 콘텐츠 영역 (750px 고정 워크스페이스로 탭 전환 시 높낮이 요동 원천 차단) */}
      <div style={{ 
        display: 'flex', 
        flexDirection: 'column', 
        alignItems: 'center', 
        width: '100%',
        height: isSubModal ? 'auto' : '750px',
        minHeight: isSubModal ? 'auto' : '750px',
        position: 'relative',
      }}>
        {/* 에러 메세지 (20px 고시인성 경고 배너, 레이아웃 시프트 방지용 절대 배치 오버레이) */}
        {errorMsg && (
          <div 
            className="neon-border-red"
            style={{ 
              position: 'absolute',
              top: '-24px',
              left: '20px',
              right: '20px',
              zIndex: 30,
              background: '#fef2f2', 
              border: '2px solid #ef4444',
              padding: '14px 22px', 
              borderRadius: '18px', 
              textAlign: 'center',
              color: '#b91c1c',
              fontSize: '20px',
              fontWeight: 800,
              letterSpacing: '-0.3px',
              lineHeight: 1.4,
              wordBreak: 'keep-all',
              boxShadow: '0 12px 28px rgba(239, 68, 68, 0.25)',
            }}
          >
            ⚠️ {errorMsg}
          </div>
        )}

        {/* 0. 안면 인식 가상 카메라 패널 (카드 가로폭 100% 일체형 웰 + 스페이스 블랙 뷰포트) */}
        {authMode === 'FACE' && (
        <div
          style={{
            width: '100%',
            height: isSubModal ? 'auto' : '750px',
            minHeight: isSubModal ? 'auto' : '750px',
            background: '#f8fafc',
            borderRadius: '28px',
            border: '1.5px solid #e2e8f0',
            padding: '28px',
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'space-between',
            alignItems: 'center',
            boxSizing: 'border-box',
          }}
        >
          {/* 스캐너 메인 뷰 (가로 100% 와이드 밸런스, 560px 대형 뷰파인더) */}
          <div 
            className="premium-glass-card"
            style={{
              width: '100%',
              height: isSubModal ? '380px' : '560px',
              background: 'radial-gradient(circle at 50% 45%, #1e293b 0%, #0f172a 100%)',
              borderRadius: '24px',
              border: `2px solid ${faceMatchResult ? '#10b981' : 'rgba(255, 255, 255, 0.12)'}`,
              position: 'relative',
              overflow: 'hidden',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              boxShadow: faceMatchResult 
                ? '0 0 40px rgba(16, 185, 129, 0.25), inset 0 0 80px rgba(16, 185, 129, 0.12)' 
                : '0 16px 40px rgba(15, 23, 42, 0.25)',
              transition: 'all 0.3s cubic-bezier(0.2, 0.8, 0.2, 1)'
            }}
          >
            {/* 4개의 코너 가이드 마커 (에메랄드 통일) */}
            {[
              { top: '28px', left: '28px', borderTop: '4px solid', borderLeft: '4px solid' },
              { top: '28px', right: '28px', borderTop: '4px solid', borderRight: '4px solid' },
              { bottom: '28px', left: '28px', borderBottom: '4px solid', borderLeft: '4px solid' },
              { bottom: '28px', right: '28px', borderBottom: '4px solid', borderRight: '4px solid' }
            ].map((pos, idx) => (
              <div 
                key={idx}
                style={{
                  position: 'absolute',
                  width: '52px',
                  height: '52px',
                  borderColor: '#10b981',
                  borderRadius: '12px',
                  opacity: faceScanning && !faceMatchResult ? 0.9 : 0.45,
                  transition: 'all 0.3s ease',
                  ...pos
                }}
              />
            ))}

            {/* 정중앙 스캔 가이드 & 카메라 아이콘 */}
            <div 
              style={{
                width: isSubModal ? '190px' : '230px',
                height: isSubModal ? '190px' : '230px',
                border: `2.5px dashed ${faceMatchResult ? 'transparent' : 'rgba(52, 211, 153, 0.45)'}`,
                borderRadius: '50%',
                position: 'relative',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                background: 'rgba(16, 185, 129, 0.06)',
                transition: 'all 0.3s ease',
                zIndex: 2,
              }}
            >
              <Camera 
                size={80} 
                style={{ 
                  color: faceMatchResult ? '#10b981' : (faceScanning ? '#34d399' : '#94a3b8'),
                  transition: 'all 0.3s ease',
                  opacity: faceMatchResult ? 0 : 1
                }} 
              />
              
              {/* 스캔 빔 애니메이션 */}
              {faceScanning && !faceMatchResult && (
                <div 
                  style={{
                    position: 'absolute',
                    width: '160%',
                    height: '4px',
                    background: 'linear-gradient(90deg, transparent, #34d399, transparent)',
                    boxShadow: '0 0 20px 4px rgba(52, 211, 153, 0.45)',
                    top: '0%',
                    left: '-30%',
                    animation: 'face-scanner 2s infinite cubic-bezier(0.4, 0, 0.2, 1)',
                    opacity: 0.9
                  }}
                />
              )}
            </div>
            
            <p style={{ 
              fontSize: isSubModal ? '22px' : '28px', 
              color: faceMatchResult ? '#34d399' : '#f8fafc', 
              fontWeight: 800,
              letterSpacing: '-0.3px',
              zIndex: 2,
              margin: '26px 0 0 0'
            }}>
              {faceScanning && !faceMatchResult ? `단말기 정면을 응시해 주세요 (${faceCountdown}초)` : '정면을 응시해 주세요'}
            </p>

            {/* 매칭 결과 축하 레이어 */}
            {faceMatchResult && (
              <div 
                style={{
                  position: 'absolute',
                  top: 0,
                  left: 0,
                  width: '100%',
                  height: '100%',
                  background: 'radial-gradient(circle, rgba(16, 185, 129, 0.2) 0%, rgba(4, 5, 7, 0.96) 85%)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  flexDirection: 'column',
                  gap: '16px',
                  zIndex: 10,
                  animation: 'scaleIn 0.4s cubic-bezier(0.175, 0.885, 0.32, 1.275)'
                }}
              >
                <div style={{
                  width: '110px',
                  height: '110px',
                  background: '#10b981',
                  borderRadius: '50%',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  boxShadow: '0 0 40px rgba(16, 185, 129, 0.5)'
                }}>
                  <Sparkles size={56} color="#ffffff" />
                </div>
                <h3 style={{ fontSize: '34px', fontWeight: 900, color: '#ffffff', margin: '4px 0 0 0' }}>
                  안면 매칭 성공!
                </h3>
                <p style={{ fontSize: '24px', color: '#34d399', fontWeight: 800, margin: 0 }}>
                  {faceMatchResult.masked_name || faceMatchResult.member_name} 회원 ({faceMatchResult.member_no})
                </p>
                <p style={{ fontSize: '18px', color: '#cbd5e1', fontWeight: 600, margin: 0 }}>본인 확인 창으로 이동합니다...</p>
              </div>
            )}
          </div>

          {/* 재시도 버튼 (스페이스 블랙 솔리드 버튼) */}
          {!faceScanning && !faceMatchResult && (
            <button
              onClick={triggerFaceScan}
              className="kiosk-btn kiosk-btn-primary"
              style={{
                width: '100%',
                height: '76px',
                borderRadius: '20px',
                fontSize: '24px',
                fontWeight: 800,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '12px',
                background: '#111827',
                color: '#ffffff',
                border: 'none',
                boxShadow: '0 10px 24px rgba(17, 24, 39, 0.2)',
                cursor: 'pointer',
                letterSpacing: '-0.4px'
              }}
            >
              <Camera size={28} strokeWidth={2.5} style={{ color: '#34d399' }} />
              다시 안면인식 시도
            </button>
          )}
        </div>
      )}

      {/* 1. 스마트폰 NFC / BLE 비접촉 태그 패널 (딥 포레스트 그린 & 솔리드 벤토) */}
      {authMode === 'SMART_TAG' && (
        <div 
          style={{
            width: '100%',
            height: isSubModal ? 'auto' : '750px',
            minHeight: isSubModal ? 'auto' : '750px',
            background: '#f8fafc',
            borderRadius: '28px',
            border: '1.5px solid #e2e8f0',
            position: 'relative',
            overflow: 'hidden',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '32px',
            padding: '38px 34px',
            boxSizing: 'border-box',
          }}
        >
          {/* 딥 포레스트 그린 원형 배지 (140x140px) */}
          <div style={{ position: 'relative', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <div 
              style={{
                width: '140px',
                height: '140px',
                borderRadius: '50%',
                background: '#064e3b',
                border: '4px solid rgba(16, 185, 129, 0.35)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                boxShadow: '0 16px 36px rgba(6, 78, 59, 0.25)',
              }}
            >
              <Smartphone size={64} strokeWidth={2.3} style={{ color: '#34d399' }} />
            </div>
          </div>

          <div style={{ textAlign: 'center', display: 'flex', flexDirection: 'column', gap: '24px', width: '100%' }}>
            <h3 style={{ fontSize: isSubModal ? '26px' : '32px', fontWeight: 900, color: '#111827', letterSpacing: '-0.6px', margin: 0, lineHeight: 1.3, wordBreak: 'keep-all' }}>
              골포스 앱에서 <span style={{ color: '#059669' }}>[스마트 체크인]</span>을 눌러주세요
            </h3>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px', width: '100%' }}>
              <div style={{ background: '#ffffff', padding: '26px 28px', minHeight: '170px', borderRadius: '22px', border: '1px solid #e2e8f0', textAlign: 'left', boxShadow: '0 4px 14px rgba(0,0,0,0.03)', display: 'flex', flexDirection: 'column', gap: '10px', justifyContent: 'center' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <span style={{ background: '#111827', color: '#ffffff', fontSize: '14px', fontWeight: 800, padding: '5px 12px', borderRadius: '999px' }}>STEP 1</span>
                  <span style={{ fontSize: '21px', fontWeight: 800, color: '#111827' }}>골포스 앱 실행</span>
                </div>
                <div style={{ fontSize: '18px', color: '#475569', fontWeight: 700, lineHeight: 1.5, wordBreak: 'keep-all' }}>
                  스마트폰에서 <b style={{ color: '#111827' }}>골포스(GOLFOS) 앱</b>을 실행해 주세요.
                </div>
              </div>
              <div style={{ background: '#ffffff', padding: '26px 28px', minHeight: '170px', borderRadius: '22px', border: '1px solid #e2e8f0', textAlign: 'left', boxShadow: '0 4px 14px rgba(0,0,0,0.03)', display: 'flex', flexDirection: 'column', gap: '10px', justifyContent: 'center' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <span style={{ background: '#059669', color: '#ffffff', fontSize: '14px', fontWeight: 800, padding: '5px 12px', borderRadius: '999px' }}>STEP 2</span>
                  <span style={{ fontSize: '21px', fontWeight: 800, color: '#111827' }}>[스마트 체크인] 터치</span>
                </div>
                <div style={{ fontSize: '18px', color: '#475569', fontWeight: 700, lineHeight: 1.5, wordBreak: 'keep-all' }}>
                  홈 화면의 <b style={{ color: '#059669' }}>[스마트 체크인]</b> 버튼을 누르면 즉시 자동 인증됩니다.
                </div>
              </div>
            </div>

            <div style={{
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '8px',
              padding: '12px 24px',
              background: '#ffffff',
              border: '1px solid #e2e8f0',
              borderRadius: '999px',
              color: '#475569',
              fontSize: '16px',
              fontWeight: 700,
              margin: '0 auto',
              boxShadow: '0 2px 8px rgba(0,0,0,0.02)',
            }}>
              <span>💡</span>
              <span>키오스크 기기에 스마트폰을 대지 않아도 무선으로 안전하게 자동 인식됩니다.</span>
            </div>
          </div>
        </div>
      )}

      {/* 2. 전화번호 직접 입력 텐키 키패드 패널 (가로 100% 솔리드 벤토 웰) */}
      {authMode === 'PHONE_KEYPAD' && (
        <div 
          style={{
            width: '100%',
            height: isSubModal ? 'auto' : '750px',
            minHeight: isSubModal ? 'auto' : '750px',
            background: '#f8fafc',
            borderRadius: '28px',
            border: '1.5px solid #e2e8f0',
            padding: '28px 32px',
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'space-between',
            alignItems: 'center',
            boxSizing: 'border-box',
          }}
        >
          {/* 휴대폰 번호 디스플레이 창 (높이 100px & 42px 대형 등폭 숫자로 흔들림 원천 차단) */}
          <div style={{
            width: '100%',
            height: '100px',
            background: '#ffffff',
            borderRadius: '22px',
            border: '2px solid #111827',
            padding: '0 28px',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            boxSizing: 'border-box',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
              <span style={{ fontSize: '22px', color: '#475569', fontWeight: 800 }}>
                휴대폰 번호 (010 제외 8자리)
              </span>
              {isPhoneReadyToSubmit && (
                <span style={{
                  background: '#d1fae5',
                  color: '#065f46',
                  fontSize: '15px',
                  fontWeight: 800,
                  padding: '5px 12px',
                  borderRadius: '999px',
                }}>
                  조회 가능
                </span>
              )}
            </div>
            <span style={{
              fontSize: '42px',
              fontWeight: 900,
              color: '#111827',
              letterSpacing: '2px',
              fontVariantNumeric: 'tabular-nums',
              lineHeight: 1,
              display: 'inline-flex',
              alignItems: 'center',
            }}>
              {effectiveSuffix8 ? (
                formatHpDisplay(phoneDigits)
              ) : (
                <>
                  <span>010-</span>
                  <span style={{ fontSize: '26px', color: '#94a3b8', letterSpacing: '-0.3px', marginLeft: '6px' }}>
                    뒷 8자리 입력
                  </span>
                </>
              )}
            </span>
          </div>

          {/* 3x4 텐키 키패드 (높이 98px 대형 캡슐 버튼, 가로세로 2.8:1 이상적 비율) */}
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(3, 1fr)',
            gap: '14px',
            width: '100%'
          }}>
            {['1', '2', '3', '4', '5', '6', '7', '8', '9', 'C', '0', 'DEL'].map((k) => (
              <button
                key={k}
                type="button"
                className="keypad-num-btn"
                onClick={() => {
                  if (k === 'C') handleKeypadClear();
                  else if (k === 'DEL') handleKeypadBackspace();
                  else handleKeypadDigit(k);
                }}
                style={{
                  height: '98px',
                  fontSize: k === 'C' || k === 'DEL' ? '24px' : '36px',
                  fontWeight: 800,
                  borderRadius: '22px',
                  border: '1px solid #cbd5e1',
                  background: k === 'C' ? '#fef2f2' : k === 'DEL' ? '#e2e8f0' : '#ffffff',
                  color: k === 'C' ? '#dc2626' : '#111827',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  boxShadow: '0 3px 8px rgba(0,0,0,0.04)',
                  fontVariantNumeric: 'tabular-nums',
                }}
              >
                {k === 'DEL' ? <Delete size={32} strokeWidth={2.5} /> : k === 'C' ? '전체지움' : k}
              </button>
            ))}
          </div>

          {/* 회원 조회 확인 버튼 */}
          <button
            type="button"
            onClick={handleKeypadSubmit}
            disabled={isSearching || !isPhoneReadyToSubmit}
            style={{
              width: '100%',
              height: '84px',
              borderRadius: '22px',
              background: isPhoneReadyToSubmit ? '#064e3b' : '#cbd5e1',
              color: '#ffffff',
              fontSize: '26px',
              fontWeight: 800,
              border: 'none',
              cursor: isPhoneReadyToSubmit ? 'pointer' : 'not-allowed',
              boxShadow: isPhoneReadyToSubmit ? '0 10px 24px rgba(6, 78, 59, 0.25)' : 'none',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '10px',
              letterSpacing: '-0.4px'
            }}
          >
            {isSearching ? '조회 중...' : '회원 조회하기'}
          </button>
        </div>
      )}

      {/* 3. 모바일 출입 QR / 바코드 스캐너 패널 */}
      {authMode === 'QR_SCAN' && (
        <div 
          style={{
            width: '100%',
            height: isSubModal ? 'auto' : '750px',
            minHeight: isSubModal ? 'auto' : '750px',
            background: '#f8fafc',
            borderRadius: '28px',
            border: '1.5px solid #e2e8f0',
            padding: '38px 34px',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '30px',
            position: 'relative',
            overflow: 'hidden',
            boxSizing: 'border-box',
          }}
        >
          {/* 스캐너 가이드 프레임 (220x220px) */}
          <div style={{
            width: '220px',
            height: '220px',
            borderRadius: '28px',
            border: '3.5px dashed #059669',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            background: '#ffffff',
            boxShadow: '0 12px 28px rgba(6, 78, 59, 0.1)',
            position: 'relative'
          }}>
            <QrCode size={110} style={{ color: '#064e3b' }} />
            <div style={{
              position: 'absolute',
              top: '50%',
              left: '12%',
              right: '12%',
              height: '4px',
              background: '#10b981',
              boxShadow: '0 0 12px #10b981',
              animation: 'pulse 1.5s infinite'
            }} />
          </div>

          <div style={{ textAlign: 'center', display: 'flex', flexDirection: 'column', gap: '14px', maxWidth: '720px' }}>
            <h3 style={{ fontSize: isSubModal ? '26px' : '32px', fontWeight: 900, color: '#111827', margin: 0, letterSpacing: '-0.6px' }}>
              모바일 출입 QR을 하단 스캐너에 비춰주세요
            </h3>
            <p style={{ fontSize: '20px', color: '#475569', margin: 0, fontWeight: 700, lineHeight: 1.5, wordBreak: 'keep-all' }}>
              골포스 회원 전용 앱의 <b style={{ color: '#059669' }}>[출입용 QR 티켓]</b> 또는 카카오톡 알림톡 QR을 키오스크 하단 바코드 리더기에 인식시켜 주세요.
            </p>
          </div>
        </div>
      )}
      </div>

      {/* 동일 휴대폰 번호(가족 공용 등) 다중 회원 후보 선택 팝업 (BUG-M02) */}
      {duplicateCandidates.length > 0 && !detectedMember && createPortal(
        <div
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            width: '100vw',
            height: '100vh',
            background: 'rgba(15, 23, 42, 0.5)',
            backdropFilter: 'blur(24px) saturate(180%)',
            WebkitBackdropFilter: 'blur(24px) saturate(180%)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 999999,
            margin: 0,
            padding: 0
          }}
        >
          <div
            style={{
              width: '620px',
              padding: '40px 36px',
              borderRadius: '32px',
              textAlign: 'center',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              gap: '24px',
              background: '#ffffff',
              border: '1.5px solid #e2e8f0',
              boxShadow: '0 25px 60px rgba(0, 0, 0, 0.25)',
              animation: 'scaleIn 0.25s cubic-bezier(0.16, 1, 0.3, 1)'
            }}
          >
            <div>
              <h3 style={{ fontSize: '32px', fontWeight: 800, color: '#0f172a', marginBottom: '8px', letterSpacing: '-0.6px' }}>
                이용하실 회원님을 선택해 주세요
              </h3>
              <p style={{ fontSize: '20px', color: '#475569', fontWeight: 700, margin: 0 }}>
                동일 번호로 등록된 가족/다중 회원이 확인되었습니다.
              </p>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', width: '100%', maxHeight: '360px', overflowY: 'auto' }}>
              {duplicateCandidates.map((cand) => (
                <button
                  key={cand.member_no}
                  type="button"
                  onClick={() => {
                    duplicateCandidatesCountRef.current = 0;
                    setDuplicateCandidates([]);
                    handleSmartTagDetected(cand.member_no, cand);
                  }}
                  style={{
                    width: '100%',
                    padding: '20px 24px',
                    borderRadius: '18px',
                    border: '2px solid #10b981',
                    background: '#f8fafc',
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    cursor: 'pointer',
                    fontSize: '23px',
                    fontWeight: 800,
                    color: '#0f172a'
                  }}
                >
                  <span>
                    <strong style={{ color: '#059669' }}>[{cand.masked_name || buildMaskedName(cand.member_name)}]</strong> 회원님
                  </span>
                  <span style={{ fontSize: '18px', color: '#475569', fontWeight: 700 }}>
                    회원번호 {cand.member_no}
                  </span>
                </button>
              ))}
            </div>

            <button
              type="button"
              onClick={() => setDuplicateCandidates([])}
              style={{
                width: '100%',
                height: '62px',
                borderRadius: '999px',
                fontSize: '21px',
                fontWeight: 800,
                background: '#f1f5f9',
                color: '#334155',
                border: '1.5px solid #cbd5e1',
                cursor: 'pointer'
              }}
            >
              닫기
            </button>
          </div>
        </div>,
        document.body
      )}

      {/* 3번 방어선: 1초 회원 이름 확인 팝업 모달 (620px 고시인성 대형 다이얼로그) */}
      {detectedMember && createPortal(
        <div 
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            width: '100vw',
            height: '100vh',
            background: 'rgba(15, 23, 42, 0.5)',
            backdropFilter: 'blur(24px) saturate(180%)',
            WebkitBackdropFilter: 'blur(24px) saturate(180%)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 999999,
            margin: 0,
            padding: 0
          }}
        >
          <div 
            style={{
              width: '620px',
              padding: '44px 40px',
              borderRadius: '32px',
              textAlign: 'center',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              gap: '26px',
              background: '#ffffff',
              border: '1.5px solid #e2e8f0',
              boxShadow: '0 28px 65px rgba(0, 0, 0, 0.22), 0 4px 16px rgba(0, 0, 0, 0.06)',
              animation: 'scaleIn 0.3s cubic-bezier(0.16, 1, 0.3, 1)'
            }}
          >
            {/* 성공 뱃지 스타일 서클 */}
            <div 
              style={{ 
                width: '88px', 
                height: '88px', 
                borderRadius: '50%', 
                background: 'linear-gradient(135deg, #10b981 0%, #059669 100%)',
                display: 'flex', 
                alignItems: 'center', 
                justifyContent: 'center',
                boxShadow: '0 12px 28px rgba(16, 185, 129, 0.35)'
              }}
            >
              <Sparkles size={46} style={{ color: '#ffffff' }} />
            </div>

            <div>
              <h3 style={{ fontSize: '38px', fontWeight: 900, color: '#0f172a', marginBottom: '10px', letterSpacing: '-0.6px' }}>
                <span style={{ color: '#059669', fontWeight: 900 }}>
                  [{detectedMember.masked_name || buildMaskedName(detectedMember.member_name) || detectedMember.member_name}]
                </span> 회원님
              </h3>
              <p style={{ fontSize: '24px', color: '#334155', fontWeight: 800, margin: 0 }}>
                본인이 맞으신가요?
              </p>
              {/* 회원 보유 이용권/등급 요약 안내 뱃지 */}
              <div
                style={{
                  marginTop: '16px',
                  padding: '12px 22px',
                  borderRadius: '16px',
                  background: '#f0fdf4',
                  border: '1.5px solid #86efac',
                  color: '#065f46',
                  fontSize: '19px',
                  fontWeight: 800,
                  display: 'inline-block'
                }}
              >
                {(() => {
                  const assignableAssets = (detectedMember.assets || []).filter(a => a.is_assignable !== false);
                  if (assignableAssets.length > 0) {
                    const primary = assignableAssets[0];
                    const remCnt = primary.remain_cnt ?? primary.rem_count;
                    return assignableAssets.length > 1
                      ? `${primary.item_name} 외 ${assignableAssets.length - 1}건 보유`
                      : `${primary.item_name}${remCnt != null ? ` (잔여 ${remCnt}회)` : ''}`;
                  }
                  if (detectedMember.item_name) {
                    return detectedMember.item_name;
                  }
                  return `회원번호 ${detectedMember.member_no} · 일일권/상품 이용 가능`;
                })()}
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1.25fr', gap: '16px', width: '100%', marginTop: '6px' }}>
              <button
                onClick={() => {
                  api.clearLocalBleCache();
                  setDetectedMember(null);
                }}
                style={{
                  height: '68px',
                  borderRadius: '999px',
                  fontSize: '22px',
                  fontWeight: 800,
                  background: '#f1f5f9',
                  color: '#334155',
                  border: '1.5px solid #cbd5e1',
                  cursor: 'pointer',
                  transition: 'all 0.15s ease'
                }}
                onMouseDown={(e) => e.currentTarget.style.transform = 'scale(0.96)'}
                onMouseUp={(e) => e.currentTarget.style.transform = 'scale(1)'}
              >
                아니오 (취소)
              </button>
              <button
                onClick={() => {
                  const target = detectedMember;
                  api.clearLocalBleCache();
                  detectedMemberRef.current = null;
                  setDetectedMember(null);
                  confirmDetectedMemberOnce(authConfirmedRef, target, onAuthSuccess);
                }}
                style={{
                  height: '68px',
                  borderRadius: '999px',
                  fontSize: '23px',
                  fontWeight: 800,
                  background: 'linear-gradient(135deg, #10b981 0%, #059669 100%)',
                  color: '#ffffff',
                  border: 'none',
                  boxShadow: '0 10px 24px rgba(16, 185, 129, 0.35)',
                  cursor: 'pointer',
                  transition: 'all 0.15s ease'
                }}
                onMouseDown={(e) => e.currentTarget.style.transform = 'scale(0.96)'}
                onMouseUp={(e) => e.currentTarget.style.transform = 'scale(1)'}
              >
                예, 맞습니다!
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* 신규 즉석 회원가입 유도 영역 (메인화면 배너와 통일된 고시인성 솔리드 바) */}
      {isSignUpAllowed && onSignUpClick && (
        <div 
          style={{ 
            padding: '22px 28px', 
            borderRadius: '22px', 
            display: 'flex', 
            justifyContent: 'space-between', 
            alignItems: 'center',
            border: '1.5px solid #e2e8f0',
            background: '#f8fafc',
          }}
        >
          <div style={{ display: 'flex', flexDirection: 'column', gap: '3px' }}>
            <span style={{ fontSize: '21px', fontWeight: 900, color: '#111827', letterSpacing: '-0.4px' }}>
              아직 등록된 회원이 아니신가요?
            </span>
            <p style={{ fontSize: '16px', color: '#64748b', fontWeight: 700, margin: 0 }}>
              현장에서 30초 만에 간편 가입하고 즉시 이용하실 수 있습니다.
            </p>
          </div>
          <button
            onClick={onSignUpClick}
            className="kiosk-btn kiosk-btn-success"
            style={{ 
              height: '58px', 
              fontSize: '19px', 
              fontWeight: 800, 
              padding: '0 28px', 
              borderRadius: '999px',
              background: '#064e3b',
              color: '#ffffff',
              border: 'none',
              boxShadow: '0 6px 16px rgba(6, 78, 59, 0.22)',
              cursor: 'pointer',
              flexShrink: 0,
            }}
          >
            30초 신규 회원가입 →
          </button>
        </div>
      )}
    </div>
    </div>
  );
};
