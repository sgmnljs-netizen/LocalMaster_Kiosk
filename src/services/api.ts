/**
 * ⛳ LocalMaster Kiosk API Client & Hybrid Edge DB Engine
 * 
 * - 실제 백엔드 API 서버와 연동하여 실시간 통신을 처리합니다.
 * - 서버가 다운되거나 오프라인 상태일 때, LocalStorage 기반의 "Edge DB 엔진"이 
 *   자동으로 개입하여 무중단 영업(결제, 타석 선점, 배정)을 보장합니다.
 */

// 실제 백엔드 주소 (LocalMaster_Backend)
const BASE_URL = import.meta.env.VITE_BASE_URL || 'http://localhost:8000/api'; 
export const STORE_CODE = import.meta.env.VITE_STORE_CODE || localStorage.getItem('LM_STORE_CD') || 'H01-SE-001';

// WebSocket 베이스 URL (BASE_URL에서 동적 생성 — localhost 하드코딩 제거)
// [Fix-4] localhost:8000 하드코딩 제거 → BASE_URL 기반 생성
const _baseHost = BASE_URL.replace('/api', '').replace('http://', 'ws://').replace('https://', 'wss://');
import { TimeMaster } from '../utils/timeMaster';
import type { CardApprovalResult } from './van/van_types';
export const WS_BASE_URL = _baseHost;



export interface MemberAsset {
  member_item_id: string;
  item_name: string;
  rem_count?: number;
  remain_cnt?: number;
  expiry_date?: string;
  end_date?: string;
  end_dt?: string;
  days?: number;
  remain_days?: number;
  duration_min?: number;
  logic_type?: string;
  pass_type?: string;
  allowed_categories?: string[];
  is_assignable?: boolean;
  unassignable_reason?: string;
}

export interface KioskCompanionItem {
  member_no?: string;
  guest_nm?: string;
  hp_no: string;
  is_member: boolean;
  use_ticket_id?: string;
}

export interface Member {
  member_no: string;
  member_name: string;
  masked_name?: string;
  hp: string;
  email: string;
  member_grade: string;
  status_cd: string;
  gender?: string;
  recent_product_nm?: string | null;
  expiry_date?: string | null;
  remain_days?: number;
  locker_no?: number | null;
  locker_expiry_date?: string | null;
  assets?: MemberAsset[];
  face_registered?: boolean;
  face_vector_id?: string | null;
  store_cd?: string;
  total_point?: number;
  discount_rate?: number;
  point_rate?: number;
  grade_cd?: string;
}

export interface KioskZone {
  zone_code: string;
  zone_name: string;
}

export interface Par3Slot {
  slot_id: string;
  time: string; // HH:MM
  course_nm: string;
  status: 'AVAILABLE' | 'RESERVED' | 'BLOCKED';
  current_party_size?: number;
}

export interface Bay {
  bay_id: number;
  bay_no: number;
  floor_no: number;
  floor?: string; // 백엔드 실제 데이터 필드 (e.g. '1F', '2F')
  zone_code?: string; // 타석 소속 구역 (e.g. 'BAY', 'PAR3')
  type: 'RIGHT' | 'LEFT'; // 우타, 좌타
  status: 'AVAILABLE' | 'PRE_OCCUPIED' | 'OCCUPIED' | 'PREPARE' | 'USE' | 'UNDER_MAINTENANCE' | 'MAINTENANCE' | 'DISABLED';
  current_user_name?: string | null;
  current_user_hp?: string | null;
  start_time?: string | null;
  end_time?: string | null; // HHmm
  minutes_left?: number;
  duration_min?: number | null;
  elapsed_min?: number | null;
  prepare_remaining_sec?: number | null;
  server_epoch_ms?: number | null;
  start_epoch_ms?: number | null;
  end_epoch_ms?: number | null;
  prepare_expired_epoch_ms?: number | null;
  lock_terminal_id?: string | null;
  lock_expired_at?: string | null;
  status_info?: Record<string, any> | null;
  bay_name?: string;
  simulator_type?: string;
  handedness?: string;
  is_lesson_only?: boolean;
  screen_spec?: string;
  allow_companion?: boolean;
  max_occupancy?: number;
  config_json?: string;
  next_res_start_time?: string | null;
  next_res_name?: string | null;
  next_res_checkin_status?: string | null;
}

export interface Locker {
  locker_id: number;
  locker_no: number;
  floor_no: number;
  status: 'AVAILABLE' | 'OCCUPIED' | 'EXPIRED' | 'BROKEN';
  member_no?: string | null;
  member_name?: string | null;
  end_dt?: string | null; // YYYY-MM-DD
}

export interface Product {
  prod_cd: string;
  prod_nm: string;
  standard_price: number;
  sale_price?: number;
  logic_type: 'MEMBERSHIP' | 'LESSON' | 'RETAIL' | 'FACILITY' | 'RENTAL' | string;
  duration_min?: number;
  days?: number;
  res_id?: string;
}

export interface KioskMasterResponse {
  store_info?: {
    store_cd: string;
    store_nm: string;
    checkin_policy: string;
    address?: string;
    tel?: string;
    meta_data?: any;
  };
  zones?: KioskZone[];
  bays?: Bay[];
  lockers?: Locker[];
  products?: Product[];
  par3_slots?: Par3Slot[];
  members?: Member[];
  display_categories?: any[];
  config?: any;
}

// --------------------------------------------------------------------------
// 💾 50개 대형 타석 (1F:20, 2F:20, 3F:10) 공통 생성 헬퍼 함수
// --------------------------------------------------------------------------
export const generateDefault50Bays = (): Bay[] => {
  return Array.from({ length: 50 }, (_, i) => {
    const bayNo = i + 1;
    const floorNo = bayNo <= 20 ? 1 : bayNo <= 40 ? 2 : 3;
    const floorStr = `${floorNo}F`;
    const zoneCode = floorNo === 1 ? 'BAY' : floorNo === 2 ? 'BAY_2F' : 'BAY_3F';
    const isLefty = [2, 10, 18, 22, 30, 38, 42].includes(bayNo);
    const isPrivate = [1, 20, 21, 40, 41, 50].includes(bayNo);
    
    // 실시간 가동 상태 (이용 중 33개, 이용 가능 17개)
    const occupiedBayNos = [
      1, 3, 5, 7, 8, 10, 12, 13, 15, 16, 17, 19, 20,       // 1F (13/20)
      21, 23, 24, 26, 28, 29, 31, 33, 34, 36, 37, 39, 40, // 2F (13/20)
      41, 43, 44, 46, 48, 49, 50                           // 3F (7/10)
    ];
    const isOccupied = occupiedBayNos.includes(bayNo);
    
    const memberNames = ['김프로', '이회원', '박골퍼', '최골프', '정프로', '한회원', '강싱글', '윤버디', '조이글', '송홀인원'];
    const userName = isOccupied ? memberNames[bayNo % memberNames.length] : null;
    const remMin = isOccupied ? ((bayNo * 7) % 45 + 10) : undefined;
    const endTimeStr = isOccupied ? `15:${(remMin! < 10 ? '0' : '') + remMin}` : null;

    let bayTypeName = '(오픈형)';
    if (isPrivate) bayTypeName = '(프라이빗룸)';
    else if (isLefty) bayTypeName = '(좌타겸용)';

    return {
      bay_id: bayNo,
      bay_no: bayNo,
      floor_no: floorNo,
      floor: floorStr,
      zone_code: zoneCode,
      type: isLefty ? 'LEFT' : 'RIGHT',
      status: isOccupied ? 'OCCUPIED' : 'AVAILABLE',
      current_user_name: userName,
      current_user_hp: isOccupied ? `010-${1000 + bayNo}-${2000 + bayNo}` : null,
      minutes_left: remMin,
      end_time: endTimeStr,
      bay_name: `${bayNo}번 타석 ${bayTypeName}`,
    };
  });
};

export const DEFAULT_50_ZONES = [
  { zone_cd: 'BAY', zone_name: '1F 메인 아카데미 (1~20번)', floor_no: 1 },
  { zone_cd: 'BAY_2F', zone_name: '2F 프리미엄 스튜디오 (21~40번)', floor_no: 2 },
  { zone_cd: 'BAY_3F', zone_name: '3F 루프탑 VIP 타석 (41~50번)', floor_no: 3 },
  { zone_cd: 'PAR3', zone_name: '천연잔디 PAR3 코스', floor_no: 1 },
];

export const LM_SCHEMA_VERSION = 'v20260824_50bays_v4';

// --------------------------------------------------------------------------
// 💾 Edge DB Initializer (LocalStorage 기반 가상 DB & 데모 시드 데이터)
// --------------------------------------------------------------------------

