#!/usr/bin/env bash
set -eu

# To run bb we need a crs.
# Download ignition up front to ensure no race conditions at runtime.
# 2^25 points + 1 because the first is the generator, *32 bytes per compressed point, -1 because Range is inclusive.
# We make the file read only to ensure no test can attempt to grow it any larger. 2^25 is already huge...
# TODO: Make bb just download and append/overwrite required range, then it becomes idempotent.

# Primary CRS host (Cloudflare R2)
CRS_PRIMARY_HOST="https://crs.aztec-cdn.foundation"
# Fallback CRS host (AWS S3)
CRS_FALLBACK_HOST="https://crs.aztec-labs.com"

# Download with fallback and retries: try primary first, then fallback on failure
download_with_fallback() {
  local output="$1"
  local file="$2"
  local range_header="${3:-}"
  local max_retries=3

  local curl_args=(-s -f -o "$output")
  if [ -n "$range_header" ]; then
    curl_args+=(-H "Range: $range_header")
  fi

  for attempt in $(seq 1 $max_retries); do
    if curl "${curl_args[@]}" "${CRS_PRIMARY_HOST}/${file}" 2>/dev/null; then
      return 0
    fi
    echo "Primary CRS host failed (attempt $attempt/$max_retries), trying fallback..."
    if curl "${curl_args[@]}" "${CRS_FALLBACK_HOST}/${file}" 2>/dev/null; then
      return 0
    fi
    if [ "$attempt" -lt "$max_retries" ]; then
      echo "Both hosts failed, retrying in 5s..."
      sleep 5
    fi
  done
  echo "ERROR: Failed to download ${file} after $max_retries attempts"
  return 1
}

crs_path=$HOME/.bb-crs
crs_size=$((2**25+1))
crs_size_bytes=$((crs_size*32))
g1=$crs_path/bn254_g1_compressed.dat
g2=$crs_path/bn254_g2.dat
if [ ! -f "$g1" ] || [ $(stat -c%s "$g1") -lt $crs_size_bytes ]; then
  echo "Downloading compressed crs of size: ${crs_size} ($((crs_size_bytes/(1024*1024)))MB)"
  mkdir -p $crs_path
  download_with_fallback "$g1" "g1_compressed.dat" "bytes=0-$((crs_size_bytes-1))"
  chmod a-w "$g1"
fi
if [ ! -f "$g2" ]; then
  download_with_fallback "$g2" "g2.dat"
fi

# grumpkin_g1_v2.dat: regenerated after affine_element::from_compressed started rejecting
# non-canonical x coordinates, so it must match binaries built with that fix.
crs_size=$((2**18))
crs_size_bytes=$((crs_size*64))
gg1=$crs_path/grumpkin_g1_v2.flat.dat
if [ ! -f "$gg1" ] || [ $(stat -c%s "$gg1") -lt $crs_size_bytes ]; then
  echo "Downloading grumpkin crs of size: ${crs_size} ($((crs_size_bytes/(1024*1024)))MB)"
  download_with_fallback "$gg1" "grumpkin_g1_v2.dat" "bytes=0-$((crs_size_bytes-1))"
fi
