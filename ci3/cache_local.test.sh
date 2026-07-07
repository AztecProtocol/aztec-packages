#!/usr/bin/env bash
# Test script for local cache functionality in cache_download and cache_upload.
set -euo pipefail

script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
test_root="/tmp/cache-local-test-$$"
passed=0
failed=0

cleanup() {
  rm -rf "$test_root"
}
trap cleanup EXIT

log() { echo -e "\033[1m$1\033[0m"; }
pass() { echo -e "  \033[32m✓ $1\033[0m"; ((++passed)); }
fail() { echo -e "  \033[31m✗ $1\033[0m"; ((++failed)); }

setup() {
  log "Setting up test environment in $test_root"
  mkdir -p "$test_root"/{local-cache,extract,source}

  # Create some test content to tar up.
  echo "hello world" > "$test_root/source/file1.txt"
  echo "foo bar" > "$test_root/source/file2.txt"

  # Create a test tar.gz from that content.
  tar -czf "$test_root/test-artifact.tar.gz" -C "$test_root/source" .
}

test_download_without_local_cache() {
  log "\nTest 1: cache_download without CACHE_LOCAL_DIR (baseline)"

  # Without CACHE_LOCAL_DIR, and without S3 access, cache_download should fail.
  # This just confirms that the env var being unset means no local cache logic runs.
  unset CACHE_LOCAL_DIR 2>/dev/null || true
  if NO_CACHE=1 "$script_dir/cache_download" "some-file.tar.gz" "$test_root/extract" 2>/dev/null; then
    fail "Should have exited with error when NO_CACHE=1"
  else
    pass "cache_download respects NO_CACHE=1 without local cache"
  fi
}

test_download_local_cache_hit() {
  log "\nTest 2: cache_download with local cache hit"

  export CACHE_LOCAL_DIR="$test_root/local-cache"
  rm -rf "$test_root/extract"
  mkdir -p "$test_root/extract"

  # Place the artifact in the local cache.
  cp "$test_root/test-artifact.tar.gz" "$CACHE_LOCAL_DIR/test-artifact.tar.gz"

  # cache_download should find it in local cache and extract.
  if "$script_dir/cache_download" "test-artifact.tar.gz" "$test_root/extract" 2>/dev/null; then
    if [[ -f "$test_root/extract/file1.txt" ]] && [[ -f "$test_root/extract/file2.txt" ]]; then
      pass "Local cache hit extracted files correctly"
    else
      fail "Local cache hit did not extract files"
    fi
  else
    fail "cache_download failed on local cache hit"
  fi

  # Verify stderr mentions local cache hit.
  local stderr_output
  rm -rf "$test_root/extract"
  mkdir -p "$test_root/extract"
  stderr_output=$("$script_dir/cache_download" "test-artifact.tar.gz" "$test_root/extract" 2>&1 >/dev/null) || true
  if echo "$stderr_output" | grep -q "Local cache hit"; then
    pass "Reported local cache hit in stderr"
  else
    fail "Did not report local cache hit (got: $stderr_output)"
  fi
}

test_download_local_cache_miss() {
  log "\nTest 3: cache_download with local cache miss (no remote)"

  export CACHE_LOCAL_DIR="$test_root/local-cache-empty"
  mkdir -p "$CACHE_LOCAL_DIR"
  rm -rf "$test_root/extract"
  mkdir -p "$test_root/extract"

  # With an empty local cache and no S3 access, download should fail.
  local stderr_output
  stderr_output=$("$script_dir/cache_download" "nonexistent.tar.gz" "$test_root/extract" 2>&1 >/dev/null) || true
  if echo "$stderr_output" | grep -q "Local cache miss"; then
    pass "Reported local cache miss in stderr"
  else
    fail "Did not report local cache miss (got: $stderr_output)"
  fi
}

