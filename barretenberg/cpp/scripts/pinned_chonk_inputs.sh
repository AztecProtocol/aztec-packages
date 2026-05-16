#!/usr/bin/env bash
# Single source of truth for the pinned chonk IVC inputs S3 hash.
#
# All scripts that download or update the pinned chonk inputs MUST source
# this file rather than holding their own copy of the hash. The hash is
# updated automatically by the `/update-chonk-inputs` CI workflow (see
# .github/workflows/update-chonk-inputs.yml), which calls
# `upload_and_pin_chonk_inputs` below.
source $(git rev-parse --show-toplevel)/ci3/source

# Updated automatically by upload_and_pin_chonk_inputs. Do not hand-edit.
pinned_chonk_inputs_hash="aafbeabe"

PINNED_CHONK_INPUTS_SCRIPT="${BASH_SOURCE[0]}"
PINNED_CHONK_S3_BUCKET="s3://aztec-ci-artifacts/protocol"
PINNED_CHONK_BASE_URL="https://aztec-ci-artifacts.s3.us-east-2.amazonaws.com/protocol"

function pinned_chonk_inputs_url {
  echo "${PINNED_CHONK_BASE_URL}/bb-chonk-inputs-${pinned_chonk_inputs_hash}.tar.gz"
}

# Canonical extraction directory used by every downstream script
# (build_bench, ci_benchmark_ivc_flows.sh, bench_hardware_concurrency.sh, ...).
function pinned_chonk_inputs_dir {
  echo "$(git rev-parse --show-toplevel)/yarn-project/end-to-end/example-app-ivc-inputs-out"
}

# Downloads and extracts the pinned tarball into $dest. Wipes $dest first.
# Fails noisily on download or extract errors.
function download_pinned_chonk_inputs {
  local dest=${1:?dest dir required}
  local url
  url=$(pinned_chonk_inputs_url)
  echo "Downloading pinned chonk inputs ${pinned_chonk_inputs_hash} from ${url}"
  rm -rf "$dest"
  mkdir -p "$dest"
  local tarball
  tarball=$(mktemp --suffix=.tar.gz)
  trap "rm -f '$tarball'" RETURN
  if ! curl -sSf "$url" -o "$tarball"; then
    echo_stderr "ERROR: failed to download pinned chonk inputs from $url"
    echo_stderr "pinned_chonk_inputs_hash='${pinned_chonk_inputs_hash}' may be stale."
    echo_stderr "Run /update-chonk-inputs on the PR to regenerate."
    return 1
  fi
  if ! tar -xzf "$tarball" -C "$dest"; then
    echo_stderr "ERROR: failed to extract pinned chonk inputs tarball"
    return 1
  fi
}

# Validates that $dir looks like a populated chonk inputs tree:
# at least one flow folder, each containing ivc-inputs.msgpack.
function check_pinned_chonk_inputs {
  local dir=${1:-$(pinned_chonk_inputs_dir)}
  if [[ ! -d "$dir" ]] || [[ -z "$(ls -A "$dir" 2>/dev/null)" ]]; then
    echo_stderr "ERROR: pinned chonk inputs not present at $dir"
    return 1
  fi
  local missing=()
  for flow_dir in "$dir"/*/; do
    [[ -d "$flow_dir" ]] || continue
    [[ -f "$flow_dir/ivc-inputs.msgpack" ]] || missing+=("${flow_dir}ivc-inputs.msgpack")
  done
  if (( ${#missing[@]} > 0 )); then
    echo_stderr "ERROR: pinned chonk inputs missing files:"
    printf '  %s\n' "${missing[@]}" >&2
    return 1
  fi
}

# Compresses $src into a tarball, uploads to S3 under the new short hash,
# rewrites pinned_chonk_inputs_hash in this script (in-place sed). No-op when
# the regenerated tarball hashes to the existing pinned value.
# Echoes the resulting short hash to stdout.
function upload_and_pin_chonk_inputs {
  local src=${1:?src dir required}
  local tarball
  tarball=$(mktemp --suffix=.tar.gz)
  trap "rm -f '$tarball'" RETURN

  echo_stderr "Packaging chonk inputs from $src ..."
  tar -czf "$tarball" -C "$src" .

  local full_hash short_hash
  full_hash=$(sha256sum "$tarball" | awk '{print $1}')
  short_hash="${full_hash:0:8}"

  if [[ "$short_hash" == "${pinned_chonk_inputs_hash}" ]]; then
    echo_stderr "Regenerated inputs hash to ${short_hash}; matches current pin. No upload."
    echo "$short_hash"
    return 0
  fi

  local s3_uri="${PINNED_CHONK_S3_BUCKET}/bb-chonk-inputs-${short_hash}.tar.gz"
  echo_stderr "Uploading new chonk inputs to ${s3_uri} ..."
  aws s3 cp "$tarball" "$s3_uri"

  sed -i "s/^pinned_chonk_inputs_hash=\"[^\"]*\"\$/pinned_chonk_inputs_hash=\"${short_hash}\"/" \
    "$PINNED_CHONK_INPUTS_SCRIPT"

  echo_stderr "Pinned chonk inputs: ${pinned_chonk_inputs_hash} -> ${short_hash}"
  # Refresh the in-memory variable so subsequent callers see the new value.
  pinned_chonk_inputs_hash="${short_hash}"
  echo "$short_hash"
}

export -f pinned_chonk_inputs_url pinned_chonk_inputs_dir \
          download_pinned_chonk_inputs check_pinned_chonk_inputs \
          upload_and_pin_chonk_inputs
