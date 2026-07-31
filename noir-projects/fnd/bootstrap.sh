#!/usr/bin/env bash
source $(git rev-parse --show-toplevel)/ci3/source_bootstrap

# Format check across the fnd workspaces. CI runs this via the root Makefile's
# noir-projects-format-check target, which runs the fnd and labs checks serially:
# both warm the shared nargo dependency cache, and parallel nargo runs trip over
# each other downloading. Ordered after generate_variants and before the
# subproject builds so the cache is warm by the time they run.
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

# Local-dev entry only (via ./bootstrap.sh test). CI does not run this aggregate:
# the root Makefile wires each subproject's test_cmds individually, so a new
# suite must also get a Makefile target to run in CI.
function test_cmds {
  parallel -k ./{}/bootstrap.sh test_cmds ::: noir-protocol-circuits noir-contracts
}

function test {
  echo_header "noir-projects fnd test"
  test_cmds | filter_test_cmds | parallelize
}

function format {
    parallel -k ./{}/bootstrap.sh format ::: noir-protocol-circuits noir-contracts
}

# Copies a subproject's compiled output into the dist directory of the npm package that publishes
# it. Named arguments beyond the source select individual artifacts; with none, every artifact in
# the directory is published.
function stage_artifacts {
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

  mkdir -p $pkg/dist/artifacts
  cp "${sources[@]}" $pkg/dist/artifacts
}

# Blanks the Noir source mapping in a package's staged artifacts.
function strip_debug_info {
  local pkg=${1:?package dir required}
  local artifact tmp
  for artifact in $pkg/dist/artifacts/*.json; do
    tmp=$(mktemp)
    jq -c '.file_map = {} | .debug_symbols = ""' $artifact > $tmp
    mv $tmp $artifact
    # The move carries mktemp's owner-only mode onto the artifact. dist is what gets packed, so leave
    # it readable like the rest of the payload.
    chmod 644 $artifact
  done
}

# The packages published from here, declared once so the staging and publish loops cannot disagree
# about which ones exist.
function artifact_packages {
  echo noir-protocol-circuits-artifacts mock-protocol-circuits-artifacts protocol-contracts-artifacts
}

# Fills each package's dist directory with the payload it publishes.
function stage_packages {
  # Each package publishes its dist directory, rebuilt from nothing on every run. The manifests
  # declare no files list and dist carries no ignore file, so npm packs the directory wholesale:
  # the tarball holds exactly what the calls below copy in, with nothing to keep in step with them
  # and nowhere for a stray file to ride along.
  local pkg
  for pkg in $(artifact_packages); do
    rm -rf $pkg/dist
    mkdir -p $pkg/dist
    cp $pkg/package.json $pkg/README.md $pkg/dist/
  done

  stage_artifacts noir-protocol-circuits-artifacts noir-protocol-circuits/target
  # Source mapping is a fifth of this package's download and nothing reads it. The contract artifacts keep
  # theirs because PXE resolves a failing public call against contract debug info, and the mocks keep theirs
  # because nothing downstream strips them today.
  strip_debug_info noir-protocol-circuits-artifacts
  # The reset-data and abi generators downstream read both of these. The dimensions file is written by
  # generate_variants, so a release needs that to have run and not merely the circuits to have compiled.
  # Config files go to the dist root rather than artifacts/, because they describe the artifacts instead
  # of being one, and because release_prep_package_json stamps a version into every artifacts/*.json,
  # which fails outright on a JSON array.
  local config
  for config in private_kernel_reset_config.json private_kernel_reset_dimensions.json; do
    [ -f noir-protocol-circuits/$config ] ||
      { echo_stderr "noir-protocol-circuits/$config not found; was the build phase run?"; exit 1; }
    cp noir-protocol-circuits/$config noir-protocol-circuits-artifacts/dist/
  done

  stage_artifacts mock-protocol-circuits-artifacts mock-protocol-circuits/target

  # Assigned on its own line because errexit ignores a failing command substitution in argument
  # position: inlined, a missing or unreadable manifest would pass zero names, and staging would
  # fall through to copying every contract in the target directory.
  local protocol_contracts
  protocol_contracts=$(jq -r '.[]' noir-contracts/protocol_contracts.json)
  [ -n "$protocol_contracts" ] || { echo_stderr "noir-contracts/protocol_contracts.json lists no contracts."; exit 1; }
  stage_artifacts protocol-contracts-artifacts noir-contracts/target $protocol_contracts
  # The generators derive each artifact's filename and TypeScript name from this list.
  cp noir-contracts/protocol_contracts.json protocol-contracts-artifacts/dist/
}

# Publishes the compiled protocol artifacts to npm, so repos without a Noir toolchain can generate
# their own bindings from them. Only runs for release tags; see ci3/source_bootstrap.
function release {
  echo_header "noir-projects fnd release"
  local version=${REF_NAME#v}

  stage_packages

  # Every package is checked before any is published. npm forbids reusing a version, so a check that
  # failed after an earlier publish would leave the release tag permanently half-published.
  local pkg
  for pkg in $(artifact_packages); do
    # A package listed above but never passed to stage_artifacts would otherwise publish nothing but
    # its manifest and README.
    [ -d $pkg/dist/artifacts ] || { echo_stderr "$pkg has no staged artifacts."; exit 1; }
    # npm pack refuses a manifest missing either field, so an unusable one fails partway through the
    # publish loop rather than here.
    jq -e '.name and .version' $pkg/dist/package.json >/dev/null ||
      { echo_stderr "$pkg/package.json is not a usable manifest."; exit 1; }
  done

  for pkg in $(artifact_packages); do
    (cd $pkg/dist && retry "deploy_npm $version")
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
