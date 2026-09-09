#!/usr/bin/env bash

DIR="./dest/browser"

# Remove all files under **/node/**
for node_file in $(find $DIR -type d -path "./*/node*"); do
    rm -rf $node_file;
done

# Replace all **/node/** imports and exports with **/browser/**
find "$DIR" -type f -name "*.js" -exec sed -i 's/\(import\|export\)\(.*\)from\(.*\)\/node\//\1\2from\3\/browser\//g' {} +
