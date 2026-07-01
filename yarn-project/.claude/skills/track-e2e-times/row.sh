#!/usr/bin/env bash
# Aggregate downloaded e2e test-timing JSONL into local summary tables: the run's aggregate sums
# (test count, overall / setup / setup.ts-fn / body / teardown), the wall-clock window, and a ranked
# span leaderboard. Reads every *.jsonl in the given folder.
#
# Usage: row.sh <folder-with-jsonl>
#   <folder>  a directory of *.jsonl produced by a timed run (TEST_TIMING_FILE) or downloaded via
#             `./ci.sh test-timings <CI_LOG_ID> <folder>`.
set -euo pipefail

folder=${1:?Usage: row.sh <folder-with-jsonl>}

shopt -s nullglob
files=("$folder"/*.jsonl)
[ ${#files[@]} -gt 0 ] || { echo "row.sh: no *.jsonl files in $folder" >&2; exit 1; }

# Sums across all per-test measurements, plus the run's commit/branch/runId and the wall-clock window
# (first test start -> last test end).
IFS=$'\t' read -r tests overall setup setupfn body teardown commit branch runid startISO endISO < <(
  cat "$folder"/*.jsonl | jq -rs '
      (map(select(.type=="test"))) as $t
    | {
        tests:    ($t | length),
        overall:  (map(.totalMs) | add),
        setup:    (map(.beforeHooksMs) | add),
        setupfn:  (map(.setupFnMs) | add),
        body:     ($t | map(.bodyMs) | add),
        teardown: (map(.afterHooksMs) | add),
        commit:   ($t | map(.commit) | first),
        branch:   ($t | map(.branch) | first),
        runid:    ($t | map(.runId) | first),
        startISO: ($t | map(.startedAt) | min),
        endISO:   ( $t
                    | map((.startedAt | sub("\\.[0-9]+Z$"; "Z") | fromdateiso8601) + (.totalMs / 1000))
                    | max | todateiso8601 )
      }
    | [ .tests, .overall, .setup, .setupfn, .body, .teardown, .commit, .branch, .runid, .startISO, .endISO ]
    | @tsv'
)

# Insert thousands separators into an integer.
group() { printf '%s' "$1" | rev | sed 's/[0-9]\{3\}/&,/g' | rev | sed 's/^,//'; }

# Format milliseconds as "Xh Ym Zs (N,NNN ms)", dropping leading zero units.
fmt() {
  local ms=$1 s h m sec out=""
  s=$(( (ms + 500) / 1000 )); h=$(( s / 3600 )); m=$(( (s % 3600) / 60 )); sec=$(( s % 60 ))
  [ "$h" -gt 0 ] && out="${h}h "
  { [ "$h" -gt 0 ] || [ "$m" -gt 0 ]; } && out="${out}${m}m "
  out="${out}${sec}s"
  printf '%s (%s ms)' "$out" "$(group "$ms")"
}

date_str=$(date -u -d "$startISO" +%Y-%m-%d)
start_hm=$(date -u -d "$startISO" +%H:%M)
end_hm=$(date -u -d "$endISO" +%H:%M)
short=${commit:0:8}

echo "tests=$tests  commit=$short  branch=$branch  runId=$runid"
echo "window=${date_str} ${start_hm}-${end_hm} UTC"
echo "overall=$(fmt "$overall") | setup=$(fmt "$setup") | setup.ts=$(fmt "$setupfn") | body=$(fmt "$body") | teardown=$(fmt "$teardown")"
[ "$tests" -lt 800 ] && echo "WARNING: only $tests tests — likely a partial/cache-hit run, NOT comparable to full runs (~950)." >&2
[ "$runid" = "null" ] && echo "NOTE: runId is null — RUN_ID was not set for this run (expected for local runs)." >&2

# Span leaderboard: roll every category:label tag up across all test/suite lines, summing busyMs (the
# concurrency-correct wall-clock) and count, taking the max maxMs, sorted by busyMs descending.
echo ""
echo "span leaderboard (busyMs | count | maxMs | tag):"
cat "$folder"/*.jsonl | jq -rs '
    [ .[] | select(.type=="test" or .type=="suite") | (.spans // {}) | to_entries[] ]
  | group_by(.key)
  | map({ tag: .[0].key, count: (map(.value.count) | add),
          busyMs: (map(.value.busyMs) | add), maxMs: (map(.value.maxMs) | max) })
  | sort_by(-.busyMs) | .[] | "\(.busyMs)\t\(.count)\t\(.maxMs)\t\(.tag)"'
