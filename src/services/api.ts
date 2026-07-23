/**
 * ⛳ LocalMaster Kiosk API Client & Hybrid Edge DB Engine
 * 
 * - 실제 백엔드 API 서버와 연동하여 실시간 통신을 처리합니다.
 * - 서버가 다운되거나 오프라인 상태일 때, LocalStorage 기반의 "Edge DB 엔진"이 
 *   자동으로 개입하여 무중단 영업(결제, 타석 선점, 배정)을 보장합니다.
 */

// 실제 백엔드 주소 (LocalMaster_Backend)
const BASE_URL = 'http://localhost:8000/api'; 
export const STORE_CODE = 'H01-SE-001';

// WebSocket 베이스 URL (BASE_URL에서 동적 생성 — localhost 하드코딩 제거)
// [Fix-4] localhost:8000 하드코딩 제거 → BASE_URL 기반 생성
const _baseHost = BASE_URL.replace('/api', '').replace('http://', 'ws://').replace('https://', 'wss://');
export const WS_BASE_URL = _baseHost;


export interface MemberAsset {
  member_item_id: string;
  item_name: string;
  rem_count: number;
  allowed_categories?: string[];
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
  hp: string;
  email: string;
  member_grade: string;
  status_cd: string;
  recent_product_nm?: string | null;
  expiry_date?: string | null;
  remain_days?: number;
  locker_no?: number | null;
  locker_expiry_date?: string | null;
  assets?: MemberAsset[];
  face_registered?: boolean;
  face_vector_id?: string | null;
  store_cd?: string;
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
  status: 'AVAILABLE' | 'PRE_OCCUPIED' | 'OCCUPIED' | 'UNDER_MAINTENANCE';
  current_user_name?: string | null;
  current_user_hp?: string | null;
  end_time?: string | null; // HHmm
  minutes_left?: number;
  lock_terminal_id?: string | null;
  lock_expired_at?: string | null;
  bay_name?: string;
  simulator_type?: string;
  handedness?: string;
  is_lesson_only?: boolean;
  screen_spec?: string;
  allow_companion?: boolean;
  max_occupancy?: number;
  config_json?: string;
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
  logic_type: 'MEMBERSHIP' | 'LESSON' | 'RETAIL' | 'FACILITY' | 'RENTAL';
  duration_min?: number;
  days?: number;
  res_id?: string;
}

// --------------------------------------------------------------------------
// 💾 Edge DB Initial Seed Data (LocalStorage 기반 가상 DB)
// --------------------------------------------------------------------------

const SEED_MEMBERS: Member[] = [
  {
    member_no: 'M260501',
    member_name: '김골프',
    hp: '010-1234-5678',
    email: 'golf@localmaster.com',
    member_grade: 'GENERAL',
    status_cd: '10',
    recent_product_nm: '1개월 종일 회원권',
    expiry_date: '2026-06-25',
    remain_days: 30,
    locker_no: 8,
    locker_expiry_date: '2026-06-25',
    face_registered: true,
    face_vector_id: 'FACE_KIMGOLF',
    store_cd: 'H01-SE-001'
  },
  {
    member_no: 'M260502',
    member_name: '이프로',
    hp: '010-9876-5432',
    email: 'pro@localmaster.com',
    member_grade: 'VIP',
    status_cd: '10',
    recent_product_nm: '일일 타석권 90분',
    expiry_date: null,
    remain_days: 0,
    locker_no: null,
    face_registered: true,
    face_vector_id: 'FACE_LEETRAN',
    store_cd: 'H01-SE-001'
  },
  {
    member_no: 'M260503',
    member_name: '박타석',
    hp: '010-5555-5555',
    email: 'park@localmaster.com',
    member_grade: 'GENERAL',
    status_cd: '10',
    recent_product_nm: '1개월 주간 회원권',
    expiry_date: '2026-05-15', // 만료됨
    remain_days: -10,
    locker_no: null,
    face_registered: false,
    face_vector_id: null,
    store_cd: 'H01-SE-001'
  }
];

