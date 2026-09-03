#!/usr/bin/env bash
# Shared helpers for the pinned chonk IVC inputs S3 hash.
#
# All scripts that download or update the pinned chonk inputs MUST source
# this file rather than holding their own copy of the hash. The hash file is
# updated automatically by PR CI when an input update is requested.
if [[ -z "${root:-}" ]]; then
  NO_CD=1 source "$(git rev-parse --show-toplevel)/ci3/source"
fi

PINNED_CHONK_INPUTS_HASH_FILE="${PINNED_CHONK_INPUTS_HASH_FILE:-$root/barretenberg/cpp/scripts/chonk-inputs.hash}"
PINNED_CHONK_S3_BUCKET="${PINNED_CHONK_S3_BUCKET:-s3://aztec-ci-artifacts/protocol}"
PINNED_CHONK_BASE_URL="${PINNED_CHONK_BASE_URL:-https://aztec-ci-artifacts.s3.us-east-2.amazonaws.com/protocol}"
PINNED_CHONK_STATE_DIR="${CHONK_INPUTS_STATE_DIR:-$root/.cache/chonk-inputs}"
PINNED_CHONK_MARKER_FILE=".chonk-inputs.hash"
PINNED_CHONK_HASH_LENGTH=16
export PINNED_CHONK_HASH_LENGTH
export PINNED_CHONK_MARKER_FILE

function read_pinned_chonk_inputs_hash {
  local hash
  hash=$(<"$PINNED_CHONK_INPUTS_HASH_FILE")
  hash="${hash//$'\n'/}"
  hash="${hash//$'\r'/}"
  hash="${hash// /}"
  if ! is_pinned_chonk_hash "$hash"; then
    echo_stderr "ERROR: invalid pinned chonk inputs hash '$hash' in $PINNED_CHONK_INPUTS_HASH_FILE"
    return 1
  fi
  echo "$hash"
}

function is_pinned_chonk_hash {
  local hash=${1:-}
  local hash_regex="^[a-f0-9]{${PINNED_CHONK_HASH_LENGTH}}$"
  [[ "$hash" =~ $hash_regex ]]
}

if ! pinned_chonk_inputs_hash="$(read_pinned_chonk_inputs_hash)"; then
  return 1 2>/dev/null || exit 1
fi

function update_pinned_chonk_inputs_hash {
  local new_hash=${1:?new hash required}
  if ! is_pinned_chonk_hash "$new_hash"; then
    echo_stderr "ERROR: invalid pinned chonk inputs hash '$new_hash'"
    return 1
  fi
  printf '%s\n' "$new_hash" > "$PINNED_CHONK_INPUTS_HASH_FILE"
  pinned_chonk_inputs_hash="$new_hash"
}

function pinned_chonk_inputs_url {
  local hash=${1:-$pinned_chonk_inputs_hash}
  echo "${PINNED_CHONK_BASE_URL}/bb-chonk-inputs-${hash}.tar.gz"
}

function pinned_chonk_inputs_s3_uri {
  local hash=${1:?hash required}
  echo "${PINNED_CHONK_S3_BUCKET}/bb-chonk-inputs-${hash}.tar.gz"
}

function reset_pinned_chonk_state_subdir {
  local name=${1:?state subdir required}
  local dir="$PINNED_CHONK_STATE_DIR/$name"
  rm -rf "$dir"
  mkdir -p "$dir"
  echo "$dir"
}

function make_pinned_chonk_state_tmpdir {
  local prefix=${1:?state prefix required}
  mkdir -p "$PINNED_CHONK_STATE_DIR"
  mktemp -d "$PINNED_CHONK_STATE_DIR/${prefix}.XXXXXXXX"
}

# Canonical extraction directory for the downloaded pinned inputs. Owned by the
# barretenberg build (populated once by barretenberg/cpp/bootstrap.sh) and read
# by every Chonk consumer. Kept under barretenberg/cpp so labs e2e jobs
# sharing the checkout never clean it.
function pinned_chonk_inputs_dir {
  echo "$(git rev-parse --show-toplevel)/barretenberg/cpp/chonk-pinned-flows"
}

# Output directory for live input capture during a refresh (chonk_inputs.sh
# update / ci-refresh-chonk). Distinct from the read path: capture is produced
# by the labs/yarn-project/end-to-end stack and only consumed by the upload step.
function chonk_capture_dir {
  echo "$(git rev-parse --show-toplevel)/labs/yarn-project/end-to-end/chonk-pinned-flows"
}

function list_chonk_input_flow_dirs {
  local dir=${1:?dir required}
  find "$dir" -mindepth 1 -maxdepth 1 -type d -printf '%f\n' | sort
}

