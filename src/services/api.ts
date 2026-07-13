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
  logic_type: 'MEMBERSHIP' | 'LESSON' | 'RETAIL' | 'FACILITY';
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

const initializeEdgeDB = () => {
  if (!localStorage.getItem('LM_KIOSK_EDGEDB_INIT')) {
    // 1. Members
    localStorage.setItem('LM_MEMBERS', JSON.stringify(SEED_MEMBERS));
    
    // 2. Products
    localStorage.setItem('LM_PRODUCTS', JSON.stringify(SEED_PRODUCTS));
    
    // 3. Bays (타석 20개 생성)
    const bays: Bay[] = [];
    for (let i = 1; i <= 20; i++) {
      const floor = i <= 10 ? 1 : 2;
      const type = (i === 5 || i === 6 || i === 15 || i === 16) ? 'LEFT' : 'RIGHT'; // 일부 좌타 배치
      let status: Bay['status'] = 'AVAILABLE';
      let current_user_name = null;
      let minutes_left = undefined;
      let end_time = null;

      if (i === 3) {
        status = 'OCCUPIED';
        current_user_name = '홍길동';
        minutes_left = 42;
        const end = new Date();
        end.setMinutes(end.getMinutes() + 42);
        end_time = `${String(end.getHours()).padStart(2, '0')}${String(end.getMinutes()).padStart(2, '0')}`;
      } else if (i === 12) {
        status = 'UNDER_MAINTENANCE';
      }

      bays.push({
        bay_id: i,
        bay_no: i,
        floor_no: floor,
        type,
        status,
        current_user_name,
        minutes_left,
        end_time
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
    console.log('⛳ LocalMaster Kiosk: Edge DB Initialized Successfully.');
  }
};

// 즉시 초기화 실행
initializeEdgeDB();

// --------------------------------------------------------------------------
// 🔗 Hybrid API Client Implementation
// --------------------------------------------------------------------------

class HybridAPIClient {
  private terminalId: string;
  private isOnline: boolean = true;

  constructor() {
    // 키오스크 단말기 고유 ID 생성 (윈도우 맥 주소 대체 등)
    let tid = localStorage.getItem('LM_KIOSK_TERMINAL_ID');
    if (!tid) {
      tid = `T-${Math.random().toString(36).substring(2, 9).toUpperCase()}`;
      localStorage.setItem('LM_KIOSK_TERMINAL_ID', tid);
    }
    this.terminalId = tid;
  }

  getTerminalId() {
    return this.terminalId;
  }

  // 네트워크 헬스 체크
  async checkConnection(): Promise<boolean> {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 2000); // 2초 타임아웃
      const res = await fetch(`${BASE_URL}/store`, { 
        method: 'GET',
        headers: { 'x-store-cd': STORE_CODE },
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

  // 가맹점 상호명 조회 (SGM Golf Academy 기본 매핑)
  async getStoreName(): Promise<string> {
    try {
      const res = await fetch(`${BASE_URL}/store`, { 
        method: 'GET',
        headers: { 'x-store-cd': STORE_CODE }
      });
      if (res.ok) {
        const data = await res.json();
        return data.store_nm || 'SGM Golf Academy';
      }
      return 'SGM Golf Academy';
    } catch {
      return 'SGM Golf Academy';
    }
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
  async preoccupyBay(bayNo: number): Promise<boolean> {
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
            bay_nos: [bayNo],
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
    const targetIdx = bays.findIndex(b => b.bay_no === bayNo);
    
    if (targetIdx !== -1 && (bays[targetIdx].status === 'AVAILABLE' || bays[targetIdx].status === 'PRE_OCCUPIED')) {
      // 1분간 선점 락 설정
      const expires = new Date();
      expires.setMinutes(expires.getMinutes() + 1);
      
      bays[targetIdx].status = 'PRE_OCCUPIED';
      bays[targetIdx].lock_terminal_id = this.terminalId;
      bays[targetIdx].lock_expired_at = expires.toISOString();
      
      localStorage.setItem('LM_BAYS', JSON.stringify(bays));
      return true;
    }
    
    return false;
  }

  // 4. 타석 선점 해제 (Release)
  async releaseBay(bayNo: number): Promise<void> {
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
            bay_nos: [bayNo],
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
    const targetIdx = bays.findIndex(b => b.bay_no === bayNo);
    
    if (targetIdx !== -1 && bays[targetIdx].status === 'PRE_OCCUPIED' && bays[targetIdx].lock_terminal_id === this.terminalId) {
      bays[targetIdx].status = 'AVAILABLE';
      bays[targetIdx].lock_terminal_id = null;
      bays[targetIdx].lock_expired_at = null;
      localStorage.setItem('LM_BAYS', JSON.stringify(bays));
    }
  }

  // 5. 타석 최종 배정 완료 (예약 & 입실 확정)
  async allocateBay(
    bayNo: number, 
    durationMin: number, 
    memberNo?: string, 
    guestName?: string, 
    hpNo?: string,
    memberItemId?: number
  ): Promise<{ success: boolean; res_id?: string; message: string }> {
    const isConnected = await this.checkConnection();
    const todayStr = new Date().toISOString().slice(0, 10).replace(/-/g, '');
    const nowHourMin = new Date().toTimeString().slice(0, 5).replace(/:/g, '');
    
    if (isConnected) {
      try {
        // 1) 예약 생성
        const createRes = await fetch(`${BASE_URL}/reservations/`, {
          method: 'POST',
          headers: { 
            'Content-Type': 'application/json',
            'x-store-cd': STORE_CODE
          },
          body: JSON.stringify({
            resource_type: 'BAY',
            resource_no: bayNo,
            member_no: memberNo || null,
            guest_nm: guestName || null,
            hp_no: hpNo || null,
            res_date: todayStr,
            start_time: nowHourMin,
            duration_min: durationMin,
            res_type: 'SLOT',
            member_item_id: memberItemId || null
          })
        });
        
        if (createRes.ok) {
          const createData = await createRes.json();
          const resId = createData.res_id;
          
          // 2) 즉시 입실 확정
          const confirmRes = await fetch(`${BASE_URL}/reservations/${resId}/confirm`, {
            method: 'PATCH',
            headers: { 'x-store-cd': STORE_CODE }
          });
          
          if (confirmRes.ok) {
            return { success: true, res_id: resId, message: '타석 배정이 성공적으로 완료되었습니다.' };
          }
        }
      } catch (err) {
        console.error('Backend allocate failed. Falling back to EdgeDB:', err);
      }
    }

    // Edge DB 모드
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
      
      // 판매 기록 로그 추가 (일비 결제인 경우)
      if (!memberNo) {
        const sales = JSON.parse(localStorage.getItem('LM_SALES') || '[]') as unknown[];
        sales.push({
          sale_id: `S-${Date.now()}`,
          sale_dt: todayStr,
          total_amt: durationMin === 60 ? 15000 : 20000,
          pay_amt: durationMin === 60 ? 15000 : 20000,
          pay_method: 'CARD',
          items: `일일 타석권 ${durationMin}분 배정`,
          status: 'COMPLETED'
        });
        localStorage.setItem('LM_SALES', JSON.stringify(sales));
      }

      return {
        success: true,
        res_id: `R-${Math.random().toString(36).substring(2, 9).toUpperCase()}`,
        message: '타석 배정이 성공적으로 완료되었습니다. (Edge DB 저장)'
      };
    }

    return { success: false, message: '타석 상태 변경 실패' };
  }

  // 6. 타석 이동 (사용 중인 타석 변경)
  async moveBay(memberNo: string, targetBayNo: number): Promise<{ success: boolean; message: string }> {
    const bays = JSON.parse(localStorage.getItem('LM_BAYS') || '[]') as Bay[];
    
    // 1. 기존 사용 중이던 타석 찾기
    const oldBayIdx = bays.findIndex(b => 
      b.status === 'OCCUPIED' && 
      (b.current_user_name === memberNo || (b.current_user_name && b.current_user_name.includes(memberNo)))
    );

    // Edge DB용 가벼운 이름/회원번호 Fallback 매칭 지원
    let searchName = memberNo;
    const member = await this.getMember(memberNo);
    if (member) {
      searchName = member.member_name;
    }

    const sourceIdx = bays.findIndex(b => b.status === 'OCCUPIED' && b.current_user_name === searchName);
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

  // 9. 라카 목록 가져오기
  async getLockers(): Promise<Locker[]> {
    return JSON.parse(localStorage.getItem('LM_LOCKERS') || '[]') as Locker[];
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
        const res = await fetch(`${BASE_URL}/members/`, {
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
            status_cd: '10',
            face_registered: faceRegistered,
            face_vector_id: faceVectorId
          })
        });
        if (res.ok) {
          const created = await res.json();
          created.face_registered = faceRegistered;
          created.face_vector_id = faceVectorId;
          created.store_cd = STORE_CODE;
          await this.writeKioskLog('MEMBER_REGISTER', `신규 회원 등록 성공 (백엔드): ${name} (${hp})`, created.member_no);
          return { success: true, member: created, message: '회원가입이 성공적으로 완료되었습니다.' };
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
    const todayStr = new Date().toISOString().slice(0, 10).replace(/-/g, '');
    const nowHourMin = new Date().toTimeString().slice(0, 5).replace(/:/g, '');

    if (isConnected) {
      try {
        const createRes = await fetch(`${BASE_URL}/reservations/`, {
          method: 'POST',
          headers: { 
            'Content-Type': 'application/json',
            'x-store-cd': STORE_CODE
          },
          body: JSON.stringify({
            resource_type: 'BAY',
            resource_no: bayNo,
            member_no: memberNo || null,
            guest_nm: guestName || null,
            hp_no: hpNo || null,
            res_date: todayStr,
            start_time: nowHourMin,
            duration_min: durationMin,
            res_type: 'SLOT',
            status_cd: 'HOLD',
            payment_mode: 'OFFLINE_CARD'
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
