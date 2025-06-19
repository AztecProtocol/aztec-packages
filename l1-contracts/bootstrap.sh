#!/usr/bin/env bash
source $(git rev-parse --show-toplevel)/ci3/source_bootstrap

cmd=${1:-}


# We rely on noir-projects for the verifier contract.
export hash=$(cache_content_hash \
  .rebuild_patterns \
  ../noir/.rebuild_patterns \
  ../noir-projects/noir-protocol-circuits \
  ../barretenberg/cpp/.rebuild_patterns
)

function build {
  echo_header "l1-contracts build"
  local artifact=l1-contracts-$hash.tar.gz
  if ! cache_download $artifact; then
    # Clean
    rm -rf broadcast cache out serve generated

    # Install
    forge install

    # Ensure libraries are at the correct version
    git submodule update --init --recursive ./lib

    mkdir -p generated
    # Copy from noir-projects. Bootstrap must have ran in noir-projects.
    local rollup_verifier_path=../noir-projects/noir-protocol-circuits/target/keys/rollup_root_verifier.sol
    if [ -f "$rollup_verifier_path" ]; then
      cp "$rollup_verifier_path" generated/HonkVerifier.sol
    else
      echo_stderr "You may need to run ./bootstrap.sh in the noir-projects folder. Could not find the rollup verifier at $rollup_verifier_path."
      exit 1
    fi

    # Compile contracts
    # Step 1: Build everything in src.
    forge build $(find src test -name '*.sol')

    # Step 1.5: Output storage information for the rollup contract.
    forge inspect --json src/core/Rollup.sol:Rollup storage > ./out/Rollup.sol/storage.json

    # Step 2: Build the generated verifier contract with optimization.
    forge build $(find generated -name '*.sol') \
      --optimize \
      --optimizer-runs 1 \
      --no-metadata

    cache_upload $artifact out generated
  fi
}

function test_cmds {
  echo "$hash cd l1-contracts && solhint --config ./.solhint.json \"src/**/*.sol\""
  echo "$hash cd l1-contracts && forge fmt --check"
  echo "$hash cd l1-contracts && forge test"
  echo "$hash cd l1-contracts && forge test --no-match-contract UniswapPortalTest --match-contract MerkleCheck --ffi"
  if [ "$CI" -eq 0 ] || [[ "${TARGET_BRANCH:-}" == "master" || "${TARGET_BRANCH:-}" == "staging" ]]; then
    echo "$hash cd l1-contracts && forge test --no-match-contract UniswapPortalTest --match-contract ScreamAndShoutTest"
  fi
}

function test {
  echo_header "l1-contracts test"
  test_cmds | filter_test_cmds | parallelise
}

function inspect {
    echo_header "l1-contracts inspect"

    # Find all .sol files in the src directory
    find src -type f -name "*.sol" | while read -r file; do

        # Get all contract/library/interface names from the file
        while read -r line; do
            if [[ $line =~ ^(contract|library|interface)[[:space:]]+([a-zA-Z0-9_]+) ]]; then
                contract_name="${BASH_REMATCH[2]}"
                full_path="${file}:${contract_name}"

                # Run forge inspect and capture output
                methods_output=$(forge inspect "$full_path" methodIdentifiers 2>/dev/null)
                errors_output=$(forge inspect "$full_path" errors 2>/dev/null)
                events_output=$(forge inspect "$full_path" events 2>/dev/null)

                # Only display if we have methods or errors or events (empty table output is 5 lines)
                if [ $(echo "$methods_output" | wc -l) != 5 ] || [ $(echo "$errors_output" | wc -l) != 5 ] || [ $(echo "$events_output" | wc -l) != 5 ]; then
                    echo "----------------------------------------"
                    echo "Inspecting $full_path"
                    echo "----------------------------------------"

                    if [ $(echo "$methods_output" | wc -l) != 5 ]; then
                        echo "$methods_output"
                        echo ""
                    fi

                    if [ $(echo "$errors_output" | wc -l) != 5 ]; then
                        echo "$errors_output"
                        echo ""
                    fi

                    if [ $(echo "$events_output" | wc -l) != 5 ]; then
                        echo "$events_output"
                        echo ""
                    fi
                fi
            fi
        done < <(grep -E "^[[:space:]]*(contract|library|interface)[[:space:]]+[a-zA-Z0-9_]+" "$file")
    done
}


