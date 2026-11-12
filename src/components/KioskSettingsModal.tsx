import React, { useState, useEffect, useMemo, useRef } from 'react';
import { Settings, X, Monitor, Wifi, Shield, Zap, Loader2, CheckCircle2, AlertTriangle, LayoutGrid, RotateCcw, Star } from 'lucide-react';
import {
  useKioskSettings,
  KioskSettings,
  KioskAuthModeKey,
  KioskTopDashboardMode,
  KioskAuthMethodsConfig,
  KioskMenuVisibilityMap,
  DEFAULT_AUTH_METHODS,
  canonicalizeKioskMenuId,
  isKioskMenuEnabled,
  normalizeVanProviderType,
  resolveDefaultVanPort,
  resolveVanStatusEndpointPath,
  clearKioskAdminSession,
  bootstrapLocalKioskSettings,
  saveKioskSettings,
} from '../stores/kioskSettings';
import { api, type KioskMenuConfig } from '../services/api';
import { kioskVanClient } from '../services/van/van_client';
import { normalizeVanProvider } from '../services/van/van_types';
import { VirtualKeyboard, type VirtualKeyboardMode } from './VirtualKeyboard';

interface KioskSettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  kioskMenuConfigs?: KioskMenuConfig[];
  checkinPolicy?: string;
  faceTerminalEnabled?: boolean;
}

interface TerminalDeviceItem {
  device_id: string;
  device_name: string;
  device_type: string;
  van_provider: string;
  terminal_id: string;
  vcat_port: number;
}

const STANDARD_KIOSK_MENUS = [
  { id: 'CHECKIN', label: '예약 타석 체크인', desc: '사전 예약 본인인증 및 체크인', emoji: '📌' },
  { id: 'ALLOCATE_DAILY', label: '연습타석 배정', desc: '회원권/일일권 연습타석 배정', emoji: '🎯' },
  { id: 'PAR3', label: '파3 코스 배정', desc: '야외 파3 라운딩 티오프 예약', emoji: '⛳' },
  { id: 'PURCHASE_PRODUCT', label: '회원권/상품 구매', desc: '기간권·횟수권·일일권 구매', emoji: '🛍️' },
  { id: 'LOCKER', label: '라카 대여/연장', desc: '개인 사물함 기간 연장 결제', emoji: '🔑' },
  { id: 'MOVE_BAY', label: '타석 이동', desc: '이용 중인 타석 위치 변경', emoji: '🔄' },
  { id: 'SIGNUP', label: '신규 회원가입', desc: '30초 즉석 회원가입 배너/버튼', emoji: '👤' },
];

const AUTH_METHOD_ITEMS: { key: KioskAuthModeKey; label: string; desc: string; emoji: string }[] = [
  { key: 'SMART_TAG', label: '앱 스마트 체크인', desc: '골포스 모바일 앱 스마트 체크인 무선 연동', emoji: '📱' },
  { key: 'PHONE_KEYPAD', label: '전화번호 입력 (키패드)', desc: '휴대폰 번호 8자리(010 자동 고정) 키패드 조회', emoji: '🔢' },
  { key: 'QR_SCAN', label: '출입 QR / 바코드 스캔', desc: '하드웨어 리더기로 모바일/알림톡 QR 인식', emoji: '📷' },
  { key: 'FACE', label: 'AI 안면 인식 (카메라)', desc: '전면 카메라 비접촉 안면 인증 및 등록', emoji: '🙂' },
];

const FALLBACK_KIOSK_OPTIONS: TerminalDeviceItem[] = [
  { device_id: 'DEV_KIOSK_01', device_name: '입구 무인 키오스크 1호기', terminal_id: '88010003', vcat_port: 8089, van_provider: 'SMARTRO', device_type: 'KIOSK' },
  { device_id: 'DEV_KIOSK_02', device_name: '2층 무인 키오스크 2호기', terminal_id: '88010004', vcat_port: 9099, van_provider: 'KCP', device_type: 'KIOSK' },
  { device_id: 'custom', device_name: '⚙️ 직접 입력 (커스텀 설정)', terminal_id: '', vcat_port: 9099, van_provider: 'KCP', device_type: 'KIOSK' },
];

