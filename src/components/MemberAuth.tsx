import React, { useState, useEffect, useRef, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { Camera, User, X, Sparkles, Smartphone, Radio, QrCode, Delete } from 'lucide-react';
import { api, Member } from '../services/api';
import { useHardwareScanner } from '../services/hardware/hooks/useHardwareScanner';
import {
  useKioskSettings,
  resolveEnabledAuthModes,
  resolveEffectiveAuthMode,
  isKioskMenuEnabled,
} from '../stores/kioskSettings';

export type AuthMode = 'SMART_TAG' | 'PHONE_KEYPAD' | 'QR_SCAN' | 'FACE';

const AUTH_MODE_SHORT_LABELS: Record<AuthMode, string> = {
  SMART_TAG: '스마트 태그',
  PHONE_KEYPAD: '전화번호',
  QR_SCAN: 'QR 스캔',
  FACE: '안면 인식',
};

function buildMaskedName(name?: string): string {
  if (!name) return '';
  if (name.length < 2) return name;
  if (name.length === 2) return `${name[0]}*`;
  return `${name[0]}${'*'.repeat(name.length - 2)}${name[name.length - 1]}`;
}

interface MemberAuthProps {
  initialAuthMode?: AuthMode;
  faceTerminalEnabled?: boolean;
  enabledAuthModes?: AuthMode[];
  defaultAuthMode?: AuthMode;
  isSubModal?: boolean;
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
  isSubModal = false,
  onAuthSuccess, 
  onCancel, 
  onSignUpClick,
  onAuthError
}) => {
  const { settings } = useKioskSettings();
  const activeAuthModes: AuthMode[] =
    enabledAuthModes && enabledAuthModes.length > 0
      ? enabledAuthModes
      : resolveEnabledAuthModes(settings.authMethods, faceTerminalEnabled);

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
  const faceScanTimeoutRef = useRef<any>(null);
  const faceTimerRef = useRef<any>(null);
  const authTimeoutRef = useRef<any>(null);
  const faceAbortControllerRef = useRef<AbortController | null>(null);
  // 키오스크 ↔ 백엔드 NFC/BLE WebSocket 연결 ref
  const nfcBleWsRef = useRef<WebSocket | null>(null);

  // 🛡️ 안면 스캔 또는 서버 검색 진행 중 전역 비활동(Inactivity) 타이머 리셋 방어 (BUG-M10)
  useEffect(() => {
    if (!faceScanning && !isSearching && !detectedMember && duplicateCandidates.length === 0) return;
    const keepAlive = setInterval(() => {
      window.dispatchEvent(new Event('keydown'));
    }, 10000);
    return () => clearInterval(keepAlive);
  }, [faceScanning, isSearching, detectedMember, duplicateCandidates.length]);

  // 스마트 태그 (NFC/BLE) 감지 시 회원 수신 처리 (3번 본인 확인 팝업 유도)
  const handleSmartTagDetected = useCallback(async (tokenOrUid: string, fallbackMember?: Member) => {
    setIsSearching(true);
    setErrorMsg('');
    setDuplicateCandidates([]);
    try {
      const isShortPhone = /^[0-9]{4}$/.test(tokenOrUid.trim());
      const member = !isShortPhone && (api as any).authenticateSmartTag
        ? await (api as any).authenticateSmartTag(tokenOrUid)
        : await api.getMember(tokenOrUid);
      if (Array.isArray(member) && member.length > 1) {
        setDuplicateCandidates(member);
      } else if ((member as any)?.candidates && Array.isArray((member as any).candidates) && (member as any).candidates.length > 0) {
        setDuplicateCandidates((member as any).candidates);
      } else if ((member as any)?.duplicate || (member as any)?.error === 'DUPLICATE_PHONE') {
        setPhoneDigits('');
        setErrorMsg('동일한 뒷번호 회원이 여러 명 있습니다. 휴대폰 번호 전체(11자리)를 입력해 주세요.');
      } else if (member) {
        const resolved = Array.isArray(member) ? member[0] : member;
        if (!resolved.masked_name && resolved.member_name) {
          resolved.masked_name = buildMaskedName(resolved.member_name);
        }
        setDetectedMember(resolved);
      } else if (fallbackMember) {
        setDetectedMember(fallbackMember);
      } else {
        setErrorMsg('등록되지 않은 모바일 회원 또는 NFC 카드입니다.');
      }
    } catch (err: any) {
      const status = err?.response?.status || err?.status;
      const detail = String(err?.response?.data?.detail || err?.message || '');
      const candidates = err?.candidates || err?.response?.data?.candidates;
      if (status === 403 || err?.inactive) {
        setErrorMsg(detail || '현재 휴면 또는 이용 제한(일시정지/탈퇴) 상태인 회원입니다. 프런트 데스크에 문의해 주세요.');
      } else if (Array.isArray(candidates) && candidates.length > 0) {
        setDuplicateCandidates(candidates);
        setErrorMsg('');
      } else if (status === 409 || err?.duplicate || detail.includes('DUPLICATE') || detail.includes('중복') || detail.includes('여러 명')) {
        setPhoneDigits('');
        setErrorMsg(detail || '동일한 뒷번호 회원이 여러 명 있습니다. 휴대폰 번호 전체(11자리)를 입력해 주세요.');
      } else if (status === 400) {
        setErrorMsg(detail || '유효하지 않은 인증 정보입니다.');
      } else if (fallbackMember) {
        setDetectedMember(fallbackMember);
      } else {
        setErrorMsg('스마트 인증 처리 중 서버 통신 에러가 발생했습니다.');
      }
    } finally {
      setIsSearching(false);
    }
  }, []);

  const isSmartTagEnabled = activeAuthModes.includes('SMART_TAG');
  const isQrScanEnabled = activeAuthModes.includes('QR_SCAN');

  // 🛡️ E2E 테스트 및 외부 하드웨어 브릿지용 전역 헬퍼 및 이벤트 리스너 (BUG-M05)
  useEffect(() => {
    (window as any).__LM_TRIGGER_SMART_AUTH__ = (tokenOrUid: string) => handleSmartTagDetected(tokenOrUid);
    const handleCustomTagEvent = (e: any) => {
      if (!isSmartTagEnabled) return;
      const target =
        e.detail?.member_no ||
        e.detail?.token_or_uid ||
        e.detail?.tag_uid ||
        e.detail?.query ||
        e.detail?.hp;
      if (target) {
        handleSmartTagDetected(String(target));
      }
    };
    window.addEventListener('lm-nfc-tag', handleCustomTagEvent);
    return () => {
      delete (window as any).__LM_TRIGGER_SMART_AUTH__;
      window.removeEventListener('lm-nfc-tag', handleCustomTagEvent);
    };
  }, [handleSmartTagDetected, isSmartTagEnabled]);

  // 🛡️ 바코드/QR 하드웨어 스캐너 전역 자동 감지 (본인확인 모달 열림, 안면 매칭 완료 대기, 검색 중, 또는 QR 인증 비활성화 시 스캔 차단)
  useHardwareScanner({
    onScan: (scanned) => {
      console.log('[MemberAuth] Hardware QR/Barcode scanned:', scanned);
      handleSmartTagDetected(scanned);
    },
    enabled: isQrScanEnabled && !isSearching && !detectedMember && !faceMatchResult && duplicateCandidates.length === 0,
  });

  // 전화번호 키패드 입력 제어 핸들러
  const handleKeypadDigit = (digit: string) => {
    if (phoneDigits.length >= 11) return;
    setPhoneDigits(prev => prev + digit);
    setErrorMsg('');
  };

  const handleKeypadClear = () => {
    setPhoneDigits('');
    setErrorMsg('');
  };

  const handleKeypadBackspace = () => {
    setPhoneDigits(prev => prev.slice(0, -1));
    setErrorMsg('');
  };

  const handleKeypadSubmit = async () => {
    if (phoneDigits.length < 4) {
      setErrorMsg('휴대폰 번호 4자리 이상을 입력해 주세요.');
      return;
    }
    await handleSmartTagDetected(phoneDigits);
  };

  const formatHpDisplay = (raw: string) => {
    if (raw.length <= 3) return raw;
    if (raw.length <= 7) return `${raw.slice(0, 3)}-${raw.slice(3)}`;
    return `${raw.slice(0, 3)}-${raw.slice(3, 7)}-${raw.slice(7, 11)}`;
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

      if (member) {
        if (!member.masked_name && member.member_name) {
          member.masked_name = buildMaskedName(member.member_name);
        }
        setFaceMatchResult(member);
        setFaceScanning(false);
        // 🛡️ BUG-M06: 안면 인식 후에도 오인식/지나가는 행인 자동 결제 방지를 위해 2차 본인 확인 모달(detectedMember)을 거치도록 통일
        authTimeoutRef.current = setTimeout(() => {
          setFaceMatchResult(null);
          setDetectedMember(member);
        }, 700);
      } else {
        if (!newController.signal.aborted) {
          setErrorMsg('등록된 안면 정보가 없습니다. 스마트 태그 인증으로 진행해 주세요.');
          setFaceScanning(false);
        }
      }
    } catch {
      if (faceTimerRef.current) {
        clearInterval(faceTimerRef.current);
        faceTimerRef.current = null;
      }
      if (!newController.signal.aborted) {
        setErrorMsg('안면인식 장치 응답 지연이 발생했습니다.');
        setFaceScanning(false);
        if (onAuthError) {
          onAuthError('ERR_HARDWARE_TIMEOUT', '안면인식 스캔 모듈로부터 데이터를 수신하는 데 실패했습니다. 응답 타임아웃.');
        }
      }
    }
  }, [onAuthError]);

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
      className="premium-glass-card" 
      style={{
        width: isSubModal ? '720px' : '940px',
        height: isSubModal ? '900px' : '1120px',
        maxWidth: '100%',
        boxSizing: 'border-box',
        margin: '0 auto',
        padding: isSubModal ? '32px' : '40px',
        display: 'flex',
        flexDirection: 'column',
        gap: isSubModal ? '24px' : '30px',
      }}
    >
      {/* 타이틀 바 */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
          <User size={isSubModal ? 32 : 40} style={{ color: 'var(--neon-green)' }} />
          <h2 style={{ fontSize: isSubModal ? '28px' : '36px', fontWeight: 900, color: 'var(--text-primary)' }}>
            {`회원 인증 (${activeAuthModes.map((m) => AUTH_MODE_SHORT_LABELS[m]).join(' · ')})`}
          </h2>
        </div>
        <button 
          onClick={onCancel}
          style={{
            background: 'rgba(255,255,255,0.03)',
            border: '1px solid var(--glass-border)',
            color: 'var(--text-secondary)',
            padding: '10px 20px',
            borderRadius: '10px',
            cursor: 'pointer',
            fontSize: '16px',
            fontWeight: 700,
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
            transition: 'transform 0.1s ease'
          }}
          onMouseDown={(e) => e.currentTarget.style.transform = 'scale(0.95)'}
          onMouseUp={(e) => e.currentTarget.style.transform = 'scale(1)'}
          onMouseLeave={(e) => e.currentTarget.style.transform = 'scale(1)'}
        >
          <X size={18} />
          돌아가기
        </button>
      </div>

      {/* 인증 모드 전환 탭 (기기별 활성화된 인증 방식만 동적 노출) */}
      <div style={{ 
        display: 'grid', 
        gridTemplateColumns: `repeat(${activeAuthModes.length}, 1fr)`, 
        gap: '8px',
        background: 'rgba(0, 0, 0, 0.04)',
        padding: '6px',
        borderRadius: '20px'
      }}>
        {activeAuthModes.includes('SMART_TAG') && (
          <button
            onClick={() => { setAuthMode('SMART_TAG'); setErrorMsg(''); }}
            style={{
              padding: isSubModal ? '12px 8px' : '18px 10px',
              fontSize: isSubModal ? '15px' : '17px',
              fontWeight: 800,
              borderRadius: '14px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '8px',
              border: '0.5px solid',
              cursor: 'pointer',
              transition: 'all 0.2s cubic-bezier(0.4, 0, 0.2, 1)',
              color: authMode === 'SMART_TAG' ? 'var(--text-primary)' : 'var(--text-secondary)',
              background: authMode === 'SMART_TAG' ? '#ffffff' : 'transparent',
              borderColor: authMode === 'SMART_TAG' ? 'rgba(0, 0, 0, 0.05)' : 'transparent',
              boxShadow: authMode === 'SMART_TAG' ? '0 2px 10px rgba(0, 0, 0, 0.04)' : 'none',
            }}
          >
            <Smartphone size={20} style={{ color: authMode === 'SMART_TAG' ? '#059669' : 'inherit' }} />
            스마트폰 태그
          </button>
        )}

        {activeAuthModes.includes('PHONE_KEYPAD') && (
          <button
            onClick={() => { setAuthMode('PHONE_KEYPAD'); setErrorMsg(''); }}
            style={{
              padding: isSubModal ? '12px 8px' : '18px 10px',
              fontSize: isSubModal ? '15px' : '17px',
              fontWeight: 800,
              borderRadius: '14px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '8px',
              border: '0.5px solid',
              cursor: 'pointer',
              transition: 'all 0.2s cubic-bezier(0.4, 0, 0.2, 1)',
              color: authMode === 'PHONE_KEYPAD' ? 'var(--text-primary)' : 'var(--text-secondary)',
              background: authMode === 'PHONE_KEYPAD' ? '#ffffff' : 'transparent',
              borderColor: authMode === 'PHONE_KEYPAD' ? 'rgba(0, 0, 0, 0.05)' : 'transparent',
              boxShadow: authMode === 'PHONE_KEYPAD' ? '0 2px 10px rgba(0, 0, 0, 0.04)' : 'none',
            }}
          >
            <span style={{ fontSize: '18px' }}>🔢</span>
            전화번호 입력
          </button>
        )}

        {activeAuthModes.includes('QR_SCAN') && (
          <button
            onClick={() => { setAuthMode('QR_SCAN'); setErrorMsg(''); }}
            style={{
              padding: isSubModal ? '12px 8px' : '18px 10px',
              fontSize: isSubModal ? '15px' : '17px',
              fontWeight: 800,
              borderRadius: '14px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '8px',
              border: '0.5px solid',
              cursor: 'pointer',
              transition: 'all 0.2s cubic-bezier(0.4, 0, 0.2, 1)',
              color: authMode === 'QR_SCAN' ? 'var(--text-primary)' : 'var(--text-secondary)',
              background: authMode === 'QR_SCAN' ? '#ffffff' : 'transparent',
              borderColor: authMode === 'QR_SCAN' ? 'rgba(0, 0, 0, 0.05)' : 'transparent',
              boxShadow: authMode === 'QR_SCAN' ? '0 2px 10px rgba(0, 0, 0, 0.04)' : 'none',
            }}
          >
            <QrCode size={20} style={{ color: authMode === 'QR_SCAN' ? '#2563eb' : 'inherit' }} />
            출입 QR 스캔
          </button>
        )}

        {activeAuthModes.includes('FACE') && (
          <button
            onClick={() => { setAuthMode('FACE'); setErrorMsg(''); }}
            style={{
              padding: isSubModal ? '12px 8px' : '18px 10px',
              fontSize: isSubModal ? '15px' : '17px',
              fontWeight: 800,
              borderRadius: '14px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '8px',
              border: '0.5px solid',
              cursor: 'pointer',
              transition: 'all 0.2s cubic-bezier(0.4, 0, 0.2, 1)',
              color: authMode === 'FACE' ? 'var(--text-primary)' : 'var(--text-secondary)',
              background: authMode === 'FACE' ? '#ffffff' : 'transparent',
              borderColor: authMode === 'FACE' ? 'rgba(0, 0, 0, 0.05)' : 'transparent',
              boxShadow: authMode === 'FACE' ? '0 2px 10px rgba(0, 0, 0, 0.04)' : 'none',
            }}
          >
            <Camera size={20} style={{ color: authMode === 'FACE' ? '#7c3aed' : 'inherit' }} />
            안면 인식
          </button>
        )}
      </div>

      {/* 에러 메세지 */}
      {errorMsg && (
        <div 
          className="neon-border-red"
          style={{ 
            background: '#FEF2F2', 
            border: '1.5px solid rgba(239, 68, 68, 0.35)',
            padding: '16px', 
            borderRadius: '14px', 
            textAlign: 'center',
            color: '#DC2626',
            fontSize: '18px',
            fontWeight: 800
          }}
        >
          {errorMsg}
        </div>
      )}

      {/* 탭 콘텐츠 영역 (고정 높이 적용으로 탭 전환 시 높낮이/헤더 흔들림 완벽 방지) */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center', width: '100%' }}>
        {/* 0. 안면 인식 가상 카메라 패널 (프리미엄 리뉴얼) */}
        {authMode === 'FACE' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '30px', alignItems: 'center' }}>
          
          {/* 거대 스캐너 메인 뷰 (640x640 정방형, Apple Face ID + Sci-Fi 무드) */}
          <div 
            className="premium-glass-card"
            style={{
              width: isSubModal ? '440px' : '640px',
              height: isSubModal ? '440px' : '640px',
              background: 'radial-gradient(circle, rgba(20, 20, 24, 0.95) 0%, rgba(4, 5, 7, 0.98) 100%)',
              borderRadius: '40px',
              border: `2px solid ${faceMatchResult ? 'var(--neon-green)' : 'rgba(255, 255, 255, 0.05)'}`,
              position: 'relative',
              overflow: 'hidden',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              boxShadow: faceMatchResult 
                ? '0 0 40px rgba(52, 199, 89, 0.2), inset 0 0 80px rgba(52, 199, 89, 0.1)' 
                : '0 24px 60px rgba(0, 0, 0, 0.6), inset 0 0 40px rgba(0, 113, 227, 0.05)',
              transition: 'all 0.4s cubic-bezier(0.2, 0.8, 0.2, 1)'
            }}
          >
            {/* 4개의 사이버틱 코너 마커 */}
            {[
              { top: '30px', left: '30px', borderTop: '4px solid', borderLeft: '4px solid' },
              { top: '30px', right: '30px', borderTop: '4px solid', borderRight: '4px solid' },
              { bottom: '30px', left: '30px', borderBottom: '4px solid', borderLeft: '4px solid' },
              { bottom: '30px', right: '30px', borderBottom: '4px solid', borderRight: '4px solid' }
            ].map((pos, idx) => (
              <div 
                key={idx}
                style={{
                  position: 'absolute',
                  width: '60px',
                  height: '60px',
                  borderColor: faceMatchResult ? 'var(--neon-green)' : 'var(--neon-indigo)',
                  boxShadow: faceMatchResult ? '0 0 16px var(--neon-green-glow)' : 'none',
                  borderRadius: '12px',
                  opacity: faceScanning && !faceMatchResult ? 0.8 : 0.4,
                  transition: 'all 0.3s ease',
                  ...pos
                }}
              />
            ))}

            {/* 정중앙 스캔 가이드 & 카메라 아이콘 */}
            <div 
              style={{
                width: isSubModal ? '240px' : '320px',
                height: isSubModal ? '240px' : '320px',
                border: `2px dashed ${faceMatchResult ? 'transparent' : 'rgba(255,255,255,0.1)'}`,
                borderRadius: '50%',
                position: 'relative',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                transition: 'all 0.3s ease',
                zIndex: 2,
              }}
            >
              <Camera 
                size={72} 
                style={{ 
                  color: faceMatchResult ? 'var(--neon-green)' : (faceScanning ? 'var(--neon-indigo)' : 'var(--text-secondary)'),
                  filter: faceMatchResult ? 'drop-shadow(0 0 12px var(--neon-green))' : 'none',
                  transition: 'all 0.3s ease',
                  opacity: faceMatchResult ? 0 : 1 // 매칭 성공시 카메라 사라짐
                }} 
              />
              
              {/* 스캔 빔 애니메이션 (빛 번짐 레이저) */}
              {faceScanning && !faceMatchResult && (
                <div 
                  style={{
                    position: 'absolute',
                    width: '180%',
                    height: '4px',
                    background: 'linear-gradient(90deg, transparent, var(--neon-indigo), transparent)',
                    boxShadow: '0 0 20px 4px var(--neon-indigo-glow)',
                    top: '0%',
                    left: '-40%',
                    animation: 'face-scanner 2s infinite cubic-bezier(0.4, 0, 0.2, 1)',
                    opacity: 0.8
                  }}
                />
              )}
            </div>
            
            <p style={{ 
              marginTop: isSubModal ? '30px' : '40px', 
              fontSize: isSubModal ? '20px' : '24px', 
              color: faceMatchResult ? 'var(--neon-green)' : 'var(--text-secondary)', 
              fontWeight: 800,
              letterSpacing: '1px',
              zIndex: 2
            }}>
              {faceScanning && !faceMatchResult ? `단말기 정면을 응시해 주세요 (${faceCountdown}초)` : '정면을 응시해 주세요'}
            </p>

            {/* 매칭 결과 축하(Pop-up) 햅틱 레이어 */}
            {faceMatchResult && (
              <div 
                style={{
                  position: 'absolute',
                  top: 0,
                  left: 0,
                  width: '100%',
                  height: '100%',
                  background: 'radial-gradient(circle, rgba(16, 185, 129, 0.15) 0%, rgba(4, 5, 7, 0.95) 80%)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  flexDirection: 'column',
                  gap: '20px',
                  zIndex: 10,
                  animation: 'scaleIn 0.4s cubic-bezier(0.175, 0.885, 0.32, 1.275)'
                }}
              >
                <div style={{
                  width: '140px',
                  height: '140px',
                  background: 'var(--neon-green)',
                  borderRadius: '50%',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  boxShadow: '0 0 40px var(--neon-green-glow)'
                }}>
                  <Sparkles size={72} color="#ffffff" />
                </div>
                <h3 style={{ fontSize: '32px', fontWeight: 900, color: '#ffffff', marginTop: '10px' }}>
                  안면 매칭 성공!
                </h3>
                <p style={{ fontSize: '24px', color: 'var(--neon-green)', fontWeight: 700 }}>
                  {faceMatchResult.masked_name || faceMatchResult.member_name} 회원 ({faceMatchResult.member_no})
                </p>
                <p style={{ fontSize: '18px', color: 'var(--text-secondary)' }}>본인 확인 창으로 이동합니다...</p>
              </div>
            )}
          </div>

          {/* 재시도 버튼 */}
          {!faceScanning && !faceMatchResult && (
            <button
              onClick={triggerFaceScan}
              className="kiosk-btn kiosk-btn-primary"
              style={{
                width: isSubModal ? '440px' : '640px',
                height: isSubModal ? '70px' : '80px',
                borderRadius: '20px',
                fontSize: isSubModal ? '20px' : '24px',
                fontWeight: 800,
                display: 'flex',
                gap: '12px',
                background: 'rgba(0, 113, 227, 0.1)',
                color: 'var(--neon-indigo)',
                border: '1px solid rgba(0, 113, 227, 0.3)',
                boxShadow: 'none'
              }}
            >
              <Camera size={28} />
              다시 안면인식 시도
            </button>
          )}
        </div>
      )}

      {/* 1. 스마트폰 NFC / BLE 비접촉 태그 패널 (Apple Light Glass Theme) */}
      {authMode === 'SMART_TAG' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '24px', alignItems: 'center', padding: '10px 0', width: '100%' }}>
          {/* 비접촉 태그 메인 뷰 카드 (Apple Frosted Light Glass) */}
          <div 
            style={{
              width: isSubModal ? '480px' : '680px',
              height: isSubModal ? '340px' : '400px',
              background: 'linear-gradient(145deg, rgba(248, 250, 252, 0.95) 0%, rgba(241, 245, 249, 0.85) 100%)',
              borderRadius: '32px',
              border: '1.5px solid rgba(16, 185, 129, 0.3)',
              position: 'relative',
              overflow: 'hidden',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              boxShadow: '0 20px 40px rgba(16, 185, 129, 0.08), inset 0 1px 0 rgba(255, 255, 255, 1)',
              gap: '20px',
              padding: '30px'
            }}
          >
            {/* 애플 호흡(Breathe Glow) 파동 서클 (Light Green Theme) */}
            <div style={{ position: 'relative', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <div 
                style={{
                  width: '120px',
                  height: '120px',
                  borderRadius: '50%',
                  background: 'linear-gradient(135deg, rgba(16, 185, 129, 0.15), rgba(5, 150, 105, 0.05))',
                  border: '2px solid #10B981',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  boxShadow: '0 0 35px rgba(16, 185, 129, 0.25)',
                  animation: 'pulse 2.5s infinite ease-in-out'
                }}
              >
                <Smartphone size={56} style={{ color: '#059669', filter: 'drop-shadow(0 0 8px rgba(16,185,129,0.5))' }} />
              </div>
            </div>

            <div style={{ textAlign: 'center', display: 'flex', flexDirection: 'column', gap: '8px' }}>
              <h3 style={{ fontSize: '26px', fontWeight: 900, color: '#0F172A', letterSpacing: '-0.5px' }}>
                스마트폰을 대거나 <span style={{ color: '#059669', fontWeight: 900 }}>[스마트 체크인]</span>을 눌러주세요
              </h3>
              <div style={{ fontSize: '17px', color: '#334155', fontWeight: 600, lineHeight: 1.6, display: 'flex', flexDirection: 'column', gap: '4px' }}>
                <span>• <b>안드로이드</b>: 골포스 앱 실행 후 하단 리더기에 폰 탭 (NFC)</span>
                <span>• <b>아이폰</b>: 골포스 앱 실행 ➔ <b style={{ color: '#059669' }}>[스마트 체크인]</b> 터치 (BLE)</span>
              </div>
            </div>
          </div>

          {/* 테스트 및 시뮬레이션용 빠른 태그 도구 (개발 환경 전용 격리) */}
          {import.meta.env.DEV && (
            <div 
              style={{ 
                width: isSubModal ? '480px' : '680px', 
                padding: '16px 20px', 
                borderRadius: '20px',
                background: 'rgba(241, 245, 249, 0.9)',
                border: '1px solid #CBD5E1',
                boxShadow: '0 4px 12px rgba(0, 0, 0, 0.03)'
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
                <span style={{ fontSize: '13px', fontWeight: 900, color: '#475569', letterSpacing: '0.5px' }}>
                  DEBUG SIMULATOR
                </span>
                <span style={{ fontSize: '12px', color: '#059669', background: 'rgba(16, 185, 129, 0.15)', padding: '2px 10px', borderRadius: '12px', fontWeight: 800 }}>
                  DEV ONLY
                </span>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '10px' }}>
                <button 
                  onClick={() => handleSmartTagDetected('M260501', {
                    member_no: 'M260501',
                    member_name: '김골프',
                    masked_name: '김*프',
                    hp: '010-1234-5678',
                    email: 'golf@example.com',
                    member_grade: 'REGULAR',
                    status_cd: 'ACTIVE',
                    expiry_date: '2029-12-31',
                    remain_days: 999,
                    assets: [
                      {
                        member_item_id: '1',
                        item_name: '정기 타석 60분 회원권',
                        duration_min: 60,
                        expiry_date: '2029-12-31',
                        logic_type: 'PERIOD',
                        is_assignable: true
                      }
                    ]
                  })}
                  style={{ 
                    fontSize: '15px', 
                    fontWeight: 800,
                    padding: '12px', 
                    background: '#ffffff', 
                    border: '1.5px solid #CBD5E1',
                    borderRadius: '12px',
                    color: '#0F172A',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '8px',
                    boxShadow: '0 2px 4px rgba(0, 0, 0, 0.05)',
                    transition: 'all 0.15s ease'
                  }}
                >
                  <Smartphone size={18} color="#059669" /> 안드로이드 NFC (김골프)
                </button>
                <button 
                  onClick={() => handleSmartTagDetected('M260502', {
                    member_no: 'M260502',
                    member_name: '이프로',
                    masked_name: '이*로',
                    hp: '010-9876-5432',
                    email: 'pro@example.com',
                    member_grade: 'VIP',
                    status_cd: 'ACTIVE'
                  })}
                  style={{ 
                    fontSize: '15px', 
                    fontWeight: 800,
                    padding: '12px', 
                    background: '#ffffff', 
                    border: '1.5px solid #CBD5E1',
                    borderRadius: '12px',
                    color: '#0F172A',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '8px',
                    boxShadow: '0 2px 4px rgba(0, 0, 0, 0.05)',
                    transition: 'all 0.15s ease'
                  }}
                >
                  <Radio size={18} color="#059669" /> 아이폰 BLE (이프로)
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* 2. 전화번호 직접 입력 텐키 키패드 패널 */}
      {authMode === 'PHONE_KEYPAD' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '20px', alignItems: 'center', padding: '10px 0', width: '100%' }}>
          <div 
            style={{
              width: isSubModal ? '480px' : '560px',
              background: 'linear-gradient(145deg, rgba(248, 250, 252, 0.95) 0%, rgba(241, 245, 249, 0.85) 100%)',
              borderRadius: '28px',
              border: '1.5px solid rgba(16, 185, 129, 0.3)',
              padding: '24px 28px',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              boxShadow: '0 20px 40px rgba(16, 185, 129, 0.08), inset 0 1px 0 rgba(255, 255, 255, 1)',
              gap: '16px'
            }}
          >
            {/* 휴대폰 번호 디스플레이 창 */}
            <div style={{
              width: '100%',
              background: '#ffffff',
              borderRadius: '18px',
              border: '2px solid #10b981',
              padding: '16px 20px',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              boxShadow: 'inset 0 2px 4px rgba(0,0,0,0.04)'
            }}>
              <span style={{ fontSize: '15px', color: '#64748b', fontWeight: 700 }}>휴대폰 번호</span>
              <span style={{ fontSize: '28px', fontWeight: 900, color: '#0f172a', letterSpacing: '2px' }}>
                {phoneDigits ? formatHpDisplay(phoneDigits) : '010-____-____'}
              </span>
            </div>

            {/* 3x4 텐키 키패드 */}
            <div style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(3, 1fr)',
              gap: '10px',
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
                    height: '52px',
                    fontSize: k === 'C' || k === 'DEL' ? '18px' : '24px',
                    fontWeight: 800,
                    borderRadius: '14px',
                    border: '1px solid #cbd5e1',
                    background: k === 'C' ? '#fef2f2' : k === 'DEL' ? '#f1f5f9' : '#ffffff',
                    color: k === 'C' ? '#ef4444' : '#0f172a',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    boxShadow: '0 2px 4px rgba(0,0,0,0.04)',
                    transition: 'all 0.1s ease'
                  }}
                  onMouseDown={(e) => e.currentTarget.style.transform = 'scale(0.95)'}
                  onMouseUp={(e) => e.currentTarget.style.transform = 'scale(1)'}
                >
                  {k === 'DEL' ? <Delete size={22} /> : k}
                </button>
              ))}
            </div>

            {/* 회원 조회 확인 버튼 */}
            <button
              type="button"
              onClick={handleKeypadSubmit}
              disabled={isSearching || phoneDigits.length < 4}
              style={{
                width: '100%',
                height: '56px',
                borderRadius: '16px',
                background: phoneDigits.length >= 4 ? 'linear-gradient(135deg, #10b981 0%, #059669 100%)' : '#cbd5e1',
                color: '#ffffff',
                fontSize: '20px',
                fontWeight: 800,
                border: 'none',
                cursor: phoneDigits.length >= 4 ? 'pointer' : 'not-allowed',
                boxShadow: phoneDigits.length >= 4 ? '0 8px 20px rgba(16, 185, 129, 0.3)' : 'none',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '8px'
              }}
            >
              {isSearching ? '조회 중...' : '회원 조회하기'}
            </button>
          </div>

          {/* 테스트 및 시뮬레이션용 빠른 태그 도구 (개발 환경) */}
          {import.meta.env.DEV && (
            <div style={{ width: isSubModal ? '480px' : '560px', padding: '14px 18px', borderRadius: '18px', background: 'rgba(241, 245, 249, 0.9)', border: '1px solid #cbd5e1' }}>
              <span style={{ fontSize: '12px', fontWeight: 800, color: '#64748b' }}>SIMULATOR: </span>
              <button
                type="button"
                onClick={() => { setPhoneDigits('01012345678'); handleSmartTagDetected('010-1234-5678'); }}
                style={{ marginLeft: '8px', padding: '6px 14px', borderRadius: '8px', background: '#fff', border: '1px solid #cbd5e1', fontWeight: 800, cursor: 'pointer', fontSize: '13px' }}
              >
                010-1234-5678 즉시 입력 및 조회 (김골프)
              </button>
            </div>
          )}
        </div>
      )}

      {/* 3. 모바일 출입 QR / 바코드 스캐너 패널 */}
      {authMode === 'QR_SCAN' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '20px', alignItems: 'center', padding: '10px 0', width: '100%' }}>
          <div 
            style={{
              width: isSubModal ? '480px' : '560px',
              height: isSubModal ? '340px' : '380px',
              background: 'linear-gradient(145deg, rgba(248, 250, 252, 0.95) 0%, rgba(241, 245, 249, 0.85) 100%)',
              borderRadius: '28px',
              border: '1.5px solid rgba(37, 99, 235, 0.3)',
              padding: '24px',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              boxShadow: '0 20px 40px rgba(37, 99, 235, 0.08), inset 0 1px 0 rgba(255, 255, 255, 1)',
              gap: '18px',
              position: 'relative',
              overflow: 'hidden'
            }}
          >
            {/* 스캐너 가이드 프레임 */}
            <div style={{
              width: '160px',
              height: '160px',
              borderRadius: '24px',
              border: '3px dashed #2563eb',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              background: 'rgba(37, 99, 235, 0.04)',
              position: 'relative'
            }}>
              <QrCode size={80} style={{ color: '#2563eb', opacity: 0.8 }} />
              <div style={{
                position: 'absolute',
                top: '50%',
                left: '10%',
                right: '10%',
                height: '3px',
                background: '#ef4444',
                boxShadow: '0 0 12px #ef4444',
                animation: 'pulse 1.5s infinite'
              }} />
            </div>

            <div style={{ textAlign: 'center', display: 'flex', flexDirection: 'column', gap: '6px' }}>
              <h3 style={{ fontSize: '24px', fontWeight: 900, color: '#0f172a', margin: 0 }}>
                모바일 출입 QR을 스캐너에 비춰주세요
              </h3>
              <p style={{ fontSize: '15px', color: '#64748b', margin: 0, fontWeight: 500 }}>
                골포스 회원 전용 앱의 <b>[출입용 QR 티켓]</b> 또는 카카오톡 알림톡 QR을 하단 리더기에 인식시켜 주세요.
              </p>
            </div>
          </div>

          {/* 테스트 및 시뮬레이션용 빠른 태그 도구 (개발 환경) */}
          {import.meta.env.DEV && (
            <div style={{ width: isSubModal ? '480px' : '560px', padding: '14px 18px', borderRadius: '18px', background: 'rgba(241, 245, 249, 0.9)', border: '1px solid #cbd5e1' }}>
              <span style={{ fontSize: '12px', fontWeight: 800, color: '#64748b' }}>SIMULATOR: </span>
              <button
                type="button"
                onClick={() => handleSmartTagDetected('QR-M260501')}
                style={{ marginLeft: '8px', padding: '6px 14px', borderRadius: '8px', background: '#fff', border: '1px solid #cbd5e1', fontWeight: 800, cursor: 'pointer', fontSize: '13px' }}
              >
                <QrCode size={14} style={{ display: 'inline', marginRight: '4px', verticalAlign: 'middle' }} />
                출입 QR 스캔 시뮬레이션 (김골프)
              </button>
            </div>
          )}
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
              width: '540px',
              padding: '36px 32px',
              borderRadius: '28px',
              textAlign: 'center',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              gap: '20px',
              background: 'rgba(255, 255, 255, 0.96)',
              border: '1px solid rgba(255, 255, 255, 0.85)',
              boxShadow: '0 25px 60px rgba(0, 0, 0, 0.2)',
              animation: 'scaleIn 0.25s cubic-bezier(0.16, 1, 0.3, 1)'
            }}
          >
            <div>
              <h3 style={{ fontSize: '26px', fontWeight: 900, color: '#0F172A', marginBottom: '6px' }}>
                이용하실 회원님을 선택해 주세요
              </h3>
              <p style={{ fontSize: '16px', color: '#475569', fontWeight: 600 }}>
                동일 번호로 등록된 가족/다중 회원이 확인되었습니다.
              </p>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', width: '100%', maxHeight: '320px', overflowY: 'auto' }}>
              {duplicateCandidates.map((cand) => (
                <button
                  key={cand.member_no}
                  type="button"
                  onClick={() => {
                    setDuplicateCandidates([]);
                    handleSmartTagDetected(cand.member_no, cand);
                  }}
                  style={{
                    width: '100%',
                    padding: '16px 20px',
                    borderRadius: '16px',
                    border: '1.5px solid #10B981',
                    background: '#F8FAFC',
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    cursor: 'pointer',
                    fontSize: '18px',
                    fontWeight: 800,
                    color: '#0F172A'
                  }}
                >
                  <span>
                    <strong style={{ color: '#059669' }}>[{cand.masked_name || buildMaskedName(cand.member_name)}]</strong> 회원님
                  </span>
                  <span style={{ fontSize: '14px', color: '#64748B', fontWeight: 700 }}>
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
                height: '52px',
                borderRadius: '14px',
                fontSize: '16px',
                fontWeight: 700,
                background: '#F1F5F9',
                color: '#475569',
                border: '1px solid #CBD5E1',
                cursor: 'pointer'
              }}
            >
              닫기
            </button>
          </div>
        </div>,
        document.body
      )}

      {/* 3번 방어선: 1초 회원 이름 확인 팝업 모달 (Apple Light System Dialog Portal) */}
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
            background: 'rgba(15, 23, 42, 0.45)',
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
              width: '520px',
              padding: '40px 32px',
              borderRadius: '28px',
              textAlign: 'center',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              gap: '22px',
              background: 'rgba(255, 255, 255, 0.94)',
              border: '1px solid rgba(255, 255, 255, 0.8)',
              boxShadow: '0 25px 60px rgba(0, 0, 0, 0.18), 0 4px 16px rgba(0, 0, 0, 0.06), inset 0 1px 0 rgba(255, 255, 255, 1)',
              animation: 'scaleIn 0.3s cubic-bezier(0.16, 1, 0.3, 1)'
            }}
          >
            {/* Apple Pay 성공 뱃지 스타일 서클 */}
            <div 
              style={{ 
                width: '76px', 
                height: '76px', 
                borderRadius: '50%', 
                background: 'linear-gradient(135deg, #10B981 0%, #059669 100%)',
                display: 'flex', 
                alignItems: 'center', 
                justifyContent: 'center',
                boxShadow: '0 10px 25px rgba(16, 185, 129, 0.35)'
              }}
            >
              <Sparkles size={40} style={{ color: '#ffffff' }} />
            </div>

            <div>
              <h3 style={{ fontSize: '32px', fontWeight: 900, color: '#0F172A', marginBottom: '8px', letterSpacing: '-0.5px' }}>
                <span style={{ color: '#059669', fontWeight: 900 }}>
                  [{detectedMember.masked_name || detectedMember.member_name}]
                </span> 회원님
              </h3>
              <p style={{ fontSize: '19px', color: '#475569', fontWeight: 600 }}>
                본인이 맞으신가요?
              </p>
              {/* 회원 보유 이용권/등급 요약 안내 뱃지 (BUG-M01, BUG-M11) */}
              <div
                style={{
                  marginTop: '12px',
                  padding: '8px 16px',
                  borderRadius: '12px',
                  background: '#F0FDF4',
                  border: '1px solid #BBF7D0',
                  color: '#065F46',
                  fontSize: '14px',
                  fontWeight: 700,
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
                  if ((detectedMember as any).item_name) {
                    return (detectedMember as any).item_name;
                  }
                  return `회원번호 ${detectedMember.member_no} · 일일권/상품 이용 가능`;
                })()}
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1.2fr', gap: '12px', width: '100%', marginTop: '6px' }}>
              <button
                onClick={() => setDetectedMember(null)}
                style={{
                  height: '56px',
                  borderRadius: '16px',
                  fontSize: '17px',
                  fontWeight: 700,
                  background: '#F1F5F9',
                  color: '#475569',
                  border: '1px solid #CBD5E1',
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
                  setDetectedMember(null);
                  onAuthSuccess(target);
                }}
                style={{
                  height: '56px',
                  borderRadius: '16px',
                  fontSize: '19px',
                  fontWeight: 800,
                  background: 'linear-gradient(135deg, #10B981 0%, #059669 100%)',
                  color: '#ffffff',
                  border: 'none',
                  boxShadow: '0 8px 20px rgba(16, 185, 129, 0.35)',
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

      {/* 신규 즉석 회원가입 유도 영역 */}
      {isSignUpAllowed && onSignUpClick && (
        <div 
          className="glass-panel" 
          style={{ 
            marginTop: '20px', 
            padding: '24px', 
            borderRadius: '16px', 
            display: 'flex', 
            justifyContent: 'space-between', 
            alignItems: 'center',
            border: '1.5px dashed rgba(16, 185, 129, 0.35)',
            background: 'rgba(16, 185, 129, 0.04)'
          }}
        >
          <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
            <span style={{ fontSize: '18px', fontWeight: 800, color: '#0F172A' }}>아직 회원이 아니신가요?</span>
            <p style={{ fontSize: '14px', color: '#475569', fontWeight: 600 }}>
              골포스 앱을 다운로드 받아 스마트 체크인을 이용해보세요.
            </p>
          </div>
          <button
            onClick={onSignUpClick}
            className="kiosk-btn kiosk-btn-success animate-pulse-glow"
            style={{ 
              height: '56px', 
              fontSize: '18px', 
              fontWeight: 800, 
              padding: '0 30px', 
              borderRadius: '10px'
            }}
          >
            30초 신규 회원가입
          </button>
        </div>
      )}
    </div>
  );
};
