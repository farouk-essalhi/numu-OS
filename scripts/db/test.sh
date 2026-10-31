#!/usr/bin/env bash
# Run the database migrations, seed and pgTAP tests against a throwaway database
# on a plain Postgres 15+ server with pgTAP installed. No Docker needed.
#
#   scripts/db/test.sh
#
# Connection comes from the usual PG* variables (PGHOST, PGPORT, PGUSER, ...).
# The user must be able to create databases and roles. The test database
# (NUMU_TEST_DB, default numu_test) is dropped and recreated on every run.
#
# With the Supabase CLI and Docker you can instead run the real stack:
#   supabase start && supabase test db
set -euo pipefail

cd "$(dirname "$0")/../.."

DB="${NUMU_TEST_DB:-numu_test}"
PSQL=(psql -X -q -v ON_ERROR_STOP=1 --no-psqlrc)

echo "==> Recreating database ${DB}"
"${PSQL[@]}" -d postgres -c "drop database if exists ${DB} with (force)" -c "create database ${DB}"
"${PSQL[@]}" -d postgres -c "alter database ${DB} set search_path = \"\$user\", public, extensions"

echo "==> Supabase shim"
"${PSQL[@]}" -d "${DB}" -f scripts/db/supabase-shim.sql

echo "==> Migrations"
for f in supabase/migrations/*.sql; do
  echo "    ${f##*/}"
  "${PSQL[@]}" -d "${DB}" -f "$f"
done

echo "==> Seed"
"${PSQL[@]}" -d "${DB}" -f supabase/seed.sql

echo "==> Tests"
failed=0
for t in supabase/tests/*.test.sql; do
  out="$("${PSQL[@]}" -d "${DB}" -tA -f "$t" 2>&1)" || { echo "$out"; echo "FAIL ${t##*/} (error)"; failed=1; continue; }
  if grep -qE '^not ok|^# Looks like' <<<"$out"; then
    echo "$out" | grep -E '^not ok|^#' || true
    echo "FAIL ${t##*/}"
    failed=1
  else
    echo "ok   ${t##*/} ($(grep -cE '^ok' <<<"$out") tests)"
  fi
done

if [[ $failed -ne 0 ]]; then
  echo "==> Some tests failed"
  exit 1
fi
echo "==> All tests passed"