function gas_report {
  check=${1:-"no"}
  echo_header "l1-contracts gas report"
  forge --version

  FORGE_GAS_REPORT=true forge test \
    --match-contract "^RollupTest$" \
    --no-match-test "(testInvalidBlobHash)|(testInvalidBlobProof)" \
    --fuzz-seed 42 \
    --json \
    > gas_report.new.tmp
  jq '.' gas_report.new.tmp > gas_report.new.json
  rm gas_report.new.tmp
  diff gas_report.new.json gas_report.json > gas_report.diff || true

  if [ -s gas_report.diff -a "$check" = "check" ]; then
    cat gas_report.diff
    echo "Gas report has changed. Please check the diffs above, then run './bootstrap.sh gas_report' to update the gas report."
    exit 1
  fi
  mv gas_report.new.json gas_report.json
}

function bench_cmds {
  echo "$hash l1-contracts/bootstrap.sh bench"
}

function bench {
  rm -rf bench-out && mkdir -p bench-out

  # Run the gas benchmark to generate the markdown file
  gas_benchmark

  # Extract gas values from gas_benchmark.md and create JSON output
  awk '
  function trim(s) {
    sub(/^[ \t]+/, "", s);
    sub(/[ \t]+$/, "", s);
    return s;
  }
  BEGIN {
    print "[";
    first = 1;
  }
  /^[a-zA-Z]/ {
    if ($1 != "Function" && $1 != "-------------------------") {
      # Split the line into columns and clean them
      n = split($0, cols, "|");
      for (i = 1; i <= n; i++) {
        cols[i] = trim(cols[i]);
      }

      # Only process Max rows
      if (cols[2] == "Max") {
        # Get the function name
        func_name = cols[1];

        # Define our cases with their column numbers
        cases["no_validators"] = 3;
        cases["100_validators"] = 4;
        cases["100_validators_slashing"] = 5;
        cases["overhead"] = 6;

        for (case_name in cases) {
          col = cases[case_name];

          # Filter: only include aggregate3 functions with 100_validators_slashing, and vice versa
          has_aggregate3 = index(tolower(func_name), "aggregate3") > 0;
          is_slashing_case = (case_name == "100_validators_slashing");

          # Skip if aggregate3 function but not slashing case, or slashing case but not aggregate3 function
          if ((has_aggregate3 && !is_slashing_case) || (is_slashing_case && !has_aggregate3)) {
            continue;
          }


          # Rename aggregate3 to proposeAndVote in function name
          display_func_name = func_name;
          if (has_aggregate3) {
            gsub(/aggregate3/, "proposeAndVote", display_func_name);
          }

          if (match(cols[col], /([0-9]+)[ ]*\(([0-9.]+)\)/)) {
            # Extract the raw gas value (first number)
            match(cols[col], /[0-9]+/);
            raw_gas = substr(cols[col], RSTART, RLENGTH);

            # Extract the per tx value
            match(cols[col], /\(([0-9.]+)\)/);
            per_tx = substr(cols[col], RSTART+1, RLENGTH-2);

            if (!first) print ",";
            first = 0;

            # Output raw gas value
            print "  {";
            print "    \"name\": \"" display_func_name " (" case_name ")\",";
            print "    \"value\": " raw_gas ",";
            print "    \"unit\": \"gas\"";
            print "  },";

            # Output per tx value
            print "  {";
            print "    \"name\": \"" display_func_name " (" case_name ") per l2 tx\",";
            print "    \"value\": " per_tx ",";
            print "    \"unit\": \"gas\"";
            print "  }";
          }
        }
      }
    }
  }
  END {
    print "]";
  }' gas_benchmark.md > ./bench-out/l1-gas.bench.json
}

