#!/bin/bash
set -euo pipefail

cd "$(dirname "$0")/../../.."

echo "Running deployment script tests..."
forge test --match-path "test/script/*.t.sol" -vvvv
