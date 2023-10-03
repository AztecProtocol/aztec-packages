#!/bin/sh
# Downloads the ignition trusted setup transcripts.
#
# See here for details of the contents of the transcript.dat files:
#  https://github.com/AztecProtocol/ignition-verification/blob/master/Transcript_spec.md
#
# To download all transcripts.
#  ./download_ignition.sh
#
# To download a range of transcripts, e.g. 0, 1 and 2.
#  ./download_ignition.sh 2
#
# If a checksums file is available, it will be used to validate if a download is required
# and also check the validity of the downloaded transcripts. If not the script downloads
# whatever is requested but does not check the validity of the downloads.
set -eu

mkdir -p ignition
cd ignition
mkdir -p monomial
cd monomial
NUM=${1:-19}
RANGE_START=${2:-}
RANGE_END=${3:-}
APPEND=${4:-"false"}

if command -v sha256sum > /dev/null; then
  SHASUM=sha256sum
else
  SHASUM="shasum -a 256"
fi

checksum() {
  grep transcript${1}.dat checksums | $SHASUM -c
  return $?
}

download() {
  # Initialize an empty variable for the Range header
  RANGE_HEADER=""
  
  # If both RANGE_START and RANGE_END are set, add them to the Range header
  if [ -n "$RANGE_START" ] && [ -n "$RANGE_END" ]; then
    RANGE_HEADER="-H Range:bytes=$RANGE_START-$RANGE_END"
  fi
  
  # Download the file
  if [ "$APPEND" = "true" ]; then
    curl $RANGE_HEADER https://aztec-ignition.s3-eu-west-2.amazonaws.com/MAIN%20IGNITION/monomial/transcript${1}.dat >> transcript${1}.dat
  else
    curl $RANGE_HEADER https://aztec-ignition.s3-eu-west-2.amazonaws.com/MAIN%20IGNITION/monomial/transcript${1}.dat > transcript${1}.dat
  fi
  
}

for TRANSCRIPT in $(seq 0 $NUM); do
  NUM=$(printf %02d $TRANSCRIPT)
  if [ -f checksums  ] && [ -z "$RANGE_START" ] && [ -z "$RANGE_END" ] ; then
    checksum $NUM && continue
    download $NUM
    checksum $NUM || exit 1
  else
    download $NUM
  fi
done
