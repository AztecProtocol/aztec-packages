#!/usr/bin/env bash
set -eu

cd $(dirname "$0")/../

nargo check --program-dir ./aztec-nr
nargo check --program-dir ./noir-contracts
nargo check --program-dir ./noir-protocol-circuits
nargo check --program-dir ./mock-protocol-circuits