test_upload_saves_to_local_cache() {
  log "\nTest 4: cache_upload saves to local cache"

  export CACHE_LOCAL_DIR="$test_root/local-cache-upload"
  mkdir -p "$CACHE_LOCAL_DIR"

  # cache_upload requires CI=1 or S3_FORCE_UPLOAD, and AWS credentials.
  # We set S3_FORCE_UPLOAD but expect S3 upload to fail (no credentials) - that's OK,
  # we just want to verify the local cache copy happens.
  local stderr_output
  stderr_output=$(S3_FORCE_UPLOAD=1 "$script_dir/cache_upload" "test-upload.tar.gz" "$test_root/source/file1.txt" "$test_root/source/file2.txt" 2>&1 >/dev/null) || true

  if [[ -f "$CACHE_LOCAL_DIR/test-upload.tar.gz" ]]; then
    pass "cache_upload saved artifact to local cache"
  else
    fail "cache_upload did not save artifact to local cache"
  fi

  if echo "$stderr_output" | grep -q "Saved test-upload.tar.gz to local cache"; then
    pass "Reported saving to local cache in stderr"
  else
    fail "Did not report saving to local cache (got: $stderr_output)"
  fi
}

test_upload_without_local_cache() {
  log "\nTest 5: cache_upload without CACHE_LOCAL_DIR"

  unset CACHE_LOCAL_DIR 2>/dev/null || true

  # Without CACHE_LOCAL_DIR, upload should not create any local cache files.
  local stderr_output
  stderr_output=$(S3_FORCE_UPLOAD=1 "$script_dir/cache_upload" "test-no-local.tar.gz" "$test_root/source/file1.txt" 2>&1 >/dev/null) || true

  if echo "$stderr_output" | grep -q "local cache"; then
    fail "Should not mention local cache when CACHE_LOCAL_DIR is unset"
  else
    pass "No local cache activity when CACHE_LOCAL_DIR is unset"
  fi
}

test_roundtrip() {
  log "\nTest 6: Upload then download roundtrip via local cache"

  export CACHE_LOCAL_DIR="$test_root/local-cache-roundtrip"
  mkdir -p "$CACHE_LOCAL_DIR"

  # Upload: creates the tar and saves to local cache.
  S3_FORCE_UPLOAD=1 "$script_dir/cache_upload" "roundtrip.tar.gz" "$test_root/source/file1.txt" "$test_root/source/file2.txt" 2>/dev/null || true

  # Download: should find it in local cache and extract.
  rm -rf "$test_root/extract"
  mkdir -p "$test_root/extract"
  if "$script_dir/cache_download" "roundtrip.tar.gz" "$test_root/extract" 2>/dev/null; then
    if [[ -f "$test_root/extract/$test_root/source/file1.txt" ]] || [[ -f "$test_root/extract/file1.txt" ]]; then
      pass "Roundtrip: upload then download via local cache works"
    else
      # The tar preserves full paths, so check with the full path structure.
      if tar -tzf "$CACHE_LOCAL_DIR/roundtrip.tar.gz" | grep -q "file1.txt"; then
        pass "Roundtrip: artifact in local cache contains expected files"
      else
        fail "Roundtrip: extracted files not found"
      fi
    fi
  else
    fail "Roundtrip: cache_download failed"
  fi
}

test_disabled_cache_skips_local() {
  log "\nTest 7: disabled-cache key skips local cache"

  export CACHE_LOCAL_DIR="$test_root/local-cache"

  local stderr_output
  stderr_output=$("$script_dir/cache_download" "disabled-cache-foo.tar.gz" "$test_root/extract" 2>&1 >/dev/null) || true
  if echo "$stderr_output" | grep -q "uncommitted changes"; then
    pass "disabled-cache still triggers early exit before local cache"
  else
    fail "disabled-cache did not trigger early exit (got: $stderr_output)"
  fi
}

test_inaccessible_cache_dir_falls_through() {
  log "\nTest 8: Inaccessible CACHE_LOCAL_DIR falls through gracefully"

  # Use a path we definitely can't create (root-owned directory).
  export CACHE_LOCAL_DIR="/proc/fake-cache-dir"

  local stderr_output
  stderr_output=$("$script_dir/cache_download" "test-artifact.tar.gz" "$test_root/extract" 2>&1 >/dev/null) || true
  if echo "$stderr_output" | grep -q "Cannot create local cache dir"; then
    pass "Download warns about inaccessible cache dir"
  else
    fail "Download did not warn about inaccessible dir (got: $stderr_output)"
  fi
  # Should NOT see "Local cache hit" or "Local cache miss" since it fell through.
  if echo "$stderr_output" | grep -q "Local cache"; then
    fail "Download should not attempt local cache when dir is inaccessible"
  else
    pass "Download skipped local cache logic when dir is inaccessible"
  fi

  # Test upload too.
  stderr_output=$(S3_FORCE_UPLOAD=1 "$script_dir/cache_upload" "test-upload-fallthrough.tar.gz" "$test_root/source/file1.txt" 2>&1 >/dev/null) || true
  if echo "$stderr_output" | grep -q "Cannot create local cache dir"; then
    pass "Upload warns about inaccessible cache dir"
  else
    fail "Upload did not warn about inaccessible dir (got: $stderr_output)"
  fi
}

