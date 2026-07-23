import React, { useState, useEffect } from 'react';
import { QrCode, CheckCircle2, AlertCircle, Calendar, Clock, ArrowRight, RefreshCw } from 'lucide-react';
import { api } from '../services/api';

interface CheckinReservationItem {
  res_id: string;
  resource_no: string;
  res_date: string;
  start_time: string;
  end_time: string;
  duration_min: number;
  status_cd: string;
  member_no?: string;
  guest_nm?: string;
}

interface CheckinSelectProps {
  memberNo: string;
  memberName?: string;
  lang?: 'KO' | 'EN';
  onCheckinSuccess: (bayNo: number, resId: string) => void;
  onCancel: () => void;
}

export const CheckinSelect: React.FC<CheckinSelectProps> = ({
  memberNo,
  memberName,
  lang = 'KO',
  onCheckinSuccess,
  onCancel,
}) => {
  const [reservations, setReservations] = useState<CheckinReservationItem[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [errorMsg, setErrorMsg] = useState<string>('');
  const [processingResId, setProcessingResId] = useState<string | null>(null);

  const loadReservations = async () => {
    setLoading(true);
    setErrorMsg('');
    try {
      const items = await api.getMemberCheckinReservations(memberNo);
      setReservations(items);
    } catch (err) {
      console.error('Failed to load checkin reservations:', err);
      setErrorMsg(lang === 'KO' ? '예약 내역을 불러오는데 실패했습니다.' : 'Failed to load reservations.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadReservations();
  }, [memberNo]);

  const handleVerifyCheckin = async (resId: string) => {
    setProcessingResId(resId);
    setErrorMsg('');
    try {
      const res = await api.verifyKioskCheckin(memberNo, resId);
      if (res.success && res.bay_no) {
        onCheckinSuccess(res.bay_no, resId);
      } else {
        setErrorMsg(res.message || (lang === 'KO' ? '체크인 승인 처리 중 오류가 발생했습니다.' : 'Checkin failed.'));
      }
    } catch (err) {
      console.error('Checkin verify error:', err);
      setErrorMsg(lang === 'KO' ? '체크인 처리 중 서버 통신 에러가 발생했습니다.' : 'Server connection error.');
    } finally {
      setProcessingResId(null);
    }
  };

  return (
    <div style={{
      width: '100%',
      height: '100%',
      display: 'flex',
      flexDirection: 'column',
      background: 'linear-gradient(135deg, #064e3b 0%, #022c22 100%)',
      color: '#ffffff',
      padding: '40px',
      boxSizing: 'border-box',
      position: 'relative'
    }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '30px' }}>
        <div>
          <h2 style={{ fontSize: '32px', fontWeight: 'bold', margin: 0, display: 'flex', alignItems: 'center', gap: '12px', color: '#10b981' }}>
            <QrCode size={36} />
            {lang === 'KO' ? '📌 사전 예약 타석 체크인' : '📌 Reservation Check-in'}
          </h2>
          <p style={{ fontSize: '16px', color: '#a7f3d0', marginTop: '6px', margin: 0 }}>
            {memberName ? `${memberName} 님의 당일 예약 타석 목록입니다.` : '당일 예약 타석 내역을 확인하고 체크인을 진행하세요.'}
          </p>
        </div>
        <button
          onClick={loadReservations}
          style={{
            padding: '10px 18px',
            borderRadius: '8px',
            background: 'rgba(255,255,255,0.1)',
            border: '1px solid rgba(255,255,255,0.2)',
            color: '#fff',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            fontSize: '14px'
          }}
        >
          <RefreshCw size={16} className={loading ? 'spin' : ''} />
          {lang === 'KO' ? '새로고침' : 'Refresh'}
        </button>
      </div>

      {/* Main Content */}
      <div style={{ flex: 1, overflowY: 'auto', paddingRight: '6px' }}>
        {loading ? (
          <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center', height: '100%', gap: '16px' }}>
            <RefreshCw size={48} style={{ animation: 'spin 1s linear infinite' }} />
            <span style={{ fontSize: '18px', color: '#a7f3d0' }}>
              {lang === 'KO' ? '예약 타석 내역을 조회 중입니다...' : 'Loading reservations...'}
            </span>
          </div>
        ) : errorMsg ? (
          <div style={{ background: 'rgba(239, 68, 68, 0.15)', border: '1px solid #ef4444', borderRadius: '12px', padding: '20px', display: 'flex', alignItems: 'center', gap: '14px' }}>
            <AlertCircle size={28} color="#f87171" />
            <span style={{ fontSize: '18px', color: '#fca5a5' }}>{errorMsg}</span>
          </div>
        ) : reservations.length === 0 ? (
          <div style={{
            height: '100%',
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'center',
            alignItems: 'center',
            background: 'rgba(255,255,255,0.05)',
            borderRadius: '20px',
            border: '1px dashed rgba(255,255,255,0.2)',
            padding: '40px'
          }}>
            <Calendar size={64} color="#6ee7b7" style={{ marginBottom: '20px' }} />
            <h3 style={{ fontSize: '24px', margin: '0 0 10px 0', color: '#ffffff' }}>
              {lang === 'KO' ? '당일 체크인 가능한 예약 내역이 없습니다.' : 'No check-in reservations found today.'}
            </h3>
            <p style={{ fontSize: '16px', color: '#a7f3d0', margin: '0 0 30px 0', textAlign: 'center' }}>
              {lang === 'KO' ? '현장 타석을 이용하시려면 [연습타석배정] 메뉴에서 즉시 배정을 진행해 주세요.' : 'Please use [Practice Bay] menu to allocate an available bay immediately.'}
            </p>
            <button
              onClick={onCancel}
              style={{
                padding: '16px 36px',
                borderRadius: '12px',
                background: '#10b981',
                color: '#ffffff',
                fontSize: '18px',
                fontWeight: 'bold',
                border: 'none',
                cursor: 'pointer',
                boxShadow: '0 4px 14px rgba(16, 185, 129, 0.4)'
              }}
            >
              {lang === 'KO' ? '메인 화면으로 돌아가기' : 'Return to Main'}
            </button>
          </div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(340px, 1fr))', gap: '20px' }}>
            {reservations.map(res => {
              const bayNo = parseInt(res.resource_no || '1') || 1;
              const isProcessing = processingResId === res.res_id;
              const isCompleted = res.status_cd === 'CHK';

              return (
                <div
                  key={res.res_id}
                  style={{
                    background: 'rgba(255, 255, 255, 0.08)',
                    borderRadius: '16px',
                    border: isCompleted ? '2px solid #10b981' : '1px solid rgba(255, 255, 255, 0.2)',
                    padding: '24px',
                    display: 'flex',
                    flexDirection: 'column',
                    justifyContent: 'space-between',
                    boxShadow: '0 8px 24px rgba(0,0,0,0.2)'
                  }}
                >
                  <div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
                      <span style={{
                        fontSize: '28px',
                        fontWeight: 'bold',
                        color: '#6ee7b7',
                        background: 'rgba(16, 185, 129, 0.2)',
                        padding: '4px 14px',
                        borderRadius: '8px',
                        border: '1px solid #10b981'
                      }}>
                        {bayNo}번 타석
                      </span>
                      <span style={{
                        fontSize: '14px',
                        fontWeight: 'bold',
                        color: isCompleted ? '#34d399' : '#f59e0b',
                        background: isCompleted ? 'rgba(52, 211, 153, 0.15)' : 'rgba(245, 158, 11, 0.15)',
                        padding: '4px 12px',
                        borderRadius: '20px'
                      }}>
                        {isCompleted ? (lang === 'KO' ? '✓ 체크인 완료' : '✓ Completed') : (lang === 'KO' ? '● 체크인 대기' : '● Ready')}
                      </span>
                    </div>

                    <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', fontSize: '15px', color: '#d1fae5', marginBottom: '20px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <Clock size={16} color="#34d399" />
                        <span>예약시간: <strong>{res.start_time || '정시'} ~ {res.end_time || '종료'}</strong> ({res.duration_min}분)</span>
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <Calendar size={16} color="#34d399" />
                        <span>예약일자: <strong>{res.res_date}</strong></span>
                      </div>
                    </div>
                  </div>

                  <button
                    onClick={() => handleVerifyCheckin(res.res_id)}
                    disabled={isProcessing}
                    style={{
                      width: '100%',
                      padding: '16px',
                      borderRadius: '12px',
                      background: isCompleted
                        ? 'rgba(52, 211, 153, 0.2)'
                        : 'linear-gradient(135deg, #10b981 0%, #059669 100%)',
                      color: '#ffffff',
                      fontSize: '18px',
                      fontWeight: 'bold',
                      border: 'none',
                      cursor: isProcessing ? 'wait' : 'pointer',
                      display: 'flex',
                      justifyContent: 'center',
                      alignItems: 'center',
                      gap: '10px',
                      boxShadow: isCompleted ? 'none' : '0 4px 16px rgba(16, 185, 129, 0.4)'
                    }}
                  >
                    {isProcessing ? (
                      <>
                        <RefreshCw size={20} style={{ animation: 'spin 1s linear infinite' }} />
                        {lang === 'KO' ? '체크인 승인 중...' : 'Processing...'}
                      </>
                    ) : isCompleted ? (
                      <>
                        <CheckCircle2 size={20} color="#34d399" />
                        {lang === 'KO' ? '체크인 완료 (티켓 출력)' : 'Re-print Ticket'}
                      </>
                    ) : (
                      <>
                        {lang === 'KO' ? '📌 체크인 완료' : 'Complete Check-in'}
                        <ArrowRight size={20} />
                      </>
                    )}
                  </button>
                  {isCompleted && (
                    <span style={{ fontSize: '11px', color: '#6ee7b7', textAlign: 'center', marginTop: '6px' }}>
                      * {lang === 'KO' ? '출입 QR 티켓 분실 시 재인출하실 수 있습니다.' : 'Re-print QR ticket if lost.'}
                    </span>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Footer / Cancel Button */}
      <div style={{ marginTop: '20px', display: 'flex', justifyContent: 'flex-end' }}>
        <button
          onClick={onCancel}
          style={{
            padding: '14px 32px',
            borderRadius: '10px',
            background: 'rgba(255,255,255,0.15)',
            border: '1px solid rgba(255,255,255,0.25)',
            color: '#ffffff',
            fontSize: '16px',
            fontWeight: 'bold',
            cursor: 'pointer'
          }}
        >
          {lang === 'KO' ? '취소 및 메인으로' : 'Cancel'}
        </button>
      </div>
    </div>
  );
};
