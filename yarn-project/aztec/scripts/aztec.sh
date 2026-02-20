#!/usr/bin/env bash
set -euo pipefail

# Re-execute using correct version if we have an .aztecrc file.
if [ "${AZTEC_VERSIONED:-0}" -eq 0 ] && [ -f .aztecrc ] && command -v aztec-up &>/dev/null; then
  env_setup=$(aztec-up env)
  eval "$env_setup"
  AZTEC_VERSIONED=1 exec aztec "$@"
fi

cmd=${1:-}
[ -n "$cmd" ] && shift

script_dir="$(dirname "$(realpath "$0")")"

function aztec {
  export AZTEC_SHELL_WRAPPER=1
  exec node --no-warnings $script_dir/../dest/bin/index.js "$@"
}

case $cmd in
  test)
    # Auto-recompile if sources changed since last compile.
    #
    # We check *.nr and Nargo.toml files not only in the current project but also in any path-based dependencies (e.g.
    # path = "../aztec-nr/aztec"), resolved recursively. Git-based deps are pinned by tag/rev so they only change when
    # Nargo.toml itself is modified -- no need to walk into them.

    # Track which directories we already visited so we don't loop forever if two packages depend on each other.
    _visited=""

    # Given a directory, print its absolute path and then recurse into every path-based dependency found in any
    # Nargo.toml under that directory.
    collect_dep_dirs() {
      # `local dir` declares a function-scoped variable.
      local dir
      # Resolve the argument to an absolute path. `cd "$1" && pwd` is a portable way to do this. `2>/dev/null`
      # suppresses errors if the dir doesn't exist, and `|| return` exits the function early in that case.
      dir=$(cd "$1" && pwd) 2>/dev/null || return

      # If we already visited this directory, skip it (cycle detection). The pattern `,/abs/path,` is checked inside
      # the comma-delimited _visited string so partial path matches don't give false positives.
      case ",$_visited," in *",$dir,"*) return ;; esac
      # Mark this directory as visited.
      _visited="$_visited,$dir"

      # Output this directory -- callers capture this via `mapfile` below.
      echo "$dir"

      # Find every Nargo.toml under this directory (skipping target/ build dirs). `< <(...)` is process substitution
      # -- the while loop reads from the output of the find command line by line.
      while IFS= read -r toml; do
        local toml_dir
        # Get the directory containing this Nargo.toml so we can resolve relative paths declared inside it.
        toml_dir=$(dirname "$toml")

        # Extract the value of every `path = "..."` entry in the toml file. sed -n with the s///p flag prints only
        # matching lines, capturing the quoted path value. Example: `aztec = { path = "../foo" }` -> `../foo`
        while IFS= read -r dep_path; do
          # If the resolved path is an existing directory, recurse into it.
          [ -d "$toml_dir/$dep_path" ] && collect_dep_dirs "$toml_dir/$dep_path"
        done < <(sed -n 's/.*path *= *"\([^"]*\)".*/\1/p' "$toml")
      done < <(find "$dir" -path '*/target' -prune -o -name 'Nargo.toml' -print 2>/dev/null)
    }

    # Build the array of all directories whose source files should be checked. `mapfile -t` reads lines from stdin
    # into a bash array (source_dirs). The input comes from collect_dep_dirs which prints one directory per line.
    mapfile -t source_dirs < <(collect_dep_dirs .)

    # Find the most recently modified artifact in target/. `ls -t` sorts by modification time (newest first),
    # `head -1` takes the first.
    newest_artifact=$(ls -t target/*.json 2>/dev/null | head -1)

    # Recompile if either:
    #   1. there is no artifact at all (first build), OR
    #   2. any *.nr or Nargo.toml in any of the source_dirs is newer than that artifact.
    # `"${source_dirs[@]}"` expands the array into separate arguments so `find` searches all directories at once.
    # `-newer` tests if a file was modified after the reference file. `head -1` short-circuits after the first match.
    if [ -z "$newest_artifact" ] || \
       [ -n "$(find "${source_dirs[@]}" \( -path '*/target' -prune \) -o \( -name '*.nr' -o -name 'Nargo.toml' \) -newer "$newest_artifact" -print 2>/dev/null | head -1)" ]; then
      echo "Recompiling contracts..."
      node --no-warnings "$script_dir/../dest/bin/index.js" compile
    fi

    export LOG_LEVEL="${LOG_LEVEL:-"error;trace:contract_log"}"
    aztec start --txe --port 8081 &
    server_pid=$!
    trap 'kill $server_pid &>/dev/null || true' EXIT
    while ! nc -z 127.0.0.1 8081 &>/dev/null; do sleep 0.2; done
    export NARGO_FOREIGN_CALL_TIMEOUT=300000
    nargo test --silence-warnings --oracle-resolver http://127.0.0.1:8081 --test-threads 16 "$@"
    ;;
  start)
    if [ "${1:-}" == "--local-network" ]; then
      # TODO: Can these just be set in TS?
      export ARCHIVER_POLLING_INTERVAL_MS=500
      export P2P_BLOCK_CHECK_INTERVAL_MS=500
      export SEQ_TX_POLLING_INTERVAL_MS=500
      export WS_BLOCK_CHECK_INTERVAL_MS=500
      export ARCHIVER_VIEM_POLLING_INTERVAL_MS=500
      export TEST_ACCOUNTS=${TEST_ACCOUNTS:-true}
      export LOG_LEVEL=${LOG_LEVEL:-info;silent:sequencer;verbose:debug_log}
      export DEPLOY_AZTEC_CONTRACTS_SALT=${DEPLOY_AZTEC_CONTRACTS_SALT:-$RANDOM}

      ANVIL_PORT=${ANVIL_PORT:-8545}

      export L1_CHAIN_ID=${L1_CHAIN_ID:-31337}
      export ETHEREUM_HOSTS=${ETHEREUM_HOSTS:-"http://127.0.0.1:${ANVIL_PORT}"}

      anvil --version
      anvil --silent --port "$ANVIL_PORT" &
      anvil_pid=$!
      trap 'kill $anvil_pid &>/dev/null' EXIT
    fi

    aztec start "$@"
    ;;
  new|init)
    $script_dir/${cmd}.sh "$@"
    ;;
  flamegraph)
    echo "Warning: 'aztec flamegraph' is deprecated. Use 'aztec profile flamegraph' instead." >&2
    aztec profile flamegraph "$@"
    ;;
  *)
    aztec $cmd "$@"
    ;;
esac
