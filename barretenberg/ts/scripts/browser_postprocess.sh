#!/usr/bin/env bash

DIR="./dest/browser"

# Remove all files under **/node/**
for node_file in $(find $DIR -type d -path "./*/node*"); do
    rm -rf $node_file;
done

# Replace all **/node/** imports and exports with **/browser/**.
# Cross-platform sed -i: BSD (macOS) requires an explicit empty backup arg;
# GNU (Linux) doesn't. Detect once and pick the right form.
if sed --version >/dev/null 2>&1; then
  SED_INPLACE=( sed -i )
else
  SED_INPLACE=( sed -i '' )
fi
find "$DIR" -type f -name "*.js" -exec "${SED_INPLACE[@]}" -E \
  's/(import|export)(.*)from(.*)\/node\//\1\2from\3\/browser\//g' {} +
# base64 on macOS doesn't have -w0 (always single-line); GNU base64 needs it
# to avoid wrapping at 76 chars and breaking the data: URL.
if base64 --help 2>&1 | grep -q -- '-w'; then
  BASE64_FLAGS=( -w0 )
else
  BASE64_FLAGS=()
fi

# Provide default wasm files as gziped base64 strings
for file in barretenberg barretenberg-threads; do
    GZIP_FILE=${DIR}/barretenberg_wasm/$file.wasm.gz
    BB_BASE64=$(cat ${GZIP_FILE} | base64 "${BASE64_FLAGS[@]}")
    printf "const barretenberg = \"data:application/gzip;base64,$BB_BASE64\"; \\nexport default barretenberg;" > $DIR/barretenberg_wasm/fetch_code/browser/$file.js
    rm $GZIP_FILE
done
