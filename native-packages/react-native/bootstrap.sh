#!/usr/bin/env bash
"$(git rev-parse --show-toplevel)/bootstrap.sh" init || exit 1
source $(git rev-parse --show-toplevel)/ci3/source_bootstrap

hash=$(cache_content_hash .rebuild_patterns)
hermes_hash=$(hash_str $(cache_content_hash ^native-packages/react-native/scripts/build_hermes.sh) $(arch)-$(os))
# The tests run bb.js, bb, the ACVM, kv-sqlite and ipc-codegen's echo example from this tree.
test_hash=$(hash_str $hash $(../../barretenberg/cpp/bootstrap.sh hash) $(../../barretenberg/ts/bootstrap.sh hash) \
  $(../acvm/bootstrap.sh hash) $(../kv-sqlite/bootstrap.sh hash) $(../../ipc-codegen/bootstrap.sh hash))

# The package's sources (third_party), and the test host: Hermes and the native module, built for this machine.
function build {
  echo_header "react-native build"
  denoise "retry 'yarn install --immutable'"
  denoise scripts/vendor.sh
  if ! cache_download react-native-hermes-$hermes_hash.tar.gz; then
    denoise scripts/build_hermes.sh
    cache_upload react-native-hermes-$hermes_hash.tar.gz build/hermes
  fi
  denoise scripts/build_host.sh
}

function test_cmds {
  local run="native-packages/react-native/scripts/run_test.sh"
  echo "$test_hash:CPUS=2:TIMEOUT=300s $run test/native.test.js"
  echo "$test_hash:CPUS=2:TIMEOUT=300s $run test/bb.test.js"
  echo "$test_hash:CPUS=2:TIMEOUT=300s $run test/noir.test.js"
  echo "$test_hash:CPUS=2:TIMEOUT=300s $run test/echo.test.js"
}

function test {
  echo_header "react-native test"
  test_cmds | filter_test_cmds | parallelize
}

# The package with prebuilt/ (scripts/build_prebuilt.sh), from the cross builds `make react-native-mobile` makes.
function release {
  build
  scripts/build_prebuilt.sh
  local version=${REF_NAME#v}
  # The portals to the in-tree packages are for this tree only; deploy_npm pins them at the release's version.
  jq --arg v "$version" '.version = $v | del(.resolutions)' package.json >package.json.tmp
  mv package.json.tmp package.json
  retry "deploy_npm $version"
}

function clean {
  rm -rf build prebuilt third_party node_modules
}

export -f build test_cmds test release clean

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
