#!/bin/bash

DIR="./dest/browser"

# Remove all files under **/node/**
for node_file in $(find $DIR -type d -path "./*/node*"); do
    rm -rf $node_file;
done

# Replace all **/node/** imports and exports with **/browser/**
find "$DIR" -type f -name "*.js" -exec sed -i 's/\(import\|export\)\(.*\)from\(.*\)\/node\//\1\2from\3\/browser\//g' {} +

# Provide default wasm files as gziped base64 strings
for file in barretenberg barretenberg-threads; do
    GZIP_FILE=${DIR}/barretenberg_wasm/$file.wasm.gz
    BB_BASE64=$(cat ${GZIP_FILE} | base64 -w0)
    printf "const barretenberg = \"data:application/gzip;base64,$BB_BASE64\"; \\nexport default barretenberg;" > $DIR/barretenberg_wasm/fetch_code/browser/$file.js
    rm $GZIP_FILE
done