function gas_benchmark {
  check=${1:-"no"}

  validator_costs

  diff gas_benchmark.new.md gas_benchmark.md > gas_benchmark.diff || true

  if [ -s gas_benchmark.diff -a "$check" = "check" ]; then
    cat gas_benchmark.diff
    echo "Gas benchmark has changed. Please check the diffs above, then run './bootstrap.sh gas_benchmark' to update the gas benchmark."
    exit 1
  fi
  mv gas_benchmark.new.md gas_benchmark.md
}

function validator_costs {
  forge --version

  # Run test without validators
  echo "Running test without validators..."
  FORGE_GAS_REPORT=true forge test \
    --match-contract "BenchmarkRollupTest" \
    --match-test "test_no_validators" \
    --fuzz-seed 42 \
    > no_validators.tmp

  # Run test with 100 validators
  echo "Running test with 100 validators..."
  FORGE_GAS_REPORT=true forge test \
    --match-contract "BenchmarkRollupTest" \
    --match-test "test_100_validators" \
    --fuzz-seed 42 \
    > with_validators.tmp

  # Run test with 100 validators and slashing
  echo "Running test with 100 validators and slashing..."
  FORGE_GAS_REPORT=true forge test \
    --match-contract "BenchmarkRollupTest" \
    --match-test "test_100_slashing_validators" \
    --fuzz-seed 42 \
    > with_slashing_validators.tmp

  file_no="no_validators.tmp"          # without validators
  file_yes="with_validators.tmp"       # with    validators
  file_yes_slashing="with_slashing_validators.tmp"       # with    validators and slashing
  report="gas_benchmark.new.md"        # will be overwritten each run

  # keep ONLY these functions, in this order
  wanted_funcs="propose setupEpoch submitEpochRootProof aggregate3"

  # one label per numeric column (use | to separate)
  labels='Min|Avg|Median|Max|# Calls'

  awk -v keep="$wanted_funcs" -v lbl="$labels" \
      -v f_no="$file_no" -v f_yes="$file_yes" -v f_yes_slashing="$file_yes_slashing" '
  function trim(s){gsub(/^[[:space:]]+|[[:space:]]+$/,"",s); return s}
  #   cell(raw [, scaled])
  #   If you call it with ONE argument, you get the raw value only.
  #   If you call it with TWO arguments, you get  "raw (scaled)"  padded to 22.
  function cell(raw, scaled,   s) {
      # Was a second parameter supplied?
      if ( scaled == "" )                 # argument omitted → print raw only
          return sprintf("%22d", raw)

      s = sprintf("%10d (%.2f)", raw, scaled)
      return sprintf("%-22s", s)          # left-pad / truncate to 22 chars
  }

  BEGIN{
      # ---------------- wanted functions & labels (unchanged) ---------------
      nf = split(keep, F, /[[:space:]]+/)
      for (i = 1; i <= nf; i++) { order[i] = F[i]; want[F[i]] }
      split(lbl, L, /\|/);   nLab = length(L)

      # ---------------- fixed-width formats ---------------------------------
      # header row
      hdr = "%-24s | %-7s | %22s | %23s | %22s | %12s\n"
      sep = "-------------------------+---------+------------------------+-------------------------+------------------------+-----------------"
      # data row (the three %22s will already be fully padded strings)
      row = "%-24s | %-7s | %22s | %23s | %22s | %10.2f%%\n"

      printf hdr, "Function", "Metric",
                  "No Validators (gas/tx)", "100 Validators (gas/tx)", "Δ Gas (gas/tx)", "% Overhead"
      print  sep

      FS="|"; OFS=""
  }
  # ---------- first file: without validators ----------------------------------
  FNR==NR {
      if($0 !~ /^\|/) next
      split($0, C)                      # C[1] "", C[2] fn, C[3..] numbers
      fn = trim(C[2])
      if(!(fn in want)) next
      for(i=3; i<=NF-1; i++) base[fn,i] = trim(C[i]) + 0
      cols[fn] = NF - 3                 # remember how many numeric cols
      next
  }
  # ---------- second file: with validators ------------------------------------
  {
      if($0 !~ /^\|/) next
      split($0, C)
      fn = trim(C[2])
      if(!(fn in want)) next
      for(i=3; i<=NF-1; i++) with[fn,i] = trim(C[i]) + 0
      cols[fn] = NF - 3
  }
  # ---------- third file: with validators and slashing --------------------------
  {
      if($0 !~ /^\|/) next
      split($0, C)
      fn = trim(C[2])
      if(!(fn in want)) next
      for(i=3; i<=NF-1; i++) with_slashing[fn,i] = trim(C[i]) + 0
      cols[fn] = NF - 3
  }
  # ---------- emit table -------------------------------------------------------
  END{
      for (k = 1; k <= nf; k++) {
          fn = order[k]
          div = (fn == "propose" || fn == "aggregate3" ? 360 : 11520)   # change 11520→720 if desired

          for (j = 1; j <= cols[fn]; j++) {
              idx    = j + 2
              metric = L[j]
              a      = base[fn,idx] + 0
              b      = with[fn,idx] + 0
              diff   = b - a
              pct    = (a ? diff * 100.0 / a : 0)

              if (metric == "# Calls") {
                  c1 = cell(a)
                  c2 = cell(b)
                  c3 = cell(diff)
              } else {
                  c1 = cell(a,   a/div)
                  c2 = cell(b,   b/div)
                  c3 = cell(diff,diff/div)
              }
              printf row, fn, metric, c1, c2, c3, pct
          }
          print sep
      }
  }
  ' "$file_no" "$file_yes" "$file_yes_slashing" > "$report"

  # Clean up temporary files
  rm no_validators.tmp with_validators.tmp with_slashing_validators.tmp
}

