set -eux -o pipefail

# Get the directory where this script is located
SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"

source "$SCRIPT_DIR/utils.sh"

# Required vars for running on CI to keep track of previous runs
if [ "$LOCAL" != "true" ]; then
  check_env_var "STATE_S3_BASE_PATH"
  check_env_var "STATE_S3_KEY"
fi

# Check all required environment variables for both local and remote running
check_env_var "AZTEC_VERSION"
check_env_var "NODE_URL"
check_env_var "L1_URL"
check_env_var "FAUCET_URL"

print_header "Setting initial state"
source "$SCRIPT_DIR/set_initial_state.sh"

print_header "Installing Aztec"
source "$SCRIPT_DIR/install_aztec.sh"

print_header "Setting SponsoredFPC payment method"
source "$SCRIPT_DIR/set_sponsored_fpc_address.sh"

print_header "Registering existing accounts from state"
source "$SCRIPT_DIR/register_existing_accounts_from_state.sh"

print_header "Creating new accounts"
source "$SCRIPT_DIR/create_new_accounts.sh"

print_header "Deploying token contracts"
source "$SCRIPT_DIR/deploy_token_contracts.sh"

print_header "Deploying AMM contracts"
source "$SCRIPT_DIR/deploy_amm_contracts.sh"

print_header "Deploying NFT contracts"
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

# TODO (ek): Re-enable this when this flow has succeeded reliably
# print_header "Uploading new state to S3"
# source "$SCRIPT_DIR/upload_state.sh"

print_header "Tests have completed successfully"
source "$SCRIPT_DIR/print_stats.sh"
