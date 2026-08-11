import React, { useEffect, useState } from 'react';
import { Ticket, Gift } from 'lucide-react';
import { Member, MemberAsset } from '../../services/api';

interface UserAssetWidgetProps {
  member?: Member | null;
  onPurchaseClick?: () => void;
}

export default function UserAssetWidget({ member: initialMember, onPurchaseClick }: UserAssetWidgetProps) {
  const [member, setMember] = useState<Member | null>(initialMember || null);
  const [assets, setAssets] = useState<MemberAsset[]>(initialMember?.assets || []);

  useEffect(() => {
    if (initialMember) {
      setMember(initialMember);
      setAssets(initialMember.assets || []);
    } else {
      const cachedMember = localStorage.getItem('LM_AUTH_MEMBER');
      if (cachedMember) {
        try {
          const parsed = JSON.parse(cachedMember);
          setMember(parsed);
          setAssets(parsed.assets || []);
        } catch {}
      }
    }
  }, [initialMember]);

  const displayAssets = assets.map(asset => {
    const name = asset.item_name || '골프 연습 이용권';
    let remain = '이용가능';
    if (asset.rem_count != null) remain = `${asset.rem_count}회`;
    else if (asset.remain_cnt != null) remain = `${asset.remain_cnt}회`;
    else if (asset.remain_days != null) remain = `D-${asset.remain_days}`;
    else if (asset.days != null) remain = `${asset.days}일`;
    else if (asset.expiry_date) remain = `~${asset.expiry_date.slice(5)}`;
    return { type: name, remain };
  });

  return (
    <div className="bento-item" style={{ backgroundColor: 'var(--color-sweet-corn)', display: 'flex', flexDirection: 'column' }}>
      <h3 style={{ color: 'var(--color-transformative-teal)', fontSize: '24px', margin: '0 0 20px 0', display: 'flex', alignItems: 'center', gap: '8px' }}>
        <Ticket size={24} /> 나의 이용권 현황
      </h3>
      
      <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', flex: 1 }}>
        {displayAssets.length > 0 ? (
          displayAssets.map((pkg, idx) => (
            <div key={idx} className="soft-btn" style={{ 
              padding: '20px', 
              display: 'flex', 
              justifyContent: 'space-between', 
              alignItems: 'center',
              backgroundColor: 'rgba(255,255,255,0.4)',
              cursor: 'default'
            }}>
              <span style={{ fontSize: '20px', fontWeight: '500' }}>{pkg.type}</span>
              <span style={{ fontSize: '24px', fontWeight: 'bold', color: 'var(--color-transformative-teal)' }}>{pkg.remain}</span>
            </div>
          ))
        ) : (
          <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-secondary)', fontSize: '18px', padding: '20px' }}>
            {member ? '보유 중인 정기 이용권이 없습니다.' : '회원 인증 후 이용권 현황을 확인하세요.'}
          </div>
        )}
      </div>

      <button 
        onClick={onPurchaseClick}
        className="soft-btn" 
        style={{ 
          marginTop: '16px', 
          padding: '16px', 
          display: 'flex', 
          alignItems: 'center', 
          justifyContent: 'center', 
          gap: '8px',
          backgroundColor: 'var(--color-cloud-dancer)',
          color: 'var(--color-transformative-teal)',
          fontSize: '18px',
          fontWeight: 'bold',
          cursor: 'pointer'
        }}
      >
        <Gift size={20} /> 패키지 추가 구매하기
      </button>
    </div>
  );
}