# First argument is a branch name (e.g. master, or the latest version e.g. 1.2.3) to push to the head of.
# Second argument is the tag name (e.g. v1.2.3, or commit-<hash>).
# Third argument is the semver for package.json (e.g. 1.2.3 or 1.2.3-commit.<hash>)
#
#   v1.2.3    commit-123cafebabe
#      |     /
#   v1.2.2  commit-123deadbeef
#      |   /
#   v1.2.1
#
function release_git_push {
  local branch_name=$1
  local tag_name=$2
  local version=$3
  local mirrored_repo_url="https://github.com/AztecProtocol/l1-contracts.git"

  # Clean up our release directory.
  rm -rf release-out && mkdir release-out

  # Copy our git files to our release directory.
  git archive HEAD | tar -x -C release-out

  # Copy from noir-projects. Bootstrap must have ran in noir-projects.
  cp ../noir-projects/noir-protocol-circuits/target/keys/rollup_root_verifier.sol release-out/src/HonkVerifier.sol

  cd release-out

  # Update the package version in package.json.
  # TODO remove package.json.
  $root/ci3/npm/release_prep_package_json $version

  # CI needs to authenticate from GITHUB_TOKEN.
  gh auth setup-git &>/dev/null || true

  git init &>/dev/null
  git remote add origin "$mirrored_repo_url" &>/dev/null
  git fetch origin --quiet

  # Checkout the existing branch or create it if it doesn't exist.
  if git ls-remote --heads origin "$branch_name" | grep -q "$branch_name"; then
    # Update branch reference without checkout.
    git branch -f "$branch_name" origin/"$branch_name"
    # Point HEAD to the branch.
    git symbolic-ref HEAD refs/heads/"$branch_name"
    # Move to latest commit, keep working tree.
    git reset --soft origin/"$branch_name"
  else
    git checkout -b "$branch_name"
  fi

  if git rev-parse "$tag_name" >/dev/null 2>&1; then
    echo "Tag $tag_name already exists. Skipping release."
  else
    git add .
    git commit -m "Release $tag_name." >/dev/null
    git tag -a "$tag_name" -m "Release $tag_name."
    do_or_dryrun git push origin "$branch_name" --quiet
    do_or_dryrun git push origin --quiet --force "$tag_name" --tags

    echo "Release complete ($tag_name) on branch $branch_name."
  fi

  do_or_dryrun git push origin "$branch_name" --quiet
  do_or_dryrun git push origin --quiet --force "$tag_name" --tags

  echo "Release complete ($tag_name) on branch $branch_name."
}