const SEED_PRODUCTS: Product[] = [
  { prod_cd: 'PROD_001', prod_nm: '일일 타석권 60분', standard_price: 15000, logic_type: 'MEMBERSHIP', duration_min: 60 },
  { prod_cd: 'PROD_002', prod_nm: '일일 타석권 90분', standard_price: 20000, logic_type: 'MEMBERSHIP', duration_min: 90 },
  { prod_cd: 'PROD_003', prod_nm: '1개월 주간 회원권', standard_price: 130000, logic_type: 'MEMBERSHIP', days: 30 },
  { prod_cd: 'PROD_004', prod_nm: '1개월 종일 회원권', standard_price: 16000, logic_type: 'MEMBERSHIP', days: 30 }, // 16만원
  { prod_cd: 'PROD_005', prod_nm: '3개월 종일 회원권', standard_price: 450000, logic_type: 'MEMBERSHIP', days: 90 },
  { prod_cd: 'PROD_LK1', prod_nm: '라카 이용권 1개월', standard_price: 10000, logic_type: 'FACILITY', days: 30 },
  { prod_cd: 'PROD_LK3', prod_nm: '라카 이용권 3개월', standard_price: 25000, logic_type: 'FACILITY', days: 90 }
];

const initializeEdgeDB = (force: boolean = false) => {
  const existingBays = JSON.parse(localStorage.getItem('LM_BAYS') || '[]') as Bay[];
  const isV51 = localStorage.getItem('LM_KIOSK_EDGEDB_INIT_V51');
  
  if (force || !isV51 || existingBays.length < 50) {
    // 1. Members
    localStorage.setItem('LM_MEMBERS', JSON.stringify(SEED_MEMBERS));
    
    // 2. Products
    localStorage.setItem('LM_PRODUCTS', JSON.stringify(SEED_PRODUCTS));
    
    // 3. Bays (백오피스 표적 50개 타석 생성: 1F 20개, 2F 20개, 3F 10개)
    const bays: Bay[] = [];
    for (let i = 1; i <= 50; i++) {
      const floor = i <= 20 ? 1 : (i <= 40 ? 2 : 3);
      // 백오피스 handedness 스펙 미러링 (5번, 6번, 15번, 16번, 25번, 26번 ... 타석)
      const type: Bay['type'] = (i === 5 || i === 6 || i === 15 || i === 16 || i === 25 || i === 26 || i === 35 || i === 36 || i === 45 || i === 46) ? 'LEFT' : 'RIGHT';
      let status: Bay['status'] = 'AVAILABLE';
      let current_user_name = null;
      let minutes_left = undefined;
      let end_time = null;

      bays.push({
        bay_id: i,
        bay_no: i,
        floor_no: floor,
        floor: `${floor}F`,
        type,
        status: 'AVAILABLE',
        current_user_name: null,
        minutes_left: undefined,
        end_time: null
      });
    }

    // 파3 미니 라운딩 타석 5개 추가 (zone_code: 'PAR3')
    for (let i = 51; i <= 55; i++) {
      bays.push({
        bay_id: i,
        bay_no: i,
        floor_no: 1,
        type: 'RIGHT',
        status: 'AVAILABLE',
        current_user_name: null,
        minutes_left: undefined,
        end_time: null,
        zone_code: 'PAR3',
        bay_name: `PAR3-${i - 50}`
      });
    }

    localStorage.setItem('LM_BAYS', JSON.stringify(bays));

    // 4. Lockers (라카 30개 생성)
    const lockers: Locker[] = [];
    for (let i = 1; i <= 30; i++) {
      const floor = i <= 15 ? 1 : 2;
      let status: Locker['status'] = 'AVAILABLE';
      let member_no = null;
      let member_name = null;
      let end_dt = null;

      if (i === 8) {
        status = 'OCCUPIED';
        member_no = 'M260501';
        member_name = '김골프';
        end_dt = '2026-06-25';
      }

      lockers.push({
        locker_id: i,
        locker_no: i,
        floor_no: floor,
        status,
        member_no,
        member_name,
        end_dt
      });
    }
    localStorage.setItem('LM_LOCKERS', JSON.stringify(lockers));
    
    // 5. Sales log
    localStorage.setItem('LM_SALES', JSON.stringify([]));

    // 6. Par3 Slots 초기화
    const slots: Par3Slot[] = [];
    const now = new Date();
    for (let i = 0; i < 15; i++) {
      const slotTime = new Date(now.getTime() + (i + 1) * 20 * 60 * 1000);
      const timeStr = `${String(slotTime.getHours()).padStart(2, '0')}:${String(slotTime.getMinutes()).padStart(2, '0')}`;
      slots.push({
        slot_id: `P3S-${i}`,
        time: timeStr,
        course_nm: i % 3 === 0 ? 'EAST' : (i % 3 === 1 ? 'WEST' : 'COMPLEX'),
        status: i === 2 ? 'RESERVED' : 'AVAILABLE',
        current_party_size: i === 2 ? 3 : 0
      });
    }
    localStorage.setItem('LM_PAR3_SLOTS', JSON.stringify(slots));

    localStorage.setItem('LM_KIOSK_EDGEDB_INIT', 'true');
    localStorage.setItem('LM_KIOSK_EDGEDB_INIT_V51', 'true');
    console.log('⛳ LocalMaster Kiosk: Edge DB 50-Bay Clean Initialized Successfully.');
  }
};

