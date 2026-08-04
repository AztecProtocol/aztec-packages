#!/usr/bin/env bash
source $(git rev-parse --show-toplevel)/ci3/source_bootstrap

# Format check across the fnd workspaces. CI runs this via the root Makefile's
# noir-projects-fnd-format-check target. The fnd and labs checks both warm the
# shared nargo dependency cache — parallel nargo runs trip over each other
# downloading — so on the monorepo the Makefile serializes labs after fnd.
# Ordered after generate_variants and before the subproject builds so the cache
# is warm by the time they run.
function format_check {
  # nargo downloads its git dependencies (e.g. noir-lang/poseidon) on first use.
  # Under heavy parallel CI load the VPC DNS resolver drops lookups
  # ("Could not resolve host: github.com"), leaving a half-cloned dependency dir
  # that then fails with "Cannot read file .../Nargo.toml". Retry the download,
  # wiping the partial dependency cache after a failure so the next attempt
  # re-clones cleanly. A warm cache is left intact on success.
  local nargo=$root/noir/noir-repo/target/release/nargo
  local fmt_check="( set -e; for dir in noir-contracts noir-protocol-circuits mock-protocol-circuits; do (cd \"\$dir\" && \"$nargo\" fmt --check); done )"
  RETRY_SLEEP=10 retry "$fmt_check || { rm -rf \"\$HOME/nargo\"; exit 1; }"
}

function build {
  echo_header "noir-projects fnd build"

  # Use fmt as a trick to download dependencies.
  # Otherwise parallel runs of nargo will trip over each other trying to download dependencies.
  # Also doubles up as our formatting check.
  function prep {
    set -eu
    ./noir-protocol-circuits/bootstrap.sh generate_variants
    format_check
  }
  export -f prep format_check

  denoise prep

  parallel --tag --line-buffered --joblog joblog.txt --halt now,fail=1 denoise "'./{}/bootstrap.sh $cmd'" ::: \
    mock-protocol-circuits \
    noir-protocol-circuits \
    noir-contracts
}

# With no argument this is a local-dev entry only (via ./bootstrap.sh test). CI does not run that
# aggregate: the root Makefile wires each subproject's test_cmds individually, so a new suite must
# also get a Makefile target to run in CI. The release argument is the form CI does run, from the
# fnd-release-tests target.
function test_cmds {
  if [ "${1:-}" = release ]; then
    # ci3 stays whole rather than naming the scripts the release path runs, because that list is
    # transitive: the release gate lives in source_bootstrap and calls semver, and deploy_npm reaches
    # release_prep_package_json. A list that falls behind skips the test instead of breaking.
    local noir_hash content_hash prefix
    noir_hash=${NOIR_HASH:-$(../../noir/bootstrap.sh hash)}
    content_hash=$(cache_content_hash \
      "^noir-projects/fnd/" \
      "^ci3/" \
      ../../avm-transpiler/.rebuild_patterns \
      ../../barretenberg/cpp/.rebuild_patterns \
      ../../barretenberg/ts/.rebuild_patterns)
    prefix=$(hash_str "$noir_hash" "$content_hash")
    echo "$prefix noir-projects/fnd/bootstrap.sh release_smoke_test"
    return
  fi
  parallel -k ./{}/bootstrap.sh test_cmds ::: noir-protocol-circuits noir-contracts
}

function test {
  echo_header "noir-projects fnd test"
  test_cmds "$@" | filter_test_cmds | parallelize
}

function format {
    parallel -k ./{}/bootstrap.sh format ::: noir-protocol-circuits noir-contracts
}

