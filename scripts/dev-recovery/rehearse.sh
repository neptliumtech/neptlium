#!/usr/bin/env bash
set -euo pipefail
umask 077
export LC_ALL=C

dev_ref=ntbaoylcrwkowqqvzkno
image=postgres:17.11-alpine@sha256:e5d2edd28b1f8d40a0a6c0c9cdc545b19b56a0d5d88f94bc11a97d970d4700d0
role=dev_recovery_reader
mode=${1:-}
source_id=${RECOVERY_SOURCE_CONTAINER:-}
target_id=${RECOVERY_TARGET_CONTAINER:-}
dir=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)

fail() { printf 'BLOCKED: %s\n' "$1" >&2; exit 1; }

[[ $mode == synthetic || $mode == hosted ]] || fail 'choose synthetic or hosted mode'
[[ $source_id =~ ^[a-f0-9]{64}$ && $target_id =~ ^[a-f0-9]{64}$ ]] || fail 'dedicated container IDs are required'
[[ $source_id != "$target_id" ]] || fail 'source and target overlap'

if [[ $mode == hosted ]]; then
  [[ ${DEV_RECOVERY_PROJECT_REF:-} == "$dev_ref" ]] || fail 'source project ref must match Neptlium Dev'
  [[ ${DEV_RECOVERY_RETENTION:-} == ephemeral-job-only && -n ${DEV_RECOVERY_APPROVAL:-} ]] ||
    fail 'recovery authorization and ephemeral retention must be recorded'
  [[ -n ${DEV_RECOVERY_DB_PASSWORD:-} && -n ${DEV_RECOVERY_CA_PEM:-} ]] ||
    fail 'Dev-only password and trusted CA are required'
  source_host=${DEV_RECOVERY_SOURCE_HOST:-}
  source_user=$role
  if [[ $source_host =~ ^aws-[0-9]+-us-east-2\.pooler\.supabase\.com$ ]]; then
    source_user="$role.$dev_ref"
  elif [[ $source_host != "db.$dev_ref.supabase.co" ]]; then
    fail 'source host must be the Dev database or its approved us-east-2 session pooler'
  fi
fi

for command in docker gpg openssl sha256sum; do
  command -v "$command" >/dev/null || fail "missing dependency $command"
done

work=$(mktemp -d)
phase=preflight
cleanup() {
  local result=$?
  trap - EXIT
  if [[ ${ca_written:-} == yes ]]; then
    docker exec "$source_id" rm -f /tmp/neptlium-dev-recovery-ca.pem >/dev/null 2>&1 || true
  fi
  if [[ -n ${restore_list:-} ]]; then
    docker exec -i "$target_id" rm -f -- "$restore_list" >/dev/null 2>&1 || true
  fi
  rm -rf -- "$work"
  if (( result != 0 )); then
    printf 'FAIL: %s. Private scratch files were removed.\n' "$phase" >&3
  fi
  exit "$result"
}
trap cleanup EXIT
trap 'exit 130' INT
trap 'exit 143' TERM
exec 3>&2 2>"$work/private.log"

local_pg() {
  local container=$1
  shift
  docker exec -i "$container" "$@" -h /var/run/postgresql -p 5432 -U postgres -d postgres
}

target() { local_pg "$target_id" "$@"; }

source_db() {
  if [[ $mode == synthetic ]]; then
    local_pg "$source_id" "$@"
  else
    PGPASSWORD="$DEV_RECOVERY_DB_PASSWORD" PGSSLROOTCERT=/tmp/neptlium-dev-recovery-ca.pem \
      PGSSLMODE=verify-full PGCONNECT_TIMEOUT=10 \
      docker exec -i -e PGPASSWORD -e PGSSLROOTCERT -e PGSSLMODE -e PGCONNECT_TIMEOUT "$source_id" \
      "$@" -h "$source_host" -p 5432 -U "$source_user" -d postgres
  fi
}

for container in "$source_id" "$target_id"; do
  [[ $(docker inspect -f '{{.Config.Image}}' "$container") == "$image" ]]
  [[ $(docker inspect -f '{{len .HostConfig.PortBindings}}' "$container") == 0 ]]
  [[ $(docker inspect -f '{{len .HostConfig.Binds}}' "$container") == 0 ]]
done
[[ $(docker inspect -f '{{index .Config.Labels "neptlium.dev-recovery"}}' "$source_id") == source ]]
[[ $(docker inspect -f '{{index .Config.Labels "neptlium.dev-recovery"}}' "$target_id") == target ]]
networks=$(docker inspect -f '{{range $name, $_ := .NetworkSettings.Networks}}{{println $name}}{{end}}' "$target_id")
while IFS= read -r network; do
  if [[ -n $network ]]; then docker network disconnect -f "$network" "$target_id"; fi
