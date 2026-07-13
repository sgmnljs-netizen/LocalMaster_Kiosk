import React, { Suspense } from 'react';
import AgentGreetingHeader from './AgentGreetingHeader';
import LiveBayStatusHero from './LiveBayStatusHero';
import UserAssetWidget from './UserAssetWidget';
import DailyScheduleWidget from './DailyScheduleWidget';
import EnvironmentNoticeWidget from './EnvironmentNoticeWidget';

export default function KioskMainPageContainer() {
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
      <AgentGreetingHeader />
      
      <div className="bento-grid">
        <Suspense fallback={<div className="bento-item bento-item-hero animate-pulse-glow" />}>
          <LiveBayStatusHero />
        </Suspense>

        <Suspense fallback={<div className="bento-item animate-pulse-glow" />}>
          <UserAssetWidget />
        </Suspense>

        <Suspense fallback={<div className="bento-item animate-pulse-glow" />}>
          <DailyScheduleWidget />
        </Suspense>

        <Suspense fallback={<div className="bento-item animate-pulse-glow" style={{ gridColumn: '1 / -1' }} />}>
          <EnvironmentNoticeWidget />
        </Suspense>
      </div>
    </div>
  );
}