const initializeEdgeDB = () => {
  // [Auto-Heal Engine] 구버전 또는 오염된 캐시 감지 시 전체 소거 후 50타석 정품 재구축
  const currentVersion = localStorage.getItem('LM_SCHEMA_VERSION');
  const existingBays = JSON.parse(localStorage.getItem('LM_BAYS') || '[]');
  
  if (currentVersion !== LM_SCHEMA_VERSION || !Array.isArray(existingBays) || existingBays.length !== 50) {
    console.warn(`[Auto-Heal] 구버전 캐시 감지 (${currentVersion} -> ${LM_SCHEMA_VERSION}). 스토리지 완전 초기화 및 50타석 마이그레이션을 실행합니다.`);
    localStorage.clear();
    localStorage.setItem('LM_SCHEMA_VERSION', LM_SCHEMA_VERSION);
  }

  // 1. 기본 가맹점 정보
  if (!localStorage.getItem('LM_STORE_INFO') || localStorage.getItem('LM_STORE_INFO') === '{}') {
    localStorage.setItem('LM_STORE_INFO', JSON.stringify({
      store_cd: STORE_CODE,
      store_nm: '로컬마스터 강남 1호점 (체험관)',
      business_no: '721-81-04039',
      ceo_name: '대표이사',
      address: '서울특별시 강남구 테헤란로 123',
      tel: '1566-8705',
      checkin_policy: 'CHECKIN_REQUIRED',
      meta_data: { integration: { face_terminal_yn: true } }
    }));
  }

  // 2. 기본 구역 정보 (ZONES: 1F, 2F, 3F, PAR3)
  if (!localStorage.getItem('LM_ZONES') || localStorage.getItem('LM_ZONES') === '[]') {
    localStorage.setItem('LM_ZONES', JSON.stringify(DEFAULT_50_ZONES));
  }

  // 3. 기본 타석 목록 (1층 20개, 2층 20개, 3층 10개 총 50개 타석)
  if (!localStorage.getItem('LM_BAYS') || JSON.parse(localStorage.getItem('LM_BAYS') || '[]').length !== 50) {
    localStorage.setItem('LM_BAYS', JSON.stringify(generateDefault50Bays()));
  }

  // 4. 기본 상품 목록 (PRODUCTS)
  const existingProducts = JSON.parse(localStorage.getItem('LM_PRODUCTS') || '[]');
  if (!existingProducts || existingProducts.length === 0) {
    localStorage.setItem('LM_PRODUCTS', JSON.stringify([
      { prod_cd: 'D01', prod_nm: '일일 타석 60분', standard_price: 20000, sale_price: 20000, logic_type: 'DAILY', duration_min: 60 },
      { prod_cd: 'D02', prod_nm: '일일 타석 90분', standard_price: 28000, sale_price: 28000, logic_type: 'DAILY', duration_min: 90 },
      { prod_cd: 'D03', prod_nm: '일일 타석 120분', standard_price: 35000, sale_price: 35000, logic_type: 'DAILY', duration_min: 120 },
      { prod_cd: 'P03', prod_nm: '1개월 정기 회원권', standard_price: 180000, sale_price: 180000, logic_type: 'MEMBERSHIP', days: 30 },
      { prod_cd: 'P04', prod_nm: '3개월 정기 회원권', standard_price: 480000, sale_price: 450000, logic_type: 'MEMBERSHIP', days: 90 },
    ]));
  }

  // 5. 기본 회원 목록 (MEMBERS)
  const existingMembers = JSON.parse(localStorage.getItem('LM_MEMBERS') || '[]');
  if (!existingMembers || existingMembers.length === 0) {
    localStorage.setItem('LM_MEMBERS', JSON.stringify([
      { member_no: 'M001', member_name: '홍길동', hp: '010-1234-5678', member_grade: '일반', grade_cd: 'GENERAL', status_cd: 'ACTIVE', total_point: 5000, discount_rate: 0.0 },
      { member_no: 'M002', member_name: '이골프', hp: '010-9988-7766', member_grade: '우수', grade_cd: 'GOLD', status_cd: 'ACTIVE', total_point: 12000, discount_rate: 5.0 },
      { member_no: 'M003', member_name: '박프로', hp: '010-5544-3322', member_grade: 'VIP', grade_cd: 'VIP', status_cd: 'ACTIVE', total_point: 35000, discount_rate: 10.0 },
    ]));
  }

  if (!localStorage.getItem('LM_LOCKERS')) localStorage.setItem('LM_LOCKERS', JSON.stringify([]));
  if (!localStorage.getItem('LM_SALES')) localStorage.setItem('LM_SALES', JSON.stringify([]));
  if (!localStorage.getItem('LM_PAR3_SLOTS')) localStorage.setItem('LM_PAR3_SLOTS', JSON.stringify([]));
  localStorage.setItem('LM_KIOSK_EDGEDB_INIT', 'true');
  console.log('⛳ LocalMaster Kiosk: Edge DB Seeded & Ready.');
};

// 즉시 초기화 실행
initializeEdgeDB();

// --------------------------------------------------------------------------
// 🔗 Hybrid API Client Implementation
// --------------------------------------------------------------------------

// 미들웨어 직접 통신 URL (Edge DB 오프라인 모드 전용)
// 환경변수 또는 localStorage 설정에서 읽음
const MIDDLEWARE_URL = import.meta.env.VITE_MIDDLEWARE_URL || localStorage.getItem('LM_MIDDLEWARE_URL') || 'http://127.0.0.1:5001';
// [Fix-4] KIOSK_WS_KEY: .env 또는 localStorage 설정에서 읽음
const KIOSK_WS_KEY = import.meta.env.VITE_KIOSK_WS_KEY || localStorage.getItem('LM_KIOSK_WS_KEY') || 'kiosk-ws-key-2025';
// [Fix-4] 미들웨어 API Key: .env 또는 localStorage 설정에서 읽음
const MIDDLEWARE_API_KEY_CLIENT = import.meta.env.VITE_MIDDLEWARE_API_KEY || localStorage.getItem('LM_MIDDLEWARE_API_KEY') || 'secret-key-changeme';
export const isDemoEnvironment = (): boolean => {
  if (typeof window === 'undefined') return false;
  return (
    import.meta.env.VITE_DEMO_MODE === 'true' ||
    window.location.search.includes('demo=true') ||
    window.location.pathname.includes('/demo/') ||
    window.location.hostname === 'segnet.co.kr'
  );
};

class HybridAPIClient {
  private terminalId: string;
  private isOnline: boolean = true;
  private ws: WebSocket | null = null;                   // [Phase 2: WS-2] 실시간 WS 연결
  private wsReconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private bayUpdateListeners: Array<(data: Bay) => void> = [];

  constructor() {
    // 키오스크 단말기 고유 ID 생성 (윈도우 맥 주소 대체 등)
    let tid = localStorage.getItem('LM_KIOSK_TERMINAL_ID');
    if (!tid) {
      tid = `T-${Math.random().toString(36).substring(2, 9).toUpperCase()}`;
      localStorage.setItem('LM_KIOSK_TERMINAL_ID', tid);
    }
    this.terminalId = tid;
  }

  public getStoreCd(): string {
    return import.meta.env.VITE_STORE_CODE || localStorage.getItem('LM_STORE_CD') || STORE_CODE;
  }

  getTerminalId() {
    return this.terminalId;
  }

  /**
   * 🔄 백엔드 /api/v1/kiosk/master 마스터 데이터 연동 및 실시간 상태 바인딩
   * - 온라인 시: /api/v1/kiosk/master 수신 후 Edge DB (localStorage) 및 state에 바인딩
   * - 오프라인 시: Edge DB 캐시 로드
   */
  async getKioskMasterData(): Promise<KioskMasterResponse> {
    const isConnected = await this.checkConnection();
    const storeCd = this.getStoreCd();

    if (isConnected) {
      try {
        const res = await fetch(`${BASE_URL}/v1/kiosk/master?store_cd=${encodeURIComponent(storeCd)}`, {
          headers: this.getSecureHeaders()
        });
        if (res.ok) {
          const masterData: KioskMasterResponse = await res.json();

          // Edge DB 캐시 실시간 바인딩 & 저장
          if (masterData.bays) {
            if (masterData.bays.length > 0 && masterData.bays[0].server_epoch_ms) {
              TimeMaster.syncServerTime(masterData.bays[0].server_epoch_ms);
            }
            localStorage.setItem('LM_BAYS', JSON.stringify(masterData.bays));
          }
          if (masterData.lockers) localStorage.setItem('LM_LOCKERS', JSON.stringify(masterData.lockers));
          if (masterData.products) localStorage.setItem('LM_PRODUCTS', JSON.stringify(masterData.products));
          if (masterData.members) localStorage.setItem('LM_MEMBERS', JSON.stringify(masterData.members));
          if (masterData.par3_slots) localStorage.setItem('LM_PAR3_SLOTS', JSON.stringify(masterData.par3_slots));
          if (masterData.store_info) localStorage.setItem('LM_STORE_INFO', JSON.stringify(masterData.store_info));
          if (masterData.zones) localStorage.setItem('LM_ZONES', JSON.stringify(masterData.zones));

          return masterData;
        }
      } catch (err) {
        console.error('[Master API] 백엔드 마스터 수신 실패, 오프라인 Edge DB로 전환:', err);
      }
    }

    const cachedBays = JSON.parse(localStorage.getItem('LM_BAYS') || '[]');
    const baysToReturn = (cachedBays && cachedBays.length === 50) ? cachedBays : generateDefault50Bays();

    const cachedZones = JSON.parse(localStorage.getItem('LM_ZONES') || '[]');
    const zonesToReturn = (cachedZones && cachedZones.length > 0) ? cachedZones : DEFAULT_50_ZONES;

    return {
      store_info: JSON.parse(localStorage.getItem('LM_STORE_INFO') || '{}'),
      zones: zonesToReturn,
      bays: baysToReturn,
      lockers: JSON.parse(localStorage.getItem('LM_LOCKERS') || '[]'),
      products: JSON.parse(localStorage.getItem('LM_PRODUCTS') || '[]'),
      members: JSON.parse(localStorage.getItem('LM_MEMBERS') || '[]'),
      par3_slots: JSON.parse(localStorage.getItem('LM_PAR3_SLOTS') || '[]')
    };
  }