function coverage {
  echo_header "l1-contracts coverage"
  forge --version

  # Default values
  MATCH_PATH=""
  LCOV=false
  SERVE=false
  HELP=false
  GOVERNANCE=false

  # Help text
  show_help() {
    echo "Usage: ./bootstrap.sh coverage [options]"
    echo "Options:"
    echo "  -p <path>    Run coverage only for files matching this path pattern"
    echo "  -l           Generate LCOV report"
    echo "  -s           Serve coverage report (requires -l)"
    echo "  -g           Run coverage for governance contracts using only gov tests"
    echo "  -h           Show this help message"
    echo ""
    echo "Examples:"
    echo "  ./bootstrap.sh coverage                  # Run coverage for all files"
    echo "  ./bootstrap.sh coverage -p src/core      # Run coverage only for src/core"
    echo "  ./bootstrap.sh coverage -l -s            # Generate and serve LCOV report"
    echo "  ./bootstrap.sh coverage -g               # Run coverage for governance contracts using only gov tests"
    echo "  ./bootstrap.sh coverage -g -l -s         # Run coverage for governance contracts using only gov tests with LCOV report and serve"
  }

  # Parse options
  while getopts "p:lshg" opt; do
    case $opt in
      p) MATCH_PATH="$OPTARG" ;;
      l) LCOV=true ;;
      s) SERVE=true ;;
      h) HELP=true ;;
      g) GOVERNANCE=true ;;
      *) show_help; exit 1 ;;
    esac
  done

  # Show help if requested
  if [ "$HELP" = true ]; then
    show_help
    exit 0
  fi

  # Validate serve option
  if [ "$SERVE" = true ] && [ "$LCOV" = false ]; then
    echo "Error: -s option requires -l option to be enabled"
    exit 1
  fi

  # Build the command
  if [ "$GOVERNANCE" = true ]; then
    CMD="FORGE_COVERAGE=true forge coverage --match-path \"test/governance/**/*.t.sol\" --no-match-coverage \"(test|script|mock|generated|core|periphery)\""
  else
    # Default coverage command
    CMD="FORGE_COVERAGE=true forge coverage --no-match-coverage \"(test|script|mock|generated)\""
  fi

  if [ -n "$MATCH_PATH" ] && [ "$GOVERNANCE" = true ]; then
    echo "Warning: -p option is not supported in governance mode"
    exit 1
  fi

  # Add path filter if specified (only if not in governance mode)
  if [ -n "$MATCH_PATH" ] && [ "$GOVERNANCE" = false ]; then
    if [ ! -e "$MATCH_PATH" ]; then
      echo "Warning: Path '$MATCH_PATH' does not exist"
      exit 1
    fi
    CMD="$CMD --match-path \"$MATCH_PATH\""
  fi

  # Add LCOV report if requested
  if [ "$LCOV" = true ]; then
    CMD="$CMD --report lcov"
  fi

  echo "Running coverage with command: $CMD"
  eval "$CMD"

  # Serve report if requested
  if [ "$SERVE" = true ]; then
    if ! command -v genhtml &> /dev/null; then
      echo "Error: genhtml not found. Please install lcov package."
      exit 1
    fi

    mkdir -p coverage
    genhtml lcov.info --branch-coverage --output-dir coverage
    echo "Serving coverage report at http://localhost:8000"
    python3 -m http.server --directory "coverage" 8000
  fi
}

function release {
  echo_header "l1-contracts release"
  local branch=$(dist_tag)
  if [ $branch = latest ]; then
    branch=master
  fi

  release_git_push $branch $REF_NAME ${REF_NAME#v}
}

case "$cmd" in
  "clean")
    git clean -fdx
    ;;
  "ci")
    build
    test
    ;;
  ""|"fast"|"full")
    build
    ;;
  "gas_report")
    shift
    gas_report "$@"
    ;;
  "gas_benchmark")
    shift
    gas_benchmark "$@"
    ;;
  "coverage")
    shift
    coverage "$@"
    ;;
  test|test_cmds|bench|bench_cmds|inspect|release)
    $cmd
    ;;
  "hash")
    echo $hash
    ;;
  *)
    echo "Unknown command: $cmd"
    exit 1
esac
