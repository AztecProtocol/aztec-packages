#!/bin/bash
set -eu

BACKEND=${BACKEND:-bb}

nargo compile

# TODO: backend should automatically generate vk if necessary.
$BACKEND write_vk -b ./target/hello_world.json
$BACKEND contract -v ./target/vk