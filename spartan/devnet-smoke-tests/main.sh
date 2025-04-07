set -eu -o pipefail

# Get the directory where this script is located
SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"

# This script assumes the presence of state.json, which is structured something like this { "accounts": [], "contracts": [] }

check_env_var() {
  local var_name="$1"
  if [[ -z "${!var_name+x}" ]]; then
    echo "ERROR: Required environment variable $var_name is not set" >&2
    return 1
  fi
}

# Check all required environment variables
check_env_var "STATE_S3_BASE_PATH"
check_env_var "AZTEC_VERSION"
check_env_var "NODE_URL"
check_env_var "L1_URL"
check_env_var "FAUCET_URL"
check_env_var "SPONSORED_FPC_ADDRESS"

SPONSORED_FPC_PAYMENT_METHOD="--payment method=fpc-sponsored,fpc=$SPONSORED_FPC_ADDRESS"

function select_random_account() {
  local accounts_json="$1"  # Pass in JSON string of accounts

  # Count accounts
  local accounts_count=$(echo "$accounts_json" | jq -s 'length')

  # Select random index
  local random_index=$((RANDOM % accounts_count))

  # Extract the account at random index
  local random_account=$(echo "$accounts_json" | jq -s ".[$random_index]")

  # Extract address
  local random_account_address=$(echo "$random_account" | jq -r '.address')

  # Output result
  echo "$random_account_address"
}

source "$SCRIPT_DIR/install_aztec.sh"

source "$SCRIPT_DIR/register_existing_accounts_from_state.sh"

source "$SCRIPT_DIR/create_new_accounts.sh"

source "$SCRIPT_DIR/deploy_token_contracts.sh"

# source ./deploy_amm_contracts.sh

# source ./deploy_nft_contracts.sh

# source ./register_senders.sh

# source ./process_token_contracts.sh

# source ./process_amm_contracts.sh

# source ./process_nft_contracts.sh

# source ./set_inited_to_true.sh
