#!/usr/bin/env bash
# Local synthetic recovery only. No remote URLs, linked projects, or credentials.
set -euo pipefail
umask 077
export LC_ALL=C
if (($#)); then
  printf 'Usage: bash supabase/scripts/gate-03c6-rehearse.sh\n' >&2
  exit 2
fi

cd "$(dirname "$0")/../.."
scratch=$(mktemp -d)
stage=initialize
image=public.ecr.aws/supabase/postgres:17.11.0.004@sha256:b15d862126dd2dac02da524696ccfde2dcce2ceaee0a58973b2727befe492706
upgrade=20261121130000_harden_identity_and_rate_limit_authority.sql
source_db=
restore_db=
cleanup() {
  local status=$?
  if ((status)); then printf 'Gate 03C.6 failed at %s.\n' "$stage" >&2; fi
  for container in "$source_db" "$restore_db"; do
    if [[ -n "$container" ]]; then docker stop "$container" >/dev/null 2>&1 || true; fi
  done
  rm -rf -- "$scratch"
}
trap cleanup EXIT

db() { docker exec -i "$1" psql -U postgres -d postgres -XqAt -v ON_ERROR_STOP=1 "${@:2}"; }
admin() { docker exec -i "$1" psql -U supabase_admin -d postgres -Xq -v ON_ERROR_STOP=1; }
dump() { docker exec "$1" pg_dump -U postgres -d postgres "${@:2}"; }
start_db() {
  docker run --rm -d --pull never --network none -e POSTGRES_PASSWORD=synthetic-gate03c6 "$image"
}
wait_db() {
  for attempt in {1..60}; do
    if docker exec "$1" pg_isready -q -h 127.0.0.1 -U postgres -d postgres; then return; fi
    sleep 1
  done
  return 1
}
run_migration() {
  local name=${2##*/} version
  version=${name%%_*}
  [[ $version =~ ^[0-9]{14}$ ]]
  printf 'Apply %s\n' "$name"
  # Preserve explicit transaction boundaries in historical migrations.
  if grep -Eiq '^begin;[[:space:]]*$' "$2"; then
    db "$1" -f - < "$2"
    db "$1" -c "insert into supabase_migrations.schema_migrations values ('$version', '$name')"
  else
    {
      cat "$2"
      printf "\ninsert into supabase_migrations.schema_migrations values ('%s', '%s');\n" "$version" "$name"
    } | db "$1" --single-transaction -f -
  fi
}
check_history() {
  db "$1" -c 'select version from supabase_migrations.schema_migrations order by version' > "$scratch/history"
  diff -u "$2" "$scratch/history"
}
normalize_dump() { sed -E '/^\\(un)?restrict /d'; }
scope=(--schema=public --schema=storage --schema=supabase_migrations)
managed_roles() {
  db "$1" -c "
    select rolname, rolsuper, rolcreaterole, rolcreatedb, rolcanlogin, rolbypassrls
      from pg_roles where rolname in ('postgres','supabase_admin','supabase_auth_admin','anon','authenticated','service_role')
      order by rolname;
    select r.rolname, m.rolname, g.rolname, a.admin_option, a.inherit_option, a.set_option
      from pg_auth_members a join pg_roles r on r.oid = a.roleid
      join pg_roles m on m.oid = a.member join pg_roles g on g.oid = a.grantor
      where m.rolname in ('postgres','supabase_admin','supabase_auth_admin','anon','authenticated','service_role')
      order by r.rolname, m.rolname, g.rolname"
}

stage=replay
source_db=$(start_db)
wait_db "$source_db"
admin "$source_db" < supabase/test/gate-03c6/managed-prerequisites.sql
admin "$source_db" < supabase/test/gate-03c6/managed-storage-fixture.sql
db "$source_db" -c 'create schema supabase_migrations; create table supabase_migrations.schema_migrations(version text primary key, name text not null);'
: > "$scratch/baseline-expected"
for file in supabase/migrations/*.sql; do
  name=${file##*/}
  [[ $name =~ ^[0-9]{14}_[a-z0-9_]+\.sql$ ]]
  if [[ $name == "$upgrade" ]]; then break; fi
  run_migration "$source_db" "$file"
  printf '%s\n' "${name%%_*}" >> "$scratch/baseline-expected"
done
test -s "$scratch/baseline-expected"
check_history "$source_db" "$scratch/baseline-expected"
db "$source_db" < supabase/test/gate-03c6/seed.sql
db "$source_db" < supabase/test/gate-03c6/authorization.sql

stage=backup
# Quiescent fixture. Copy Auth rows separately, before app triggers exist on the target.
dump "$source_db" --format=custom "${scope[@]}" > "$scratch/application.dump"
dump "$source_db" --data-only --table=auth.users > "$scratch/auth-users.sql"
dump "$source_db" --schema-only "${scope[@]}" | normalize_dump > "$scratch/source-schema"
dump "$source_db" --data-only "${scope[@]}" | normalize_dump > "$scratch/source-data"
managed_roles "$source_db" > "$scratch/source-roles"
(cd "$scratch" && sha256sum application.dump auth-users.sql > SHA256SUMS)

stage=upgrade
run_migration "$source_db" "supabase/migrations/$upgrade"
{ cat "$scratch/baseline-expected"; printf '%s\n' "${upgrade%%_*}"; } > "$scratch/upgrade-expected"
check_history "$source_db" "$scratch/upgrade-expected"
db "$source_db" < supabase/test/gate-03c6/authorization.sql
db "$source_db" < supabase/test/gate-03c6/hardening.sql
decision="set role service_role; select allowed from public.consume_api_rate_limit(repeat('e', 64), 1, 60000)"
db "$source_db" -c "$decision" > "$scratch/decision-a" &
client_a=$!
db "$source_db" -c "$decision" > "$scratch/decision-b" &
client_b=$!
wait "$client_a"
wait "$client_b"
sort "$scratch/decision-a" "$scratch/decision-b" > "$scratch/decisions"
printf 'f\nt\n' | cmp - "$scratch/decisions"
db "$source_db" < supabase/test/gate-03c6/read-only-inventory.sql > "$scratch/upgrade-inventory"
printf 'Verified upgrade, grants, tenant RLS, identity rollback, and limiter behavior (%s versions).\n' "$(wc -l < "$scratch/upgrade-expected")"

stage=recovery
docker stop "$source_db" >/dev/null
source_db=
restore_db=$(start_db)
wait_db "$restore_db"
admin "$restore_db" < supabase/test/gate-03c6/managed-prerequisites.sql
(cd "$scratch" && sha256sum --check --status SHA256SUMS)
docker cp "$scratch/application.dump" "$restore_db:/tmp/application.dump"
docker exec "$restore_db" pg_restore --list /tmp/application.dump |
  sed -E '/^[0-9]+; [0-9]+ [0-9]+ SCHEMA - (public|storage) /d' > "$scratch/restore.list"

# Supabase's bootstrap role owns managed ACLs. Keep ownership and grants in the dump.
admin "$restore_db" <<'SQL'
create schema if not exists storage authorization postgres;
alter default privileges for role supabase_admin in schema public revoke all on tables from postgres, anon, authenticated, service_role;
alter default privileges for role supabase_admin in schema public revoke all on sequences from postgres, anon, authenticated, service_role;
alter default privileges for role supabase_admin in schema public revoke all on functions from postgres, anon, authenticated, service_role;
alter default privileges for role postgres in schema public revoke all on tables from anon, authenticated, service_role;
alter default privileges for role postgres in schema public revoke all on sequences from anon, authenticated, service_role;
alter default privileges for role postgres in schema public revoke all on functions from anon, authenticated, service_role;
SQL
db "$restore_db" < "$scratch/auth-users.sql"
docker exec -i "$restore_db" pg_restore -U supabase_admin -d postgres --single-transaction --exit-on-error \
  --use-list=/dev/stdin /tmp/application.dump < "$scratch/restore.list"
check_history "$restore_db" "$scratch/baseline-expected"
dump "$restore_db" --schema-only "${scope[@]}" | normalize_dump > "$scratch/restored-schema"
diff -u "$scratch/source-schema" "$scratch/restored-schema"
dump "$restore_db" --data-only "${scope[@]}" | normalize_dump > "$scratch/restored-data"
cmp "$scratch/source-data" "$scratch/restored-data"
managed_roles "$restore_db" > "$scratch/restored-roles"
cmp "$scratch/source-roles" "$scratch/restored-roles"
db "$restore_db" < supabase/test/gate-03c6/authorization.sql
printf 'Verified independent pre-upgrade recovery (%s versions), schema/ACLs, roles and fixture ownership.\n' "$(wc -l < "$scratch/baseline-expected")"