# Copies a subproject's compiled output into the dist directory of the npm package that publishes
# it. Named arguments beyond the source select individual artifacts; with none, every artifact in
# the directory is published. --filter takes a jq program to rewrite each artifact on the way in.
function stage_artifacts {
  local filter=
  if [ "${1:-}" = --filter ]; then
    filter=${2:?jq program required}
    shift 2
  fi
  local pkg=${1:?package dir required}
  local src=${2:?source dir required}
  shift 2
  local -a selected=("$@")

  local -a sources
  # Nothing selected means take every artifact in the source directory. Otherwise take just the named ones.
  if [ ${#selected[@]} -eq 0 ]; then
    # Artifacts only. The source also holds a keys/ subdirectory of generated Solidity verifiers, which
    # are no use to a consumer of these artifacts.
    sources=($src/*.json)
    # The circuit subprojects create target/keys before doing any work, so a source directory that
    # exists tells you nothing about whether anything was compiled into it. An unmatched glob is left
    # verbatim, so this catches an empty and an absent source alike.
    [ -e "${sources[0]}" ] || { echo_stderr "no artifacts in $src; was the build phase run?"; exit 1; }
  else
    local artifact
    for artifact in "${selected[@]}"; do
      [ -f "$src/$artifact.json" ] || { echo_stderr "$src/$artifact.json not found; was the build phase run?"; exit 1; }
      sources+=($src/$artifact.json)
    done
  fi

  local dist
  dist=$(dist_dir $pkg)
  mkdir -p $dist/artifacts
  # Serially, because the filter is a jq program from the caller: fanning out means splicing it into
  # a job template, where whichever character the placeholder uses stops being literal. deploy_npm
  # rewrites the same files one at a time anyway, so there is little to win.
  if [ -n "$filter" ]; then
    local artifact
    for artifact in "${sources[@]}"; do
      jq -c "$filter" $artifact > $dist/artifacts/$(basename $artifact)
    done
  else
    cp "${sources[@]}" $dist/artifacts
  fi
}

# The packages published from here, declared once so the staging and publish loops cannot disagree
# about which ones exist.
function artifact_packages {
  echo protocol-circuits-artifacts mock-protocol-circuits-artifacts protocol-contracts-artifacts
}

# Overridable because grind_test runs many copies of one test command side by side in a single
# checkout, and copies sharing a staging directory clear it out from under each other.
function dist_dir {
  echo ${FND_DIST_ROOT:-.}/${1:?package dir required}/dist
}

function stage_packages {
  # Each package publishes its dist directory, rebuilt from nothing on every run. The manifests
  # declare no files list and dist carries no ignore file, so npm packs the directory wholesale:
  # the tarball holds exactly what the calls below copy in, with nothing to keep in step with them
  # and nowhere for a stray file to ride along.
  local pkg dist
  for pkg in $(artifact_packages); do
    dist=$(dist_dir $pkg)
    rm -rf $dist
    mkdir -p $dist
    cp $pkg/package.json $pkg/README.md $dist/
  done

  # Source mapping is a fifth of this package's download and nothing reads it. The contract artifacts keep
  # theirs because PXE resolves a failing public call against contract debug info, and the mocks keep theirs
  # because nothing downstream strips them today.
  stage_artifacts --filter '.file_map = {} | .debug_symbols = ""' \
    protocol-circuits-artifacts noir-protocol-circuits/target
  # The reset-data and abi generators downstream read both of these. The dimensions file is written by
  # generate_variants, so a release needs that to have run and not merely the circuits to have compiled.
  # They go to the dist root rather than artifacts/, because they describe the artifacts instead of
  # being one.
  local config
  for config in private_kernel_reset_config.json private_kernel_reset_dimensions.json; do
    [ -f noir-protocol-circuits/$config ] ||
      { echo_stderr "noir-protocol-circuits/$config not found; was the build phase run?"; exit 1; }
    cp noir-protocol-circuits/$config $(dist_dir protocol-circuits-artifacts)/
  done

  stage_artifacts mock-protocol-circuits-artifacts mock-protocol-circuits/target

  # Assigned on its own line because errexit ignores a failing command substitution in argument
  # position: inlined, a missing or unreadable manifest would pass zero names, and staging would
  # fall through to copying every contract in the target directory.
  local protocol_contracts
  protocol_contracts=$(jq -r '.[]' noir-contracts/protocol_contracts.json)
  [ -n "$protocol_contracts" ] || { echo_stderr "noir-contracts/protocol_contracts.json lists no contracts."; exit 1; }
  stage_artifacts protocol-contracts-artifacts noir-contracts/target $protocol_contracts
  # The generators derive each artifact's filename and TypeScript name from this list. It sits at the
  # dist root because it is a JSON array, and release_prep_package_json stamps a version into every
  # artifacts/*.json, which fails outright on one.
  cp noir-contracts/protocol_contracts.json $(dist_dir protocol-contracts-artifacts)/
}

# Publishes the compiled protocol artifacts to npm, so repos without a Noir toolchain can generate
# their own bindings from them. Only runs for release tags; see ci3/source_bootstrap.
function release {
  echo_header "noir-projects fnd release"
  local version=${REF_NAME#v}

  stage_packages

  # Every package is checked before any is published. Re-running a tag finishes a partial publish,
  # since deploy_npm skips a package already at that version, but a break that needs a code fix
  # cannot be repaired that way: whatever published first is frozen at that version, and the fix has
  # to go out under a new one.
  local pkg dist
  for pkg in $(artifact_packages); do
    dist=$(dist_dir $pkg)
    # A package listed above but never passed to stage_artifacts would otherwise publish nothing but
    # its manifest and README.
    [ -d $dist/artifacts ] || { echo_stderr "$pkg has no staged artifacts."; exit 1; }
  done

  for pkg in $(artifact_packages); do
    (cd $(dist_dir $pkg) && retry "deploy_npm $version")
  done
}

# Runs the real release path against the current build output, publishing nothing, so a break shows up
# on a PR rather than on a release tag, where whatever published before the break is frozen at that
# version and the fix has to go out under a new one.
function release_smoke_test {
  echo_header "noir-projects fnd release smoke test"

  # Inside the checkout rather than under /tmp: deploy_npm locates ci3 by running git rev-parse from
  # the directory it publishes, so from outside the repo it sources nothing and goes on to run the
  # whole publish path with no errexit and none of ci3's functions, passing whatever happens.
  local dist_root
  dist_root=$(mktemp -d -p "$PWD" smoke.XXXXXX)
  trap "rm -rf $dist_root" EXIT

  # Retries off: a failure here is the staged payload being wrong, and repeating a pack of every
  # artifact twice more only buries the error under the test's timeout.
  RETRY_DISABLED=1 FND_DIST_ROOT=$dist_root REF_NAME=v99.0.0 DRY_RUN=1 ./bootstrap.sh release

  # A release whose REF_NAME does not parse as a release tag is skipped by exiting 0, so without this
  # check a version that stopped parsing as one would leave a test that passes having staged nothing.
  local pkg
  for pkg in $(artifact_packages); do
    [ -n "$(ls -A $dist_root/$pkg/dist/artifacts 2>/dev/null)" ] ||
      { echo_stderr "$pkg staged no artifacts; the release did not run."; exit 1; }
  done
}

function pin-build {
  echo_header "noir-projects fnd pin-build"
  parallel --tag --line-buffered --halt now,fail=1 './{}/bootstrap.sh pin-build' ::: \
    mock-protocol-circuits \
    noir-protocol-circuits
}

case "$cmd" in
  "")
    build
    ;;
  *)
    default_cmd_handler "$@"
    ;;
esac
