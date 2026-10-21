import React, { useState, useEffect, useRef } from 'react';
import { QrCode, CheckCircle2, AlertCircle, Calendar, Clock, ArrowRight, RefreshCw, Printer } from 'lucide-react';
import { api } from '../services/api';
import { TimeMaster } from '../utils/timeMaster';
import { recordKioskBlackBox } from '../utils/kioskBlackBox';

interface CheckinReservationItem {
  res_id: string;
  resource_no: string;
  resource_type?: string;
  res_date: string;
  start_time: string;
  end_time: string;
  duration_min: number;
  status_cd: string;
  payment_status?: string;
  member_no?: string;
  guest_nm?: string;
}

interface CheckinSelectProps {
  memberNo: string;
  memberName?: string;
  lang?: 'KO' | 'EN';
  onCheckinSuccess: (
    bayNo: number | string,
    resId: string,
    durationMin?: number,
    startTime?: string,
    endTime?: string,
    message?: string,
    checkinMode?: string
  ) => void;
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
  // [BUG-C09] 동기식 터치 잠금 (React 비동기 setState 이전 연타 방어)
  const verifyingRef = useRef<string | null>(null);

  const loadReservations = async () => {
    setLoading(true);
    setErrorMsg('');
    try {
      const items = await api.getMemberCheckinReservations(memberNo);
      setReservations(items);
      recordKioskBlackBox('CHECKIN', 'CHECKIN_START', {
        memberNo,
        memberName: memberName || undefined,
        reservationsCount: items.length,
      });
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

  const formatResTime = (t?: string) => {
    if (!t) return '';
    const clean = t.trim();
    if (/^\d{4}$/.test(clean)) {
      return `${clean.slice(0, 2)}:${clean.slice(2, 4)}`;
    }
    return clean;
  };

  const formatResourceTitle = (res: CheckinReservationItem) => {
    const rType = (res.resource_type || 'BAY').toUpperCase();
    const rawNo = String(res.resource_no || '1').trim();
    const parsedNo = parseInt(rawNo.replace(/[^0-9]/g, ''), 10);
    if (rType === 'PAR3') {
      return lang === 'KO' ? `파3 ${rawNo}` : `Par-3 ${rawNo}`;
    }
    if (rType === 'SCREEN' || rType === 'ROOM') {
      return lang === 'KO' ? `스크린룸 ${rawNo}` : `Room ${rawNo}`;
    }
    if (rType === 'LESSON') {
      return lang === 'KO' ? `레슨 ${ !isNaN(parsedNo) ? `${parsedNo}번 타석` : rawNo }` : `Lesson ${rawNo}`;
    }
    return lang === 'KO'
      ? `${!isNaN(parsedNo) ? parsedNo : rawNo}번 타석`
      : `Bay ${!isNaN(parsedNo) ? parsedNo : rawNo}`;
  };

  const handleVerifyCheckin = async (resId: string) => {
    // [BUG-C09] 동기 잠금으로 더블 클릭/연타 완벽 차단
    if (verifyingRef.current) return;
    verifyingRef.current = resId;
    setProcessingResId(resId);
    setErrorMsg('');
    const targetRes = reservations.find((r) => r.res_id === resId);
    recordKioskBlackBox('CHECKIN', 'CHECKIN_CONFIRM', {
      memberNo,
      resId,
      resourceNo: targetRes?.resource_no,
      resourceType: targetRes?.resource_type || 'BAY',
      startTime: targetRes?.start_time,
    });
    try {
      const res = await api.verifyKioskCheckin(memberNo, resId);
      if (res.success) {
        const rawNo = String(targetRes?.resource_no || '1').trim();
        const numericNo = parseInt(rawNo.replace(/[^0-9]/g, ''), 10);
        const resolvedBayNo = res.bay_no || (!isNaN(numericNo) ? numericNo : rawNo) || 1;
        onCheckinSuccess(
          resolvedBayNo,
          resId,
          res.duration_min ?? targetRes?.duration_min,
          formatResTime(res.start_time ?? targetRes?.start_time) || (res.start_time ?? targetRes?.start_time),
          formatResTime(res.end_time ?? targetRes?.end_time) || (res.end_time ?? targetRes?.end_time),
          res.message,
          res.checkin_mode
        );
      } else {
        // [BUG-C03] 백엔드 거부(점검 중 409, 미결제 400 등) 시 CHK 상태라도 에러를 삼키지 않고 즉시 표시
        const chkErrMsg = res.message || (lang === 'KO' ? '체크인 승인 처리 중 오류가 발생했습니다.' : 'Checkin failed.');
        setErrorMsg(chkErrMsg);
        api.writeKioskLog('CHECKIN_ERROR', `예약 체크인 거부 (${resId}): ${chkErrMsg}`, memberNo).catch(() => {});
      }
    } catch (err) {
      console.error('Checkin verify error:', err);
      const netErrMsg = lang === 'KO' ? '체크인 처리 중 서버 통신 에러가 발생했습니다.' : 'Server connection error.';
      setErrorMsg(netErrMsg);
      api.writeKioskLog('CHECKIN_ERROR', `예약 체크인 통신 오류 (${resId}): ${String(err)}`, memberNo).catch(() => {});
    } finally {
      verifyingRef.current = null;
      setProcessingResId(null);
    }
  };

  const nowHhMm = TimeMaster.formatKstDateTime(new Date()).slice(11, 16);

  return (
    <div
      style={{
        width: '100%',
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '32px 24px 110px 24px',
        boxSizing: 'border-box',
        position: 'relative',
        fontFamily: '"SF Pro Display", -apple-system, BlinkMacSystemFont, "Pretendard", sans-serif'
      }}
    >
      <div
        style={{
          width: '100%',
          maxWidth: '940px',
          background: '#ffffff',
          borderRadius: '36px',
          border: '1px solid rgba(0, 0, 0, 0.08)',
          boxShadow: '0 28px 70px rgba(0, 0, 0, 0.14), 0 4px 16px rgba(0, 0, 0, 0.04)',
          padding: '44px 48px',
          boxSizing: 'border-box',
          display: 'flex',
          flexDirection: 'column',
          gap: '28px',
          maxHeight: 'calc(100vh - 160px)'
        }}
      >
        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '16px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
            <div
              style={{
                width: '56px',
                height: '56px',
                borderRadius: '50%',
                background: '#1d1d1f',
                color: '#ffffff',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                boxShadow: '0 6px 16px rgba(0, 0, 0, 0.14)',
                flexShrink: 0
              }}
            >
              <QrCode size={28} />
            </div>
            <div>
              <h2 style={{ fontSize: '30px', fontWeight: 900, margin: 0, color: '#1d1d1f', letterSpacing: '-0.6px' }}>
                {lang === 'KO' ? '사전 예약 타석 체크인' : 'Reservation Check-in'}
              </h2>
              <p style={{ fontSize: '16px', color: '#86868b', fontWeight: 600, marginTop: '4px', margin: 0 }}>
                {memberName ? `${memberName} 님의 당일 예약 목록입니다.` : '당일 예약 내역을 확인하고 체크인을 진행해 주세요.'}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={loadReservations}
            style={{
              height: '48px',
              padding: '0 22px',
              borderRadius: '999px',
              background: '#f5f5f7',
              border: '1px solid #d2d2d7',
              color: '#1d1d1f',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              fontSize: '15px',
              fontWeight: 800,
              flexShrink: 0
            }}
          >
            <RefreshCw size={16} className={loading ? 'spin' : ''} />
            {lang === 'KO' ? '새로고침' : 'Refresh'}
          </button>
        </div>

        {/* Main Content */}
        <div style={{ flex: 1, overflowY: 'auto', paddingRight: '4px' }}>
          {errorMsg && (
            <div
              style={{
                background: '#fef2f2',
                border: '1px solid #fecaca',
                borderRadius: '18px',
                padding: '16px 20px',
                display: 'flex',
                alignItems: 'center',
                gap: '12px',
                marginBottom: '20px'
              }}
            >
              <AlertCircle size={24} color="#dc2626" />
              <span style={{ fontSize: '16px', color: '#b91c1c', fontWeight: 800 }}>{errorMsg}</span>
            </div>
          )}

          {loading ? (
            <div
              style={{
                display: 'flex',
                flexDirection: 'column',
                justifyContent: 'center',
                alignItems: 'center',
                minHeight: '300px',
                gap: '16px',
                background: '#f5f5f7',
                borderRadius: '28px',
                border: '1px solid #e5e5ea'
              }}
            >
              <RefreshCw size={42} color="#1d1d1f" style={{ animation: 'spin 1s linear infinite' }} />
              <span style={{ fontSize: '18px', color: '#86868b', fontWeight: 700 }}>
                {lang === 'KO' ? '예약 내역을 조회 중입니다...' : 'Loading reservations...'}
              </span>
            </div>
          ) : reservations.length === 0 ? (
            <div
              style={{
                minHeight: '320px',
                display: 'flex',
                flexDirection: 'column',
                justifyContent: 'center',
                alignItems: 'center',
                background: '#f5f5f7',
                borderRadius: '28px',
                border: '1px solid #e5e5ea',
                padding: '48px 36px',
                textAlign: 'center'
              }}
            >
              <div
                style={{
                  width: '72px',
                  height: '72px',
                  borderRadius: '50%',
                  background: '#ffffff',
                  border: '1px solid #e5e5ea',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  marginBottom: '18px'
                }}
              >
                <Calendar size={34} color="#1d1d1f" />
              </div>
              <h3 style={{ fontSize: '24px', fontWeight: 900, margin: '0 0 8px 0', color: '#1d1d1f', letterSpacing: '-0.5px' }}>
                {lang === 'KO' ? '당일 체크인 가능한 예약 내역이 없습니다.' : 'No check-in reservations found today.'}
              </h3>
              <p style={{ fontSize: '16px', color: '#86868b', fontWeight: 600, margin: '0 0 28px 0' }}>
                {lang === 'KO'
                  ? '현장 타석을 이용하시려면 [연습타석배정] 메뉴에서 즉시 배정을 진행해 주세요.'
                  : 'Please use [Practice Bay] menu to allocate an available bay immediately.'}
              </p>
              <button
                type="button"
                onClick={onCancel}
                style={{
                  height: '58px',
                  padding: '0 36px',
                  borderRadius: '999px',
                  background: '#1d1d1f',
                  color: '#ffffff',
                  fontSize: '17px',
                  fontWeight: 800,
                  border: 'none',
                  cursor: 'pointer',
                  boxShadow: '0 8px 20px rgba(0, 0, 0, 0.16)'
                }}
              >
                {lang === 'KO' ? '메인 화면으로 돌아가기' : 'Return to Main'}
              </button>
            </div>
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(380px, 1fr))', gap: '20px' }}>
              {reservations.map((res) => {
                const isProcessing = processingResId === res.res_id;
                const startFormatted = formatResTime(res.start_time) || '00:00';
                const isFutureTime = startFormatted > nowHhMm;

                // [BUG-C06] 4단계 상태 명확 구분
                const isActiveSession = ['PREPARE', 'USE', 'RUN', 'IN_USE'].includes(res.status_cd);
                const isPreCheckedInWait = res.status_cd === 'CHK' && isFutureTime;
                const isReadyToEnter = res.status_cd === 'CHK' && !isFutureTime;
                const isTicketPrintState = isActiveSession || isPreCheckedInWait;

                const badgeLabel = isActiveSession
                  ? (lang === 'KO' ? '✓ 입실/이용 중' : '✓ In Use')
                  : isPreCheckedInWait
                    ? (lang === 'KO' ? '✓ 사전 체크인 완료' : '✓ Pre-Checked In')
                    : isReadyToEnter
                      ? (lang === 'KO' ? '● 입실 시작 가능' : '● Ready to Start')
                      : (lang === 'KO' ? '● 체크인 대기' : '● Waiting Check-in');

                const buttonLabel = isActiveSession
                  ? (lang === 'KO' ? '배정표 재출력' : 'Re-print Ticket')
                  : isPreCheckedInWait
                    ? (lang === 'KO' ? '사전체크인 확인표 출력' : 'Print Pre-Checkin Slip')
                    : isReadyToEnter
                      ? (lang === 'KO' ? '⛳ 체크인 및 타석 입실 시작' : 'Start Session Now')
                      : isFutureTime
                        ? (lang === 'KO' ? '📌 사전 체크인 접수' : 'Pre Check-in')
                        : (lang === 'KO' ? '📌 체크인 및 입실 시작' : 'Complete Check-in');

                return (
                  <div
                    key={res.res_id}
                    style={{
                      background: '#f5f5f7',
                      borderRadius: '26px',
                      border: isReadyToEnter ? '2px solid #0071e3' : '1.5px solid #e5e5ea',
                      padding: '26px',
                      display: 'flex',
                      flexDirection: 'column',
                      justifyContent: 'space-between',
                      gap: '18px',
                      boxShadow: '0 8px 24px rgba(0, 0, 0, 0.04)'
                    }}
                  >
                    <div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
                        <span
                          style={{
                            fontSize: '26px',
                            fontWeight: 900,
                            color: '#1d1d1f',
                            letterSpacing: '-0.6px'
                          }}
                        >
                          {formatResourceTitle(res)}
                        </span>
                        <span
                          style={{
                            fontSize: '13px',
                            fontWeight: 800,
                            color: isTicketPrintState ? '#047857' : isReadyToEnter ? '#0071e3' : '#b45309',
                            background: isTicketPrintState
                              ? 'rgba(5, 150, 105, 0.1)'
                              : isReadyToEnter
                                ? 'rgba(0, 113, 227, 0.1)'
                                : '#fef3c7',
                            border: isTicketPrintState
                              ? '1px solid rgba(5, 150, 105, 0.25)'
                              : isReadyToEnter
                                ? '1px solid rgba(0, 113, 227, 0.25)'
                                : '1px solid #fcd34d',
                            padding: '5px 12px',
                            borderRadius: '999px'
                          }}
                        >
                          {badgeLabel}
                        </span>
                      </div>

                      <div
                        style={{
                          background: '#ffffff',
                          borderRadius: '18px',
                          border: '1px solid #e5e5ea',
                          padding: '16px 18px',
                          display: 'flex',
                          flexDirection: 'column',
                          gap: '10px',
                          fontSize: '15px',
                          color: '#515154'
                        }}
                      >
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                          <Clock size={17} color="#1d1d1f" />
                          <span>
                            예약시간:{' '}
                            <strong style={{ color: '#1d1d1f', fontWeight: 800 }}>
                              {formatResTime(res.start_time) || '정시'} ~ {formatResTime(res.end_time) || '종료'}
                            </strong>{' '}
                            ({res.duration_min}분)
                          </span>
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                          <Calendar size={17} color="#86868b" />
                          <span>
                            예약일자: <strong style={{ color: '#1d1d1f', fontWeight: 700 }}>{res.res_date}</strong>
                          </span>
                        </div>
                      </div>
                    </div>

                    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                      <button
                        type="button"
                        onClick={() => handleVerifyCheckin(res.res_id)}
                        disabled={isProcessing}
                        style={{
                          width: '100%',
                          height: '60px',
                          borderRadius: '999px',
                          background: isTicketPrintState ? '#ffffff' : '#1d1d1f',
                          color: isTicketPrintState ? '#1d1d1f' : '#ffffff',
                          fontSize: '17px',
                          fontWeight: 800,
                          border: isTicketPrintState ? '1.5px solid #d2d2d7' : 'none',
                          cursor: isProcessing ? 'wait' : 'pointer',
                          display: 'flex',
                          justifyContent: 'center',
                          alignItems: 'center',
                          gap: '10px',
                          boxShadow: isTicketPrintState ? '0 2px 8px rgba(0, 0, 0, 0.04)' : '0 8px 20px rgba(0, 0, 0, 0.16)'
                        }}
                      >
                        {isProcessing ? (
                          <>
                            <RefreshCw size={20} style={{ animation: 'spin 1s linear infinite' }} />
                            {lang === 'KO' ? '체크인 승인 중...' : 'Processing...'}
                          </>
                        ) : isTicketPrintState ? (
                          <>
                            <Printer size={20} color="#1d1d1f" />
                            {buttonLabel}
                          </>
                        ) : (
                          <>
                            <CheckCircle2 size={20} />
                            {buttonLabel}
                            <ArrowRight size={20} />
                          </>
                        )}
                      </button>
                      {isPreCheckedInWait && (
                        <span style={{ fontSize: '13px', color: '#047857', fontWeight: 700, textAlign: 'center' }}>
                          * {lang === 'KO' ? `예약시간(${startFormatted}) 정각에 타석이 자동 가동됩니다.` : `Bay starts automatically at ${startFormatted}.`}
                        </span>
                      )}
                      {isActiveSession && (
                        <span style={{ fontSize: '13px', color: '#86868b', fontWeight: 600, textAlign: 'center' }}>
                          * {lang === 'KO' ? '현재 이용 중인 타석의 배정표를 재출력합니다.' : 'Re-print ticket for active bay.'}
                        </span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

