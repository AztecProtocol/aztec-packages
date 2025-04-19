function check_env_var() {
  local var_name="$1"
  if [[ -z "${!var_name+x}" ]]; then
    echo "ERROR: Required environment variable $var_name is not set" >&2
    return 1
  fi
}

function print_header() {
  local message="$1"
  local length=${#message}
  local border=$(printf '═%.0s' $(seq 1 $((length + 8))))

  echo "╔${border}╗"
  echo "║    ${message}    ║"
  echo "╚${border}╝"
}

function select_random_account() {
  local accounts_json="$1"  # Pass in JSON string of accounts

  local accounts_count=$(echo "$accounts_json" | jq -s 'length')
  local random_index=$((RANDOM % accounts_count))
  local random_account=$(echo "$accounts_json" | jq -s ".[$random_index]")
  local random_account_address=$(echo "$random_account" | jq -r '.address')

  # Output result
  echo "$random_account_address"
}

function get_contract_address() {
  grep "Contract deployed at" | awk '{print $4}'
}

function get_simulation_result() {
  grep "Simulation result:" | awk '{print $3}' | sed 's/n$//'
}

function assert_eq() {
  if ! [[ "$1" == "$2" ]]; then
    echo "Assertion failed: Expected '$1' but got '$2'"
    exit 1
  fi
}

function assert_lt() {
  if ! [[ "$1" -lt "$2" ]]; then
    echo "Assertion failed: Expected '$1' to be less than '$2'"
    exit 1
  fi
}

function add_to_state() {
  local json_path="$1"
  local new_data="$2"

  jq --argjson new_data "$new_data" "$json_path += \$new_data" state.json > tmp.json &&
  mv tmp.json state.json
}

function get_private_balance() {
  local token_address="$1"
  local user_address="$2"

  local balance=$(aztec-wallet \
    simulate balance_of_private \
    -ca "$token_address" \
    --args "$user_address" \
    -f "$user_address" \
    | get_simulation_result)

  echo "$balance"
}

function get_public_balance() {
  local token_address="$1"
  local user_address="$2"
  local from_address="$3"

  local balance=$(aztec-wallet \
    simulate balance_of_public \
    -ca "$token_address" \
    --args "$user_address" \
    -f "$from_address" \
    | get_simulation_result)

  echo "$balance"
}

function get_fee_method() {
    if [ "$1" = "true" ]; then
        echo "$SPONSORED_FPC_PAYMENT_METHOD"
    else
        echo ""
    fi
}

function get_prover() {
  if [[ "$1" = "true" || "$1" = "1" ]]; then
    echo "-p native"
  else
    echo "-p none"
  fi
}

function aztec-wallet() {
  command aztec-wallet --node-url "$NODE_URL" "$@"
}
export -f aztec-wallet
