import React, { useEffect, useState } from 'react';
import { CloudRain, Megaphone } from 'lucide-react';
import { api } from '../../services/api';

interface EnvironmentNoticeWidgetProps {
  noticeText?: string;
  weatherText?: string;
}

export default function EnvironmentNoticeWidget({ noticeText: initialNotice, weatherText: initialWeather }: EnvironmentNoticeWidgetProps) {
  const [weather, setWeather] = useState<string>(initialWeather || '맑음, 22°C (미세먼지 좋음)');
  const [notice, setNotice] = useState<string>(initialNotice || '센터 공지사항을 확인해 주세요.');

  useEffect(() => {
    const fetchStoreInfo = async () => {
      try {
        const info = await api.getStoreInfo();
        if (!initialNotice) {
          const metaNotice = info.meta_data?.notice || info.meta_data?.announcement;
          if (metaNotice) {
            setNotice(metaNotice);
          } else if (info.store_nm) {
            setNotice(`${info.store_nm} 정상 운영 중 (운영시간 06:00~23:00)`);
          }
        }
        if (!initialWeather) {
          const metaWeather = info.meta_data?.weather;
          if (metaWeather) {
            setWeather(metaWeather);
          }
        }
      } catch (err) {
        console.error('Failed to fetch store info for notice widget:', err);
      }
    };
    fetchStoreInfo();
  }, [initialNotice, initialWeather]);

  return (
    <div className="bento-item" style={{ 
      display: 'grid', 
      gridTemplateColumns: '1fr 1fr', 
      gap: '24px',
      alignItems: 'center'
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
        <div style={{ 
          backgroundColor: 'rgba(0, 102, 102, 0.1)', 
          padding: '16px', 
          borderRadius: '16px',
          color: 'var(--color-transformative-teal)'
        }}>
          <CloudRain size={32} />
        </div>
        <div>
          <h4 style={{ margin: 0, fontSize: '18px', color: 'var(--text-secondary)' }}>현재 날씨</h4>
          <p style={{ margin: 0, fontSize: '24px', fontWeight: 'bold', color: 'var(--color-transformative-teal)' }}>
            {weather}
          </p>
        </div>
      </div>
      
      <div style={{ display: 'flex', alignItems: 'center', gap: '16px', borderLeft: '1px solid var(--glass-border)', paddingLeft: '24px' }}>
        <div style={{ 
          backgroundColor: 'rgba(249, 215, 28, 0.2)', 
          padding: '16px', 
          borderRadius: '16px',
          color: '#B39100'
        }}>
          <Megaphone size={32} />
        </div>
        <div>
          <h4 style={{ margin: 0, fontSize: '18px', color: 'var(--text-secondary)' }}>센터 공지</h4>
          <p style={{ margin: 0, fontSize: '22px', fontWeight: '500', color: 'var(--text-primary)' }}>
            {notice}
          </p>
        </div>
      </div>
    </div>
  );
}
