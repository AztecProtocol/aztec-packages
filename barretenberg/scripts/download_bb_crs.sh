#!/bin/bash
set -eu

# To run bb we need a crs.
# Download ignition up front to ensure no race conditions at runtime.
# 2^25 points + 1 because the first is the generator, *64 bytes per point, -1 because Range is inclusive.
# We make the file read only to ensure no test can attempt to grow it any larger. 2^25 is already huge...
# TODO: Make bb just download and append/overwrite required range, then it becomes idempotent.
crs_path=$HOME/.bb-crs
crs_size=$((2**25+1))
crs_size_bytes=$((crs_size*64))
g1=$crs_path/bn254_g1.dat
g2=$crs_path/bn254_g2.dat
if [ ! -f "$g1" ] || [ $(stat -c%s "$g1") -lt $crs_size_bytes ]; then
  echo "Downloading crs of size: ${crs_size} ($((crs_size_bytes/(1024*1024)))MB)"
  mkdir -p $crs_path
  curl -s -H "Range: bytes=0-$((crs_size_bytes-1))" -o $g1 \
    https://aztec-ignition.s3.amazonaws.com/MAIN%20IGNITION/flat/g1.dat
  chmod a-w $crs_path/bn254_g1.dat
fi
if [ ! -f "$g2" ]; then
  curl -s https://aztec-ignition.s3.amazonaws.com/MAIN%20IGNITION/flat/g2.dat -o $g2
fi

# TODO: This grumpkin CRS in S3 still has the 28 byte header on it. Remove.
# And if we ever need more than transcript00.dat, concatenate to single file like we did with bn254 above.
crs_size=$((2**18+1))
crs_size_bytes=$((crs_size*64))
gg1=$crs_path/grumpkin_g1.dat
if [ ! -f "$gg1" ] || [ $(stat -c%s "$gg1") -lt $crs_size_bytes ]; then
  echo "Downloading grumpkin crs of size: ${crs_size} ($((crs_size_bytes/(1024*1024)))MB)"
  curl -s -H "Range: bytes=28-$((28 + crs_size_bytes-1))" -o $gg1 \
    https://aztec-ignition.s3-eu-west-2.amazonaws.com/TEST%20GRUMPKIN/monomial/transcript00.dat
  echo $crs_size > $crs_path/grumpkin_size
fi