#!/usr/bin/env bash
source $(git rev-parse --show-toplevel)/ci3/source_bootstrap

cmd=${1:-}

hash=$(hash_str $(cache_content_hash .rebuild_patterns) $(../yarn-project/bootstrap.sh hash))

function build {
  echo_header "playground build"
  npm_install_deps

  if ! cache_download playground-$hash.tar.gz; then
    denoise 'yarn build'
    cache_upload playground-$hash.tar.gz $(git ls-files --others --ignored --exclude-standard | grep -vE '^"?node_modules/')
  fi
}

function test {
  echo_header "playground test"
  test_cmds | filter_test_cmds | parallelise
}

function test_cmds {
  for browser in chromium webkit firefox; do
    echo "$hash playground/scripts/run_test.sh $browser"
  done
}

function release {
  echo_header "playground release"
  if [ $(dist_tag) != "latest" ]; then
    # TODO attach to github release
    do_or_dryrun yarn netlify deploy --site aztec-playground --dir=dist
  else
    do_or_dryrun yarn netlify deploy --site aztec-playground --prod --dir=dist
  fi
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
  test|test_cmds|release)
    $cmd
    ;;
  "hash")
    echo $hash
    ;;
  *)
    echo "Unknown command: $cmd"
    exit 1
esac
