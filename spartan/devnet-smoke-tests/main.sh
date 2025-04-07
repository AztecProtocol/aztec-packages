set -eu -o pipefail

# Get the directory where this script is located
SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"

# This script assumes the presence of state.json, which is structured something like this { "accounts": [], "contracts": [] }

source "$SCRIPT_DIR/utils.sh"

# Check all required environment variables
check_env_var "STATE_S3_BASE_PATH"
check_env_var "AZTEC_VERSION"
check_env_var "NODE_URL"
check_env_var "L1_URL"
check_env_var "FAUCET_URL"
check_env_var "SPONSORED_FPC_ADDRESS"

SPONSORED_FPC_PAYMENT_METHOD="--payment method=fpc-sponsored,fpc=$SPONSORED_FPC_ADDRESS"

print_header "Installing Aztec"
source "$SCRIPT_DIR/install_aztec.sh"

print_header "Registering existing accounts from state"
source "$SCRIPT_DIR/register_existing_accounts_from_state.sh"

print_header "Creating new accounts"
source "$SCRIPT_DIR/create_new_accounts.sh"

print_header "Deploying token contracts"
source "$SCRIPT_DIR/deploy_token_contracts.sh"

print_header "Deploying AMM contracts"
source "$SCRIPT_DIR/deploy_amm_contracts.sh"

print_header "Deploying nft contracts"
source "$SCRIPT_DIR/deploy_nft_contracts.sh"

print_header "Registering senders"
source "$SCRIPT_DIR/register_senders.sh"

print_header "Processing token contracts"
source "$SCRIPT_DIR/process_token_contracts.sh"

print_header "Processing AMM contracts"
source "$SCRIPT_DIR/process_amm_contracts.sh"

print_header "Processing NFT contracts"
source "$SCRIPT_DIR/process_nft_contracts.sh"

print_header "Marking setup of new accounts / contracts to be completed"
source "$SCRIPT_DIR/mark_setup_completed.sh"