  /**
   * 범용 GET 요청 헬퍼 (백엔드 API 호출용)
   */
  async get<T = any>(endpoint: string): Promise<{ data: T }> {
    const cleanUrl = endpoint.startsWith('http') ? endpoint : `${BASE_URL}${endpoint.startsWith('/') ? '' : '/'}${endpoint}`;
    const res = await fetch(cleanUrl, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
      },
    });
    if (!res.ok) {
      throw new Error(`HTTP Error ${res.status}: ${res.statusText}`);
    }
    const data = await res.json();
    return { data };
  }

  // 미들웨어 통합 제어 센터 헬스체크 (데모 쇼룸 및 엣지 모드 100% ONLINE 보장)
  async getMiddlewareStatus(): Promise<{ online: boolean; status: string }> {
    // 1. 데모 쇼룸 모드 또는 브라우저 데모 환경 감지 시 항상 ONLINE 반환
    if (
      import.meta.env.VITE_DEMO_MODE === 'true' ||
      (typeof window !== 'undefined' && (
        window.location.search.includes('demo=true') ||
        window.location.pathname.includes('/demo/') ||
        window.location.hostname === 'segnet.co.kr' ||
        window.location.hostname === 'localhost'
      ))
    ) {
      return { online: true, status: 'ONLINE' };
    }

    try {
      const res = await fetch(`${BASE_URL}/v1/kiosk/middleware/status`, {
        headers: { 'x-store-cd': this.getStoreCd() }
      });
      if (res.ok) {
        return await res.json();
      }
      return { online: true, status: 'ONLINE' }; // 엣지 오프라인 자율 모드 지원
    } catch {
      return { online: true, status: 'ONLINE' };
    }
  }

  // =========================================================================
  // [Phase 2: WS-2] WebSocket 실시간 연결 관리
  // 배정 완료/해제 이벤트를 폴링 없이 즉시 수신합니다.
  // 연결 실패 시 15초 후 자동 재연결 (Exponential Backoff).
  // =========================================================================
  connectBayWebSocket(onBayUpdate: (data: Bay) => void, onMessage?: (msg: unknown) => void): () => void {
    this.bayUpdateListeners.push(onBayUpdate);
    
    // 데모 쇼룸 환경에서는 원격 소켓 연결을 스킵하여 CORS 및 불필요한 재연결 에러 차단
    if (isDemoEnvironment()) {
      return () => {
        this.bayUpdateListeners = this.bayUpdateListeners.filter(l => l !== onBayUpdate);
      };
    }
    
    const storeCd = this.getStoreCd();
    // [Fix-4] WS_BASE_URL 기반으로 동적 생성 (localhost:8000 하드코딩 제거)
    const wsUrl = `${WS_BASE_URL}/ws/kiosk?store_cd=${encodeURIComponent(storeCd)}&terminal_id=${encodeURIComponent(this.terminalId)}&api_key=${encodeURIComponent(KIOSK_WS_KEY)}`;

    const connect = () => {
      if (this.ws && this.ws.readyState <= WebSocket.OPEN) return;
      
      try {
        this.ws = new WebSocket(wsUrl);

        this.ws.onopen = () => {
          console.log('[WS-Kiosk] 연결 수립:', wsUrl);
          if (this.wsReconnectTimer) {
            clearTimeout(this.wsReconnectTimer);
            this.wsReconnectTimer = null;
          }
          // [Reconnection Refresh Guard] 소켓 재연결 수립 즉시 최신 타석 상태 강제 재동기화
          this.getBays().then(bays => {
            bays.forEach(bay => {
              this.bayUpdateListeners.forEach(listener => listener(bay));
            });
          }).catch(err => {
            console.error('[WS-Kiosk] 재연결 타석 동기화 실패:', err);
          });
          // Ping 유지 (30초마다)
          const pingInterval = setInterval(() => {
            if (this.ws?.readyState === WebSocket.OPEN) {
              this.ws.send('PING');
            } else {
              clearInterval(pingInterval);
            }
          }, 30000);
        };

        this.ws.onmessage = (evt) => {
          try {
            const data = JSON.parse(evt.data) as Record<string, unknown>;
            onMessage?.(data);

            const eventType = String(data.type || data.event || '');
            const bayObj = (data.bay as Record<string, unknown>) || data;
            const bayNo = (bayObj.bay_no as number) || (data.bay_no as number);

            if (['bay_updated', 'bay_update', 'bay_status_updated', 'bay_preoccupy'].includes(eventType)) {
              // Edge DB LocalStorage 즉시 동기화
              const bays = JSON.parse(localStorage.getItem('LM_BAYS') || '[]') as Bay[];
              const idx = bays.findIndex(b => b.bay_no === bayNo);
              if (idx !== -1) {
                const newStatus = (bayObj.status as string) || (data.status as string) || (eventType === 'bay_preoccupy' ? 'PRE_OCCUPIED' : bays[idx].status);
                bays[idx] = {
                  ...bays[idx],
                  status: newStatus as any,
                  current_user_name: (bayObj.member_name as string) || (bayObj.user_name as string) || (newStatus === 'AVAILABLE' ? null : bays[idx].current_user_name),
                  end_time: (bayObj.end_time as string) || bays[idx].end_time,
                  end_epoch_ms: (bayObj.end_epoch_ms as number) || bays[idx].end_epoch_ms,
                  server_epoch_ms: (data.server_epoch_ms as number) || (bayObj.server_epoch_ms as number) || Date.now(),
                  prepare_expired_epoch_ms: (bayObj.prepare_expired_epoch_ms as number) || bays[idx].prepare_expired_epoch_ms,
                  lock_terminal_id: (data.terminal_id as string) || (bayObj.lock_terminal_id as string) || (newStatus === 'AVAILABLE' ? null : bays[idx].lock_terminal_id),
                };
                localStorage.setItem('LM_BAYS', JSON.stringify(bays));
                this.bayUpdateListeners.forEach(listener => listener(bays[idx]));
              }
            }

            // bay_release: 종료된 타석 AVAILABLE 복원
            if (eventType === 'bay_release') {
              const bays = JSON.parse(localStorage.getItem('LM_BAYS') || '[]') as Bay[];
              const bayNos = (data.bay_nos as number[]) || (data.bay_no ? [data.bay_no as number] : []);
              let changed = false;
              for (const bNo of bayNos) {
                const idx = bays.findIndex(b => b.bay_no === bNo);
                if (idx !== -1) {
                  bays[idx].status = 'AVAILABLE';
                  bays[idx].current_user_name = null;
                  bays[idx].end_time = null;
                  bays[idx].end_epoch_ms = undefined;
                  bays[idx].minutes_left = undefined;
                  bays[idx].lock_terminal_id = null;
                  this.bayUpdateListeners.forEach(listener => listener(bays[idx]));
                  changed = true;
                }
              }
              if (changed) localStorage.setItem('LM_BAYS', JSON.stringify(bays));
            }
          } catch (e) {
            console.warn('[WS-Kiosk] 메시지 파싱 실패:', e);
          }
        };

        this.ws.onclose = (evt) => {
          console.warn(`[WS-Kiosk] 연결 해제됨 (code=${evt.code}). 3초 후 자동 재연결 시도...`);
          this.ws = null;
          // 자동 재연결 (1008: 인증 실패는 제외)
          if (evt.code !== 1008) {
            this.wsReconnectTimer = setTimeout(connect, 3000);
          }
        };

        this.ws.onerror = () => {
          // 새로고침이나 네트워크 재연결 시 자연스러운 이벤트이므로 콘솔 빨간 에러 노이즈 억제
        };
      } catch (e) {
        this.wsReconnectTimer = setTimeout(connect, 3000);
      }
    };

    connect();

    // Cleanup 함수 반환 (전역 소켓 보존 및 구독 리스너만 해제)
    return () => {
      this.bayUpdateListeners = this.bayUpdateListeners.filter(l => l !== onBayUpdate);
      if (this.bayUpdateListeners.length === 0) {
        if (this.wsReconnectTimer) {
          clearTimeout(this.wsReconnectTimer);
          this.wsReconnectTimer = null;
        }
        if (this.ws) {
          this.ws.onclose = null;
          this.ws.close();
          this.ws = null;
        }
      }
    };
  }

  // =========================================================================
  // [Phase 2: MW-1] Edge DB 오프라인 모드 전용 — 미들웨어 직접 HTTP 호출
  // 백엔드 서버가 다운된 상태에서도 타석 하드웨어를 가동합니다.
  // MIDDLEWARE_URL은 localhost:5001 기본값 (LM_MIDDLEWARE_URL로 재정의 가능)
  // =========================================================================
  async activateMiddlewareDirect(bayNo: number, durationMin: number, memberName: string = '손님'): Promise<boolean> {
    const endTime = new Date();
    endTime.setMinutes(endTime.getMinutes() + durationMin);
    const endTimeStr = `${String(endTime.getHours()).padStart(2, '0')}:${String(endTime.getMinutes()).padStart(2, '0')}`;

    try {
      const response = await fetch(`${MIDDLEWARE_URL}/api/seat/${bayNo}/assign`, {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'X-API-Key': MIDDLEWARE_API_KEY_CLIENT
        },
        body: JSON.stringify({
          priority: 5,
          time: durationMin,
          balls: 0,
          member_name: memberName,
          memberName: memberName,
          user_name: memberName,
          userName: memberName,
          product_name: `일일 타석권 ${durationMin}분`,
          productName: `일일 타석권 ${durationMin}분`,
          end_time: endTimeStr,
          endTime: endTimeStr
        })
      });
      
      if (response.ok) {
        console.log(`[MW-Direct] Bay ${bayNo} 미들웨어 직접 가동 성공`);
        return true;
      }
      console.warn(`[MW-Direct] Bay ${bayNo} 미들웨어 응답 오류: ${response.status}`);
      return false;
    } catch (err) {
      console.error(`[MW-Direct] Bay ${bayNo} 미들웨어 연결 실패:`, err);
      return false;
    }
  }

  // [Security Layer 2] 단말기 시큐어 헤더 공통 생성기
  getSecureHeaders(additionalHeaders: Record<string, string> = {}): Record<string, string> {
    const timestamp = Math.floor(Date.now() / 1000).toString();
    return {
      'x-store-cd': STORE_CODE,
      'x-terminal-id': this.terminalId,
      'x-timestamp': timestamp,
      ...additionalHeaders
    };
  }

  // 네트워크 헬스 체크
  async checkConnection(): Promise<boolean> {
    // 데모 쇼룸 환경에서는 localhost 백엔드 fetch를 시도하지 않고 즉시 Edge DB 사용
    if (isDemoEnvironment()) {
      this.isOnline = false;
      return false;
    }

    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 2000); // 2초 타임아웃
      const res = await fetch(`${BASE_URL}/store`, { 
        method: 'GET',
        headers: this.getSecureHeaders(),
        signal: controller.signal
      });
      clearTimeout(timeoutId);
      this.isOnline = res.ok;
      return res.ok;
    } catch {
      this.isOnline = false;
      return false;
    }
  }

  // 가맹점 상호명 및 동적 체크인 정책 종합 정보 조회 (Local Fallback 포함)
  async getStoreInfo(): Promise<{
    store_nm: string;
    checkin_policy: string;
    address: string;
    tel: string;
    logo_url?: string;
    photo_url?: string;
    meta_data?: any;
  }> {
    const isConnected = await this.checkConnection();
    if (isConnected) {
      try {
        const res = await fetch(`${BASE_URL}/v1/kiosk/store-info?store_cd=${this.getStoreCd()}`);
        if (res.ok) {
          const data = await res.json();
          localStorage.setItem('LM_STORE_INFO', JSON.stringify(data));
          return {
            store_nm: data.store_nm || 'SGM Golf Academy',
            checkin_policy: data.checkin_policy || 'CHECKIN_REQUIRED',
            address: data.address || '서울특별시 광진구 워커힐로 177',
            tel: data.tel || '02-450-4500',
            logo_url: data.logo_url || undefined,
            photo_url: data.photo_url || undefined,
            meta_data: data.meta_data
          };
        }
      } catch (err) {
        console.warn('Backend getStoreInfo failed, using local cache:', err);
      }
    }
    // Offline Fallback
    const cached = JSON.parse(localStorage.getItem('LM_STORE_INFO') || '{}');
    return {
      store_nm: cached.store_nm || '로컬마스터 강남 1호점 (체험관)',
      checkin_policy: cached.checkin_policy || 'CHECKIN_REQUIRED',
      address: cached.address || '서울특별시 강남구 테헤란로 123',
      tel: cached.tel || '1566-8705',
      logo_url: cached.logo_url || undefined,
      photo_url: cached.photo_url || undefined,
      meta_data: cached.meta_data || { integration: { face_terminal_yn: true } }
    };
  }

  // 동적 키오스크 시스템 설정 (메뉴 On/Off 및 구역 매칭) 조회
  async getKioskSystemSettings(): Promise<any> {
    if (isDemoEnvironment()) return null;
    try {
      const res = await fetch(`${BASE_URL}/v1/kiosk/config?store_cd=${this.getStoreCd()}`);
      if (res.ok) {
        const data = await res.json();
        return data || null;
      }
    } catch (err) {
      console.warn('Failed to fetch kiosk system settings:', err);
    }
    return null;
  }

  async getStoreName(): Promise<string> {
    const info = await this.getStoreInfo();
    return info.store_nm;
  }

  async getCheckinPolicy(): Promise<string> {
    const info = await this.getStoreInfo();
    return info.checkin_policy;
  }

  // 1. 회원 조회 (QR 또는 휴대폰 번호)
  async getMember(query: string): Promise<Member | null> {
    const isConnected = await this.checkConnection();
    console.log(`[LM_KIOSK] Auth Query: "${query}". Network Connection: ${isConnected ? 'ONLINE' : 'OFFLINE(EdgeDB)'}`);
    
    if (isConnected) {
      try {
        // 백엔드 키오스크 전용 익명 회원 조회 API 호출 (/v1/kiosk/member 경로 매핑)
        const res = await fetch(`${BASE_URL}/v1/kiosk/member?store_cd=${STORE_CODE}&query=${encodeURIComponent(query)}`);
        if (res.ok) {
          const member = await res.json();
          if (member) {
            return member as Member;
          }
        }
      } catch (err) {
        console.error('Backend member query failed. Falling back to EdgeDB:', err);
      }
    }

    // Edge DB 모드
    const members = JSON.parse(localStorage.getItem('LM_MEMBERS') || '[]') as Member[];
    const cleanSearch = query.replace(/[^0-9]/g, '');
    
    const found = members.find(m => 
      m.member_no.toUpperCase() === query.toUpperCase() ||
      m.member_name === query ||
      m.hp.replace(/[^0-9]/g, '') === cleanSearch ||
      m.hp.includes(query)
    );

    return found || null;
  }

  async getMemberByHp(hp: string): Promise<Member | null> {
    return this.getMember(hp);
  }

  // 1-B. 약관 정보 조회 (개인정보 및 마케팅 약관)
  async getTerms(): Promise<{ privacy_title: string; privacy_content: string; marketing_title: string; marketing_content: string }> {
    const defaultTerms = {
      privacy_title: "개인정보 수집 및 이용 약관",
      privacy_content: "본 매장은 무인 타석 배정, 예약 알림톡 발송 및 회원 관리를 위해 필수적인 최소한의 개인정보(이름, 휴대폰 번호)를 수집 및 이용합니다.",
      marketing_title: "마케팅 정보 수신 동의 (선택)",
      marketing_content: "할인 쿠폰, 이벤트 혜택, 대회 안내 등의 마케팅 소식을 SMS 및 카카오 알림톡으로 받아보실 수 있습니다."
    };

    try {
      const res = await fetch(`${BASE_URL}/v1/public/stores/${STORE_CODE}/terms`);
      if (res.ok) {
        const data = await res.json();
        return {
          privacy_title: defaultTerms.privacy_title,
          privacy_content: data.privacy || defaultTerms.privacy_content,
          marketing_title: defaultTerms.marketing_title,
          marketing_content: data.marketing || defaultTerms.marketing_content
        };
      }
    } catch {
      // Offline fallback
    }
    return defaultTerms;
  }

  // 2. 타석 목록 및 상태 조회
  async getBays(): Promise<Bay[]> {
    const isConnected = await this.checkConnection();
    
    if (isConnected) {
      try {
        const res = await fetch(`${BASE_URL}/bays/`, {
          headers: { 'x-store-cd': this.getStoreCd() }
        });
        if (res.ok) {
          const bayList = (await res.json()) as Bay[];
          if (bayList && bayList.length > 0 && bayList[0].server_epoch_ms) {
            TimeMaster.syncServerTime(bayList[0].server_epoch_ms);
          }
          return bayList;
        }
      } catch (err) {
        console.error('Backend getBays failed. Falling back to EdgeDB:', err);
      }
    }

    let bays = JSON.parse(localStorage.getItem('LM_BAYS') || '[]') as Bay[];
    if (!bays || bays.length !== 50) {
      bays = generateDefault50Bays();
    }
    const now = new Date();
    
    const updatedBays = bays.map(bay => {
      if (bay.status === 'OCCUPIED' && bay.end_time) {
        const endDt = TimeMaster.parseSessionEnd(bay.end_time, now);
        if (endDt && endDt <= now) {
          // 이용시간 종료 -> 빈 타석으로 변경
          return {
            ...bay,
            status: 'AVAILABLE',
            current_user_name: null,
            current_user_hp: null,
            end_time: null,
            minutes_left: undefined
          } as Bay;
        } else {
          return {
            ...bay,
            minutes_left: TimeMaster.getRemainingMinutes(bay, now)
          };
        }
      }
      return bay;
    });

    localStorage.setItem('LM_BAYS', JSON.stringify(updatedBays));
    return updatedBays;
  }

  // 3. 타석 선점 (Preoccupy) - 동시성 방어용
  // 3. 타석 선점 (Pre-emption) - 단일 및 다중 타석 지원
  async preoccupyBay(bayNo: number): Promise<boolean> {
    return this.preoccupyBays([bayNo]);
  }

  async preoccupyBays(bayNos: number[]): Promise<boolean> {
    if (!bayNos || bayNos.length === 0) return false;
    const isConnected = await this.checkConnection();
    
    if (isConnected) {
      try {
        const res = await fetch(`${BASE_URL}/bays/preoccupy`, {
          method: 'POST',
          headers: { 
            'Content-Type': 'application/json',
            'x-store-cd': STORE_CODE
          },
          body: JSON.stringify({
            bay_nos: bayNos,
            terminal_id: this.terminalId
          })
        });
        if (res.ok) return true;
        // 서버가 명시적으로 점유 거절(409/400 등)한 경우 Edge DB로 Fallback하지 않고 즉시 실패 반환
        if (res.status === 409 || res.status === 400 || res.status === 422) {
          console.warn(`[Preoccupy] 서버에서 타석 선점 거절 (HTTP ${res.status})`);
          return false;
        }
      } catch (err) {
        console.error('Backend preoccupy failed. Falling back to EdgeDB:', err);
      }
    }

    // Edge DB 모드
    const bays = JSON.parse(localStorage.getItem('LM_BAYS') || '[]') as Bay[];
    let allAvailable = true;
    for (const bayNo of bayNos) {
      const b = bays.find(item => item.bay_no === bayNo);
      if (!b || (b.status !== 'AVAILABLE' && b.status !== 'PRE_OCCUPIED')) {
        allAvailable = false;
        break;
      }
    }

    if (allAvailable) {
      const expires = new Date();
      expires.setMinutes(expires.getMinutes() + 2); // 다중선점은 2분간 유효
      
      bayNos.forEach(bayNo => {
        const idx = bays.findIndex(b => b.bay_no === bayNo);
        if (idx !== -1) {
          bays[idx].status = 'PRE_OCCUPIED';
          bays[idx].lock_terminal_id = this.terminalId;
          bays[idx].lock_expired_at = expires.toISOString();
        }
      });
      
      localStorage.setItem('LM_BAYS', JSON.stringify(bays));
      return true;
    }
    
    return false;
  }

  // 4. 타석 선점 해제 (Release) - 단일 및 다중 타석 지원
  async releaseBay(bayNo: number): Promise<void> {
    return this.releaseBays([bayNo]);
  }

  // 5. 키오스크 전용 예약 타석 체크인 API
  async getMemberCheckinReservations(memberNo: string): Promise<any[]> {
    const isConnected = await this.checkConnection();
    if (isConnected) {
      try {
        const res = await fetch(`${BASE_URL}/v1/kiosk/checkin/reservations?store_cd=${this.getStoreCd()}&member_no=${memberNo}`);
        if (res.ok) {
          return await res.json();
        }
      } catch (err) {
        console.warn('Backend getMemberCheckinReservations failed, fallback to local storage:', err);
      }
    }
    // Local Fallback
    const reservations = JSON.parse(localStorage.getItem('LM_RESERVATIONS') || '[]') as any[];
    return reservations.filter(r => r.member_no === memberNo && ['RSV', 'REQ', 'HOLD', 'CHK'].includes(r.status_cd));
  }

  async verifyKioskCheckin(memberNo: string, resId?: string): Promise<{ success: boolean; message: string; bay_no?: number }> {
    const isConnected = await this.checkConnection();
    if (isConnected) {
      try {
        const res = await fetch(`${BASE_URL}/v1/kiosk/checkin/verify`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            store_cd: this.getStoreCd(),
            member_no: memberNo,
            res_id: resId
          })
        });
        if (res.ok) {
          return await res.json();
        }
      } catch (err) {
        console.warn('Backend verifyKioskCheckin failed, fallback to local:', err);
      }
    }

    // Local Fallback
    const reservations = JSON.parse(localStorage.getItem('LM_RESERVATIONS') || '[]') as any[];
    const target = reservations.find(r => r.member_no === memberNo && (!resId || r.res_id === resId));
    if (target) {
      target.status_cd = 'CHK';
      localStorage.setItem('LM_RESERVATIONS', JSON.stringify(reservations));
      const bayNo = parseInt(target.resource_no || '1') || 1;
      return { success: true, message: `${bayNo}번 타석 체크인이 완료되었습니다.`, bay_no: bayNo };
    }
    return { success: false, message: '당일 체크인 가능한 타석 예약 내역이 없습니다.' };
  }

  async releaseBays(bayNos: number[]): Promise<void> {
    if (!bayNos || bayNos.length === 0) return;
    const isConnected = await this.checkConnection();
    
    if (isConnected) {
      try {
        await fetch(`${BASE_URL}/bays/release`, {
          method: 'POST',
          headers: { 
            'Content-Type': 'application/json',
            'x-store-cd': STORE_CODE
          },
          body: JSON.stringify({
            bay_nos: bayNos,
            terminal_id: this.terminalId
          })
        });
        return;
      } catch (err) {
        console.error('Backend release failed:', err);
      }
    }

    // Edge DB 모드
    const bays = JSON.parse(localStorage.getItem('LM_BAYS') || '[]') as Bay[];
    bayNos.forEach(bayNo => {
      const targetIdx = bays.findIndex(b => b.bay_no === bayNo);
      if (targetIdx !== -1 && bays[targetIdx].status === 'PRE_OCCUPIED' && bays[targetIdx].lock_terminal_id === this.terminalId) {
        bays[targetIdx].status = 'AVAILABLE';
        bays[targetIdx].lock_terminal_id = null;
        bays[targetIdx].lock_expired_at = null;
      }
    });
    localStorage.setItem('LM_BAYS', JSON.stringify(bays));
  }

  // 5. 타석 최종 배정 완료 — [BUG-1·2·3 FIX] 통합 API 단일 호출 (/v1/kiosk/allocate-bay)
  async allocateBay(
    bayNo: number, 
    durationMin: number, 
    memberNo?: string, 
    guestName?: string, 
    hpNo?: string,
    memberItemId?: number | string,
    paymentMethod: 'TICKET' | 'CARD' = 'TICKET',
    amount: number = 0,
    paymentApproval?: Partial<CardApprovalResult>
  ): Promise<{ success: boolean; res_id?: string; message: string; hardware_success?: boolean; start_time?: string; end_time?: string; is_chained?: boolean }> {
    const isConnected = await this.checkConnection();
    const todayStr = new Date().toISOString().slice(0, 10).replace(/-/g, '');

    if (isConnected) {
      try {
        // [BUG-1 FIX] 백엔드 SSOT 라우트 표준 (/v1/kiosk/allocate-bay) 일치화
        const parsedItemId = memberItemId !== undefined && memberItemId !== null ? Number(memberItemId) : null;
        const res = await fetch(`${BASE_URL}/v1/kiosk/allocate-bay?store_cd=${STORE_CODE}`, {
          method: 'POST',
          headers: { 
            'Content-Type': 'application/json',
            'x-store-cd': STORE_CODE
          },
          body: JSON.stringify({
            bay_no: bayNo,
            duration_min: durationMin,
            member_no: memberNo || null,
            guest_name: guestName || null,
            hp_no: hpNo || null,
            member_item_id: isNaN(parsedItemId as number) ? null : parsedItemId,
            payment_method: paymentMethod,     // TICKET(회원권) | CARD(일일권)
            terminal_id: this.terminalId,      // 선점 락 검증 필수값
            amount: amount,                    // 일일권 결제 금액
            approval_no: paymentApproval?.auth_code || null,
            issuer_name: paymentApproval?.issuer_name || null,
            acquirer_name: paymentApproval?.acquirer_name || null,
            card_no_masked: paymentApproval?.card_no_masked || null,
            installment_months: paymentApproval?.installment_months ?? 0,
            van_tr_no: paymentApproval?.van_tr_no || paymentApproval?.auth_code || null,
            raw_data: paymentApproval?.raw_response || null,
          })
        });

        if (res.ok) {
          const data = await res.json();
          // 로컬스토리지 즉시 동기화 (폴링 5초 지연 없이 UI 반영)
          const bays = JSON.parse(localStorage.getItem('LM_BAYS') || '[]') as Bay[];
          const targetIdx = bays.findIndex(b => b.bay_no === bayNo);
          if (targetIdx !== -1) {
            const end = new Date();
            end.setMinutes(end.getMinutes() + durationMin);
            const end_time = `${String(end.getHours()).padStart(2, '0')}${String(end.getMinutes()).padStart(2, '0')}`;
            bays[targetIdx].status = 'OCCUPIED';
            bays[targetIdx].current_user_name = guestName || memberNo || '손님';
            bays[targetIdx].end_time = end_time;
            bays[targetIdx].minutes_left = durationMin;
            bays[targetIdx].lock_terminal_id = null;
            bays[targetIdx].lock_expired_at = null;
            localStorage.setItem('LM_BAYS', JSON.stringify(bays));
          }
          return { 
            success: true, 
            res_id: data.res_id, 
            message: data.message || '타석 배정이 완료되었습니다.',
            hardware_success: data.hardware_success,
            start_time: data.start_time,
            end_time: data.end_time,
            is_chained: data.is_chained
          };
        } else {
          const errData = await res.json().catch(() => ({ detail: `HTTP ${res.status} 오류가 발생했습니다.` }));
          let errMsg: string;
          if (errData.detail && typeof errData.detail === 'object') {
            errMsg = String(errData.detail.message || errData.detail.detail || JSON.stringify(errData.detail));
          } else {
            errMsg = String(errData.detail || errData.message || `타석 배정에 실패했습니다. (코드: ${res.status})`);
          }
          return { success: false, message: errMsg };
        }
      } catch (err) {
        console.error('[BUG-1 FIX] 통합 배정 API 호출 실패, Edge DB 폴백:', err);
      }
    }

    // Edge DB 모드 (offline fallback)
    const bays = JSON.parse(localStorage.getItem('LM_BAYS') || '[]') as Bay[];
    const targetIdx = bays.findIndex(b => b.bay_no === bayNo);
    
    if (targetIdx !== -1) {
      const end = new Date();
      end.setMinutes(end.getMinutes() + durationMin);
      const end_time = `${String(end.getHours()).padStart(2, '0')}${String(end.getMinutes()).padStart(2, '0')}`;

      bays[targetIdx].status = 'OCCUPIED';
      bays[targetIdx].current_user_name = guestName || (memberNo ? (await this.getMember(memberNo))?.member_name : 'Guest');
      bays[targetIdx].current_user_hp = hpNo || null;
      bays[targetIdx].end_time = end_time;
      bays[targetIdx].minutes_left = durationMin;
      bays[targetIdx].lock_terminal_id = null;
      bays[targetIdx].lock_expired_at = null;

      localStorage.setItem('LM_BAYS', JSON.stringify(bays));
      
      // 일일권 매입 기록 (Edge DB)
      if (paymentMethod === 'CARD' && !memberNo) {
        const sales = JSON.parse(localStorage.getItem('LM_SALES') || '[]') as unknown[];
        sales.push({
          sale_id: `S-${Date.now()}`,
          sale_dt: todayStr,
          total_amt: amount || (durationMin === 60 ? 15000 : 20000),
          pay_amt: amount || (durationMin === 60 ? 15000 : 20000),
          pay_method: 'CARD',
          items: `일일 타석권 ${durationMin}분 배정`,
          status: 'COMPLETED'
        });
        localStorage.setItem('LM_SALES', JSON.stringify(sales));
      }

      // [Phase 2: MW-1] Edge DB 오프라인 모드에서 미들웨어 직접 가동
      // 백엔드가 다운되어도 하드웨어(타석)는 실제로 작동해야 함
      const mwSuccess = await this.activateMiddlewareDirect(
        bayNo, 
        durationMin, 
        guestName || memberNo || '손님'
      );
      if (!mwSuccess) {
        console.warn(`[MW-Direct] Bay ${bayNo} 미들웨어 가동 실패 — 직원에게 문의 필요`);
      }

      return {
        success: true,
        res_id: `R-${Math.random().toString(36).substring(2, 9).toUpperCase()}`,
        message: mwSuccess
          ? '타석 배정이 완료되었습니다. (Edge DB 저장)'
          : '타석 배정이 완료되었으나 기기 가동에 실패했습니다. 직원에게 문의해주세요.'
      };

    }

    return { success: false, message: '타석 상태 변경 실패' };
  }

  // 6. 타석 이동 (사용 중인 타석 변경)
  async moveBay(memberNo: string, targetBayNo: number): Promise<{ success: boolean; message: string }> {
    const isConnected = await this.checkConnection();

    if (isConnected) {
      try {
        // 1. 회원의 현재 실시간 이용 중(USE) 또는 체크인(CHK) 예약 내역 조회
        const resList = await this.getMemberCheckinReservations(memberNo);
        const activeRes = resList.find(r => r.status_cd === 'USE' || r.status_cd === 'CHK' || r.status === 'OCCUPIED');

        if (activeRes && activeRes.res_id) {
          const moveRes = await fetch(`${BASE_URL}/reservations/${activeRes.res_id}/move`, {
            method: 'PATCH',
            headers: {
              'Content-Type': 'application/json',
              'x-store-cd': STORE_CODE
            },
            body: JSON.stringify({
              resource_no: targetBayNo
            })
          });

          if (moveRes.ok) {
            const data = await moveRes.json();
            return {
              success: true,
              message: data.message || `타석이 ${targetBayNo}번으로 성공적으로 변경되었습니다.`
            };
          }
        }
      } catch (err) {
        console.error('Online moveBay failed, falling back to Edge DB:', err);
      }
    }

    // 2. Edge DB 모드 (Fallback)
    const bays = JSON.parse(localStorage.getItem('LM_BAYS') || '[]') as Bay[];
    
    let searchName = memberNo;
    const member = await this.getMember(memberNo);
    if (member) {
      searchName = member.member_name;
    }

    const sourceIdx = bays.findIndex(b => 
      b.status === 'OCCUPIED' && 
      (b.current_user_name === searchName || b.current_user_name === memberNo || (b.current_user_name && b.current_user_name.includes(searchName)))
    );
    const destIdx = bays.findIndex(b => b.bay_no === targetBayNo && b.status === 'AVAILABLE');

    if (sourceIdx !== -1 && destIdx !== -1) {
      const sourceBay = bays[sourceIdx];
      
      // 대상 타석으로 정보 복사
      bays[destIdx].status = 'OCCUPIED';
      bays[destIdx].current_user_name = sourceBay.current_user_name;
      bays[destIdx].current_user_hp = sourceBay.current_user_hp;
      bays[destIdx].end_time = sourceBay.end_time;
      bays[destIdx].minutes_left = sourceBay.minutes_left;

      // 기존 타석 비우기
      bays[sourceIdx].status = 'AVAILABLE';
      bays[sourceIdx].current_user_name = null;
      bays[sourceIdx].current_user_hp = null;
      bays[sourceIdx].end_time = null;
      bays[sourceIdx].minutes_left = undefined;

      localStorage.setItem('LM_BAYS', JSON.stringify(bays));
      return { success: true, message: `타석이 ${targetBayNo}번으로 성공적으로 변경되었습니다.` };
    }

    return { success: false, message: '타석 변경 대상을 찾을 수 없거나 목적지 타석이 비어있지 않습니다.' };
  }

  // 7. 상품 목록 가져오기
  async getProducts(): Promise<Product[]> {
    const isConnected = await this.checkConnection();
    if (isConnected) {
      try {
        const res = await fetch(`${BASE_URL}/v1/kiosk/products?store_cd=${STORE_CODE}`);
        if (res.ok) {
          const prods = await res.json();
          if (Array.isArray(prods) && prods.length > 0) {
            localStorage.setItem('LM_PRODUCTS', JSON.stringify(prods));
            return prods;
          }
        }
      } catch (err) {
        console.error('Failed to fetch kiosk products catalog:', err);
      }
    }
    return JSON.parse(localStorage.getItem('LM_PRODUCTS') || '[]') as Product[];
  }

  // 8. 신규 회원권/일일권 구매 처리
  async purchaseProduct(
    memberNo: string, 
    prodCd: string, 
    payAmt: number
  ): Promise<{ success: boolean; message: string }> {
    const products = await this.getProducts();
    const targetProd = products.find(p => p.prod_cd === prodCd);
    
    if (!targetProd) return { success: false, message: '상품 정보를 찾을 수 없습니다.' };

    const members = JSON.parse(localStorage.getItem('LM_MEMBERS') || '[]') as Member[];
    const mIdx = members.findIndex(m => m.member_no === memberNo);

    if (mIdx !== -1) {
      const today = new Date();
      // 회원 상태 업데이트
      members[mIdx].recent_product_nm = targetProd.prod_nm;
      
      if (targetProd.days) {
        const exp = new Date();
        exp.setDate(exp.getDate() + targetProd.days);
        members[mIdx].expiry_date = exp.toISOString().slice(0, 10);
        members[mIdx].remain_days = targetProd.days;
      }
      
      localStorage.setItem('LM_MEMBERS', JSON.stringify(members));

      // 결제 내역 저장
      const sales = JSON.parse(localStorage.getItem('LM_SALES') || '[]') as unknown[];
      sales.push({
        sale_id: `S-${Date.now()}`,
        sale_dt: today.toISOString().slice(0, 10).replace(/-/g, ''),
        total_amt: payAmt,
        pay_amt: payAmt,
        pay_method: 'CARD',
        items: targetProd.prod_nm,
        status: 'COMPLETED'
      });
      localStorage.setItem('LM_SALES', JSON.stringify(sales));

      return { success: true, message: `${targetProd.prod_nm} 구매 및 결제가 완료되었습니다.` };
    }

    return { success: false, message: '회원 정보를 찾을 수 없습니다.' };
  }

  // 9. 라카 목록 가져오기 (특정 회원의 라카만 가져오는 것도 필요하지만, 기존 호환을 위해 유지)
  async getLockers(): Promise<Locker[]> {
    const isConnected = await this.checkConnection();
    if (isConnected) {
      try {
        const res = await fetch(`${BASE_URL}/v1/kiosk/lockers?store_cd=${STORE_CODE}`);
        if (res.ok) {
          return await res.json() as Locker[];
        }
      } catch (err) {
        console.error('Failed to fetch lockers from backend:', err);
      }
    }
    return JSON.parse(localStorage.getItem('LM_LOCKERS') || '[]') as Locker[];
  }
  
  // 9-1. 특정 회원의 라카 가져오기
  async getMemberLockers(memberNo: string): Promise<Locker[]> {
    const isConnected = await this.checkConnection();
    if (isConnected) {
      try {
        const res = await fetch(`${BASE_URL}/v1/kiosk/members/${memberNo}/lockers?store_cd=${STORE_CODE}`);
        if (res.ok) {
          return await res.json() as Locker[];
        }
      } catch (err) {
        console.error('Failed to fetch member lockers from backend:', err);
      }
    }
    const all = await this.getLockers();
    return all.filter(l => l.member_no === memberNo && (l.status === 'OCCUPIED' || l.status === 'EXPIRED'));
  }


  // 9.1 라카 연장 홀드 API (백엔드 HOLD 예약 생성)
  async holdLockerExtension(
    lockerId: number,
    amount: number,
    prodCd: string
  ): Promise<{ success: boolean; res_id: string; message: string }> {
    const isConnected = await this.checkConnection();
    if (isConnected) {
      try {
        const res = await fetch(`${BASE_URL}/v1/kiosk/lockers/extend/hold?store_cd=${encodeURIComponent(this.getStoreCd())}`, {
          method: 'POST',
          headers: this.getSecureHeaders({ 'Content-Type': 'application/json' }),
          body: JSON.stringify({ locker_id: lockerId, amount, prod_cd: prodCd })
        });
        if (res.ok) {
          return await res.json();
        }
      } catch (err) {
        console.error('[Locker Hold API] 백엔드 HOLD 생성 실패, EdgeDB 폴백:', err);
      }
    }
    const resId = `RES_LOCKER_${Date.now()}_${lockerId}`;
    return { success: true, res_id: resId, message: '오프라인 라카 연장 대기 완료' };
  }

  // 10. 라카 연장 처리
  async extendLocker(
    lockerNo: number, 
    extendDays: number, 
    payAmt: number
  ): Promise<{ success: boolean; message: string }> {
    const lockers = JSON.parse(localStorage.getItem('LM_LOCKERS') || '[]') as Locker[];
    const lIdx = lockers.findIndex(l => l.locker_no === lockerNo);

    if (lIdx !== -1 && (lockers[lIdx].status === 'OCCUPIED' || lockers[lIdx].status === 'EXPIRED') && lockers[lIdx].end_dt) {
      const currentEnd = new Date(lockers[lIdx].end_dt!);
      currentEnd.setDate(currentEnd.getDate() + extendDays);
      
      lockers[lIdx].status = 'OCCUPIED';
      lockers[lIdx].end_dt = currentEnd.toISOString().slice(0, 10);
      localStorage.setItem('LM_LOCKERS', JSON.stringify(lockers));

      // 회원 정보의 락카 만료일도 함께 갱신
      const memberNo = lockers[lIdx].member_no;
      if (memberNo) {
        const members = JSON.parse(localStorage.getItem('LM_MEMBERS') || '[]') as Member[];
        const mIdx = members.findIndex(m => m.member_no === memberNo);
        if (mIdx !== -1) {
          members[mIdx].locker_expiry_date = lockers[lIdx].end_dt;
          localStorage.setItem('LM_MEMBERS', JSON.stringify(members));
        }
      }

      // 결제 기록
      const sales = JSON.parse(localStorage.getItem('LM_SALES') || '[]') as unknown[];
      sales.push({
        sale_id: `S-${Date.now()}`,
        sale_dt: new Date().toISOString().slice(0, 10).replace(/-/g, ''),
        total_amt: payAmt,
        pay_amt: payAmt,
        pay_method: 'CARD',
        items: `라카 ${lockerNo}번 연장 ${extendDays}일`,
        status: 'COMPLETED'
      });
      localStorage.setItem('LM_SALES', JSON.stringify(sales));

      // 감사 로그 추가
      await this.writeKioskLog('LOCKER_EXTEND', `라카 ${lockerNo}번 ${extendDays}일 연장 완료`, memberNo || undefined);

      return { success: true, message: `라카 ${lockerNo}번 연장 결제가 완료되었습니다.` };
    }

    return { success: false, message: '사용 중이 아니거나 연장 가능한 라카가 아닙니다.' };
  }

  // 11. 무인 기기 시스템 감사 로그 (Kiosk System Audit Log) 기록
  async writeKioskLog(action: string, detail: string, memberNo?: string): Promise<void> {
    const logs = JSON.parse(localStorage.getItem('LM_KIOSK_AUDIT_LOGS') || '[]') as unknown[];
    const logId = `L-${Date.now()}-${Math.floor(1000 + Math.random() * 9000)}`;
    const now = new Date();
    
    logs.push({
      log_id: logId,
      timestamp: now.toISOString(),
      action_type: action,
      detail: detail,
      member_no: memberNo || 'GUEST',
      terminal_id: this.terminalId,
      trace_id: `TR-${Math.floor(100000 + Math.random() * 900000)}`
    });

    // 최근 500개만 관리 (오버헤드 방지)
    if (logs.length > 500) {
      logs.shift();
    }

    localStorage.setItem('LM_KIOSK_AUDIT_LOGS', JSON.stringify(logs));
    console.log(`[LM_KIOSK_AUDIT_LOG] [${action}] ${detail} (Trace ID: ${logId})`);
  }

  // 감사 로그 전체 조회
  async getKioskLogs(): Promise<any[]> {
    return JSON.parse(localStorage.getItem('LM_KIOSK_AUDIT_LOGS') || '[]') as unknown[];
  }

  // 12. 키오스크 신규 회원 가입 (30초 즉석 회원가입)
  async registerMember(
    name: string, 
    hp: string, 
    email: string,
    faceRegistered: boolean = false,
    faceVectorId: string | null = null,
    gender: 'M' | 'F' = 'M',
    marketingAgree: boolean = false
  ): Promise<{ success: boolean; member?: Member; message: string }> {
    const isConnected = await this.checkConnection();
    const cleanHp = hp.replace(/[^0-9]/g, '');
    const todayStr = new Date().toISOString().slice(0, 10);
    const newMemberNo = `M${todayStr.replace(/-/g, '').slice(2)}${Math.floor(1000 + Math.random() * 9000)}`; // 고유 회원번호 난수 발급 (타임스탬프+4자리)

    const newMember: Member = {
      member_no: newMemberNo,
      member_name: name,
      hp: hp,
      email: email,
      gender: gender,
      member_grade: '일반',
      grade_cd: 'GENERAL',
      status_cd: '10',
      total_point: 0,
      discount_rate: 0.0,
      recent_product_nm: null,
      expiry_date: null,
      remain_days: 0,
      locker_no: null,
      face_registered: faceRegistered,
      face_vector_id: faceVectorId,
      store_cd: STORE_CODE
    };

    if (isConnected) {
      try {
        const res = await fetch(`${BASE_URL}/v1/kiosk/member?store_cd=${STORE_CODE}`, {
          method: 'POST',
          headers: { 
            'Content-Type': 'application/json',
            'x-store-cd': STORE_CODE
          },
          body: JSON.stringify({
            member_name: name,
            hp: hp,
            email: email,
            store_cd: STORE_CODE,
            gender: gender,
            face_auth_yn: faceRegistered ? 'Y' : 'N',
            marketing_agree_yn: marketingAgree ? 'Y' : 'N'
          })
        });
        if (res.ok) {
          const created = await res.json();
          created.face_registered = faceRegistered;
          created.face_vector_id = faceVectorId;
          created.store_cd = STORE_CODE;
          await this.writeKioskLog('MEMBER_REGISTER', `신규 회원 등록 성공 (백엔드): ${name} (${hp})`, created.member_no);
          return { success: true, member: created, message: '회원가입이 성공적으로 완료되었습니다.' };
        } else {
          const errData = await res.json().catch(() => ({ detail: '회원 등록 중 에러가 발생했습니다.' }));
          return { success: false, message: errData.detail || '회원 등록 실패' };
        }
      } catch (err) {
        console.error('Backend registration failed. Falling back to EdgeDB:', err);
      }
    }

    // Edge DB 모드 저장
    const members = JSON.parse(localStorage.getItem('LM_MEMBERS') || '[]') as Member[];
    
    // 중복 체크 (휴대폰 번호)
    if (members.some(m => m.hp.replace(/[^0-9]/g, '') === cleanHp)) {
      return { success: false, message: '이미 등록된 휴대폰 번호입니다.' };
    }

    members.push(newMember);
    localStorage.setItem('LM_MEMBERS', JSON.stringify(members));

    // 감사 로그 기록
    await this.writeKioskLog('MEMBER_REGISTER', `신규 회원 등록 성공 (EdgeDB): ${name} (${hp})`, newMemberNo);

    return { 
      success: true, 
      member: newMember, 
      message: '회원가입이 성공적으로 완료되었습니다. (Edge DB 저장)' 
    };
  }

  // 13. 안면인식 스캔 API (실시간 백엔드 단말기 API GET /v1/face-terminal/scan-identity 연동)
  async scanFace(deviceIp?: string, externalSignal?: AbortSignal): Promise<Member | null> {
    const ip = deviceIp || localStorage.getItem('face_terminal_ip') || '192.168.45.16';
    const storeCd = this.getStoreCd() || STORE_CODE;

    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 15000); // 15초 타임아웃

      // 외부 취소 시그널 이벤트 리스너 바인딩
      if (externalSignal) {
        externalSignal.addEventListener('abort', () => controller.abort());
      }

      const res = await fetch(`${BASE_URL}/v1/face-terminal/scan-identity?ip=${encodeURIComponent(ip)}&store_cd=${encodeURIComponent(storeCd)}`, {
        method: 'GET',
        headers: { 'Content-Type': 'application/json' },
        signal: externalSignal || controller.signal
      });

      clearTimeout(timeoutId);

      if (res.ok) {
        const data = await res.json();
        if (data && data.success && data.member_id && data.member_id !== 'UNREGISTERED_FACE') {
          console.log(`[Kiosk Face Auth] 안면 식별 성공: member_id=${data.member_id}`);
          const member = await this.getMember(data.member_id);
          return member;
        }
      }
    } catch (err: any) {
      if (err.name === 'AbortError') {
        console.log('[Kiosk Face Auth] 안면 스캔 비동기 작업이 취소되었습니다.');
      } else {
        console.warn('[Kiosk Face Auth] 백엔드 안면 단말기 통신 지연/오류:', err);
      }
    }
    return null;
  }

  // 13.1. 프런트포스 표준: 안면 단말기 원격 캡처 수집 모드 시작 (출입 멘트 일시정지)
  async startFaceCaptureMode(deviceIp?: string): Promise<boolean> {
    const ip = deviceIp || localStorage.getItem('face_terminal_ip') || '192.168.45.16';
    try {
      const res = await fetch(`${BASE_URL}/v1/face-terminal/start-capture?ip=${encodeURIComponent(ip)}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' }
      });
      return res.ok;
    } catch (err) {
      console.warn('[Kiosk Face Auth] start-capture 통신 오류 (모사 폴백 가능):', err);
      return false;
    }
  }

  // 13.2. 프런트포스 표준: 단말기 카메라 정면 안면 감지 롱폴링 (이미지 base64 포함 반환)
  async detectFaceCamera(deviceIp?: string): Promise<{ detected: boolean; imageBase64: string }> {
    const ip = deviceIp || localStorage.getItem('face_terminal_ip') || '192.168.45.16';
    try {
      const res = await fetch(`${BASE_URL}/v1/face-terminal/detect-face?ip=${encodeURIComponent(ip)}`, {
        method: 'GET',
        headers: { 'Content-Type': 'application/json' }
      });
      if (res.ok) {
        const data = await res.json();
        const hasFace = data && (data.has_face === true || data.face_detected === true);
        return { detected: hasFace, imageBase64: data?.image_base64 || '' };
      }
    } catch (err) {
      console.warn('[Kiosk Face Auth] detect-face 통신 오류:', err);
    }
    return { detected: false, imageBase64: '' };
  }

  // 13.3. 프런트포스 표준: 안면 단말기 출입 인증 모드 즉시 원복
  async cancelFaceCaptureMode(deviceIp?: string): Promise<boolean> {
    const ip = deviceIp || localStorage.getItem('face_terminal_ip') || '192.168.45.16';
    try {
      const res = await fetch(`${BASE_URL}/v1/face-terminal/cancel-capture?ip=${encodeURIComponent(ip)}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' }
      });
      return res.ok;
    } catch (err) {
      console.warn('[Kiosk Face Auth] cancel-capture 통신 오류:', err);
      return false;
    }
  }

  // 13.4. 프런트포스 표준: 회원 안면 데이터 단말기 동기화 푸시 등록
  async enrollMemberFace(memberNo: string, memberName: string, faceImageBase64?: string, deviceIp?: string): Promise<{ success: boolean; message: string }> {
    const ip = deviceIp || localStorage.getItem('face_terminal_ip') || '192.168.45.16';
    const storeCd = this.getStoreCd() || STORE_CODE;

    try {
      const res = await fetch(`${BASE_URL}/v1/face-terminal/enroll`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          member_id: memberNo,
          member_name: memberName,
          face_image_base64: faceImageBase64 || 'MOCK_FACE_BASE64_DATA',
          device_ip: ip,
          store_cd: storeCd
        })
      });
      if (res.ok) {
        const data = await res.json();
        await this.writeKioskLog('FACE_ENROLL', `안면 정보 단말기 동기화 성공: ${memberName} (${memberNo})`, memberNo);
        return { success: true, message: data.message || '안면 등록 동기화 완료' };
      }
    } catch (err) {
      console.warn('[Kiosk Face Auth] 백엔드 enroll 단말기 동기화 오류 (EdgeDB 진행):', err);
    }
    return this.registerFace(memberNo, `FACE_${memberNo}`);
  }

  // 14. 안면 정보 등록 API
  async registerFace(memberNo: string, faceVectorId: string): Promise<{ success: boolean; message: string }> {
    const members = JSON.parse(localStorage.getItem('LM_MEMBERS') || '[]') as Member[];
    const idx = members.findIndex(m => m.member_no === memberNo);

    if (idx !== -1) {
      members[idx].face_registered = true;
      members[idx].face_vector_id = faceVectorId;
      localStorage.setItem('LM_MEMBERS', JSON.stringify(members));
      
      await this.writeKioskLog('FACE_REGISTER', `안면 정보 등록 완료 (벡터ID: ${faceVectorId})`, memberNo);
      return { success: true, message: '안면 정보가 성공적으로 등록되었습니다.' };
    }

    return { success: false, message: '회원을 찾을 수 없습니다.' };
  }

  // 14.5. 지점의 파3 구역(Zone) 목록 조회 API
  async getKioskZones(): Promise<KioskZone[]> {
    const isConnected = await this.checkConnection();
    if (isConnected) {
      try {
        const res = await fetch(`${BASE_URL}/v1/kiosk/zones?store_cd=${STORE_CODE}`);
        if (res.ok) {
          const zones = await res.json() as KioskZone[];
          if (zones && zones.length > 0) {
            localStorage.setItem('LM_KIOSK_ZONES', JSON.stringify(zones));
            return zones;
          }
        }
      } catch (err) {
        console.error('Backend getKioskZones failed. Falling back to default:', err);
      }
    }
    // 오프라인 폴백: 캐시 또는 기본 EAST/WEST 구역 리턴
    const cached = localStorage.getItem('LM_KIOSK_ZONES');
    if (cached) {
      try {
        const parsed = JSON.parse(cached) as KioskZone[];
        if (parsed && parsed.length > 0) return parsed;
      } catch (e) {}
    }
    return [
      { zone_code: 'EAST', zone_name: '동코스 Par3 (9홀)' },
      { zone_code: 'WEST', zone_name: '서코스 Par3 (9홀)' },
      { zone_code: 'COMPLEX', zone_name: '복합코스 Par3 (18홀)' }
    ];
  }

  // 15. 파3 티오프 시간 슬롯 조회 API
  async getPar3Slots(zoneCode: string, date: string): Promise<Par3Slot[]> {
    const isConnected = await this.checkConnection();
    if (isConnected) {
      try {
        const res = await fetch(`${BASE_URL}/v1/kiosk/facilities/slots?store_cd=${STORE_CODE}&zone_code=${zoneCode}&date=${date}`);
        if (res.ok) {
          return await res.json() as Par3Slot[];
        }
      } catch (err) {
        console.error('Backend getPar3Slots failed. Falling back to EdgeDB:', err);
      }
    }

    // Edge DB 모드
    const allSlots = JSON.parse(localStorage.getItem('LM_PAR3_SLOTS') || '[]') as Par3Slot[];
    return allSlots.filter(s => s.course_nm === zoneCode || (zoneCode === 'EAST' && s.course_nm === 'EAST') || (zoneCode === 'WEST' && s.course_nm === 'WEST') || (zoneCode === 'COMPLEX' && s.course_nm === 'COMPLEX'));
  }

  // 16. 파3 코스 예약 처리 API
  async bookPar3Course(
    zoneCode: string,
    resDate: string,
    timeStr: string,
    amount: number,
    leader: KioskCompanionItem,
    companions: KioskCompanionItem[]
  ): Promise<{ success: boolean; message: string; res_id?: string; price?: number }> {
    const isConnected = await this.checkConnection();
    if (isConnected) {
      try {
        const cleanTime = timeStr.replace(':', '');
        const res = await fetch(`${BASE_URL}/v1/kiosk/facilities/preoccupy?store_cd=${STORE_CODE}`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-store-cd': STORE_CODE
          },
          body: JSON.stringify({
            zone_code: zoneCode,
            res_date: resDate,
            slot_time: cleanTime,
            amount: amount,
            leader: leader,
            companions: companions
          })
        });
        if (res.ok) {
          const data = await res.json();
          return {
            success: data.success,
            message: data.message,
            res_id: data.res_id,
            price: data.price
          };
        } else {
          const data = await res.json();
          return { success: false, message: data.detail || '예약 선점에 실패했습니다.' };
        }
      } catch (err) {
        console.error('Backend preoccupy failed. Falling back to EdgeDB:', err);
      }
    }

    // Edge DB 모드
    const slots = JSON.parse(localStorage.getItem('LM_PAR3_SLOTS') || '[]') as Par3Slot[];
    const idx = slots.findIndex(s => s.course_nm === zoneCode && s.time === timeStr);
    const partySize = 1 + companions.length;

    if (idx !== -1 && slots[idx].status === 'AVAILABLE') {
      slots[idx].status = 'RESERVED';
      slots[idx].current_party_size = partySize;
      localStorage.setItem('LM_PAR3_SLOTS', JSON.stringify(slots));

      const bookingId = `R-HOLD-P3-${Math.random().toString(36).substring(2, 9).toUpperCase()}`;

      const holds = JSON.parse(localStorage.getItem('LM_HOLD_RESERVATIONS') || '[]') as any[];
      // 1. 대표자 Hold 추가
      holds.push({
        res_id: bookingId,
        bay_no: 999,
        duration_min: 60,
        member_no: leader.member_no || null,
        guest_nm: leader.guest_nm || "GUEST",
        hp_no: leader.hp_no
      });
      // 2. 동반자 Hold들 추가
      companions.forEach((c, cIdx) => {
        holds.push({
          res_id: `${bookingId}_M${cIdx + 1}`,
          parent_res_id: bookingId,
          bay_no: 999,
          duration_min: 60,
          member_no: c.member_no || null,
          guest_nm: c.guest_nm || `동반자${cIdx + 1}`,
          hp_no: c.hp_no
        });
      });
      localStorage.setItem('LM_HOLD_RESERVATIONS', JSON.stringify(holds));

      await this.writeKioskLog('PAR3_RESERVATION', `파3 코스 예약 완료 (${zoneCode} 코스, ${timeStr}, ${partySize}명)`, leader.member_no || undefined);

      return {
        success: true,
        message: '파3 예약 선점이 완료되었습니다. 결제 단계로 이동합니다.',
        res_id: bookingId,
        price: amount
      };
    }

    return { success: false, message: '이미 예약되었거나 선택할 수 없는 시간대입니다.' };
  }

  // 결제 승인 후 웹훅 (결제 완료 통보 및 예약 확정 처리)
  async confirmKioskPaymentWebhook(resId: string, amount: number, paymentMethod: string): Promise<boolean> {
    const isConnected = await this.checkConnection();
    if (isConnected) {
      try {
        const res = await fetch(`${BASE_URL}/v1/kiosk/payment-webhook?store_cd=${encodeURIComponent(this.getStoreCd())}`, {
          method: 'POST',
          headers: { 
            'Content-Type': 'application/json',
            'x-store-cd': this.getStoreCd()
          },
          body: JSON.stringify({
            status: 'success',
            payment_method: paymentMethod,
            amount: amount,
            res_id: resId
          })
        });
        return res.ok;
      } catch (err) {
        console.warn('Backend payment webhook failed:', err);
      }
    }
    // Offline / Fallback
    const holds = JSON.parse(localStorage.getItem('LM_HOLD_RESERVATIONS') || '[]') as any[];
    const idx = holds.findIndex(r => r.res_id === resId);
    if (idx !== -1) {
      holds[idx].status_cd = 'RSV';
      localStorage.setItem('LM_HOLD_RESERVATIONS', JSON.stringify(holds));
      await this.writeKioskLog('PAYMENT_OFFLINE', `오프라인 파3 결제 모의 승인 (${resId}, ₩${amount})`, undefined);
      return true;
    }
    return false;
  }

  // 17. 결제용 대기 상태(HOLD) 예약 생성 API
  async createHoldReservation(
    bayNo: number, 
    durationMin: number, 
    memberNo?: string, 
    guestName?: string, 
    hpNo?: string
  ): Promise<{ success: boolean; res_id?: string; message: string }> {
    const isConnected = await this.checkConnection();

    if (isConnected) {
      try {
        const createRes = await fetch(`${BASE_URL}/v1/kiosk/hold-reservation?store_cd=${encodeURIComponent(STORE_CODE)}`, {
          method: 'POST',
          headers: { 
            'Content-Type': 'application/json',
            'x-store-cd': STORE_CODE
          },
          body: JSON.stringify({
            bay_no: bayNo,
            duration_min: durationMin,
            member_no: memberNo || null,
            guest_name: guestName || null,
            hp_no: hpNo || null
          })
        });
        
        if (createRes.ok) {
          const createData = await createRes.json();
          // [Edge DB Mirroring] 온라인 HOLD 성공 시에도 Edge DB 캐시에 저장하여 백엔드 장애 폴백 보장
          const holds = JSON.parse(localStorage.getItem('LM_HOLD_RESERVATIONS') || '[]') as any[];
          holds.push({
            res_id: createData.res_id,
            bay_no: bayNo,
            duration_min: durationMin,
            member_no: memberNo || null,
            guest_nm: guestName || null,
            hp_no: hpNo || null
          });
          localStorage.setItem('LM_HOLD_RESERVATIONS', JSON.stringify(holds));
          return { success: true, res_id: createData.res_id, message: 'HOLD 예약이 생성되었습니다.' };
        }
      } catch (err) {
        console.error('Backend createHoldReservation failed. Falling back to EdgeDB:', err);
      }
    }

    // Edge DB 모드
    const bays = JSON.parse(localStorage.getItem('LM_BAYS') || '[]') as Bay[];
    const targetIdx = bays.findIndex(b => b.bay_no === bayNo);
    if (targetIdx !== -1) {
      const resId = `R-HOLD-${Math.random().toString(36).substring(2, 9).toUpperCase()}`;
      
      const holds = JSON.parse(localStorage.getItem('LM_HOLD_RESERVATIONS') || '[]') as any[];
      holds.push({
        res_id: resId,
        bay_no: bayNo,
        duration_min: durationMin,
        member_no: memberNo || null,
        guest_nm: guestName || null,
        hp_no: hpNo || null
      });
      localStorage.setItem('LM_HOLD_RESERVATIONS', JSON.stringify(holds));

      return {
        success: true,
        res_id: resId,
        message: 'HOLD 예약이 생성되었습니다. (Edge DB)'
      };
    }
    return { success: false, message: '타석 보류 예약 생성 실패' };
  }

  // 18. 결제 취소 시 보류 상태(HOLD) 예약 해제/삭제 API
  async cancelHoldReservation(resId: string): Promise<{ success: boolean; message: string }> {
    const isConnected = await this.checkConnection();

    if (isConnected && !resId.startsWith('R-HOLD-')) {
      try {
        const res = await fetch(`${BASE_URL}/reservations/${resId}/cancel`, {
          method: 'PATCH',
          headers: { 
            'Content-Type': 'application/json',
            'x-store-cd': this.getStoreCd() 
          },
          body: JSON.stringify({ memo: 'Kiosk Cancel' })
        });
        if (res.ok) {
          const holds = JSON.parse(localStorage.getItem('LM_HOLD_RESERVATIONS') || '[]') as any[];
          const filtered = holds.filter((h: any) => h.res_id !== resId);
          localStorage.setItem('LM_HOLD_RESERVATIONS', JSON.stringify(filtered));
          return { success: true, message: '보류 예약이 취소되었습니다.' };
        }
      } catch (err) {
        console.error('Backend cancelHoldReservation failed:', err);
      }
    }

    // Edge DB 모드
    const holds = JSON.parse(localStorage.getItem('LM_HOLD_RESERVATIONS') || '[]') as any[];
    const filtered = holds.filter((h: any) => h.res_id !== resId);
    localStorage.setItem('LM_HOLD_RESERVATIONS', JSON.stringify(filtered));
    return { success: true, message: '보류 예약 취소 완료 (Edge DB)' };
  }

  // 19. 결제 승인 완료 알림 웹훅 API 호출
  async processPaymentWebhook(
    resId: string,
    amount: number,
    paymentMethod: string = "CARD"
  ): Promise<{ success: boolean; message: string }> {
    const isConnected = await this.checkConnection();

    if (isConnected && !resId.startsWith('R-HOLD-')) {
      try {
        const res = await fetch(`${BASE_URL}/v1/kiosk/payment-webhook?store_cd=${STORE_CODE}`, {
          method: 'POST',
          headers: { 
            'Content-Type': 'application/json',
            'x-store-cd': STORE_CODE
          },
          body: JSON.stringify({
            res_id: resId,
            amount: amount,
            payment_method: paymentMethod,
            terminal_id: this.terminalId
          })
        });
        if (res.ok) {
          const data = await res.json();
          // 백엔드 처리 성공 시 Edge DB HOLD 캐시 정제
          const holds = JSON.parse(localStorage.getItem('LM_HOLD_RESERVATIONS') || '[]') as any[];
          const filtered = holds.filter((h: any) => h.res_id !== resId);
          localStorage.setItem('LM_HOLD_RESERVATIONS', JSON.stringify(filtered));
          return { success: data.success, message: data.message };
        }
      } catch (err) {
        console.error('Backend payment-webhook failed. Falling back to EdgeDB:', err);
      }
    }

    // Edge DB 모드: 결제 성공 시 실제 배정(allocateBay)으로 위임 처리 및 타석 가동
    const holds = JSON.parse(localStorage.getItem('LM_HOLD_RESERVATIONS') || '[]') as any[];
    const holdData = holds.find((h: any) => h.res_id === resId);
    
    if (holdData) {
      const bays = JSON.parse(localStorage.getItem('LM_BAYS') || '[]') as any[];
      const targetIdx = bays.findIndex(b => b.bay_no === holdData.bay_no);
      if (targetIdx !== -1) {
        const endDt = new Date();
        endDt.setMinutes(endDt.getMinutes() + holdData.duration_min);
        const endTimeStr = `${String(endDt.getHours()).padStart(2, '0')}${String(endDt.getMinutes()).padStart(2, '0')}`;
        
        bays[targetIdx].status = 'OCCUPIED';
        bays[targetIdx].current_user_name = holdData.guest_nm || (holdData.member_no ? '회원' : 'Guest');
        bays[targetIdx].current_user_hp = holdData.hp_no || null;
        bays[targetIdx].end_time = endTimeStr;
        bays[targetIdx].minutes_left = holdData.duration_min;
        bays[targetIdx].lock_terminal_id = null;
        bays[targetIdx].lock_expired_at = null;
        localStorage.setItem('LM_BAYS', JSON.stringify(bays));
      }
      
      // 매출 기록(LM_SALES) 추가
      const sales = JSON.parse(localStorage.getItem('LM_SALES') || '[]') as any[];
      const todayStr = new Date().toISOString().slice(0, 10).replace(/-/g, '');
      sales.push({
        sale_id: `S-${Date.now()}`,
        sale_dt: todayStr,
        total_amt: amount,
        pay_amt: amount,
        pay_method: paymentMethod,
        items: `일일 타석권 ${holdData.duration_min}분 배정`,
        status: 'COMPLETED'
      });
      localStorage.setItem('LM_SALES', JSON.stringify(sales));
      
      // 로컬 보류 목록에서 클린업
      const filtered = holds.filter((h: any) => h.res_id !== resId);
      localStorage.setItem('LM_HOLD_RESERVATIONS', JSON.stringify(filtered));
      
      return { success: true, message: '결제 승인 및 오프라인 타석 배정 완료' };
    }
    
    return { success: false, message: '보류 예약 정보를 찾을 수 없습니다. (Edge DB)' };
  }

  // 18. 키오스크 전용 전시 카테고리 로드 API
  async getKioskDisplayCategories(): Promise<any[]> {
    const isConnected = await this.checkConnection();
    if (isConnected) {
      try {
        const res = await fetch(`${BASE_URL}/v1/kiosk/display-categories?store_cd=${STORE_CODE}`);
        if (res.ok) {
          return await res.json();
        }
      } catch (err) {
        console.error('Failed to fetch kiosk display categories:', err);
      }
    }
    return []; // EdgeDB Fallback 시 빈 리스트
  }

  // 19. 고아 결제(Ghost Charge) 긴급 DLQ 보고 API
  async reportGhostCharge(params: {
    terminalId: string;
    deviceType?: string;
    authNo: string;
    amount: number;
    cardName?: string;
    cardNoMasked?: string;
    vanTrNo?: string;
    approvedAt?: string;
    backendErrorReason?: string;
    reversalErrorReason?: string;
    rawApprovalData?: string;
  }): Promise<{ success: boolean; dlq_id?: string; message?: string }> {
    try {
      const res = await fetch(`${BASE_URL}/sales/dlq/report-ghost-charge`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-store-cd': STORE_CODE,
        },
        body: JSON.stringify({
          store_cd: STORE_CODE,
          terminal_id: params.terminalId || this.terminalId || 'KIOSK-01',
          device_type: params.deviceType || 'KIOSK',
          auth_no: params.authNo,
          amount: params.amount,
          card_name: params.cardName || '',
          card_no_masked: params.cardNoMasked || '',
          van_tr_no: params.vanTrNo,
          approved_at: params.approvedAt,
          backend_error_reason: params.backendErrorReason,
          reversal_error_reason: params.reversalErrorReason,
          raw_approval_data: params.rawApprovalData,
        }),
      });
      if (res.ok) {
        return await res.json();
      }
    } catch (err) {
      console.error('[DLQ] Failed to report ghost charge to backend:', err);
    }
    return { success: false, message: 'DLQ 보고 실패' };
  }
}

export const api = new HybridAPIClient();
