import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const srcDir = path.join(__dirname, '../src');

const FORBIDDEN_PATTERNS = [
  { pattern: /\|\|\s*60/g, desc: '시간 60분 하드코딩 (|| 60)' },
  { pattern: /\|\|\s*90/g, desc: '시간 90분 하드코딩 (|| 90)' },
  { pattern: /\*\s*60(?!\s*\*\s*1000)/g, desc: '시간 60분 곱셈 하드코딩 (* 60)' },
  { pattern: /===\s*['"]D00[12]['"]/g, desc: '상품코드 D001/D002 고정 조건 하드코딩' }
];

let hasError = false;

function scanDir(dir) {
  const files = fs.readdirSync(dir);
  for (const file of files) {
    const fullPath = path.join(dir, file);
    const stat = fs.statSync(fullPath);
    if (stat.isDirectory()) {
      scanDir(fullPath);
    } else if (file.endsWith('.ts') || file.endsWith('.tsx')) {
      const content = fs.readFileSync(fullPath, 'utf8');
      FORBIDDEN_PATTERNS.forEach(({ pattern, desc }) => {
        const matches = content.match(pattern);
        if (matches) {
          console.error(`\x1b[31m[HARDCODE AUDIT ERROR]\x1b[0m ${file} 내 금지된 하드코딩 검출: "${desc}" (${matches.length}건)`);
          hasError = true;
        }
      });
    }
  }
}

console.log('🔍 [Zero-Hardcoding Check] 키오스크 소스코드 하드코딩 전수검사를 시작합니다...');
scanDir(srcDir);

if (hasError) {
  console.error('\x1b[31m\n🚨 하드코딩 검수가 실패했습니다! 빌드를 중단합니다. 임시 하드코딩을 제거하고 DB/API 동적 구조로 수정하십시오.\x1b[0m');
  process.exit(1);
} else {
  console.log('\x1b[32m✔ [Zero-Hardcoding Check PASS] 하드코딩 0건 확인 완료. 빌드를 진행합니다.\x1b[0m\n');
}
