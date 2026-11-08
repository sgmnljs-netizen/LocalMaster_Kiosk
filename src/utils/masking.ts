/**
 * LocalMaster Kiosk PII Security Masking Utilities
 */

/**
 * 이름 마스킹 (예: "홍길동" -> "홍*동", "김철" -> "김*")
 */
export const maskName = (name?: string | null): string => {
  if (!name) return '비회원';
  const trimmed = name.trim();
  if (!trimmed) return '비회원';
  const chars = Array.from(trimmed);
  if (chars.length === 1) return chars[0];
  if (chars.length === 2) return `${chars[0]}*`;
  return `${chars[0]}${'*'.repeat(chars.length - 2)}${chars[chars.length - 1]}`;
};

/**
 * 휴대폰 번호 마스킹 (예: "010-1234-5678" -> "010-****-5678")
 */
export const maskHp = (hp?: string | null): string => {
  if (!hp || !hp.trim()) return '010-****-****';
  let clean = hp.replace(/[^0-9]/g, '');
  if (clean.startsWith('821') && (clean.length === 11 || clean.length === 12)) {
    clean = `0${clean.slice(2)}`;
  }
  if (clean.startsWith('02') && clean.length === 9) {
    return `02-***-${clean.slice(5)}`;
  }
  if (clean.startsWith('02') && clean.length === 10) {
    return `02-****-${clean.slice(6)}`;
  }
  if (clean.length === 12) {
    return `${clean.slice(0, 4)}-****-${clean.slice(8)}`;
  }
  if (clean.length === 11) {
    return `${clean.slice(0, 3)}-****-${clean.slice(7)}`;
  }
  if (clean.length === 10) {
    return `${clean.slice(0, 3)}-***-${clean.slice(6)}`;
  }
  return hp;
};
