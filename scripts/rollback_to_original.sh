#!/bin/bash
# ==============================================================================
# 🔄 LocalMaster Kiosk 원본 상태 100% 즉시 롤백 스크립트
# ==============================================================================

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
KIOSK_ROOT="$(dirname "$SCRIPT_DIR")"
BACKUP_DIR="$KIOSK_ROOT/backups/kiosk_main_backup_20260823_original"

echo "========================================================"
echo "🔄 [Kiosk Rollback] 원본 상태로 복구를 시작합니다..."
echo "========================================================"

if [ -d "$BACKUP_DIR/src" ]; then
    echo "📦 1. 물리적 백업본(backups/kiosk_main_backup_20260823_original/src)에서 복원 중..."
    rm -rf "$KIOSK_ROOT/src"
    cp -r "$BACKUP_DIR/src" "$KIOSK_ROOT/src"
    echo "✅ src 디렉토리 복원 완료."
else
    echo "⚠️ 물리적 백업 디렉토리가 없어 git 태그를 통해 복원합니다."
    cd "$KIOSK_ROOT"
    git checkout backup_kiosk_main_before_redesign_20260823 -- src/
    echo "✅ Git 태그 기반 복원 완료."
fi

echo "========================================================"
echo "🎉 원본 상태로 100% 완벽히 복구되었습니다!"
echo "========================================================"