// 즉시 초기화 실행
initializeEdgeDB();

// --------------------------------------------------------------------------
// 🔗 Hybrid API Client Implementation
// --------------------------------------------------------------------------

// 미들웨어 직접 통신 URL (Edge DB 오프라인 모드 전용)
// 환경변수 또는 localStorage 설정에서 읽음
const MIDDLEWARE_URL = localStorage.getItem('LM_MIDDLEWARE_URL') || 'http://127.0.0.1:5001';
// [Fix-4] KIOSK_WS_KEY: localStorage 또는 .env로 주입된 값 사용
// LM_KIOSK_WS_KEY 설정으로 settings.KIOSK_WS_KEY와 동기화 가능
const KIOSK_WS_KEY = localStorage.getItem('LM_KIOSK_WS_KEY') || 'kiosk-ws-key-2025';
// [Fix-4] 미들웨어 API Key: localStorage 또는 settings.MIDDLEWARE_API_KEY와 동기화
const MIDDLEWARE_API_KEY_CLIENT = localStorage.getItem('LM_MIDDLEWARE_API_KEY') || 'secret-key-changeme';


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
    return localStorage.getItem('LM_STORE_CD') || 'H01-SE-001';
  }

  getTerminalId() {
    return this.terminalId;
  }

  // 미들웨어 통합 제어 센터 30초 헬스체크
  async getMiddlewareStatus(): Promise<{ online: boolean; status: string }> {
    try {
      const res = await fetch(`${BASE_URL}/v1/kiosk/middleware/status`, {
        headers: { 'x-store-cd': this.getStoreCd() }
      });
      if (res.ok) {
        return await res.json();
      }
      return { online: false, status: 'OFFLINE' };
    } catch {
      return { online: false, status: 'OFFLINE' };
    }
  }

  // =========================================================================
  // [Phase 2: WS-2] WebSocket 실시간 연결 관리
  // 배정 완료/해제 이벤트를 폴링 없이 즉시 수신합니다.
  // 연결 실패 시 15초 후 자동 재연결 (Exponential Backoff).
  // =========================================================================
  connectBayWebSocket(onBayUpdate: (data: Bay) => void, onMessage?: (msg: unknown) => void): () => void {
    this.bayUpdateListeners.push(onBayUpdate);
    
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

            if (data.type === 'bay_updated' || data.type === 'bay_update') {
              // Edge DB LocalStorage 즉시 동기화
              const bays = JSON.parse(localStorage.getItem('LM_BAYS') || '[]') as Bay[];
              const idx = bays.findIndex(b => b.bay_no === (data.bay_no as number));
              if (idx !== -1) {
                if (data.status === 'OCCUPIED') {
                  bays[idx].status = 'OCCUPIED';
                  bays[idx].current_user_name = (data.user_name as string) || (data.member_name as string) || '손님';
                  bays[idx].lock_terminal_id = null;
                  bays[idx].lock_expired_at = null;
                } else if (data.status === 'AVAILABLE') {
                  bays[idx].status = 'AVAILABLE';
                  bays[idx].current_user_name = null;
                  bays[idx].end_time = null;
                  bays[idx].minutes_left = undefined;
                }
                localStorage.setItem('LM_BAYS', JSON.stringify(bays));
                this.bayUpdateListeners.forEach(listener => listener(bays[idx]));
              }
            }

            // [Fix-3C] bay_release: 종료된 타석 AVAILABLE 복원
            if (data.type === 'bay_release') {
              const bays = JSON.parse(localStorage.getItem('LM_BAYS') || '[]') as Bay[];
              const bayNos = (data.bay_nos as number[]) || (data.bay_no ? [data.bay_no as number] : []);
              let changed = false;
              for (const bayNo of bayNos) {
                const idx = bays.findIndex(b => b.bay_no === bayNo);
                if (idx !== -1) {
                  bays[idx].status = 'AVAILABLE';
                  bays[idx].current_user_name = null;
                  bays[idx].end_time = null;
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

    // Cleanup 함수 반환 (React useEffect return용)
    return () => {
      if (this.wsReconnectTimer) clearTimeout(this.wsReconnectTimer);
      if (this.ws) {
        this.ws.onclose = null; // 자동 재연결 방지
        this.ws.close();
        this.ws = null;
      }
      this.bayUpdateListeners = this.bayUpdateListeners.filter(l => l !== onBayUpdate);
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
  async getStoreInfo(): Promise<{ store_nm: string; checkin_policy: string }> {
    const isConnected = await this.checkConnection();
    if (isConnected) {
      try {
        const res = await fetch(`${BASE_URL}/v1/kiosk/store-info?store_cd=${this.getStoreCd()}`);
        if (res.ok) {
          const data = await res.json();
          localStorage.setItem('LM_STORE_INFO', JSON.stringify(data));
          return {
            store_nm: data.store_nm || 'SGM Golf Academy',
            checkin_policy: data.checkin_policy || 'CHECKIN_REQUIRED'
          };
        }
      } catch (err) {
        console.warn('Backend getStoreInfo failed, using local cache:', err);
      }
    }
    // Offline Fallback
    const cached = JSON.parse(localStorage.getItem('LM_STORE_INFO') || '{}');
    return {
      store_nm: cached.store_nm || 'SGM Golf Academy',
      checkin_policy: cached.checkin_policy || 'CHECKIN_REQUIRED'
    };
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

  // 2. 타석 목록 및 상태 조회
  async getBays(): Promise<Bay[]> {
    const isConnected = await this.checkConnection();
    
    if (isConnected) {
      try {
        const res = await fetch(`${BASE_URL}/bays/`, {
          headers: { 'x-store-cd': STORE_CODE }
        });
        if (res.ok) {
          return await res.json() as Bay[];
        }
      } catch (err) {
        console.error('Backend getBays failed. Falling back to EdgeDB:', err);
      }
    }

    // Edge DB 모드
    // 실시간으로 남은 시간이 0이 되었을 때 AVAILABLE로 갱신하는 시뮬레이션 포함
    const bays = JSON.parse(localStorage.getItem('LM_BAYS') || '[]') as Bay[];
    const now = new Date();
    
    const updatedBays = bays.map(bay => {
      if (bay.status === 'OCCUPIED' && bay.end_time) {
        const endHour = parseInt(bay.end_time.substring(0, 2));
        const endMin = parseInt(bay.end_time.substring(2, 4));
        const endDt = new Date();
        endDt.setHours(endHour, endMin, 0, 0);

        if (endDt <= now) {
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
          const diffMs = endDt.getTime() - now.getTime();
          const diffMin = Math.ceil(diffMs / 1000 / 60);
          return {
            ...bay,
            minutes_left: diffMin
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
    amount: number = 0
  ): Promise<{ success: boolean; res_id?: string; message: string; hardware_success?: boolean }> {
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
            amount: amount                     // 일일권 결제 금액
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
            hardware_success: data.hardware_success
          };
        } else {
          const errData = await res.json().catch(() => ({ detail: `HTTP ${res.status} 오류가 발생했습니다.` }));
          const errMsg = errData.detail || errData.message || `타석 배정에 실패했습니다. (코드: ${res.status})`;
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
          return await res.json();
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


  // 10. 라카 연장 처리
  async extendLocker(
    lockerNo: number, 
    extendDays: number, 
    payAmt: number
  ): Promise<{ success: boolean; message: string }> {
    const lockers = JSON.parse(localStorage.getItem('LM_LOCKERS') || '[]') as Locker[];
    const lIdx = lockers.findIndex(l => l.locker_no === lockerNo);

    if (lIdx !== -1 && lockers[lIdx].status === 'OCCUPIED' && lockers[lIdx].end_dt) {
      const currentEnd = new Date(lockers[lIdx].end_dt!);
      currentEnd.setDate(currentEnd.getDate() + extendDays);
      
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
    faceVectorId: string | null = null
  ): Promise<{ success: boolean; member?: Member; message: string }> {
    const isConnected = await this.checkConnection();
    const cleanHp = hp.replace(/[^0-9]/g, '');
    const todayStr = new Date().toISOString().slice(0, 10);
    const newMemberNo = `M2605${Math.floor(10 + Math.random() * 89)}`; // 신규 회원번호 난수 발급

    const newMember: Member = {
      member_no: newMemberNo,
      member_name: name,
      hp: hp,
      email: email,
      member_grade: 'GENERAL',
      status_cd: '10',
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
            store_cd: STORE_CODE
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

  // 13. 가상 안면인식 스캔 API (테넌트 격리 필터 적용)
  async scanFace(): Promise<Member | null> {
    // 1.5초 딜레이 모사 (카메라 프레임 처리 속도)
    await new Promise(resolve => setTimeout(resolve, 1500));

    // 로컬스토리지에서 회원 목록 읽기
    const members = JSON.parse(localStorage.getItem('LM_MEMBERS') || '[]') as Member[];
    // 테넌트 격리: 현재 단말 가맹점 코드(STORE_CODE)에 속하고 안면 등록이 활성화된 회원만 조회
    const registeredMembers = members.filter(m => m.face_registered && m.store_cd === STORE_CODE);

    if (registeredMembers.length === 0) return null;

    // 등록된 회원 중 랜덤 반환 (김골프, 이프로 등)
    const randomIndex = Math.floor(Math.random() * registeredMembers.length);
    return registeredMembers[randomIndex];
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
          return await res.json() as KioskZone[];
        }
      } catch (err) {
        console.error('Backend getKioskZones failed. Falling back to default:', err);
      }
    }
    // 오프라인 폴백: 기본 EAST/WEST 구역 리턴
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
          method: 'POST',
          headers: { 'x-store-cd': STORE_CODE }
        });
        if (res.ok) {
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
            payment_method: paymentMethod
          })
        });
        if (res.ok) {
          const data = await res.json();
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
}

export const api = new HybridAPIClient();
