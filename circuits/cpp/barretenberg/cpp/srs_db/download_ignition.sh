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
set -e

mkdir -p ignition
cd ignition
mkdir -p monomial
cd monomial
NUM=${1:-19}

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
  curl https://aztec-ignition.s3-eu-west-2.amazonaws.com/MAIN%20IGNITION/monomial/transcript${1}.dat > transcript${1}.dat
}

for TRANSCRIPT in $(seq 0 $NUM); do
  NUM=$(printf %02d $TRANSCRIPT)
  if [ -f checksums ]; then
    checksum $NUM && continue
    download $NUM
    checksum $NUM || exit 1
  else
    download $NUM
  fi
done