function list_pinned_chonk_input_flows {
  local dir=${1:-$(pinned_chonk_inputs_dir)}
  check_pinned_chonk_inputs "$dir"
  list_chonk_input_flow_dirs "$dir"
}

function pinned_chonk_input_flow_dir {
  local flow=${1:?flow required}
  local dir=${2:-$(pinned_chonk_inputs_dir)}
  local flow_dir="$dir/$flow"
  if [[ ! -f "$flow_dir/ivc-inputs.msgpack" ]]; then
    echo_stderr "ERROR: pinned Chonk input flow '$flow' not found under $dir"
    return 1
  fi
  echo "$flow_dir"
}

function write_pinned_chonk_inputs_marker {
  local dest=${1:?dest dir required}
  printf '%s\n' "$pinned_chonk_inputs_hash" > "$dest/$PINNED_CHONK_MARKER_FILE"
}

# Downloads and extracts the pinned tarball into $dest. Wipes $dest first.
# Fails noisily on download or extract errors.
function download_pinned_chonk_inputs {
  local dest=${1:?dest dir required}
  local url
  url=$(pinned_chonk_inputs_url)
  echo_stderr "Downloading pinned chonk inputs ${pinned_chonk_inputs_hash} from ${url}"
  rm -rf "$dest"
  mkdir -p "$dest"
  local state_dir tarball
  state_dir="$(make_pinned_chonk_state_tmpdir download)"
  tarball="$state_dir/bb-chonk-inputs-${pinned_chonk_inputs_hash}.tar.gz"
  if ! curl -sSf "$url" -o "$tarball"; then
    echo_stderr "ERROR: failed to download pinned chonk inputs from $url"
    echo_stderr "pinned_chonk_inputs_hash='${pinned_chonk_inputs_hash}' may be stale."
    echo_stderr "Add the ci-refresh-chonk label to the PR, or put --ci-refresh-chonk in the head commit message, to regenerate."
    rm -rf "$state_dir"
    return 1
  fi
  if ! tar -xzf "$tarball" -C "$dest"; then
    echo_stderr "ERROR: failed to extract pinned chonk inputs tarball"
    rm -rf "$state_dir"
    return 1
  fi
  write_pinned_chonk_inputs_marker "$dest"
  rm -rf "$state_dir"
}

