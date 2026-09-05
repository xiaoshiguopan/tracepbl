#!/bin/sh
set -eu
cd "$(dirname "$0")/.."
project=${TRACEPBL_SAFETY_PROJECT:-tracepbl-stage12-cp12}
pg=${project}-postgres-1
run=stage12_dump_$(date +%s)
restored=${run}_restored
journal=/recovery/${run}.json
docker exec "$pg" createdb -U postgres "$run"
docker exec "$pg" createdb -U postgres "$restored"
fixture() {
  db=$1; shift
  docker compose -f tests/stage12.compose.yaml -p "$project" run --rm -T -v tracepbl-stage12-drill-journals:/recovery -v "$PWD/tests/stage12.restore-fixture.ts:/app/tests/stage12.restore-fixture.ts:ro" -e "TRACEPBL_RECOVERY_JOURNAL=$journal" -e "TRACEPBL_TEST_DATABASE_URL=postgres://postgres:synthetic-stage12-only@postgres:5432/$db" verify node --experimental-transform-types tests/stage12.restore-fixture.ts "$@"
}
fixture "$run" prepare
docker exec "$pg" pg_dump -U postgres -Fc -f "/tmp/$run.dump" "$run"
fixture "$run" expire
docker exec "$pg" pg_restore -U postgres --exit-on-error -d "$restored" "/tmp/$run.dump"
fixture "$restored" assert-blocked
head=$(fixture "$run" fingerprint)
docker compose -f tests/stage12.compose.yaml -p "$project" run --rm -T -v tracepbl-stage12-drill-journals:/recovery -e "TRACEPBL_RECOVERY_JOURNAL=$journal" -e "TRACEPBL_MIGRATOR_DATABASE_URL=postgres://postgres:synthetic-stage12-only@postgres:5432/$restored" verify node --experimental-transform-types apps/worker/src/recovery-maintenance.ts reconcile "$head"
fixture "$restored" assert-purged