done <<<"$networks"
[[ $(docker inspect -f '{{len .NetworkSettings.Networks}}' "$target_id") == 0 ]]
[[ $(target psql -XAtq -v ON_ERROR_STOP=1 -c "
  select current_setting('server_version_num')::int / 10000 = 17
    and not exists (select from pg_namespace where nspname in ('auth','storage','supabase_migrations'))
    and (select pg_get_userbyid(nspowner) = 'pg_database_owner' from pg_namespace where nspname = 'public')
    and not exists (select from pg_class where relnamespace = 'public'::regnamespace)
    and not exists (select from pg_proc where pronamespace = 'public'::regnamespace)") == t ]]
printf 'PASS target is a separate, disconnected PG17 service\n'

phase='source validation'
schemas=(--schema=public)
if [[ $mode == synthetic ]]; then
  source_db psql -Xq -v ON_ERROR_STOP=1 < "$dir/synthetic.sql"
  schemas+=(--schema=supabase_migrations)
else
  ca_written=yes
  printf '%s\n' "$DEV_RECOVERY_CA_PEM" |
    docker exec -i "$source_id" sh -c 'umask 077; cat > /tmp/neptlium-dev-recovery-ca.pem'
  [[ $(source_db psql -XAtq -v ON_ERROR_STOP=1 -c "
  select current_setting('server_version_num')::int / 10000 = 17
    and current_setting('transaction_read_only') = 'on'
    and current_user = 'dev_recovery_reader'
    and session_user = current_user
    and not (rolsuper or rolcreaterole or rolcreatedb or rolreplication or rolbypassrls)
    and not exists (select from pg_auth_members where member = oid)
    and not has_schema_privilege('public','CREATE')
    and to_regnamespace('auth') is not null and to_regnamespace('storage') is not null
    and to_regnamespace('supabase_migrations') is null
    and (select pg_get_userbyid(nspowner) = 'pg_database_owner' from pg_namespace where nspname = 'public')
    and not exists (select from pg_class where relnamespace = 'public'::regnamespace)
    and not exists (select from pg_proc where pronamespace = 'public'::regnamespace)
    and not exists (select from pg_type where typnamespace = 'public'::regnamespace)
  from pg_roles where rolname = current_user") == t ]]
fi

# Compare schema DDL (including ACLs and policies) and fixture rows without emitting them.
fingerprint() {
  "$1" pg_dump --format=plain --inserts --strict-names "${schemas[@]}" |
    sed -E '/^\\(un)?restrict /d; /^-- Dumped (from|by) database version /d' |
    sha256sum | cut -d ' ' -f1
}

phase='checkpoint creation and encryption'
before=$(fingerprint source_db)
openssl rand -hex 32 > "$work/passphrase"
mkdir "$work/gnupg"
gpg_local() { gpg --no-options --homedir "$work/gnupg" --batch --no-symkey-cache --pinentry-mode loopback --passphrase-file "$work/passphrase" "$@"; }
source_db pg_dump --format=custom --strict-names "${schemas[@]}" |
  gpg_local --symmetric --cipher-algo AES256 --compress-algo none --output "$work/checkpoint.gpg"
(cd "$work" && sha256sum checkpoint.gpg > checkpoint.sha256 && sha256sum -c checkpoint.sha256)
printf 'Checkpoint ciphertext SHA-256 %s\n' "$(cut -d ' ' -f1 "$work/checkpoint.sha256")"

phase='isolated restore'
target psql -Xq -v ON_ERROR_STOP=1 <<'SQL'
create role anon nologin;
create role authenticated nologin;
create role service_role nologin bypassrls;
create role authenticator nologin;
create role supabase_admin nologin;
SQL
# Retain the stock public schema and its default ACL. Restore separate ACL and
# comment entries from the archive. Dropping public loses the default PUBLIC USAGE.
gpg_local --decrypt "$work/checkpoint.gpg" |
  docker exec -i "$target_id" pg_restore --list > "$work/archive.list"
[[ $(grep -Ec '^[0-9]+; [0-9]+ [0-9]+ SCHEMA - public pg_database_owner$' "$work/archive.list") == 1 ]]
restore_list="/tmp/neptlium-dev-recovery-${work##*/}.list"
sed -E '/^[0-9]+; [0-9]+ [0-9]+ SCHEMA - public pg_database_owner$/s/^/;/' "$work/archive.list" |
  docker exec -i "$target_id" sh -c 'umask 077; cat > "$1"' sh "$restore_list"
gpg_local --decrypt "$work/checkpoint.gpg" |
  target pg_restore --use-list="$restore_list" --exit-on-error --single-transaction

phase='consistency and coverage verification'
[[ $(fingerprint target) == "$before" ]]
[[ $(fingerprint source_db) == "$before" ]]
[[ $(target psql -XAtq -v ON_ERROR_STOP=1 -c "
  select to_regnamespace('auth') is null and to_regnamespace('storage') is null
    and (select count(*) from pg_roles where rolname in ('anon','authenticated','service_role','authenticator','supabase_admin')
      and not (rolcanlogin or rolsuper or rolcreatedb or rolcreaterole or rolreplication)
      and rolbypassrls = (rolname = 'service_role')) = 5") == t ]]
if [[ $mode == synthetic ]]; then
  [[ $(target psql -XAtq -v ON_ERROR_STOP=1 -c "
    select count(*) = 1 from supabase_migrations.schema_migrations where version='fixture'") == t ]]
  [[ $(target psql -XAtq -v ON_ERROR_STOP=1 -c "
    set role authenticated;
    select count(*) = 1 and min(id) = 1 from public.recovery_fixture") == t ]]
fi
printf 'PASS restored scope matches source before and after restore (%s)\n' "$mode"
printf 'Coverage: application SQL and supported ACLs; managed Auth, Storage and global roles excluded\n'
