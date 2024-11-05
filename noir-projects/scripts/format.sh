#!/usr/bin/env bash
set -eu

cd $(dirname "$0")/../

nargo fmt --program-dir ./aztec-nr
nargo fmt --program-dir ./noir-contracts
nargo fmt --program-dir ./noir-protocol-circuits
nargo fmt --program-dir ./mock-protocol-circuits
