#!/usr/bin/env bash
set -euo pipefail

# Script to deploy L1 contracts via Forge with environment variable configuration
# For rollup-only deployments (upgrades), see deploy_rollup_for_upgrade.sh
# This script wraps the Forge deployment and provides --help documentation

show_help() {
  cat << EOF
Usage: $(basename "$0") [OPTIONS] OUTPUT_FILE

Deploy Aztec L1 contracts to Ethereum using Forge.
Configuration is passed via environment variables.

Arguments:
  OUTPUT_FILE              Path to write deployment addresses JSON (required)

Options:
  -h, --help              Show this help message
  --rpc-url URL           Ethereum RPC URL (required)
  --private-key KEY       Deployer private key with 0x prefix (required)
  --broadcast             Broadcast transactions (otherwise dry-run)
  -v, -vv, -vvv, -vvvv    Verbosity level for forge output

Environment Variables:
  NETWORK=<string>                      Network name (local, devnet, testnet, mainnet, etc.)
                                        Default: local

  Deployment Options:
  REAL_VERIFIER=<bool>              Use mock verifier instead of real verifier
                                        Default: true
  FUND_REWARD_DISTRIBUTOR=<bool>        Fund reward distributor with initial tokens
                                        Default: true
  EXISTING_STAKING_ASSET_ADDRESS=<addr> Use existing ERC20 for staking (0x... address)
                                        Default: deploy new TestERC20
  REWARD_DISTRIBUTOR_FUNDING=<uint>     Amount to fund reward distributor
                                        Default: checkpointReward * 200_000

  Genesis Configuration:
  VK_TREE_ROOT=<bytes32>                VK tree root for genesis
  PROTOCOL_CONTRACTS_HASH=<bytes32>     Protocol contracts hash for genesis
  GENESIS_ARCHIVE_ROOT=<bytes32>        Genesis archive root

  Timing Configuration:
  AZTEC_SLOT_DURATION=<uint>            L2 slot duration in seconds
                                        Default: 36
  AZTEC_EPOCH_DURATION=<uint>           L2 slots per epoch
                                        Default: 32
  AZTEC_TARGET_COMMITTEE_SIZE=<uint>    Target committee size
                                        Default: 48
  AZTEC_LAG_IN_EPOCHS_FOR_VALIDATOR_SET=<uint>
                                        Lag for validator set in epochs
                                        Default: 2
  AZTEC_LAG_IN_EPOCHS_FOR_RANDAO=<uint> Lag for randao in epochs
                                        Default: 2
  AZTEC_PROOF_SUBMISSION_EPOCHS=<uint>  Proof submission window in epochs
                                        Default: 1

  GSE Configuration:
  AZTEC_ACTIVATION_THRESHOLD=<uint>     Validator deposit amount (wei)
                                        Default: 100e18
  AZTEC_EJECTION_THRESHOLD=<uint>       Minimum validator stake (wei)
                                        Default: 50e18
  AZTEC_LOCAL_EJECTION_THRESHOLD=<uint> Local ejection threshold (wei)
                                        Default: 98e18

  Slashing Configuration:
  AZTEC_SLASHER_FLAVOR=<string>         Slasher type: none, tally, empire
                                        Default: tally
  AZTEC_SLASHING_ROUND_SIZE_IN_EPOCHS=<uint>
                                        Slashing round size in epochs
                                        Default: 4
  AZTEC_SLASHING_OFFSET_IN_ROUNDS=<uint>
                                        Slashing offset in rounds
                                        Default: 2 (for tally), 0 (for others)
  AZTEC_SLASHING_LIFETIME_IN_ROUNDS=<uint>
                                        Slashing lifetime in rounds
                                        Default: 5
  AZTEC_SLASHING_EXECUTION_DELAY_IN_ROUNDS=<uint>
                                        Execution delay in rounds
                                        Default: 0
  AZTEC_SLASHING_VETOER=<address>       Slashing vetoer address
                                        Default: 0x0
  AZTEC_SLASHING_DISABLE_DURATION=<uint>
                                        Disable duration in seconds
                                        Default: 5 days (432000)
  AZTEC_SLASH_AMOUNT_SMALL=<uint>       Small slash amount (wei)
                                        Default: 10e18
  AZTEC_SLASH_AMOUNT_MEDIUM=<uint>      Medium slash amount (wei)
                                        Default: 20e18
  AZTEC_SLASH_AMOUNT_LARGE=<uint>       Large slash amount (wei)
                                        Default: 50e18

  Fee Configuration:
  AZTEC_MANA_TARGET=<uint>              Mana target
                                        Default: 100_000_000
  AZTEC_PROVING_COST_PER_MANA=<uint>    Proving cost per mana (wei)
                                        Default: 100
  AZTEC_EXIT_DELAY_SECONDS=<uint>       Exit delay in seconds
                                        Default: 2 days (172800)

  Governance Configuration:
  AZTEC_GOVERNANCE_PROPOSER_QUORUM=<uint>
                                        Governance proposer quorum
                                        Default: roundSize/2 + 1
  AZTEC_GOVERNANCE_PROPOSER_ROUND_SIZE=<uint>
                                        Governance proposer round size
                                        Default: 300

  ZK Passport Configuration:
  ZKPASSPORT_DOMAIN=<string>            ZKPassport domain
                                        Default: sequencer.alpha-testnet.aztec.network
  ZKPASSPORT_SCOPE=<string>             ZKPassport scope
                                        Default: personhood

  Initial Validators:
  INITIAL_VALIDATORS=<json>             JSON array of initial validators
                                        Format: [{"attester":"0x...","withdrawer":"0x...",
                                                  "privateKey":"123...",
                                                  "publicKeyInG2":{"x0":"...","x1":"...","y0":"...","y1":"..."}}]
                                        Default: [] (no initial validators)

Examples:
  # Deploy to local anvil with defaults
  $(basename "$0") ./deployment.json \\
    --rpc-url http://localhost:8545 \\
    --private-key 0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80 \\
    --broadcast

  # Deploy to devnet with custom timing
  NETWORK=devnet \\
  AZTEC_SLOT_DURATION=24 \\
  AZTEC_EPOCH_DURATION=32 \\
  $(basename "$0") ./deployment.json \\
    --rpc-url \$DEVNET_RPC_URL \\
    --private-key \$DEPLOYER_KEY \\
    --broadcast -vvv

  # Deploy with custom GSE thresholds
  AZTEC_ACTIVATION_THRESHOLD=200000000000000000000 \\
  AZTEC_EJECTION_THRESHOLD=50000000000000000000 \\
  $(basename "$0") ./deployment.json \\
    --rpc-url \$RPC_URL \\
    --private-key \$PRIVATE_KEY \\
    --broadcast

See Also:
  - DeploymentConfiguration.sol for full list of environment variables
  - DeployL1Contracts.s.sol for deployment logic
EOF
}

