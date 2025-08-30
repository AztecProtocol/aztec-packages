#!/bin/bash

# make sure we're in the directory where the script is located
cd "$(dirname "$0")"

find . -type d -name "state" -exec rm -rf {} +

