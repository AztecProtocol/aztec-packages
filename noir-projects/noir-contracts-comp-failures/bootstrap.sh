#!/usr/bin/env bash
source $(git rev-parse --show-toplevel)/ci3/source_bootstrap

# nargo command path relative to the individual contract directory
export NARGO=${NARGO:-../../../../noir/noir-repo/target/release/nargo}

# Check that `nargo compile` stderr matches expected_error exactly.
#
# Every nargo compile error begins with a line `error: <headline>`. The runner
# extracts that ordered list of headlines (stripped of the `error: ` prefix) and
# requires it to equal, line for line, the non-blank lines in expected_error.
# Any change to the emitted errors — different text, different count, different
# order — fails the test and must be resolved by regenerating the snapshot.
#
# When ACCEPT_SNAPSHOTS=1 the runner skips assertion and writes every extracted
# headline (one per line) into expected_error. CI refuses this flag so any drift
# must be resolved by a developer locally. If nargo emits no `error: ` lines
# (e.g. an internal compiler panic), the full stderr is written instead and a
# warning is printed — such cases need a manual trim before committing.
check_compilation_error() {
    local contract_dir=$1
    local expected_error_file="$contract_dir/expected_error"

    local actual_output
    local compile_rc=0
    actual_output=$(cd "$contract_dir" && $NARGO compile --silence-warnings 2>&1) || compile_rc=$?

    local actual_headlines
    actual_headlines=$(echo "$actual_output" | awk '/^error: /{sub(/^error: /, ""); print}')

    if [ -n "${ACCEPT_SNAPSHOTS:-}" ]; then
        if [ "$compile_rc" -eq 0 ]; then
            : > "$expected_error_file"
            echo "↻ $contract_dir: wrote empty expected_error (compiled successfully)"
        elif [ -n "$actual_headlines" ]; then
            echo "$actual_headlines" > "$expected_error_file"
            local count
            count=$(printf '%s\n' "$actual_headlines" | wc -l | tr -d ' ')
            echo "↻ $contract_dir: wrote $count headline(s) to expected_error"
        else
            echo "$actual_output" > "$expected_error_file"
            echo "⚠ $contract_dir: no 'error: ' headlines found in stderr; wrote full output — trim manually"
        fi
        return 0
    fi

    if [ ! -f "$expected_error_file" ]; then
        echo "✗ $contract_dir: No expected_error file. Run with ACCEPT_SNAPSHOTS=1 to generate one."
        exit 1
    fi

    local -a expected_lines=() actual_lines=()
    while IFS= read -r line; do
        [ -z "$line" ] && continue
        expected_lines+=("$line")
    done < "$expected_error_file"
    while IFS= read -r line; do
        actual_lines+=("$line")
    done <<< "$actual_headlines"
    # `<<<` always appends a newline; if no headlines were found this leaves a
    # single empty element that would miscount 0 as 1.
    if [ "${#actual_lines[@]}" -eq 1 ] && [ -z "${actual_lines[0]}" ]; then
        actual_lines=()
    fi

    if [ "${#expected_lines[@]}" -ne "${#actual_lines[@]}" ]; then
        echo "✗ $contract_dir: error count mismatch — expected ${#expected_lines[@]}, got ${#actual_lines[@]}"
        echo "Expected lines:"
        if [ "${#expected_lines[@]}" -eq 0 ]; then echo "  (none)"; else printf '  %s\n' "${expected_lines[@]}"; fi
        echo "Actual error headlines:"
        if [ "${#actual_lines[@]}" -eq 0 ]; then echo "  (none)"; else printf '  %s\n' "${actual_lines[@]}"; fi
        echo "Full stderr:"
        echo "$actual_output"
        exit 1
    fi

    local i
    for i in "${!expected_lines[@]}"; do
        if [ "${actual_lines[$i]}" != "${expected_lines[$i]}" ]; then
            echo "✗ $contract_dir: error $((i + 1)) does not match"
            echo "  Expected: ${expected_lines[$i]}"
            echo "  Actual:   ${actual_lines[$i]}"
            echo "Full stderr:"
            echo "$actual_output"
            exit 1
        fi
    done

    if [ "${#expected_lines[@]}" -eq 0 ]; then
        echo "⚠ $contract_dir: compiled successfully (see src/main.nr doc comment)"
    else
        echo "✓ $contract_dir: Compilation failed as expected with correct error(s)"
    fi
}

# Tests that compilation of contracts in noir-contracts-comp-failures fails with the expected error message.
#
# Optional arg: a shell glob to filter by contract directory name. Examples:
#   ./bootstrap.sh test                       # all cases
#   ./bootstrap.sh test reserved_public_dispatch
#   ./bootstrap.sh test 'panic_on_*'
test() {
    if [ -n "${ACCEPT_SNAPSHOTS:-}" ] && [ "${CI:-0}" = "1" ]; then
        echo "ACCEPT_SNAPSHOTS is not permitted in CI. Snapshots must be regenerated locally and committed." >&2
        exit 1
    fi

    local pattern=${1:-}
    local matched=0

    for contract_dir in contracts/*/; do
        [ -d "$contract_dir" ] || continue
        if [ -n "$pattern" ]; then
            local name=${contract_dir%/}
            name=${name#contracts/}
            # `case` pattern matching supports shell globs; leave $pattern unquoted.
            case "$name" in
                $pattern) ;;
                *) continue ;;
            esac
        fi
        check_compilation_error "$contract_dir"
        matched=$((matched + 1))
    done

    if [ -n "$pattern" ] && [ "$matched" -eq 0 ]; then
        echo "✗ no contracts matched pattern '$pattern'" >&2
        exit 1
    fi
}

function test_cmds {
    # Fairies want to run these tests on every PR
    if [ "${TARGET_BRANCH:-}" = "merge-train/fairies" ]; then
      hash=disabled-cache
    else
      hash=$(hash_str $(../../noir/bootstrap.sh hash) $(cache_content_hash ^noir-projects/noir-contracts-comp-failures))
    fi
    echo "$hash ./noir-projects/noir-contracts-comp-failures/bootstrap.sh test"
}

case "$cmd" in
  *)
    default_cmd_handler "$@"
    ;;
esac
