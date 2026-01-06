#!/usr/bin/env bash
source $(git rev-parse --show-toplevel)/ci3/source_bootstrap

# To run bb we need a crs.
# Download ignition up front to ensure no race conditions at runtime.
# 2^25 points + 1 because the first is the generator, *64 bytes per point, -1 because Range is inclusive.
# We make the file read only to ensure no test can attempt to grow it any larger. 2^25 is already huge...
# TODO: Make bb just download and append/overwrite required range, then it becomes idempotent.
function build {
  crs_path=$HOME/.bb-crs
  crs_size=$((2**25+1))
  crs_size_bytes=$((crs_size*64))
  g1=$crs_path/bn254_g1.dat
  g2=$crs_path/bn254_g2.dat
  # stat -c%s is Linux-only, use stat -f%z on macOS
  local g1_size=0
  if [ -f "$g1" ]; then
    if [[ "$(uname)" == "Darwin" ]]; then
      g1_size=$(stat -f%z "$g1")
    else
      g1_size=$(stat -c%s "$g1")
    fi
  fi
  if [ ! -f "$g1" ] || [ $g1_size -lt $crs_size_bytes ]; then
    echo "Downloading crs of size: ${crs_size} ($((crs_size_bytes/(1024*1024)))MB)"
    mkdir -p $crs_path
    curl -s -H "Range: bytes=0-$((crs_size_bytes-1))" -o $g1 \
      https://crs.aztec.network/g1.dat
    chmod a-w $crs_path/bn254_g1.dat
  fi
  if [ ! -f "$g2" ]; then
    curl -s https://crs.aztec.network/g2.dat -o $g2
  fi

  # TODO: This grumpkin CRS in S3 still has the 28 byte header on it. Remove.
  # And if we ever need more than transcript00.dat, concatenate to single file like we did with bn254 above.
  crs_size=$((2**18))
  crs_size_bytes=$((crs_size*64))
  gg1=$crs_path/grumpkin_g1.flat.dat
  local gg1_size=0
  if [ -f "$gg1" ]; then
    if [[ "$(uname)" == "Darwin" ]]; then
      gg1_size=$(stat -f%z "$gg1")
    else
      gg1_size=$(stat -c%s "$gg1")
    fi
  fi
  if [ ! -f "$gg1" ] || [ $gg1_size -lt $crs_size_bytes ]; then
    echo "Downloading grumpkin crs of size: ${crs_size} ($((crs_size_bytes/(1024*1024)))MB)"
    curl -s -H "Range: bytes=0-$((crs_size_bytes-1))" -o $gg1 \
      https://crs.aztec.network/grumpkin_g1.dat
  fi
}

case "$cmd" in
  "")
    build
    ;;
  *)
    default_cmd_handler "$@"
    ;;
esac