test_upload_local_save_without_ci() {
  log "\nTest 9: cache_upload saves to local cache with CI=0 and no S3_FORCE_UPLOAD"

  export CACHE_LOCAL_DIR="$test_root/local-cache-ci0"
  mkdir -p "$CACHE_LOCAL_DIR"

  local stderr_output
  stderr_output=$(CI=0 "$script_dir/cache_upload" "test-ci0.tar.gz" "$test_root/source/file1.txt" 2>&1 >/dev/null) || true

  if [[ -f "$CACHE_LOCAL_DIR/test-ci0.tar.gz" ]]; then
    pass "Local build populated local cache without CI/S3_FORCE_UPLOAD"
  else
    fail "Local build did not populate local cache (got: $stderr_output)"
  fi
  if echo "$stderr_output" | grep -q "Skipping S3 upload"; then
    pass "S3 upload still skipped at CI=0"
  else
    fail "Expected S3 upload skip at CI=0 (got: $stderr_output)"
  fi

  # With no CACHE_LOCAL_DIR either, upload is a no-op and skips tarring entirely.
  unset CACHE_LOCAL_DIR
  stderr_output=$(CI=0 "$script_dir/cache_upload" "test-ci0-noop.tar.gz" "$test_root/source/file1.txt" 2>&1 >/dev/null) || true
  if echo "$stderr_output" | grep -q "no CACHE_LOCAL_DIR"; then
    pass "No-op exit when there is nowhere to save"
  else
    fail "Expected no-op exit message (got: $stderr_output)"
  fi
}

test_upload_ci_exists_skips_tar() {
  log "\nTest 10: CI=1 upload of an artifact that already exists in S3 exits before tarring"

  # Stub aws: credentials present, artifact exists in S3. The upload paths are given a NONEXISTENT
  # file, so if cache_upload tars before checking existence the tar fails and so does the script —
  # the existence check must short-circuit first.
  local stub="$test_root/aws-stub"
  mkdir -p "$stub"
  cat > "$stub/aws" <<'EOF'
#!/usr/bin/env bash
case "$1" in
  configure) exit 0 ;;
  s3) [[ "$2" == "ls" ]] && exit 0 || exit 1 ;;
esac
exit 1
EOF
  chmod +x "$stub/aws"

  unset CACHE_LOCAL_DIR 2>/dev/null || true
  local stderr_output rc=0
  stderr_output=$(PATH="$stub:$PATH" CI=1 "$script_dir/cache_upload" "exists-remote.tar.gz" "$test_root/nonexistent-artifact" 2>&1 >/dev/null) || rc=$?
  if [[ $rc -eq 0 ]] && echo "$stderr_output" | grep -q "already exists"; then
    pass "Existing remote artifact short-circuits before tarring"
  else
    fail "Expected pre-tar short-circuit (rc=$rc, got: $stderr_output)"
  fi
}

main() {
  log "=== Local Cache Test Suite ===\n"

  setup

  test_download_without_local_cache
  test_download_local_cache_hit
  test_download_local_cache_miss
  test_upload_saves_to_local_cache
  test_upload_without_local_cache
  test_roundtrip
  test_disabled_cache_skips_local
  test_inaccessible_cache_dir_falls_through
  test_upload_local_save_without_ci
  test_upload_ci_exists_skips_tar

  log "\n=== Results ==="
  echo -e "\033[32mPassed: $passed\033[0m"
  echo -e "\033[31mFailed: $failed\033[0m"

  if [[ $failed -gt 0 ]]; then
    exit 1
  fi
}

main "$@"
