#!/usr/bin/env bash
source $(git rev-parse --show-toplevel)/ci3/source_bootstrap

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
  test_cmds | filter_test_cmds | parallelize
}

function test_cmds {
  for browser in chromium firefox; do
    echo "$hash playground/scripts/run_test.sh $browser"
  done
}

function release {
  echo_header "playground release"

  local dtag=$(dist_tag)
  do_or_dryrun aws s3 sync ./dist s3://play.aztec.network/$dtag --quiet
  do_or_dryrun aws s3 sync ./dist s3://play.aztec.network/$REF_NAME --quiet

  # Record which version owns the dist_tag path so retract can guard against wiping a newer deployment.
  echo "$REF_NAME" | do_or_dryrun aws s3 cp - s3://play.aztec.network/$dtag/_version --content-type text/plain

  # We want the root to redirect to the latest master version.
  echo '<!DOCTYPE html><html><head><meta http-equiv="refresh" content="0; url=/latest"></head></html>' | \
    do_or_dryrun aws s3 cp - s3://play.aztec.network/index.html --content-type text/html

  invalidate_cloudfront
}

function retract {
  echo_header "playground retract"

  do_or_dryrun aws s3 rm --recursive "s3://play.aztec.network/$REF_NAME"

  # Only remove the dist_tag path if it still points to this release.
  local dtag=$(dist_tag)
  local current_version
  current_version=$(aws s3 cp "s3://play.aztec.network/$dtag/_version" - 2>/dev/null || true)
  if [ "$current_version" = "$REF_NAME" ]; then
    do_or_dryrun aws s3 rm --recursive "s3://play.aztec.network/$dtag"
    [ "${DRY_RUN:-0}" = 0 ] && echo "Removed dist_tag path $dtag -> $REF_NAME."
  else
    echo "Dist_tag path $dtag points to '$current_version' (not '$REF_NAME'), skipping."
  fi

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
    echo $hash
    ;;
  *)
    default_cmd_handler "$@"
    ;;
esac
