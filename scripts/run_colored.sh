#!/bin/bash
set -euo pipefail

# This could have been a BASH function - except cleaning background bash functions is a pain, don't respond to 'kill'
cmd="$1"
color="$2"
$cmd 2>&1 | while IFS= read -r line; do
  echo -e "${color}[$cmd]\e[0m $line"
done