export const KioskSettingsModal: React.FC<KioskSettingsModalProps> = ({
  isOpen,
  onClose,
  kioskMenuConfigs = [],
  checkinPolicy = 'CHECKIN_REQUIRED',
  faceTerminalEnabled = true,
}) => {
  const { settings, updateSettings } = useKioskSettings();

  const [activeTab, setActiveTab] = useState<'device' | 'menus' | 'connection' | 'maintenance'>('device');
  const [terminalList, setTerminalList] = useState<TerminalDeviceItem[]>(FALLBACK_KIOSK_OPTIONS);
  const [formDeviceId, setFormDeviceId] = useState(settings.deviceId);
  const [formDeviceName, setFormDeviceName] = useState(settings.deviceName);
  const [formProviderType, setFormProviderType] = useState(normalizeVanProviderType(settings.providerType));
  const [formTerminalId, setFormTerminalId] = useState(settings.terminalId);
  const [formVcatPort, setFormVcatPort] = useState(settings.vcatPort);

  const [formApiUrl, setFormApiUrl] = useState(settings.apiUrl);
  const [formStoreCode, setFormStoreCode] = useState(settings.storeCode);
  const [formDeviceKey, setFormDeviceKey] = useState(settings.deviceKey);

  // 보안 정책: 기존 PIN 평문 노출 및 실수로 초기화되는 사고 방지를 위해 입력란은 빈 문자열로 시작 (변경 시에만 4자리 입력)
  const [formAdminPin, setFormAdminPin] = useState('');
  const [formIsMaintenance, setFormIsMaintenance] = useState(settings.isMaintenanceMode);

  const [formMenuOverrides, setFormMenuOverrides] = useState<KioskMenuVisibilityMap>(settings.menuOverrides || {});
  const [formAuthMethods, setFormAuthMethods] = useState<KioskAuthMethodsConfig>({
    ...DEFAULT_AUTH_METHODS,
    ...(settings.authMethods || {}),
  });
  const [formDefaultAuthMode, setFormDefaultAuthMode] = useState<KioskAuthModeKey>(
    settings.defaultAuthMode || 'SMART_TAG'
  );
  const [formMinGapMinutes, setFormMinGapMinutes] = useState<number>(
    settings.minGapMinutes ?? 60
  );
  const [formTopDashboardMode, setFormTopDashboardMode] = useState<KioskTopDashboardMode>(
    settings.topDashboardMode || 'AUTO'
  );
  const [formQrCouponOnlyMode, setFormQrCouponOnlyMode] = useState<boolean>(
    settings.qrCouponOnlyMode !== false
  );
  const [policyGuardMsg, setPolicyGuardMsg] = useState<string | null>(null);

  const [isPinging, setIsPinging] = useState(false);
  const [pingStatus, setPingStatus] = useState<string | null>(null);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [activeKeyboardField, setActiveKeyboardField] = useState<
    'terminalId' | 'vcatPort' | 'apiUrl' | 'storeCode' | 'deviceKey' | 'adminPin' | null
  >(null);
  const [isBootstrapping, setIsBootstrapping] = useState(false);
  const [bootstrapMsg, setBootstrapMsg] = useState<string | null>(null);
  const [confirmExitKiosk, setConfirmExitKiosk] = useState(false);
  const [isControllingApp, setIsControllingApp] = useState(false);
  const [appControlStatus, setAppControlStatus] = useState<string | null>(null);
  const wasOpenRef = useRef<boolean>(false);
  const saveCloseTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (saveCloseTimerRef.current) {
        clearTimeout(saveCloseTimerRef.current);
        saveCloseTimerRef.current = null;
      }
    };
  }, []);

  const configurableMenus = useMemo(() => {
    const builtinCanonicalSet = new Set(STANDARD_KIOSK_MENUS.map((m) => m.id));
    const customMenus = (kioskMenuConfigs || [])
      .filter((m) => Boolean(m?.menu_id && !builtinCanonicalSet.has(canonicalizeKioskMenuId(m.menu_id))))
      .map((m) => ({
        id: String(m.menu_id),
        label: m.menu_name || String(m.menu_id),
        desc: m.description || '파트너센터 커스텀 메뉴',
        emoji: '✨',
      }));
    return [...STANDARD_KIOSK_MENUS, ...customMenus];
  }, [kioskMenuConfigs]);

  const getPartnerMenuDefault = (menuId: string): boolean => {
    const canonical = canonicalizeKioskMenuId(menuId);
    if (canonical === 'CHECKIN' && checkinPolicy === 'DISABLED') {
      return false;
    }
    if (kioskMenuConfigs && kioskMenuConfigs.length > 0) {
      const matched = kioskMenuConfigs.find(
        (m) => canonicalizeKioskMenuId(m.menu_id) === canonical || m.menu_id === menuId
      );
      if (matched) {
        return matched.is_active !== false;
      }
    }
    return true;
  };

  // 모달이 닫힘 -> 열림(false -> true) 전환될 때만 폼을 초기화하여,
  // 10초 주기 백그라운드 설정 폴링이나 자동 불러오기 저장 시 입력 중인 값·가상키보드·안내문구가 초기화되지 않도록 보호
  useEffect(() => {
    if (isOpen && !wasOpenRef.current) {
      wasOpenRef.current = true;
      setFormDeviceId(settings.deviceId);
      setFormDeviceName(settings.deviceName);
      setFormProviderType(normalizeVanProviderType(settings.providerType));
      setFormTerminalId(settings.terminalId);
      setFormVcatPort(settings.vcatPort);
      setFormApiUrl(settings.apiUrl);
      setFormStoreCode(settings.storeCode);
      setFormDeviceKey(settings.deviceKey);
      setFormAdminPin('');
      setFormIsMaintenance(settings.isMaintenanceMode);
      setFormMenuOverrides(settings.menuOverrides || {});
      setFormAuthMethods({
        ...DEFAULT_AUTH_METHODS,
        ...(settings.authMethods || {}),
      });
      setFormDefaultAuthMode(settings.defaultAuthMode || 'SMART_TAG');
      setFormMinGapMinutes(settings.minGapMinutes ?? 60);
      setFormTopDashboardMode(settings.topDashboardMode || 'AUTO');
      setFormQrCouponOnlyMode(settings.qrCouponOnlyMode !== false);
      setPolicyGuardMsg(null);
      setPingStatus(null);
      setSaveSuccess(false);
      setActiveKeyboardField(null);
      setBootstrapMsg(null);
      setConfirmExitKiosk(false);
      setIsControllingApp(false);
      setAppControlStatus(null);

      // 백엔드 실시간 단말기 마스터 조회
      const fetchTerminals = async () => {
        try {
          const terminalClient: {
            getKioskTerminals?: () => Promise<TerminalDeviceItem[] | { data?: TerminalDeviceItem[] }>;
            get?: <T = TerminalDeviceItem[]>(endpoint: string) => Promise<{ data: T }>;
          } = api;
          const res = typeof terminalClient.getKioskTerminals === 'function'
            ? await terminalClient.getKioskTerminals().catch(() => null)
            : typeof terminalClient.get === 'function'
              ? await terminalClient.get<TerminalDeviceItem[]>('/v1/terminals').catch(() => null)
              : null;
          const list = Array.isArray(res) ? res : (res?.data && Array.isArray(res.data) ? res.data : null);
          if (list && list.length > 0) {
            const customOpt: TerminalDeviceItem = {
              device_id: 'custom',
              device_name: '⚙️ 직접 입력 (커스텀 설정)',
              terminal_id: '',
              vcat_port: 9099,
              van_provider: 'KCP_VAN',
              device_type: 'KIOSK',
            };
            setTerminalList([...list, customOpt]);
          }
        } catch {
          setTerminalList(FALLBACK_KIOSK_OPTIONS);
        }
      };
      fetchTerminals();
    } else if (!isOpen) {
      wasOpenRef.current = false;
    }
  }, [isOpen, settings]);

  // 도킹 화상키보드 열림 시 가로형 모니터 등 낮은 뷰포트에서도 활성 입력창이 가려지지 않도록 중앙 스크롤 보장
  useEffect(() => {
    if (!isOpen || !activeKeyboardField || typeof document === 'undefined') return;
    const timer = window.setTimeout(() => {
      const targetEl = document.querySelector(
        `[data-testid="settings-input-${activeKeyboardField}"]`
      ) as HTMLElement | null;
      if (targetEl && typeof targetEl.scrollIntoView === 'function') {
        targetEl.scrollIntoView({ block: 'center', behavior: 'smooth' });
      }
    }, 60);
    return () => window.clearTimeout(timer);
  }, [isOpen, activeKeyboardField]);

  // 🛡️ 관리자 설정창 열림 상태에서 현장 담당자 이탈 방치 시 180초(3분) 무조작 자동 닫힘 가드
  useEffect(() => {
    if (!isOpen) return;
    const SETTINGS_IDLE_CLOSE_MS = 180000;
    let idleTimer: ReturnType<typeof setTimeout> | null = null;
    const resetIdle = () => {
      if (idleTimer) clearTimeout(idleTimer);
      idleTimer = setTimeout(() => {
        clearKioskAdminSession();
        onClose();
      }, SETTINGS_IDLE_CLOSE_MS);
    };
    resetIdle();
    const events = ['click', 'touchstart', 'keydown', 'input', 'change', 'wheel'];
    events.forEach((ev) => window.addEventListener(ev, resetIdle));
    return () => {
      if (idleTimer) clearTimeout(idleTimer);
      events.forEach((ev) => window.removeEventListener(ev, resetIdle));
    };
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const handleToggleMenu = (menuId: string) => {
    setPolicyGuardMsg(null);
    const partnerDefault = getPartnerMenuDefault(menuId);
    const currentEnabled = isKioskMenuEnabled(menuId, formMenuOverrides, partnerDefault);
    const nextEnabled = !currentEnabled;

    if (!nextEnabled) {
      const enabledCount = configurableMenus.filter((m) =>
        isKioskMenuEnabled(m.id, formMenuOverrides, getPartnerMenuDefault(m.id))
      ).length;
      if (enabledCount <= 1) {
        setPolicyGuardMsg('최소 1개 이상의 메뉴는 활성화(ON)되어 있어야 합니다.');
        return;
      }
    }

    setFormMenuOverrides((prev) => ({
      ...prev,
      [menuId]: nextEnabled,
    }));
  };

  const handleResetMenuOverrides = () => {
    setPolicyGuardMsg(null);
    setFormMenuOverrides({});
  };

  const handleToggleAuthMethod = (key: KioskAuthModeKey) => {
    setPolicyGuardMsg(null);
    const currentEnabled = formAuthMethods[key] !== false;
    const nextEnabled = !currentEnabled;

    if (!nextEnabled) {
      const activeKeys = (['SMART_TAG', 'PHONE_KEYPAD', 'QR_SCAN', 'FACE'] as KioskAuthModeKey[]).filter(
        (k) => (k === key ? false : formAuthMethods[k] !== false && (k !== 'FACE' || faceTerminalEnabled !== false))
      );
      if (activeKeys.length === 0) {
        setPolicyGuardMsg('최소 1개 이상의 회원인증 방식은 활성화(ON)되어 있어야 합니다.');
        return;
      }
      if (formDefaultAuthMode === key) {
        setFormDefaultAuthMode(activeKeys[0]);
      }
    }

    setFormAuthMethods((prev) => ({
      ...prev,
      [key]: nextEnabled,
    }));
  };

  const handleDeviceSelect = (devId: string) => {
    const matched = terminalList.find((d) => d.device_id === devId);
    if (matched) {
      setFormDeviceId(matched.device_id);
      setFormDeviceName(matched.device_name);
      if (matched.device_id !== 'custom') {
        const nextProv = normalizeVanProviderType(matched.van_provider);
        setFormTerminalId(matched.terminal_id);
        setFormVcatPort(String(matched.vcat_port || resolveDefaultVanPort(nextProv)));
        setFormProviderType(nextProv);
      }
    }
  };

  const handlePingVcat = async () => {
    setIsPinging(true);
    setPingStatus(null);
    const statusPath = resolveVanStatusEndpointPath(formProviderType);
    try {
      const res = await fetch(`http://127.0.0.1:${formVcatPort}${statusPath}`, {
        signal: AbortSignal.timeout(3000),
      });
      if (!res.ok) {
        throw new Error(`HTTP ${res.status}`);
      }
      setPingStatus(`[${formDeviceName}] VAN 데몬(${formVcatPort}${statusPath}) 통신 정상 확인!`);
    } catch {
      setPingStatus(`VAN 데몬(${formVcatPort}${statusPath}) 응답 없음. 포트와 프로그램을 확인해주세요.`);
    } finally {
      setIsPinging(false);
    }
  };

  const handleSave = () => {
    const trimmedNewPin = formAdminPin.trim();
    if (trimmedNewPin.length > 0 && !/^\d{4}$/.test(trimmedNewPin)) {
      setActiveTab('maintenance');
      setPolicyGuardMsg('관리자 PIN 번호를 변경하려면 숫자 4자리를 모두 입력해 주세요. (유지 시 비워두기)');
      return;
    }

    const cleanStoreCd = formStoreCode.trim();
    const cleanDeviceId = formDeviceId.trim();
    const rawTerminalId = formTerminalId.trim();
    const cleanTerminalId = rawTerminalId === 'custom' ? '88010003' : (rawTerminalId || '88010003');
    const cleanVcatPort = formVcatPort.trim();
    const normalizedProvider = normalizeVanProviderType(formProviderType);

    const updated: Partial<KioskSettings> = {
      deviceId: cleanDeviceId,
      deviceName: formDeviceName,
      providerType: normalizedProvider,
      terminalId: cleanTerminalId,
      vcatPort: cleanVcatPort,
      apiUrl: formApiUrl.trim(),
      storeCode: cleanStoreCd,
      deviceKey: formDeviceKey.trim(),
      isMaintenanceMode: formIsMaintenance,
      menuOverrides: formMenuOverrides,
      authMethods: formAuthMethods,
      defaultAuthMode: formDefaultAuthMode,
      minGapMinutes: formMinGapMinutes,
      topDashboardMode: formTopDashboardMode,
      qrCouponOnlyMode: formQrCouponOnlyMode,
    };

    try {
      if (cleanStoreCd) localStorage.setItem('LM_STORE_CD', cleanStoreCd);
      if (cleanDeviceId) localStorage.setItem('LM_KIOSK_DEVICE_ID', cleanDeviceId);
      if (cleanTerminalId) localStorage.setItem('LM_KIOSK_TERMINAL_ID', cleanTerminalId);
    } catch (e) {
      console.warn('[KioskSettingsModal] Failed to sync localStorage keys:', e);
    }

    kioskVanClient.setConfig({
      provider: normalizeVanProvider(normalizedProvider),
      providerType: normalizedProvider,
      vcatPort: Number(cleanVcatPort) || 9099,
      terminalId: cleanTerminalId,
    });

    updateSettings(updated, {
      syncRemote: true,
      newAdminPin: trimmedNewPin.length === 4 ? trimmedNewPin : undefined,
    });
    setSaveSuccess(true);
    if (saveCloseTimerRef.current) {
      clearTimeout(saveCloseTimerRef.current);
    }
    saveCloseTimerRef.current = setTimeout(() => {
      saveCloseTimerRef.current = null;
      clearKioskAdminSession();
      onClose();
    }, 600);
  };

  return (
    <div
      data-testid="kiosk-settings-overlay"
      style={{
        position: 'fixed',
        inset: 0,
        backgroundColor: 'rgba(15, 23, 42, 0.55)',
        backdropFilter: 'blur(16px)',
        WebkitBackdropFilter: 'blur(16px)',
        zIndex: 100005,
        display: 'flex',
        alignItems: 'flex-start',
        justifyContent: 'center',
        paddingTop: '9vh',
        paddingLeft: '24px',
        paddingRight: '24px',
        paddingBottom: '24px',
        boxSizing: 'border-box',
      }}
    >
      <div
        data-testid="kiosk-settings-modal-card"
        style={{
          width: '680px',
          maxWidth: '94vw',
          maxHeight: '82vh',
          background: '#ffffff',
          borderRadius: '28px',
          border: '1px solid #e2e8f0',
          boxShadow: '0 24px 60px rgba(15, 23, 42, 0.18), 0 4px 16px rgba(15, 23, 42, 0.06)',
          overflow: 'hidden',
          display: 'flex',
          flexDirection: 'column',
          color: '#0f172a',
          fontFamily: 'Pretendard, -apple-system, BlinkMacSystemFont, system-ui, Roboto, sans-serif',
          boxSizing: 'border-box',
        }}
      >
        {/* Header (Fixed Top) */}
        <div
          data-testid="kiosk-settings-header"
          style={{
            flexShrink: 0,
            padding: '22px 28px',
            background: '#f8fafc',
            borderBottom: '1px solid #e2e8f0',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <div
              style={{
                padding: '10px',
                background: '#ecfdf5',
                border: '1px solid #a7f3d0',
                borderRadius: '14px',
                color: '#059669',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <Settings size={22} />
            </div>
            <div>
              <h2 style={{ fontSize: '20px', fontWeight: 800, color: '#0f172a', margin: 0, letterSpacing: '-0.5px' }}>
                무인 키오스크 시스템 설정
              </h2>
              <p style={{ fontSize: '12.5px', color: '#64748b', margin: '3px 0 0 0', fontWeight: 500 }}>
                단말기(TID), 기기별 노출 메뉴 및 회원인증 방식을 설정합니다.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => {
              clearKioskAdminSession();
              onClose();
            }}
            style={{
              background: '#ffffff',
              border: '1px solid #cbd5e1',
              borderRadius: '50%',
              width: '38px',
              height: '38px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: '#475569',
              cursor: 'pointer',
              boxShadow: '0 1px 2px rgba(15, 23, 42, 0.05)',
            }}
          >
            <X size={18} />
          </button>
        </div>

        {/* Tab Navigation (Fixed Top - Never shifts vertically on tab change) */}
        <div
          data-testid="kiosk-settings-tabbar"
          style={{
            flexShrink: 0,
            padding: '10px 20px',
            background: '#f1f5f9',
            borderBottom: '1px solid #e2e8f0',
            display: 'grid',
            gridTemplateColumns: 'repeat(4, 1fr)',
            gap: '8px',
          }}
        >
          {([
            { key: 'device', label: '기기 식별 & 단말기', icon: <Monitor size={15} /> },
            { key: 'menus', label: '메뉴 & 인증 설정', icon: <LayoutGrid size={15} /> },
            { key: 'connection', label: '서버 / 연결 설정', icon: <Wifi size={15} /> },
            { key: 'maintenance', label: '운영 모드 & PIN', icon: <Shield size={15} /> },
          ] as const).map((tab) => {
            const isTabActive = activeTab === tab.key;
            return (
              <button
                key={tab.key}
                type="button"
                data-testid={`settings-tab-${tab.key}`}
                onClick={() => {
                  setActiveKeyboardField(null);
                  setActiveTab(tab.key);
                }}
                style={{
                  padding: '11px 8px',
                  fontSize: '13px',
                  fontWeight: 800,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '6px',
                  borderRadius: '12px',
                  border: isTabActive ? '1px solid #cbd5e1' : '1px solid transparent',
                  background: isTabActive ? '#ffffff' : 'transparent',
                  color: isTabActive ? '#059669' : '#64748b',
                  boxShadow: isTabActive ? '0 2px 8px rgba(15, 23, 42, 0.06)' : 'none',
                  cursor: 'pointer',
                  transition: 'all 0.15s ease',
                }}
              >
                {tab.icon}
                {tab.label}
              </button>
            );
          })}
        </div>

        {/* Tab Body (Scrollable / Expands Downwards Only) */}
        <div
          data-testid="kiosk-settings-body"
          style={{
            flex: 1,
            padding: '24px 28px',
            overflowY: 'auto',
            background: '#ffffff',
            boxSizing: 'border-box',
          }}
        >
          {/* Tab 1: Device */}
          {activeTab === 'device' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '18px' }}>
              <div
                style={{
                  background: '#f8fafc',
                  border: '1px solid #e2e8f0',
                  borderRadius: '16px',
                  padding: '18px',
                }}
              >
                <label style={{ display: 'block', fontSize: '13px', fontWeight: 800, color: '#1e293b', marginBottom: '8px' }}>
                  현재 키오스크 기기 지정
                </label>
                <select
                  value={formDeviceId}
                  onChange={(e) => handleDeviceSelect(e.target.value)}
                  style={{
                    width: '100%',
                    background: '#ffffff',
                    border: '1px solid #cbd5e1',
                    borderRadius: '12px',
                    padding: '12px 14px',
                    color: '#0f172a',
                    fontSize: '14px',
                    fontWeight: 700,
                    outline: 'none',
                    boxSizing: 'border-box',
                    cursor: 'pointer',
                  }}
                >
                  {terminalList.map((opt) => (
                    <option key={opt.device_id} value={opt.device_id} style={{ background: '#ffffff', color: '#0f172a' }}>
                      {opt.device_name} {opt.terminal_id ? `(TID: ${opt.terminal_id} / ${opt.van_provider})` : ''}
                    </option>
                  ))}
                </select>
                <p style={{ fontSize: '12px', color: '#047857', fontWeight: 600, margin: '8px 0 0 0' }}>
                  * 선택 시 파트너센터에 등록된 단말기 번호(TID)가 자동 바인딩됩니다.
                </p>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px' }}>
                <div
                  style={{
                    background: '#f8fafc',
                    border: '1px solid #e2e8f0',
                    borderRadius: '16px',
                    padding: '16px',
                  }}
                >
                  <label style={{ display: 'block', fontSize: '13px', fontWeight: 800, color: '#1e293b', marginBottom: '8px' }}>
                    연동 단말기 번호 (TID)*
                  </label>
                  <input
                    type="text"
                    data-testid="settings-input-terminalId"
                    value={formTerminalId}
                    onFocus={() => setActiveKeyboardField('terminalId')}
                    onClick={() => setActiveKeyboardField('terminalId')}
                    onChange={(e) => setFormTerminalId(e.target.value)}
                    placeholder="예: 88010003"
                    style={{
                      width: '100%',
                      background: '#ffffff',
                      border: activeKeyboardField === 'terminalId' ? '2px solid #059669' : '1px solid #cbd5e1',
                      borderRadius: '12px',
                      padding: '12px 14px',
                      color: '#0f172a',
                      fontFamily: 'monospace',
                      fontSize: '14px',
                      fontWeight: 700,
                      outline: 'none',
                      boxSizing: 'border-box',
                    }}
                  />
                </div>
                <div
                  style={{
                    background: '#f8fafc',
                    border: '1px solid #e2e8f0',
                    borderRadius: '16px',
                    padding: '16px',
                  }}
                >
                  <label style={{ display: 'block', fontSize: '13px', fontWeight: 800, color: '#1e293b', marginBottom: '8px' }}>
                    VCAT 데몬 포트
                  </label>
                  <input
                    type="text"
                    data-testid="settings-input-vcatPort"
                    value={formVcatPort}
                    onFocus={() => setActiveKeyboardField('vcatPort')}
                    onClick={() => setActiveKeyboardField('vcatPort')}
                    onChange={(e) => setFormVcatPort(e.target.value.replace(/[^0-9]/g, ''))}
                    placeholder="예: 9099"
                    style={{
                      width: '100%',
                      background: '#ffffff',
                      border: activeKeyboardField === 'vcatPort' ? '2px solid #059669' : '1px solid #cbd5e1',
                      borderRadius: '12px',
                      padding: '12px 14px',
                      color: '#0f172a',
                      fontFamily: 'monospace',
                      fontSize: '14px',
                      fontWeight: 700,
                      outline: 'none',
                      boxSizing: 'border-box',
                    }}
                  />
                </div>
              </div>

              <div
                style={{
                  background: '#f8fafc',
                  border: '1px solid #e2e8f0',
                  borderRadius: '16px',
                  padding: '16px',
                }}
              >
                <label style={{ display: 'block', fontSize: '13px', fontWeight: 800, color: '#1e293b', marginBottom: '8px' }}>
                  결제 제공사 (VAN)
                </label>
                <select
                  value={formProviderType}
                  onChange={(e) => {
                    const nextProv = normalizeVanProviderType(e.target.value);
                    setFormProviderType(nextProv);
                    const curPort = formVcatPort.trim();
                    if (!curPort || curPort === '9099' || curPort === '8088' || curPort === '8089') {
                      setFormVcatPort(resolveDefaultVanPort(nextProv));
                    }
                  }}
                  style={{
                    width: '100%',
                    background: '#ffffff',
                    border: '1px solid #cbd5e1',
                    borderRadius: '12px',
                    padding: '12px 14px',
                    color: '#0f172a',
                    fontSize: '14px',
                    fontWeight: 700,
                    outline: 'none',
                    boxSizing: 'border-box',
                    cursor: 'pointer',
                  }}
                >
                  <option value="KCP_VAN" style={{ background: '#ffffff', color: '#0f172a' }}>💳 NHN KCP VAN (현장 단말기)</option>
                  <option value="SMARTRO_VAN" style={{ background: '#ffffff', color: '#0f172a' }}>💳 스마트로 SMARTRO VAN (현장 단말기)</option>
                  <option value="NICE_VAN" style={{ background: '#ffffff', color: '#0f172a' }}>💳 NICE 정보통신 VAN (현장 단말기)</option>
                </select>
              </div>

              <div style={{ paddingTop: '2px' }}>
                <button
                  type="button"
                  onClick={handlePingVcat}
                  disabled={isPinging}
                  style={{
                    width: '100%',
                    padding: '13px',
                    background: '#f8fafc',
                    border: '1px solid #cbd5e1',
                    borderRadius: '14px',
                    color: '#1e293b',
                    fontSize: '13.5px',
                    fontWeight: 800,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '8px',
                    cursor: 'pointer',
                    boxShadow: '0 1px 2px rgba(15, 23, 42, 0.04)',
                  }}
                >
                  {isPinging ? <Loader2 size={16} className="animate-spin" color="#059669" /> : <Zap size={16} color="#d97706" />}
                  단말기 통신 점검 (VCAT Ping)
                </button>
                {pingStatus && (
                  <p style={{ fontSize: '12.5px', color: '#059669', fontWeight: 700, textAlign: 'center', margin: '8px 0 0 0' }}>
                    {pingStatus}
                  </p>
                )}
              </div>
            </div>
          )}

          {/* Tab 1.5: Menus & Auth Methods */}
          {activeTab === 'menus' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '18px' }}>
              {policyGuardMsg && (
                <div
                  style={{
                    padding: '11px 14px',
                    background: '#fffbeb',
                    border: '1px solid #fde68a',
                    borderRadius: '12px',
                    color: '#b45309',
                    fontSize: '12.5px',
                    fontWeight: 800,
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px',
                  }}
                >
                  <AlertTriangle size={16} color="#d97706" />
                  <span>{policyGuardMsg}</span>
                </div>
              )}

              {/* Section 1: Kiosk Menu On/Off */}
              <div
                style={{
                  background: '#f8fafc',
                  border: '1px solid #e2e8f0',
                  borderRadius: '16px',
                  padding: '16px',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12px' }}>
                  <div>
                    <h4 style={{ fontSize: '14px', fontWeight: 800, color: '#0f172a', margin: 0 }}>
                      메인 화면 메뉴 노출 제어 (기기별 개별 설정)
                    </h4>
                    <p style={{ fontSize: '11.5px', color: '#64748b', margin: '2px 0 0 0', fontWeight: 500 }}>
                      파트너센터 설정과 무관하게 현재 키오스크에서 특정 메뉴만 개별 ON/OFF 할 수 있습니다.
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={handleResetMenuOverrides}
                    disabled={Object.keys(formMenuOverrides).length === 0}
                    style={{
                      padding: '7px 11px',
                      borderRadius: '10px',
                      fontSize: '11.5px',
                      fontWeight: 800,
                      display: 'flex',
                      alignItems: 'center',
                      gap: '5px',
                      background: Object.keys(formMenuOverrides).length > 0 ? '#ecfdf5' : '#f1f5f9',
                      border: Object.keys(formMenuOverrides).length > 0 ? '1px solid #6ee7b7' : '1px solid #e2e8f0',
                      color: Object.keys(formMenuOverrides).length > 0 ? '#047857' : '#94a3b8',
                      cursor: Object.keys(formMenuOverrides).length > 0 ? 'pointer' : 'not-allowed',
                    }}
                  >
                    <RotateCcw size={12} />
                    파트너센터 기본값 복원
                  </button>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
                  {configurableMenus.map((menu) => {
                    const partnerDefault = getPartnerMenuDefault(menu.id);
                    const isOverridden = Object.prototype.hasOwnProperty.call(formMenuOverrides, menu.id);
                    const isEnabled = isKioskMenuEnabled(menu.id, formMenuOverrides, partnerDefault);

                    return (
                      <div
                        key={menu.id}
                        onClick={() => handleToggleMenu(menu.id)}
                        style={{
                          padding: '10px 12px',
                          borderRadius: '12px',
                          background: isEnabled ? '#ffffff' : '#f1f5f9',
                          border: isEnabled ? '1.5px solid #10b981' : '1px solid #cbd5e1',
                          boxShadow: isEnabled ? '0 2px 6px rgba(16, 185, 129, 0.08)' : 'none',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'space-between',
                          gap: '8px',
                          cursor: 'pointer',
                          opacity: isEnabled ? 1 : 0.72,
                        }}
                      >
                        <div style={{ minWidth: 0, flex: 1 }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                            <span style={{ fontSize: '14px' }}>{menu.emoji}</span>
                            <span style={{ fontSize: '13px', fontWeight: 800, color: isEnabled ? '#0f172a' : '#64748b', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                              {menu.label}
                            </span>
                          </div>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginTop: '4px' }}>
                            <span
                              style={{
                                fontSize: '10px',
                                fontWeight: 800,
                                padding: '2px 6px',
                                borderRadius: '6px',
                                background: isOverridden ? '#fef3c7' : '#e2e8f0',
                                color: isOverridden ? '#b45309' : '#475569',
                              }}
                            >
                              {isOverridden ? '기기 개별설정' : `파트너센터(${partnerDefault ? 'ON' : 'OFF'})`}
                            </span>
                          </div>
                        </div>

                        <div
                          style={{
                            padding: '4px 10px',
                            borderRadius: '999px',
                            fontSize: '11px',
                            fontWeight: 800,
                            background: isEnabled ? '#10b981' : '#cbd5e1',
                            color: isEnabled ? '#ffffff' : '#475569',
                            flexShrink: 0,
                          }}
                        >
                          {isEnabled ? 'ON' : 'OFF'}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Section 2: Member Auth Methods On/Off & Default Tab */}
              <div
                style={{
                  background: '#f8fafc',
                  border: '1px solid #e2e8f0',
                  borderRadius: '16px',
                  padding: '16px',
                }}
              >
                <div style={{ marginBottom: '12px' }}>
                  <h4 style={{ fontSize: '14px', fontWeight: 800, color: '#0f172a', margin: 0 }}>
                    회원인증 수단 ON/OFF 및 기본 시작 탭
                  </h4>
                  <p style={{ fontSize: '11.5px', color: '#64748b', margin: '2px 0 0 0', fontWeight: 500 }}>
                    이 키오스크에 장착된 하드웨어(카메라, QR리더기, NFC)에 맞춰 인증 탭을 켜거나 끄고 첫 화면 기본 탭을 지정합니다.
                  </p>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
                  {AUTH_METHOD_ITEMS.map((item) => {
                    const isServerDisabledFace = item.key === 'FACE' && faceTerminalEnabled === false;
                    const isEnabled = formAuthMethods[item.key] !== false && !isServerDisabledFace;
                    const isDefault = formDefaultAuthMode === item.key && isEnabled;

                    return (
                      <div
                        key={item.key}
                        style={{
                          padding: '10px 12px',
                          borderRadius: '12px',
                          background: isEnabled ? '#ffffff' : '#f1f5f9',
                          border: isDefault
                            ? '2px solid #059669'
                            : isEnabled
                            ? '1px solid #93c5fd'
                            : '1px solid #cbd5e1',
                          boxShadow: isEnabled ? '0 2px 6px rgba(15, 23, 42, 0.04)' : 'none',
                          display: 'flex',
                          flexDirection: 'column',
                          justifyContent: 'space-between',
                          gap: '8px',
                          opacity: isEnabled ? 1 : 0.72,
                        }}
                      >
                        <div
                          onClick={() => !isServerDisabledFace && handleToggleAuthMethod(item.key)}
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'space-between',
                            gap: '8px',
                            cursor: isServerDisabledFace ? 'not-allowed' : 'pointer',
                          }}
                        >
                          <div style={{ minWidth: 0, flex: 1 }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                              <span style={{ fontSize: '14px' }}>{item.emoji}</span>
                              <span style={{ fontSize: '12.5px', fontWeight: 800, color: isEnabled ? '#0f172a' : '#64748b' }}>
                                {item.label}
                              </span>
                            </div>
                            <p style={{ fontSize: '11px', color: '#64748b', margin: '3px 0 0 0', fontWeight: 500 }}>
                              {isServerDisabledFace ? '매장 정책상 안면인식 비활성화됨' : item.desc}
                            </p>
                          </div>

                          <div
                            style={{
                              padding: '4px 10px',
                              borderRadius: '999px',
                              fontSize: '11px',
                              fontWeight: 800,
                              background: isEnabled ? '#2563eb' : '#cbd5e1',
                              color: isEnabled ? '#ffffff' : '#475569',
                              flexShrink: 0,
                            }}
                          >
                            {isEnabled ? 'ON' : 'OFF'}
                          </div>
                        </div>

                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', paddingTop: '6px', borderTop: '1px solid #f1f5f9' }}>
                          <button
                            type="button"
                            disabled={!isEnabled}
                            onClick={() => isEnabled && setFormDefaultAuthMode(item.key)}
                            style={{
                              width: '100%',
                              padding: '5px 8px',
                              borderRadius: '8px',
                              fontSize: '11px',
                              fontWeight: 800,
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              gap: '4px',
                              background: isDefault ? '#ecfdf5' : '#f8fafc',
                              border: isDefault ? '1px solid #10b981' : '1px solid #e2e8f0',
                              color: isDefault ? '#047857' : isEnabled ? '#475569' : '#94a3b8',
                              cursor: isEnabled ? 'pointer' : 'not-allowed',
                            }}
                          >
                            <Star size={11} fill={isDefault ? '#059669' : 'none'} color={isDefault ? '#059669' : 'currentColor'} />
                            {isDefault ? '현재 기본 시작 탭' : '기본 시작 탭으로 지정'}
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>

                {/* QR 인증 시 정기권 허용/차단 정책 스위치 */}
                <div
                  style={{
                    marginTop: '12px',
                    padding: '12px 14px',
                    borderRadius: '12px',
                    background: formQrCouponOnlyMode ? '#ecfdf5' : '#fff7ed',
                    border: formQrCouponOnlyMode ? '1.5px solid #10b981' : '1.5px solid #fdba74',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    gap: '12px',
                  }}
                >
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: '13px', fontWeight: 800, color: '#0f172a', display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <span>🔒 QR 인증 시 일반 정기권 노출 차단 (쿠폰·횟수권 전용)</span>
                      <span
                        style={{
                          fontSize: '10.5px',
                          padding: '2px 7px',
                          borderRadius: '999px',
                          fontWeight: 800,
                          background: formQrCouponOnlyMode ? '#059669' : '#ea580c',
                          color: '#ffffff',
                        }}
                      >
                        {formQrCouponOnlyMode ? '차단 중 (권장)' : '정기권 허용'}
                      </span>
                    </div>
                    <p style={{ fontSize: '11px', color: '#475569', margin: '3px 0 0 0', fontWeight: 500, lineHeight: 1.4 }}>
                      {formQrCouponOnlyMode
                        ? 'QR 사진 공유 시 본인 전용 기간제 정기권·포인트·등급할인은 자동 숨김 처리되고 쿠폰(횟수권/시간권)만 배정 가능합니다. (라카·상품구매는 QR 미노출)'
                        : '주의: QR 스캔 시 기간제 정기권도 함께 노출됩니다. QR 사진 양도 남용 우려가 없는 매장에서만 허용하세요.'}
                    </p>
                  </div>
                  <button
                    type="button"
                    data-testid="toggle-qr-coupon-only-mode"
                    onClick={() => setFormQrCouponOnlyMode((prev) => !prev)}
                    style={{
                      padding: '8px 14px',
                      borderRadius: '10px',
                      fontSize: '12px',
                      fontWeight: 800,
                      border: formQrCouponOnlyMode ? '1px solid #059669' : '1px solid #cbd5e1',
                      background: formQrCouponOnlyMode ? '#059669' : '#ffffff',
                      color: formQrCouponOnlyMode ? '#ffffff' : '#334155',
                      cursor: 'pointer',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    {formQrCouponOnlyMode ? '쿠폰 전용 ON' : '정기권 허용됨'}
                  </button>
                </div>
              </div>

              {/* Section C: Intermediate Gap Threshold */}
              <div
                style={{
                  background: '#f8fafc',
                  border: '1px solid #e2e8f0',
                  borderRadius: '16px',
                  padding: '16px',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '10px' }}>
                  <div>
                    <h4 style={{ fontSize: '14px', fontWeight: 800, color: '#0f172a', margin: 0 }}>
                      ⏱️ 중간 빈타석 표시 기준 시간 (대기시간 포함 자동 계산)
                    </h4>
                    <p style={{ fontSize: '11.5px', color: '#64748b', margin: '2px 0 0 0', fontWeight: 500 }}>
                      예약과 다음 예약 사이의 빈 시간이 기준 시간 미만이면 뒤 예약과 하나로 묶어 통합 종료시각으로 표시합니다. (기기 표준값: 60분)
                    </p>
                  </div>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(6, 1fr)', gap: '8px' }}>
                  {[50, 60, 70, 80, 90, 120].map((minOpt) => {
                    const isSelected = formMinGapMinutes === minOpt;
                    return (
                      <button
                        key={minOpt}
                        type="button"
                        data-testid={`min-gap-opt-${minOpt}`}
                        onClick={() => setFormMinGapMinutes(minOpt)}
                        style={{
                          padding: '10px 6px',
                          borderRadius: '10px',
                          fontSize: '13px',
                          fontWeight: 800,
                          background: isSelected ? '#10b981' : '#ffffff',
                          border: isSelected ? '1.5px solid #059669' : '1px solid #cbd5e1',
                          color: isSelected ? '#ffffff' : '#334155',
                          boxShadow: isSelected ? '0 3px 8px rgba(16, 185, 129, 0.25)' : 'none',
                          cursor: 'pointer',
                        }}
                      >
                        {minOpt}분{minOpt === 60 ? ' (표준)' : ''}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Section D: Top Teebox Dashboard Display Mode */}
              <div
                style={{
                  background: '#f8fafc',
                  border: '1px solid #e2e8f0',
                  borderRadius: '16px',
                  padding: '16px',
                }}
              >
                <div style={{ marginBottom: '10px' }}>
                  <h4 style={{ fontSize: '14px', fontWeight: 800, color: '#0f172a', margin: 0 }}>
                    📊 메인 화면 상단 실시간 타석 현황판 배열 모드
                  </h4>
                  <p style={{ fontSize: '11.5px', color: '#64748b', margin: '2px 0 0 0', fontWeight: 500 }}>
                    매장 층별 타석 수에 따라 상단 현황판 타일 크기와 줄 수를 자동 최적화하거나 가맹점 요청에 맞춰 고정할 수 있습니다.
                  </p>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '8px' }}>
                  {([
                    { mode: 'AUTO' as KioskTopDashboardMode, label: '✨ 자동 맞춤 (추천)', desc: '12개 이하 1줄 / 13개 이상 2줄 대형 타일' },
                    { mode: 'COMPACT_1ROW' as KioskTopDashboardMode, label: '📏 1줄 컴팩트 고정', desc: '타석 수와 무관하게 무조건 1줄 배열' },
                    { mode: 'HIDDEN' as KioskTopDashboardMode, label: '🙈 현황판 숨김', desc: '상단 현황판 없이 메인 메뉴만 확대 표시' },
                  ]).map((opt) => {
                    const isSelected = formTopDashboardMode === opt.mode;
                    return (
                      <button
                        key={opt.mode}
                        type="button"
                        data-testid={`top-dashboard-mode-${opt.mode}`}
                        onClick={() => setFormTopDashboardMode(opt.mode)}
                        style={{
                          padding: '10px 12px',
                          borderRadius: '12px',
                          textAlign: 'left',
                          background: isSelected ? '#ecfdf5' : '#ffffff',
                          border: isSelected ? '2px solid #059669' : '1px solid #cbd5e1',
                          color: '#0f172a',
                          boxShadow: isSelected ? '0 3px 8px rgba(16, 185, 129, 0.15)' : 'none',
                          cursor: 'pointer',
                        }}
                      >
                        <div style={{ fontSize: '12.5px', fontWeight: 800, color: isSelected ? '#047857' : '#1e293b' }}>
                          {opt.label}
                        </div>
                        <div style={{ fontSize: '10.5px', color: '#64748b', marginTop: '3px', fontWeight: 500 }}>
                          {opt.desc}
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>
          )}

          {/* Tab 2: Connection */}
          {activeTab === 'connection' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <div
                style={{
                  background: '#f8fafc',
                  border: '1px solid #e2e8f0',
                  borderRadius: '16px',
                  padding: '16px',
                }}
              >
                <label style={{ display: 'block', fontSize: '13px', fontWeight: 800, color: '#1e293b', marginBottom: '8px' }}>
                  로컬 서버 API 주소
                </label>
                <input
                  type="text"
                  data-testid="settings-input-apiUrl"
                  value={formApiUrl}
                  onFocus={() => setActiveKeyboardField('apiUrl')}
                  onClick={() => setActiveKeyboardField('apiUrl')}
                  onChange={(e) => setFormApiUrl(e.target.value)}
                  placeholder="예: http://127.0.0.1:8000"
                  style={{
                    width: '100%',
                    background: '#ffffff',
                    border: activeKeyboardField === 'apiUrl' ? '2px solid #059669' : '1px solid #cbd5e1',
                    borderRadius: '12px',
                    padding: '12px 14px',
                    color: '#0f172a',
                    fontFamily: 'monospace',
                    fontSize: '14px',
                    fontWeight: 700,
                    outline: 'none',
                    boxSizing: 'border-box',
                  }}
                />
              </div>

              <div
                style={{
                  background: '#f8fafc',
                  border: '1px solid #e2e8f0',
                  borderRadius: '16px',
                  padding: '16px',
                }}
              >
                <label style={{ display: 'block', fontSize: '13px', fontWeight: 800, color: '#1e293b', marginBottom: '8px' }}>
                  매장 코드 (Store Code)
                </label>
                <input
                  type="text"
                  data-testid="settings-input-storeCode"
                  value={formStoreCode}
                  onFocus={() => setActiveKeyboardField('storeCode')}
                  onClick={() => setActiveKeyboardField('storeCode')}
                  onChange={(e) => setFormStoreCode(e.target.value.toUpperCase())}
                  placeholder="예: H01-SE-001"
                  style={{
                    width: '100%',
                    background: '#ffffff',
                    border: activeKeyboardField === 'storeCode' ? '2px solid #059669' : '1px solid #cbd5e1',
                    borderRadius: '12px',
                    padding: '12px 14px',
                    color: '#0f172a',
                    fontFamily: 'monospace',
                    fontSize: '14px',
                    fontWeight: 700,
                    textTransform: 'uppercase',
                    outline: 'none',
                    boxSizing: 'border-box',
                  }}
                />
              </div>

              <div
                style={{
                  background: '#f8fafc',
                  border: '1px solid #e2e8f0',
                  borderRadius: '16px',
                  padding: '16px',
                }}
              >
                <label style={{ display: 'block', fontSize: '13px', fontWeight: 800, color: '#1e293b', marginBottom: '8px' }}>
                  키오스크 기기 인증키
                </label>
                <input
                  type="password"
                  data-testid="settings-input-deviceKey"
                  value={formDeviceKey}
                  onFocus={() => setActiveKeyboardField('deviceKey')}
                  onClick={() => setActiveKeyboardField('deviceKey')}
                  onChange={(e) => setFormDeviceKey(e.target.value)}
                  placeholder="파트너센터 발급 기기 인증키"
                  style={{
                    width: '100%',
                    background: '#ffffff',
                    border: activeKeyboardField === 'deviceKey' ? '2px solid #059669' : '1px solid #cbd5e1',
                    borderRadius: '12px',
                    padding: '12px 14px',
                    color: '#0f172a',
                    fontFamily: 'monospace',
                    fontSize: '14px',
                    fontWeight: 700,
                    outline: 'none',
                    boxSizing: 'border-box',
                  }}
                />
              </div>

              <div>
                <button
                  type="button"
                  data-testid="settings-auto-bootstrap-btn"
                  disabled={isBootstrapping}
                  onClick={async () => {
                    setIsBootstrapping(true);
                    setBootstrapMsg(null);
                    try {
                      const res = await bootstrapLocalKioskSettings({
                        force: true,
                        allowAuthenticatedLan: true,
                        apiUrlOverride: formApiUrl.trim() || undefined,
                      });
                      if (res && res.storeCode) {
                        setFormApiUrl(res.apiUrl);
                        setFormStoreCode(res.storeCode);
                        setFormDeviceKey(res.deviceKey);
                        setFormDeviceId(res.deviceId);
                        setFormDeviceName(res.deviceName);
                        setFormTerminalId(res.terminalId);
                        setFormVcatPort(res.vcatPort);
                        setFormProviderType(normalizeVanProviderType(res.providerType));
                        setBootstrapMsg(`✅ 서버 기기정보 자동 연동 완료 (${res.storeCode} · TID ${res.terminalId})`);
                      } else {
                        setBootstrapMsg('⚠️ 서버에서 기기 프로비저닝 정보를 불러오지 못했습니다. API 주소 및 서버 연결을 확인하세요.');
                      }
                    } finally {
                      setIsBootstrapping(false);
                    }
                  }}
                  style={{
                    width: '100%',
                    padding: '13px',
                    background: '#ecfdf5',
                    border: '1px solid #a7f3d0',
                    borderRadius: '14px',
                    color: '#065f46',
                    fontSize: '13.5px',
                    fontWeight: 800,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '8px',
                    cursor: 'pointer',
                  }}
                >
                  {isBootstrapping ? <Loader2 size={16} className="animate-spin" color="#059669" /> : <RotateCcw size={16} color="#059669" />}
                  서버 기기정보 자동 불러오기 (매장코드 · 인증키 · 단말기)
                </button>
                {bootstrapMsg && (
                  <p style={{ fontSize: '12.5px', color: bootstrapMsg.startsWith('✅') ? '#059669' : '#b45309', fontWeight: 700, textAlign: 'center', margin: '8px 0 0 0' }}>
                    {bootstrapMsg}
                  </p>
                )}
              </div>
            </div>
          )}

          {/* Tab 3: Maintenance */}
          {activeTab === 'maintenance' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '18px' }}>
              <div
                style={{
                  padding: '18px 20px',
                  background: formIsMaintenance ? '#fffbeb' : '#f8fafc',
                  border: formIsMaintenance ? '1.5px solid #f59e0b' : '1px solid #e2e8f0',
                  borderRadius: '16px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                }}
              >
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '14px', fontWeight: 800, color: '#0f172a', marginBottom: '4px' }}>
                    <AlertTriangle size={17} color="#d97706" />
                    임시 점검 모드 (화면 잠금)
                  </div>
                  <p style={{ fontSize: '12px', color: '#64748b', margin: 0, fontWeight: 500 }}>
                    활성화 시 일반 고객의 터치를 차단하고 점검 안내를 띄웁니다.
                  </p>
                </div>
                <input
                  type="checkbox"
                  checked={formIsMaintenance}
                  onChange={(e) => setFormIsMaintenance(e.target.checked)}
                  style={{ width: '24px', height: '24px', accentColor: '#10b981', cursor: 'pointer' }}
                />
              </div>

              <div
                style={{
                  background: '#f8fafc',
                  border: '1px solid #e2e8f0',
                  borderRadius: '16px',
                  padding: '18px',
                }}
              >
                <label style={{ display: 'block', fontSize: '13px', fontWeight: 800, color: '#1e293b', marginBottom: '8px' }}>
                  관리자 PIN 번호 변경 (4자리 · 미입력 시 기존 유지)
                </label>
                <input
                  type="password"
                  data-testid="settings-input-adminPin"
                  maxLength={4}
                  value={formAdminPin}
                  onFocus={() => setActiveKeyboardField('adminPin')}
                  onClick={() => setActiveKeyboardField('adminPin')}
                  onChange={(e) => {
                    setPolicyGuardMsg(null);
                    setFormAdminPin(e.target.value.replace(/[^0-9]/g, ''));
                  }}
                  placeholder={settings.hasCustomAdminPin ? '변경 시 새 4자리 입력 (현재 커스텀 PIN 설정됨)' : '변경 시 새 4자리 입력'}
                  style={{
                    width: '100%',
                    background: '#ffffff',
                    border: activeKeyboardField === 'adminPin' ? '2px solid #059669' : '1px solid #cbd5e1',
                    borderRadius: '12px',
                    padding: '12px 14px',
                    color: '#0f172a',
                    fontFamily: 'monospace',
                    fontSize: formAdminPin ? '20px' : '14px',
                    fontWeight: 800,
                    textAlign: 'center',
                    letterSpacing: formAdminPin ? '8px' : '0px',
                    outline: 'none',
                    boxSizing: 'border-box',
                  }}
                />
                <p style={{ fontSize: '12px', color: '#64748b', margin: '8px 0 0 0', fontWeight: 500 }}>
                  * 좌측 상단 5회 탭 시 입력할 관리자 비밀번호입니다. 비워두면 기존 PIN이 그대로 유지됩니다.
                </p>
              </div>

              {/* 관리자 전용 키오스크 프로그램 종료 / 재실행 제어 카드 */}
              <div
                style={{
                  background: '#f8fafc',
                  border: '1px solid #cbd5e1',
                  borderRadius: '16px',
                  padding: '18px',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '12px',
                }}
              >
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '14px', fontWeight: 800, color: '#0f172a', marginBottom: '4px' }}>
                    <Monitor size={17} color="#0284c7" />
                    키오스크 프로그램 제어 (관리자 전용)
                  </div>
                  <p style={{ fontSize: '12px', color: '#64748b', margin: 0, fontWeight: 500 }}>
                    현장 점검 또는 윈도우 바탕화면 확인이 필요할 때 물리 키보드 없이 프로그램을 재실행하거나 종료할 수 있습니다.
                  </p>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                  <button
                    type="button"
                    data-testid="settings-restart-kiosk-btn"
                    disabled={isControllingApp}
                    onClick={async () => {
                      setIsControllingApp(true);
                      setConfirmExitKiosk(false);
                      setAppControlStatus('키오스크 프로그램을 재실행하는 중입니다...');
                      clearKioskAdminSession();
                      const res = await api.controlKioskApp('RESTART');
                      setAppControlStatus(res.message);
                      setIsControllingApp(false);
                    }}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: '8px',
                      padding: '13px 14px',
                      borderRadius: '12px',
                      border: '1.5px solid #0284c7',
                      background: '#f0f9ff',
                      color: '#0369a1',
                      fontSize: '13px',
                      fontWeight: 800,
                      cursor: isControllingApp ? 'wait' : 'pointer',
                    }}
                  >
                    <RotateCcw size={16} />
                    키오스크 프로그램 재실행
                  </button>

                  <button
                    type="button"
                    data-testid="settings-exit-kiosk-btn"
                    disabled={isControllingApp}
                    onClick={() => {
                      setAppControlStatus(null);
                      setConfirmExitKiosk((prev) => !prev);
                    }}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: '8px',
                      padding: '13px 14px',
                      borderRadius: '12px',
                      border: '1.5px solid #dc2626',
                      background: confirmExitKiosk ? '#fee2e2' : '#fef2f2',
                      color: '#b91c1c',
                      fontSize: '13px',
                      fontWeight: 800,
                      cursor: isControllingApp ? 'wait' : 'pointer',
                    }}
                  >
                    <X size={16} />
                    키오스크 프로그램 종료 (바탕화면)
                  </button>
                </div>

                {confirmExitKiosk && (
                  <div
                    data-testid="settings-exit-confirm-box"
                    style={{
                      background: '#fff1f2',
                      border: '1.5px solid #fda4af',
                      borderRadius: '12px',
                      padding: '12px 14px',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      gap: '12px',
                    }}
                  >
                    <div style={{ fontSize: '12px', fontWeight: 700, color: '#9f1239', lineHeight: 1.45 }}>
                      전체화면 키오스크를 닫고 Windows 바탕화면으로 나가시겠습니까?
                      <div style={{ fontSize: '11px', fontWeight: 500, color: '#be123c', marginTop: '2px' }}>
                        * 바탕화면의 [GOLFOS KIOSK] 아이콘을 더블클릭하면 언제든 다시 실행할 수 있습니다.
                      </div>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexShrink: 0 }}>
                      <button
                        type="button"
                        data-testid="settings-cancel-exit-kiosk-btn"
                        disabled={isControllingApp}
                        onClick={() => setConfirmExitKiosk(false)}
                        style={{
                          padding: '9px 14px',
                          borderRadius: '10px',
                          border: '1px solid #cbd5e1',
                          background: '#ffffff',
                          color: '#475569',
                          fontSize: '12px',
                          fontWeight: 700,
                          cursor: 'pointer',
                        }}
                      >
                        취소
                      </button>
                      <button
                        type="button"
                        data-testid="settings-confirm-exit-kiosk-btn"
                        disabled={isControllingApp}
                        onClick={async () => {
                          setIsControllingApp(true);
                          setAppControlStatus('키오스크 프로그램을 종료하고 바탕화면으로 이동합니다...');
                          clearKioskAdminSession();
                          const res = await api.controlKioskApp('EXIT');
                          setAppControlStatus(res.message);
                          setIsControllingApp(false);
                        }}
                        style={{
                          padding: '9px 14px',
                          borderRadius: '10px',
                          border: 'none',
                          background: '#dc2626',
                          color: '#ffffff',
                          fontSize: '12px',
                          fontWeight: 800,
                          cursor: isControllingApp ? 'wait' : 'pointer',
                        }}
                      >
                        종료 확인
                      </button>
                    </div>
                  </div>
                )}

                {appControlStatus && (
                  <div
                    data-testid="settings-app-control-status"
                    style={{
                      padding: '10px 12px',
                      borderRadius: '10px',
                      background: '#f1f5f9',
                      border: '1px solid #cbd5e1',
                      color: '#334155',
                      fontSize: '12px',
                      fontWeight: 700,
                    }}
                  >
                    {appControlStatus}
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        {/* 터치스크린 무키보드 환경 대응 도킹 화상키보드 */}
        {activeKeyboardField && (() => {
          const kbMeta: Record<
            NonNullable<typeof activeKeyboardField>,
            {
              label: string;
              mode: VirtualKeyboardMode;
              value: string;
              onChange: (v: string) => void;
              uppercase?: boolean;
              masked?: boolean;
              maxLength?: number;
            }
          > = {
            terminalId: {
              label: '단말기 번호 (TID)',
              mode: 'ASCII_TEXT',
              value: formTerminalId,
              onChange: setFormTerminalId,
              uppercase: true,
              maxLength: 32,
            },
            vcatPort: {
              label: 'VCAT 포트',
              mode: 'NUMERIC',
              value: formVcatPort,
              onChange: setFormVcatPort,
              maxLength: 5,
            },
            apiUrl: {
              label: '서버 API 주소',
              mode: 'ASCII_TEXT',
              value: formApiUrl,
              onChange: setFormApiUrl,
              maxLength: 120,
            },
            storeCode: {
              label: '매장 코드',
              mode: 'ASCII_TEXT',
              value: formStoreCode,
              onChange: setFormStoreCode,
              uppercase: true,
              maxLength: 24,
            },
            deviceKey: {
              label: '기기 인증키',
              mode: 'ASCII_TEXT',
              value: formDeviceKey,
              onChange: setFormDeviceKey,
              masked: true,
              maxLength: 128,
            },
            adminPin: {
              label: '새 관리자 PIN (4자리)',
              mode: 'NUMERIC',
              value: formAdminPin,
              onChange: (val) => {
                setPolicyGuardMsg(null);
                setFormAdminPin(val);
              },
              masked: true,
              maxLength: 4,
            },
          };
          const cfg = kbMeta[activeKeyboardField];
          return (
            <div style={{ flexShrink: 0, padding: '10px 18px', background: '#f1f5f9', borderTop: '1px solid #e2e8f0' }}>
              <VirtualKeyboard
                key={activeKeyboardField}
                mode={cfg.mode}
                label={cfg.label}
                value={cfg.value}
                onChange={cfg.onChange}
                uppercase={cfg.uppercase}
                masked={cfg.masked}
                maxLength={cfg.maxLength}
                compact={true}
                docked={true}
                onClose={() => setActiveKeyboardField(null)}
              />
            </div>
          );
        })()}

        {/* Footer (Fixed Bottom) */}
        <div
          data-testid="kiosk-settings-footer"
          style={{
            flexShrink: 0,
            padding: '16px 24px',
            background: '#f8fafc',
            borderTop: '1px solid #e2e8f0',
            display: 'flex',
            flexDirection: 'column',
            gap: '10px',
          }}
        >
          {confirmExitKiosk && activeTab !== 'maintenance' && (
            <div
              data-testid="settings-footer-exit-confirm-box"
              style={{
                background: '#fff1f2',
                border: '1.5px solid #fda4af',
                borderRadius: '12px',
                padding: '10px 14px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: '10px',
              }}
            >
              <div style={{ fontSize: '12px', fontWeight: 800, color: '#9f1239' }}>
                전체화면 키오스크를 종료하고 Windows 바탕화면으로 이동할까요?
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexShrink: 0 }}>
                <button
                  type="button"
                  onClick={() => setConfirmExitKiosk(false)}
                  style={{
                    padding: '7px 12px',
                    borderRadius: '8px',
                    border: '1px solid #cbd5e1',
                    background: '#ffffff',
                    color: '#475569',
                    fontSize: '12px',
                    fontWeight: 700,
                    cursor: 'pointer',
                  }}
                >
                  취소
                </button>
                <button
                  type="button"
                  data-testid="settings-footer-confirm-exit-btn"
                  disabled={isControllingApp}
                  onClick={async () => {
                    setIsControllingApp(true);
                    setAppControlStatus('키오스크 프로그램을 종료하고 바탕화면으로 이동합니다...');
                    clearKioskAdminSession();
                    const res = await api.controlKioskApp('EXIT');
                    setAppControlStatus(res.message);
                    setIsControllingApp(false);
                  }}
                  style={{
                    padding: '7px 14px',
                    borderRadius: '8px',
                    border: 'none',
                    background: '#dc2626',
                    color: '#ffffff',
                    fontSize: '12px',
                    fontWeight: 800,
                    cursor: isControllingApp ? 'wait' : 'pointer',
                  }}
                >
                  종료 확인
                </button>
              </div>
            </div>
          )}

          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: '10px',
              flexWrap: 'wrap',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <button
                type="button"
                onClick={() => {
                  clearKioskAdminSession();
                  onClose();
                }}
                style={{
                  padding: '12px 18px',
                  background: '#ffffff',
                  border: '1px solid #cbd5e1',
                  borderRadius: '12px',
                  color: '#475569',
                  fontSize: '13px',
                  fontWeight: 800,
                  cursor: 'pointer',
                }}
              >
                닫기
              </button>

              <button
                type="button"
                data-testid="settings-footer-restart-kiosk-btn"
                disabled={isControllingApp}
                onClick={async () => {
                  setIsControllingApp(true);
                  setConfirmExitKiosk(false);
                  setAppControlStatus('키오스크 프로그램을 재실행하는 중입니다...');
                  clearKioskAdminSession();
                  const res = await api.controlKioskApp('RESTART');
                  setAppControlStatus(res.message);
                  setIsControllingApp(false);
                }}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                  padding: '12px 14px',
                  background: '#f0f9ff',
                  border: '1.5px solid #0284c7',
                  borderRadius: '12px',
                  color: '#0369a1',
                  fontSize: '12.5px',
                  fontWeight: 800,
                  cursor: isControllingApp ? 'wait' : 'pointer',
                }}
              >
                <RotateCcw size={15} />
                키오스크 재실행
              </button>

              <button
                type="button"
                data-testid="settings-footer-exit-kiosk-btn"
                disabled={isControllingApp}
                onClick={() => {
                  setAppControlStatus(null);
                  setConfirmExitKiosk((prev) => !prev);
                }}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                  padding: '12px 14px',
                  background: confirmExitKiosk ? '#fee2e2' : '#fef2f2',
                  border: '1.5px solid #dc2626',
                  borderRadius: '12px',
                  color: '#b91c1c',
                  fontSize: '12.5px',
                  fontWeight: 800,
                  cursor: isControllingApp ? 'wait' : 'pointer',
                }}
              >
                <X size={15} />
                키오스크 종료 (바탕화면)
              </button>
            </div>

            <button
              type="button"
              onClick={handleSave}
              style={{
                padding: '12px 24px',
                background: 'linear-gradient(135deg, #10b981 0%, #059669 100%)',
                border: 'none',
                borderRadius: '14px',
                color: '#ffffff',
                fontSize: '14px',
                fontWeight: 800,
                cursor: 'pointer',
                boxShadow: '0 4px 14px rgba(16, 185, 129, 0.3)',
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
              }}
            >
              {saveSuccess ? (
                <>
                  <CheckCircle2 size={16} />
                  저장 완료!
                </>
              ) : (
                '설정 저장'
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
