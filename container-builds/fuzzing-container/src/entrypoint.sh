#!/usr/bin/env bash
# ContFuzzer v2 entrypoint for Barretenberg fuzzing container.

set -uo pipefail
IFS=$'\n\t'
umask 000

# ---------------------------------------------------------------------------
# Platform contract — these variables are set by the ContFuzzer platform.
# Do not change defaults without updating api/jobs/config_builder.py.
# ---------------------------------------------------------------------------
: "${FUZZ_MODE:=fuzz}"             # fuzz | coverage | minimize | reproduce | regress
: "${FUZZ_TARGET:=}"               # target binary name (maps to /targets/<name>)
: "${FUZZ_CORPUS_DIR:=/corpus}"    # mounted corpus directory
: "${FUZZ_CRASH_DIR:=/crashes}"    # mounted crash directory
: "${FUZZ_OUTPUT_DIR:=/output}"    # mounted output directory (logs, reports, artifacts)
: "${FUZZ_TIMEOUT:=0}"            # wall-clock seconds (0 = unlimited)
: "${FUZZ_JOBS:=4}"               # parallelism hint (total libfuzzer processes)
: "${FUZZ_REPRODUCE_DIR:=}"       # input dir for batch reproduce mode
: "${FUZZ_CRASH_FILE:=}"          # specific crash file for single-file reproduce
: "${FUZZ_MEMORY:=}"              # total memory budget (e.g. "16g", "512m")

# ---------------------------------------------------------------------------
# Container-internal — tuning knobs for libFuzzer, not set by the platform.
# ---------------------------------------------------------------------------
: "${FUZZ_WORKERS:=$FUZZ_JOBS}"           # libFuzzer -workers (defaults to JOBS)
: "${FUZZ_VERBOSITY:=0}"                  # libFuzzer verbosity (0 = quiet)
: "${FUZZ_MERGE_JOBS:=1}"                 # merge phase parallelism (keep low, flaky)
: "${FUZZ_MERGE_WORKERS:=1}"              # merge phase workers

# Derive per-worker RSS limit from FUZZ_MEMORY if provided.
# FUZZ_MEMORY is the total container budget (e.g. "16g"); we divide by
# FUZZ_JOBS so each libFuzzer worker gets a fair share and libFuzzer can
# kill a runaway worker before Docker OOM-kills the whole container.
# Falls back to 2048 MB if FUZZ_MEMORY is unset (standalone/local runs).
_parse_memory_mb() {
	local mem="${1:-}"
	case "$mem" in
		*[gG]) echo $(( ${mem%[gG]} * 1024 )) ;;
		*[mM]) echo "${mem%[mM]}" ;;
		*)     echo "" ;;
	esac
}

if [ -n "$FUZZ_MEMORY" ]; then
	_total_mb=$(_parse_memory_mb "$FUZZ_MEMORY")
	if [ -n "$_total_mb" ] && [ "$_total_mb" -gt 0 ] 2>/dev/null; then
		FUZZ_RSS_LIMIT=$(( _total_mb / FUZZ_JOBS ))
		# Floor: don't go below 512 MB per worker — targets need headroom
		[ "$FUZZ_RSS_LIMIT" -lt 512 ] && FUZZ_RSS_LIMIT=512
	else
		FUZZ_RSS_LIMIT=2048
	fi
else
	: "${FUZZ_RSS_LIMIT:=2048}"
fi
: "${FUZZ_MERGE_RSS_LIMIT:=$FUZZ_RSS_LIMIT}"  # merge RSS limit (raise if merge OOMs)

log() { echo "[$(date '+%Y-%m-%d %H:%M:%S')] $*"; }

# Run libFuzzer merge; logs to logfile. Sets global _merge_status.
_run_merge() {
	local logfile=$1
	shift
	: >"$logfile"
	set +e
	"$@" >>"$logfile" 2>&1
	_merge_status=$?
	set -e
}

