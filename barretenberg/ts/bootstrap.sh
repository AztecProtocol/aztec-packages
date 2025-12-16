#!/usr/bin/env bash
# Use ci3 script base.
source $(git rev-parse --show-toplevel)/ci3/source_bootstrap

# We mix if we're a release into the hash, as releases have all architectures built.
hash=$(hash_str \
  $(../cpp/bootstrap.sh hash) \
  $(cache_content_hash .rebuild_patterns) \
  $(semver check $REF_NAME && echo 1 || echo 0))

function build {
  echo_header "bb.js build"
  npm_install_deps

  if ! cache_download bb.js-$hash.tar.gz; then
    find . -exec touch -d "@0" {} + 2>/dev/null || true
    yarn clean
    yarn generate
    yarn build:wasm
    yarn build:native
    parallel -v --line-buffered --tag 'denoise "yarn {}"' ::: build:esm build:cjs build:browser
    cache_upload bb.js-$hash.tar.gz dest build
  fi

  # We copy snapshot dirs to dest so we can run tests from dest.
  # This is because web-workers run into issues with transpilation.
  for snapshot_dir in src/**/__snapshots__; do
    dest_dir="${snapshot_dir/src\//dest\/node\/}"
    rm -rf "$dest_dir"
    cp -r "$snapshot_dir" "$dest_dir"
    for file in $dest_dir/*.test.ts.snap; do
      mv "$file" "${file/.test.ts.snap/.test.js.snap}"
    done
  done
}

function test_cmds {
  cd dest/node
  for test in **/*.test.js; do
    # Skip benchmarks here.
    [[ "$test" =~ \.bench\.test\.js$ ]] && continue

    local prefix=$hash
    # Extra resource.
    if [[ "$test" =~ ^examples/ ]]; then
      prefix="$prefix:CPUS=16"
    fi
    echo "$prefix barretenberg/ts/scripts/run_test.sh $test"
  done
}

function bench_cmds {
  echo "$hash:CPUS=4 barretenberg/ts/scripts/run_test.sh poseidon.bench.test.js"
}

function test {
  echo_header "bb.js test"
  test_cmds | filter_test_cmds | parallelize
}

function release {
  cross_copy
  retry "deploy_npm $(dist_tag) ${REF_NAME#v}"
}

# Port release: re-tag NPM package from source version to target dist tag.
function port_release {
  local source_ref=${1:-$SOURCE_REF}
  local target_ref=${2:-$TARGET_REF}

  echo_header "bb.js port_release: $source_ref -> $target_ref"

  local source_version=${source_ref#v}
  local target_version=${target_ref#v}

  # Compute target dist tag from target_ref.
  local target_dist_tag=$(REF_NAME=$target_ref dist_tag)

  local package_name=$(jq -r '.name' package.json)

  # Check if source version exists on NPM.
  if ! npm view "$package_name@$source_version" version >/dev/null 2>&1; then
    echo "Error: $package_name@$source_version not found on NPM."
    exit 1
  fi

  # Tag existing version with target dist tag.
  echo "Tagging $package_name@$source_version as $target_dist_tag..."
  do_or_dryrun npm dist-tag add "$package_name@$source_version" "$target_dist_tag"
}

function cross_copy {
  ./scripts/copy_cross.sh
}

case "$cmd" in
  "")
    build
    ;;
  "hash")
    echo "$hash"
    ;;
  *)
    default_cmd_handler "$@"
    ;;
esac
