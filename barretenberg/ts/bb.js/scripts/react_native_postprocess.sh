#!/usr/bin/env bash
# The React Native build: the browser build's rewrite, to the react-native directories.
DIR="./dest/react-native"

for node_dir in $(find $DIR -type d \( -name node -o -name browser \)); do
  rm -rf $node_dir
done

# Replace all **/node/** imports and exports with **/react-native/**
find "$DIR" -type f -name "*.js" -exec sed -i 's/\(import\|export\)\(.*\)from\(.*\)\/node\//\1\2from\3\/react-native\//g' {} +
