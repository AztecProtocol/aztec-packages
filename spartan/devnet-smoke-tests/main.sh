set -eu -o pipefail

# This script assumes the presence of state.json, which is structured something like this { "accounts": [], "contracts": [] }

# TODO: Change this bucket to be more reflecting of what is actually being stored. Currently the runner doesn't
# have permissions in aws.
CONTRACT_S3_BUCKET=s3://aztec-ci-artifacts

NODE_URL=http://104.198.9.16:8080

source ./install_aztec.sh

source ./setup_initial_accounts.sh

source ./add_token_contracts.sh

source ./add_amm_contracts.sh

source ./add_nft_contracts.sh

source ./create_new_accounts.sh

source ./register_senders.sh

source ./process_token_contracts.sh

source ./process_amm_contracts.sh

source ./process_nft_contracts.sh

source ./set_inited_to_true.sh