# Replace contents of dest_dir with files from src_dir. Fails if mv loses data.
_swap_corpus_dir() {
	local dest_dir=$1
	local src_dir=$2
	local label=$3

	if [ ! -d "$src_dir" ]; then
		log "ERROR: $label: source dir missing: $src_dir"
		return 1
	fi
	local n
	n=$(find "$src_dir" -type f 2>/dev/null | wc -l | tr -d ' ')
	if [ "${n:-0}" -eq 0 ]; then
		log "ERROR: $label: source has no files: $src_dir"
		return 1
	fi

	rm -rf "${dest_dir:?}/"*
	if ! mv "$src_dir"/* "$dest_dir/" 2>/dev/null; then
		log "ERROR: $label: mv to $dest_dir failed (permissions? read-only volume?)"
		return 1
	fi
	return 0
}

_restore_corpus_backup() {
	local dest_dir=$1
	local backup=$2
	log "Restoring corpus from backup..."
	rm -rf "${dest_dir:?}/"*
	if ! mv "$backup"/* "$dest_dir/" 2>/dev/null; then
		log "ERROR: restore from backup failed — corpus at $dest_dir may be empty"
		return 1
	fi
	return 0
}

# ---------------------------------------------------------------------------
# Resolve binaries
# ---------------------------------------------------------------------------

if [ -z "$FUZZ_TARGET" ]; then
	log "ERROR: FUZZ_TARGET not set"
	exit 2
fi

BINARY="/targets/$FUZZ_TARGET"
if [ ! -x "$BINARY" ]; then
	log "ERROR: Binary not found: $BINARY"
	log "Available targets:"
	ls /targets/ 2>/dev/null
	exit 2
fi

# Derive base name (strip variant suffix) for companion binaries
BASE_NAME=$(echo "$FUZZ_TARGET" | sed -E 's/_(noasm|avm|asan|cov)$//')
ASAN_BINARY="/targets/${BASE_NAME}_asan"
COV_BINARY="/targets/${BASE_NAME}_cov"
[ ! -x "$ASAN_BINARY" ] && ASAN_BINARY="$BINARY"
[ ! -x "$COV_BINARY" ]  && COV_BINARY="$BINARY"

mkdir -p "$FUZZ_CORPUS_DIR" "$FUZZ_CRASH_DIR" "$FUZZ_OUTPUT_DIR" "$FUZZ_OUTPUT_DIR/coverage"

# All writes go to FUZZ_OUTPUT_DIR — libFuzzer -jobs=N creates fuzz-*.log in CWD,
# and the rootfs is read-only in production (ContFuzzer platform).
cd "$FUZZ_OUTPUT_DIR"

# ---------------------------------------------------------------------------
# Regression — run existing crash inputs before fuzzing
# ---------------------------------------------------------------------------
regress() {
	local src="$1"
	if ! compgen -G "$src/*" &>/dev/null; then return 0; fi
	log "Regression testing $src..."
	for x in "$src"/*; do
		"$BINARY" "$x" &>/dev/null
		local s=$?
		if [ "$s" -ne 0 ]; then
			"$ASAN_BINARY" "$x" &>"$FUZZ_OUTPUT_DIR/result.txt" || true
			cp "$x" "$FUZZ_OUTPUT_DIR/" 2>/dev/null || true
			cp "$x" "$FUZZ_CRASH_DIR/" 2>/dev/null || true
			log "Regression failure: $x (exit $s)"
			exit 1
		fi
	done
	log "Regression passed: $src"
}

# ---------------------------------------------------------------------------
# Mode: fuzz
# ---------------------------------------------------------------------------
do_fuzz() {
	regress "$FUZZ_CORPUS_DIR"

	TMPOUT="$FUZZ_OUTPUT_DIR/tmp"
	mkdir -p "$TMPOUT"
	trap 'rm -rf "$TMPOUT" 2>/dev/null' EXIT

	ARGS=("-artifact_prefix=$TMPOUT/")
	ARGS+=("-jobs=$FUZZ_JOBS" "-workers=$FUZZ_WORKERS")
	ARGS+=("-verbosity=$FUZZ_VERBOSITY")
	ARGS+=("-rss_limit_mb=$FUZZ_RSS_LIMIT")
	ARGS+=("-entropic=1" "-shrink=1" "-use_value_profile=1" "-print_final_stats=1")
	[ "$FUZZ_TIMEOUT" -gt 0 ] 2>/dev/null && ARGS+=("-max_total_time=$FUZZ_TIMEOUT")
	ARGS+=("$FUZZ_CORPUS_DIR")

	log "Fuzzing: $BINARY ${ARGS[*]}"
	set +e
	"$BINARY" "${ARGS[@]}" &>"$TMPOUT/session.log"
	local status=$?
	set -e
	log "Fuzzer exited ($status)"

	# Process crashes
	local exit_code=0
	local crash_files=("$TMPOUT"/crash-*)
	if [ -e "${crash_files[0]:-}" ]; then
		log "Found ${#crash_files[@]} crash(es), minimizing..."
		for crash in "${crash_files[@]}"; do
			local cname=$(basename "$crash")
			log "  Minimizing $cname ($(wc -c <"$crash")B)"

			local mindir=$(mktemp -d)
			mv "$crash" "$mindir/"
			"$BINARY" -minimize_crash=1 -runs=10000 -rss_limit_mb="$FUZZ_RSS_LIMIT" \
				-artifact_prefix="$mindir/" "$mindir/$cname" &>>"$TMPOUT/minimize.log" || true

			local smallest=$(ls -S "$mindir/" | tail -n 1)
			log "  Minimized: $smallest ($(wc -c <"$mindir/$smallest")B)"

			cp "$mindir/$smallest" "$FUZZ_OUTPUT_DIR/"
			"$ASAN_BINARY" "$mindir/$smallest" &>"$FUZZ_OUTPUT_DIR/${smallest}_result.txt" || true
			mv "$mindir/"* "$FUZZ_CRASH_DIR/" 2>/dev/null || true
			rm -rf "$mindir"
		done
		exit_code=1
	elif [ "$status" -ne 0 ]; then
		local timeout_files=("$TMPOUT"/timeout-*)
		local oom_files=("$TMPOUT"/oom-*)
		if [ ! -e "${timeout_files[0]:-}" ] && [ ! -e "${oom_files[0]:-}" ]; then
			log "Non-fuzzing failure (exit $status)"
			exit_code=1
		fi
	fi

	# Corpus minimization (backup original in case merge fails)
	local before=$(find "$FUZZ_CORPUS_DIR" -type f 2>/dev/null | wc -l | tr -d ' ')
	log "Minimizing corpus ($before entries)..."
	local mincorp="$TMPOUT/corpus"
	local backup="$TMPOUT/corpus-backup"
	mkdir -p "$mincorp"
	cp -a "$FUZZ_CORPUS_DIR"/. "$backup/"

	log "Merge: jobs=$FUZZ_MERGE_JOBS workers=$FUZZ_MERGE_WORKERS rss_mb=$FUZZ_MERGE_RSS_LIMIT (see merge.log)"
	_run_merge "$TMPOUT/merge.log" \
		"$BINARY" -merge=1 \
		-jobs="$FUZZ_MERGE_JOBS" -workers="$FUZZ_MERGE_WORKERS" \
		-rss_limit_mb="$FUZZ_MERGE_RSS_LIMIT" \
		"$mincorp" "$FUZZ_CORPUS_DIR"

	local merged_n
	merged_n=$(find "$mincorp" -type f 2>/dev/null | wc -l | tr -d ' ')

	if [ "$_merge_status" -eq 0 ] && [ "${merged_n:-0}" -gt 0 ]; then
		if _swap_corpus_dir "$FUZZ_CORPUS_DIR" "$mincorp" "post-merge"; then
			:
		else
			log "Corpus merge produced files but install to $FUZZ_CORPUS_DIR failed, restoring backup"
			_restore_corpus_backup "$FUZZ_CORPUS_DIR" "$backup" || true
		fi
	else
		log "Corpus merge failed (exit $_merge_status) or empty output ($merged_n files) — see merge.log"
		_restore_corpus_backup "$FUZZ_CORPUS_DIR" "$backup" || true
	fi

	local after=$(find "$FUZZ_CORPUS_DIR" -type f 2>/dev/null | wc -l | tr -d ' ')
	log "Corpus minimized: $before -> $after"

	cp "$TMPOUT/"*.log "$FUZZ_OUTPUT_DIR/" 2>/dev/null || true
	# fuzz-*.log already in $FUZZ_OUTPUT_DIR (CWD)

	# Translate libfuzzer exit codes to platform convention
	case $exit_code in
		0)  exit 0 ;;
		77) exit 137 ;;
		*)  exit $exit_code ;;
	esac
}

# ---------------------------------------------------------------------------
# Mode: coverage
# ---------------------------------------------------------------------------
do_coverage() {
	if ! compgen -G "$FUZZ_CORPUS_DIR/*" &>/dev/null; then
		log "Corpus is empty, nothing to collect coverage from."
		exit 0
	fi

	local covdir="$FUZZ_OUTPUT_DIR/coverage"
	local rawdir="$covdir/raw"
	mkdir -p "$rawdir"

	rm -f "$rawdir"/*.profraw "$covdir/fuzz.profdata" 2>/dev/null || true
	rm -rf "$covdir/cov-html" 2>/dev/null || true

	local tmpdir="$FUZZ_OUTPUT_DIR/tmp"
	mkdir -p "$tmpdir"
	trap 'rm -rf "$tmpdir"' EXIT
	local ts=$(date +%Y%m%dT%H%M%S)
	local cov_mergelog="$tmpdir/coverage-merge.log"

	log "Collecting coverage with $COV_BINARY..."
	set +e
	LLVM_PROFILE_FILE="$rawdir/${ts}-%p.profraw" \
		"$COV_BINARY" -merge=1 \
		-jobs="$FUZZ_MERGE_JOBS" -workers="$FUZZ_MERGE_WORKERS" \
		-rss_limit_mb="$FUZZ_MERGE_RSS_LIMIT" \
		"$tmpdir" "$FUZZ_CORPUS_DIR/" >>"$cov_mergelog" 2>&1
	local cov_merge_st=$?
	set -e
	cp "$cov_mergelog" "$FUZZ_OUTPUT_DIR/coverage-merge.log" 2>/dev/null || true
	if [ "$cov_merge_st" -ne 0 ]; then
		log "Coverage merge step exited $cov_merge_st — see $FUZZ_OUTPUT_DIR/coverage-merge.log"
		exit 1
	fi

	log "Merging profile data..."
	llvm-profdata-18 merge -sparse "$rawdir/"*.profraw -o "$covdir/fuzz.profdata"

	log "Generating HTML report..."
	llvm-cov-18 show "$COV_BINARY" \
		-instr-profile="$covdir/fuzz.profdata" \
		-format=html \
		-output-dir="$covdir/cov-html" \
		-show-line-counts-or-regions \
		--show-branches=percent \
		--show-directory-coverage

	log "Exporting coverage JSON summary..."
	llvm-cov-18 export "$COV_BINARY" \
		-instr-profile="$covdir/fuzz.profdata" \
		-summary-only > "$covdir/coverage.json"

	log "Exporting LCOV..."
	llvm-cov-18 export "$COV_BINARY" \
		-instr-profile="$covdir/fuzz.profdata" \
		-format=lcov > "$covdir/coverage.lcov"

	# Generate content hashes (SHA256 of each source file referenced in LCOV).
	# Enables high-confidence cross-fuzzer file deduplication on the platform.
	log "Generating content hashes..."
	local _hash_tmp
	_hash_tmp=$(mktemp)
	grep '^SF:' "$covdir/coverage.lcov" | cut -d: -f2- | sort -u | while IFS= read -r fpath; do
		if [ -f "$fpath" ]; then
			hash=$(sha256sum "$fpath" | cut -d' ' -f1)
			printf '"%s":"%s"\n' "$fpath" "$hash" >> "$_hash_tmp"
		fi
	done
	printf '{%s}' "$(paste -sd, "$_hash_tmp")" > "$covdir/coverage_hashes.json"
	rm -f "$_hash_tmp"

	log "Coverage outputs: cov-html/, coverage.json, coverage.lcov, coverage_hashes.json"
	exit 0
}

# ---------------------------------------------------------------------------
# Mode: minimize
# ---------------------------------------------------------------------------
do_minimize() {
	if ! compgen -G "$FUZZ_CORPUS_DIR/*" &>/dev/null; then
		log "Corpus is empty."
		exit 0
	fi

	local before=$(find "$FUZZ_CORPUS_DIR" -type f | wc -l | tr -d ' ')
	log "Minimizing corpus ($before entries)..."

	local tmp_bundle="$FUZZ_OUTPUT_DIR/tmp"
	local mergedir="$tmp_bundle/merge-out"
	local mergelog="$tmp_bundle/minimize-merge.log"
	local backup="$tmp_bundle/backup"
	mkdir -p "$mergedir" "$backup"
	cp -a "$FUZZ_CORPUS_DIR"/. "$backup/"

	_run_merge "$mergelog" \
		"$BINARY" -merge=1 \
		-jobs="$FUZZ_MERGE_JOBS" -workers="$FUZZ_MERGE_WORKERS" \
		-rss_limit_mb="$FUZZ_MERGE_RSS_LIMIT" \
		"$mergedir" "$FUZZ_CORPUS_DIR"

	cp "$mergelog" "$FUZZ_OUTPUT_DIR/minimize-merge.log" 2>/dev/null || true

	local merged_n
	merged_n=$(find "$mergedir" -type f 2>/dev/null | wc -l | tr -d ' ')

	if [ "$_merge_status" -eq 0 ] && [ "${merged_n:-0}" -gt 0 ]; then
		if ! _swap_corpus_dir "$FUZZ_CORPUS_DIR" "$mergedir" "minimize"; then
			log "Install failed, restoring backup — see $FUZZ_OUTPUT_DIR/minimize-merge.log"
			_restore_corpus_backup "$FUZZ_CORPUS_DIR" "$backup" || true
		fi
	else
		log "Corpus merge failed (exit $_merge_status) or empty ($merged_n files)"
		_restore_corpus_backup "$FUZZ_CORPUS_DIR" "$backup" || true
	fi

	rm -rf "$tmp_bundle" 2>/dev/null || true

	local after=$(find "$FUZZ_CORPUS_DIR" -type f 2>/dev/null | wc -l | tr -d ' ')
	log "Corpus minimized: $before -> $after"
	exit 0
}

# ---------------------------------------------------------------------------
# Mode: reproduce
# ---------------------------------------------------------------------------
do_reproduce() {
	local last_exit=0

	if [ -n "${FUZZ_CRASH_FILE:-}" ]; then
		# Single-file reproduce (platform sets FUZZ_CRASH_FILE)
		if [ ! -f "$FUZZ_CRASH_FILE" ]; then
			log "ERROR: Crash file not found: $FUZZ_CRASH_FILE"
			exit 2
		fi
		local cname=$(basename "$FUZZ_CRASH_FILE")
		log "Reproducing $FUZZ_CRASH_FILE..."
		set +e
		"$BINARY" "$FUZZ_CRASH_FILE"
		last_exit=$?
		set -e
		if [ "$last_exit" -ne 0 ]; then
			cp "$FUZZ_CRASH_FILE" "$FUZZ_CRASH_DIR/$cname"
			"$ASAN_BINARY" "$FUZZ_CRASH_FILE" &>"$FUZZ_OUTPUT_DIR/${cname}_result.txt" || true
			log "REPRODUCED (exit $last_exit): $FUZZ_CRASH_FILE"
		else
			log "Did not reproduce: $FUZZ_CRASH_FILE"
		fi
	else
		# Batch: iterate inputs from FUZZ_REPRODUCE_DIR (or fall back to FUZZ_CRASH_DIR)
		local src_dir="${FUZZ_REPRODUCE_DIR:-$FUZZ_CRASH_DIR}"
		if ! compgen -G "$src_dir/*" &>/dev/null; then
			log "ERROR: No crash files in $src_dir"
			exit 2
		fi
		for input_file in "$src_dir"/*; do
			[ -f "$input_file" ] || continue
			local cname=$(basename "$input_file")
			log "Reproducing $input_file..."
			set +e
			"$BINARY" "$input_file"
			local s=$?
			set -e
			if [ "$s" -ne 0 ]; then
				cp "$input_file" "$FUZZ_CRASH_DIR/$cname"
				"$ASAN_BINARY" "$input_file" &>"$FUZZ_OUTPUT_DIR/${cname}_result.txt" || true
				log "REPRODUCED (exit $s): $input_file"
				last_exit=$s
			else
				log "Did not reproduce: $input_file"
			fi
		done
	fi

	# Translate libfuzzer exit codes to platform convention
	case $last_exit in
		0)  exit 0 ;;
		77) exit 137 ;;
		*)  exit $last_exit ;;
	esac
}

# ---------------------------------------------------------------------------
# Mode: regress
# ---------------------------------------------------------------------------
do_regress() {
	if ! compgen -G "$FUZZ_CORPUS_DIR/*" &>/dev/null; then
		log "Corpus is empty, nothing to regress."
		exit 0
	fi

	local failures=0
	local total=0

	log "Regressing $FUZZ_CORPUS_DIR..."
	for x in "$FUZZ_CORPUS_DIR"/*; do
		total=$((total + 1))
		set +e
		"$BINARY" "$x" &>/dev/null
		local s=$?
		set -e
		if [ "$s" -ne 0 ]; then
			"$ASAN_BINARY" "$x" &>"$FUZZ_OUTPUT_DIR/$(basename "$x")_result.txt" || true
			cp "$x" "$FUZZ_CRASH_DIR/" 2>/dev/null || true
			log "FAIL: $x (exit $s)"
			failures=$((failures + 1))
		fi
	done

	log "Regression complete: $total file(s) tested, $failures failure(s)"
	[ "$failures" -gt 0 ] && exit 1
	exit 0
}

# ---------------------------------------------------------------------------
# Dispatch
# ---------------------------------------------------------------------------
case "$FUZZ_MODE" in
	fuzz)      do_fuzz ;;
	coverage)  do_coverage ;;
	minimize)  do_minimize ;;
	reproduce) do_reproduce ;;
	regress)   do_regress ;;
	*)         log "ERROR: Unknown FUZZ_MODE=$FUZZ_MODE"; exit 2 ;;
esac
