#!/usr/bin/env bash
set -eu

cd $(dirname "$0")/../

nargo check --program-dir ./aztec-nr --silence-warnings
nargo check --program-dir ./noir-contracts --silence-warnings
nargo check --program-dir ./noir-protocol-circuits --silence-warnings
nargo check --program-dir ./mock-protocol-circuits --silence-warnings
