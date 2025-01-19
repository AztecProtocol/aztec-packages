#!/usr/bin/env bash
# Use ci3 script base.
source $(git rev-parse --show-toplevel)/ci3/source_bootstrap

cmd=${1:-}
hash=$(cache_content_hash ../cpp/.rebuild_patterns .rebuild_patterns)

function build {
  echo_header "bb.js build"
  denoise "yarn install"

  if ! cache_download bb.js-$hash.tar.gz; then
    find . -exec touch -d "@0" {} + 2>/dev/null || true
    denoise "yarn formatting && yarn build"
    cache_upload bb.js-$hash.tar.gz dest
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
    echo "$hash barretenberg/ts/scripts/run_test.sh $test"
  done
}

# # WORKTODO(adam) remove once publish-aztec-packages is refactored
# publish-npm:
#     FROM +deps
#     ARG VERSION
#     ARG DIST_TAG
#     ARG DRY_RUN=0
#     RUN --secret NPM_TOKEN echo "//registry.npmjs.org/:_authToken=${NPM_TOKEN}" > /usr/src/barretenberg/ts/.npmrc
#     WORKDIR /usr/src/barretenberg/ts
#     RUN jq --arg v $VERSION '.version = $v' package.json > _tmp.json && mv  _tmp.json package.json
#     RUN if [ "$DRY_RUN" = "1" ]; then \
#         npm publish --tag $DIST_TAG --access public --dry-run; \
#     else \
#         npm publish --tag $DIST_TAG --access public; \
#     fi

function test {
  echo_header "bb.js test"
  test_cmds | parallelise
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
  "test")
    test
    ;;
  "test-cmds")
    test_cmds
    ;;
  "format")
    yarn formatting:fix
    ;;
  "hash")
    echo "$hash"
    ;;
  *)
    echo "Unknown command: $cmd"
    exit 1
esac