# Parse arguments
OUTPUT_FILE=""
FORGE_ARGS=()

while [[ $# -gt 0 ]]; do
  case $1 in
    -h|--help)
      show_help
      exit 0
      ;;
    --rpc-url|--private-key|--broadcast|-v|-vv|-vvv|-vvvv)
      FORGE_ARGS+=("$1")
      if [[ "$1" == "--rpc-url" || "$1" == "--private-key" ]]; then
        shift
        FORGE_ARGS+=("$1")
      fi
      shift
      ;;
    *)
      if [[ -z "$OUTPUT_FILE" ]]; then
        OUTPUT_FILE="$1"
      else
        echo "Error: Unknown argument: $1" >&2
        echo "Run '$(basename "$0") --help' for usage information" >&2
        exit 1
      fi
      shift
      ;;
  esac
done

# Validate required arguments
if [[ -z "$OUTPUT_FILE" ]]; then
  echo "Error: OUTPUT_FILE is required" >&2
  echo "Run '$(basename "$0") --help' for usage information" >&2
  exit 1
fi

# Check if --rpc-url is provided
if [[ ! " ${FORGE_ARGS[@]} " =~ " --rpc-url " ]]; then
  echo "Error: --rpc-url is required" >&2
  exit 1
fi

# Check if --private-key is provided
if [[ ! " ${FORGE_ARGS[@]} " =~ " --private-key " ]]; then
  echo "Error: --private-key is required" >&2
  exit 1
fi

# Get the directory of this script
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
L1_CONTRACTS_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"

# Run forge script with env vars passed through
cd "$L1_CONTRACTS_DIR"
exec forge script \
  script/deploy/rollup/DeployL1Contracts.s.sol \
  --sig "run(string)" \
  "$OUTPUT_FILE" \
  "${FORGE_ARGS[@]}"
