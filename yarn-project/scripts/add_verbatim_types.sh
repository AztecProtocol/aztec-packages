#!/bin/bash

while true; do
  declare -A processed
  processed=()
  lines=$(yarn tsc -b 2>&1 | grep -E "error TS(1484|1205)" | awk -F'[:,()]' '{print $1 " " $2 " " $3}');

  [ -z "$lines" ] && exit

  while IFS=' ' read -r file line N; do
    key="$file:$line"
    if [[ -n "${processed[$key]}" ]]; then
      continue
    fi
    processed[$key]=1
    # echo $file $line $N
    echo -n "$file: "
    sed -n "${line}p" "$file"
    sed -i "${line}s/^\(.\{$((N-1))\}\)/\1type /" "$file"
    echo -n "$file: "
    sed -n "${line}p" "$file"
    echo
  done <<< "$lines"
done
