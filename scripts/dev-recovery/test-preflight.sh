#!/usr/bin/env bash
set -euo pipefail

script=$(dirname -- "${BASH_SOURCE[0]}")/rehearse.sh
source_id=$(printf 'a%.0s' {1..64})
target_id=$(printf 'b%.0s' {1..64})
defaults=(
  RECOVERY_SOURCE_CONTAINER="$source_id"
  RECOVERY_TARGET_CONTAINER="$target_id"
  DEV_RECOVERY_PROJECT_REF=ntbaoylcrwkowqqvzkno
  DEV_RECOVERY_SOURCE_HOST=db.ntbaoylcrwkowqqvzkno.supabase.co
  DEV_RECOVERY_DB_PASSWORD=fixture
  DEV_RECOVERY_CA_PEM=fixture
  DEV_RECOVERY_APPROVAL=fixture
  GITHUB_SHA=0123456789012345678901234567890123456789
  DEV_RECOVERY_APPROVED_SHA=0123456789012345678901234567890123456789
  DEV_RECOVERY_RETENTION=ephemeral-job-only
)

denies() {
  local expected=$1
  shift
  local output
  if output=$(env "${defaults[@]}" "$@" bash "$script" hosted 2>&1); then
    printf 'FAIL unexpected preflight success\n' >&2
    exit 1
  fi
  [[ $output == "BLOCKED: $expected" ]]
  printf 'PASS %s\n' "$expected"
}

denies 'source and target overlap' RECOVERY_TARGET_CONTAINER="$source_id"
denies 'source project ref must match Neptlium Dev' DEV_RECOVERY_PROJECT_REF=udghxwlhztwxvkjaefjh
denies 'source host must be the Dev database or its approved us-east-2 session pooler' DEV_RECOVERY_SOURCE_HOST=db.udghxwlhztwxvkjaefjh.supabase.co
denies 'source host must be the Dev database or its approved us-east-2 session pooler' DEV_RECOVERY_SOURCE_HOST=127.0.0.1
denies 'source host must be the Dev database or its approved us-east-2 session pooler' DEV_RECOVERY_SOURCE_HOST=aws-0-us-east-2.pooler.supabase.com:6543
denies 'Dev-only password and trusted CA are required' DEV_RECOVERY_DB_PASSWORD=
denies 'Dev-only password and trusted CA are required' DEV_RECOVERY_CA_PEM=
denies 'recovery authorization and ephemeral retention must be recorded' DEV_RECOVERY_RETENTION=
denies 'recovery authorization and ephemeral retention must be recorded' DEV_RECOVERY_APPROVAL=

denies 'hosted recovery requires approval for the exact checked-out commit' DEV_RECOVERY_APPROVED_SHA=
denies 'hosted recovery requires approval for the exact checked-out commit' DEV_RECOVERY_APPROVED_SHA=abcdefabcdefabcdefabcdefabcdefabcdefabcd
