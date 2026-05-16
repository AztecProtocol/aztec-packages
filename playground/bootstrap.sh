#!/usr/bin/env bash
if [ "${1:-}" = "hash" ] && [ "${NO_CACHE:-0}" -eq 1 ] && [ "${NO_CACHE_UPLOAD:-0}" -eq 1 ]; then
  echo disabled-cache
  exit 0
fi

script_dir=${BASH_SOURCE[0]%/*}
[ "$script_dir" = "${BASH_SOURCE[0]}" ] && script_dir=.
case "$script_dir" in
  /*) root=${root:-$script_dir/..} ;;
  *) root=${root:-$PWD/$script_dir/..} ;;
esac
source "$root/ci3/source_bootstrap"

function get_hash {
  if [ "${NO_CACHE:-0}" -eq 1 ] && [ "${NO_CACHE_UPLOAD:-0}" -eq 1 ]; then
    echo disabled-cache
    return
  fi

  hash_str $(cache_content_hash .rebuild_patterns) $(../yarn-project/bootstrap.sh hash)
}

function get_test_hash {
  if [ "${NO_CACHE:-0}" -eq 1 ]; then
    echo disabled-cache
  else
    get_hash
  fi
}

function upload_build_cache {
  local artifact=$1
  if [[ "$artifact" == *"disabled-cache"* ]] || [[ -z "${S3_FORCE_UPLOAD:-}" && "${CI:-0}" -eq 0 ]] || [ "${NO_CACHE_UPLOAD:-0}" -eq 1 ]; then
    cache_upload "$artifact" .
  else
    cache_upload "$artifact" $(git ls-files --others --ignored --exclude-standard | grep -vE '^"?node_modules/')
  fi
}

function build {
  echo_header "playground build"
  npm_install_deps

  local hash=$(get_hash)
  if ! cache_download playground-$hash.tar.gz; then
    denoise 'yarn build'
    upload_build_cache playground-$hash.tar.gz
  fi
}

function test {
  echo_header "playground test"
  test_cmds | filter_test_cmds | parallelize
}

function test_cmds {
  local hash=$(get_test_hash)
  for browser in chromium firefox; do
    echo "$hash:TIMEOUT=900s playground/scripts/run_test.sh $browser"
  done
}

function release {
  echo_header "playground release"

  do_or_dryrun aws s3 sync ./dist s3://play.aztec.network/$(dist_tag) --quiet
  do_or_dryrun aws s3 sync ./dist s3://play.aztec.network/$REF_NAME --quiet

  # We want the root to redirect to the latest master version.
  echo '<!DOCTYPE html><html><head><meta http-equiv="refresh" content="0; url=/latest"></head></html>' | \
    do_or_dryrun aws s3 cp - s3://play.aztec.network/index.html --content-type text/html

  invalidate_cloudfront
}

function invalidate_cloudfront {
  local id=$(aws cloudfront list-distributions \
    --query "DistributionList.Items[?Aliases.Items && contains(Aliases.Items, 'play.aztec-labs.com')].Id | [0]" \
    --output text)
  do_or_dryrun aws cloudfront create-invalidation --distribution-id $id --paths "/*"
}

case "$cmd" in
  "")
    build
    ;;
  "hash")
    get_hash
    ;;
  *)
    default_cmd_handler "$@"
    ;;
esac