function check_chonk_inputs_shape {
  local dir=${1:?dir required}
  if [[ ! -d "$dir" ]] || [[ -z "$(ls -A "$dir" 2>/dev/null)" ]]; then
    echo_stderr "ERROR: pinned chonk inputs not present at $dir"
    return 1
  fi
  local missing=()
  local flow_count=0
  for flow_dir in "$dir"/*/; do
    [[ -d "$flow_dir" ]] || continue
    flow_count=$((flow_count + 1))
    [[ -f "$flow_dir/ivc-inputs.msgpack" ]] || missing+=("${flow_dir}ivc-inputs.msgpack")
  done
  if (( flow_count == 0 )); then
    echo_stderr "ERROR: pinned chonk inputs contain no flow directories at $dir"
    return 1
  fi
  if (( ${#missing[@]} > 0 )); then
    echo_stderr "ERROR: pinned chonk inputs missing files:"
    printf '  %s\n' "${missing[@]}" >&2
    return 1
  fi
}

# Validates that $dir is a pinned chonk inputs tree for the current hash:
# at least one flow folder, each containing ivc-inputs.msgpack, plus marker.
function check_pinned_chonk_inputs {
  local dir=${1:-$(pinned_chonk_inputs_dir)}
  check_chonk_inputs_shape "$dir"
  local marker="$dir/$PINNED_CHONK_MARKER_FILE"
  if [[ -f "$marker" ]] && [[ "$(<"$marker")" != "$pinned_chonk_inputs_hash" ]]; then
    echo_stderr "ERROR: pinned chonk inputs at $dir were downloaded for hash $(<"$marker"), expected ${pinned_chonk_inputs_hash}"
    return 1
  fi
}

function ensure_pinned_chonk_inputs {
  local dest=${1:-$(pinned_chonk_inputs_dir)}
  local lock_dir lock_file
  lock_dir="$PINNED_CHONK_STATE_DIR/locks"
  mkdir -p "$lock_dir"
  lock_file="$lock_dir/$(printf '%s' "$dest" | sha256sum | cut -c1-16).lock"

  (
    flock 9
    if [[ -f "$dest/$PINNED_CHONK_MARKER_FILE" ]] && check_pinned_chonk_inputs "$dest" >/dev/null 2>&1; then
      return 0
    fi
    download_pinned_chonk_inputs "$dest"
    check_pinned_chonk_inputs "$dest"
  ) 9>"$lock_file"
}

function create_normalized_chonk_inputs_tarball {
  local src=${1:?src dir required}
  local tarball=${2:?tarball path required}
  local state_dir plain_tar
  mkdir -p "$(dirname "$tarball")"
  state_dir="$(make_pinned_chonk_state_tmpdir package)"
  plain_tar="$state_dir/bb-chonk-inputs.tar"

  if ! tar --sort=name \
           --mtime='UTC 1970-01-01' \
           --owner=0 \
           --group=0 \
           --numeric-owner \
           --mode='u+rw,go+r-w,a+X' \
           --exclude='./chonk-inputs-manifest.json' \
           --exclude="./$PINNED_CHONK_MARKER_FILE" \
           -cf "$plain_tar" \
           -C "$src" .; then
    rm -rf "$state_dir"
    return 1
  fi
  if ! gzip -n -c "$plain_tar" > "$tarball"; then
    rm -rf "$state_dir"
    return 1
  fi
  rm -rf "$state_dir"
}

function assert_chonk_inputs_object_exists {
  local hash=${1:?hash required}
  if [[ "${CHONK_INPUTS_UPLOAD_DRY_RUN:-0}" == "1" ]]; then
    return 0
  fi
  local url
  url="$(pinned_chonk_inputs_url "$hash")"
  if ! curl -sSfI "$url" >/dev/null; then
    echo_stderr "ERROR: uploaded chonk inputs artifact is not visible at ${url}"
    return 1
  fi
}

# Compresses $src into a tarball, uploads to S3 under the new hash prefix,
# rewrites the hash file. No-op when
# the regenerated tarball hashes to the existing pinned value.
# Echoes the resulting hash prefix to stdout.
function upload_and_pin_chonk_inputs {
  local src=${1:?src dir required}
  local state_dir tarball
  check_chonk_inputs_shape "$src"
  state_dir="$(make_pinned_chonk_state_tmpdir upload)"
  tarball="$state_dir/bb-chonk-inputs.tar.gz"

  echo_stderr "Packaging chonk inputs from $src ..."
  if ! create_normalized_chonk_inputs_tarball "$src" "$tarball"; then
    rm -rf "$state_dir"
    return 1
  fi

  local full_hash hash_prefix
  if ! full_hash=$(sha256sum "$tarball" | awk '{print $1}'); then
    rm -rf "$state_dir"
    return 1
  fi
  hash_prefix="${full_hash:0:$PINNED_CHONK_HASH_LENGTH}"

  if [[ "$hash_prefix" == "${pinned_chonk_inputs_hash}" ]]; then
    echo_stderr "Regenerated inputs hash to ${hash_prefix}; matches current pin. No upload."
    echo "$hash_prefix"
    rm -rf "$state_dir"
    return 0
  fi

  local s3_uri
  s3_uri="$(pinned_chonk_inputs_s3_uri "$hash_prefix")"
  if [[ "${CHONK_INPUTS_UPLOAD_DRY_RUN:-0}" == "1" ]]; then
    echo_stderr "Dry-run: would upload new chonk inputs to ${s3_uri}"
  else
    echo_stderr "Uploading new chonk inputs to ${s3_uri} ..."
    if ! aws s3 cp "$tarball" "$s3_uri"; then
      rm -rf "$state_dir"
      return 1
    fi
  fi
  if ! assert_chonk_inputs_object_exists "$hash_prefix"; then
    rm -rf "$state_dir"
    return 1
  fi

  echo_stderr "Pinned chonk inputs: ${pinned_chonk_inputs_hash} -> ${hash_prefix}"
  if ! update_pinned_chonk_inputs_hash "$hash_prefix"; then
    rm -rf "$state_dir"
    return 1
  fi
  echo "$hash_prefix"
  rm -rf "$state_dir"
}

export -f pinned_chonk_inputs_url pinned_chonk_inputs_s3_uri pinned_chonk_inputs_dir chonk_capture_dir \
          make_pinned_chonk_state_tmpdir list_chonk_input_flow_dirs \
          list_pinned_chonk_input_flows pinned_chonk_input_flow_dir \
          write_pinned_chonk_inputs_marker \
          reset_pinned_chonk_state_subdir create_normalized_chonk_inputs_tarball \
          assert_chonk_inputs_object_exists check_chonk_inputs_shape \
          is_pinned_chonk_hash read_pinned_chonk_inputs_hash update_pinned_chonk_inputs_hash \
          download_pinned_chonk_inputs check_pinned_chonk_inputs \
          ensure_pinned_chonk_inputs \
          upload_and_pin_chonk_inputs
