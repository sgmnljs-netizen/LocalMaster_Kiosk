import React, { Suspense } from 'react';
import AgentGreetingHeader from './AgentGreetingHeader';
import LiveBayStatusHero from './LiveBayStatusHero';
import UserAssetWidget from './UserAssetWidget';
import DailyScheduleWidget from './DailyScheduleWidget';
import EnvironmentNoticeWidget from './EnvironmentNoticeWidget';
import { Member } from '../../services/api';

interface KioskMainPageContainerProps {
  bays?: any[];
  member?: Member | null;
  onQuickReserve?: (bayNo?: number | string) => void;
  onPurchaseClick?: () => void;
  noticeText?: string;
  weatherText?: string;
}

export default function KioskMainPageContainer({ 
  bays = [],
  member,
  onQuickReserve,
  onPurchaseClick,
  noticeText,
  weatherText
}: KioskMainPageContainerProps) {
  return (
    <div style={{
      width: '1080px',
      height: '1920px',
      backgroundColor: 'var(--color-cloud-dancer)',
      display: 'flex',
      flexDirection: 'column',
      position: 'relative',
      overflow: 'hidden'
    }}>
      <AgentGreetingHeader member={member} onQuickReserve={onQuickReserve} />
      
      <div className="bento-grid">
        <Suspense fallback={<div className="bento-item bento-item-hero animate-pulse-glow" />}>
          <LiveBayStatusHero bays={bays} />
        </Suspense>

        <Suspense fallback={<div className="bento-item animate-pulse-glow" />}>
          <UserAssetWidget member={member} onPurchaseClick={onPurchaseClick} />
        </Suspense>

        <Suspense fallback={<div className="bento-item animate-pulse-glow" />}>
          <DailyScheduleWidget />
        </Suspense>

        <Suspense fallback={<div className="bento-item animate-pulse-glow" style={{ gridColumn: '1 / -1' }} />}>
          <EnvironmentNoticeWidget noticeText={noticeText} weatherText={weatherText} />
        </Suspense>
      </div>
    </div>
  );
}
