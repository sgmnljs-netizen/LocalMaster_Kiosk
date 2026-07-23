/**
 * LocalMaster Kiosk PII Security Masking Utilities
 */

/**
 * 이름 마스킹 (예: "홍길동" -> "홍*동", "김철" -> "김*")
 */
export const maskName = (name?: string | null): string => {
  if (!name) return '비회원';
  const trimmed = name.trim();
  if (trimmed.length <= 1) return trimmed;
  if (trimmed.length === 2) return `${trimmed[0]}*`;
  return `${trimmed[0]}${'*'.repeat(trimmed.length - 2)}${trimmed[trimmed.length - 1]}`;
};

/**
 * 휴대폰 번호 마스킹 (예: "010-1234-5678" -> "010-****-5678")
 */
export const maskHp = (hp?: string | null): string => {
  if (!hp) return '010-****-****';
  const clean = hp.replace(/[^0-9]/g, '');
  if (clean.length === 11) {
    return `${clean.slice(0, 3)}-****-${clean.slice(7)}`;
  }
  if (clean.length === 10) {
    return `${clean.slice(0, 3)}-***-${clean.slice(6)}`;
  }
  return hp;
};
