#!/usr/bin/env bash

set -e

# This script should be run from the root of iac/network. It will destroy all VMs for the provided network
# By default, only the VMs are destroyed. Use the optional flags to delete other per-network bootnode resources.

# Usage: ./scripts/destroy_bootnodes.sh <network-name> <gcp-project-id> [--destroy-ip] [--destroy-private-key] [--dry-run]

usage() {
    echo "Usage: ./scripts/destroy_bootnodes.sh <network-name> <gcp-project-id> [--destroy-ip] [--destroy-private-key] [--dry-run]"
    echo ""
    echo "Options:"
    echo "  --destroy-ip           Delete the reserved static IP addresses and remove them from Terraform state"
    echo "  --destroy-private-key  Delete the per-region bootnode private-key secrets"
    echo "  --dry-run              Show the planned VM destroy and print other destructive commands without running them"
}

print_command() {
    printf '+'
    printf ' %q' "$@"
    printf '\n'
}

run_destructive() {
    print_command "$@"

    if [[ "$DRY_RUN" != "true" ]]; then
        "$@"
    fi
}

DESTROY_IP=false
DESTROY_PRIVATE_KEY=false
DRY_RUN=false
POSITIONAL_ARGS=()

while [[ $# -gt 0 ]]; do
    case "$1" in
        --destroy-ip)
            DESTROY_IP=true
            shift
            ;;
        --destroy-private-key)
            DESTROY_PRIVATE_KEY=true
            shift
            ;;
        --dry-run)
            DRY_RUN=true
            shift
            ;;
        -h | --help)
            usage
            exit 0
            ;;
        *)
            POSITIONAL_ARGS+=("$1")
            shift
            ;;
    esac
done

NETWORK_NAME=${POSITIONAL_ARGS[0]:-}
PROJECT_ID=${POSITIONAL_ARGS[1]:-}

if [[ ${#POSITIONAL_ARGS[@]} -gt 2 ]]; then
    echo "Unexpected arguments: ${POSITIONAL_ARGS[*]:2}"
    usage
    exit 1
fi

if [[ -z "$NETWORK_NAME" ]]; then
    echo "NETWORK_NAME is required"
    usage
    exit 1
fi

if [[ -z "$PROJECT_ID" ]]; then
    echo "PROJECT_ID is required"
    usage
    exit 1
fi

if [[ "$DESTROY_IP" == "true" || "$DESTROY_PRIVATE_KEY" == "true" ]] && ! command -v gcloud >/dev/null 2>&1; then
    echo "gcloud is required when --destroy-ip or --destroy-private-key is used"
    exit 1
fi

# Not used, but valid numbers are required
P2P_PORT=40400
L1_CHAIN_ID=1
TAG=latest

ROOT=$(git rev-parse --show-toplevel)/iac/network

cd "$ROOT/bootnode/ip/gcp"

terraform init -reconfigure -backend-config="prefix=network/$NETWORK_NAME/bootnode/ip/gcp" >/dev/null

OUTPUT=$(terraform output -json ip_addresses)

echo "IP Addresses output: $OUTPUT"

GCP_REGIONS_ARRAY=()
GCP_IPS_ARRAY=()

while read -r REGION IP; do
    echo "IP: $IP is in region $REGION"

    GCP_REGIONS_ARRAY+=("$REGION")
    GCP_IPS_ARRAY+=("$IP")

done < <(echo "$OUTPUT" | jq -r 'to_entries | .[] | "\(.key) \(.value)"')

GCP_REGIONS_TF_ARG=$(jq --compact-output --null-input '$ARGS.positional' --args -- "${GCP_REGIONS_ARRAY[@]}")

# We need a valid JSON array of the correct length for the private keys, the contents are not used in a destroy
PRIVATE_KEYS_TF_ARG=$GCP_REGIONS_TF_ARG


echo "GCP_REGIONS: $GCP_REGIONS_TF_ARG"

cd "$ROOT"

BOOTNODE_START_SCRIPT="$ROOT/scripts/bootnode_startup.sh"

cd "$ROOT/bootnode/vm/gcp"

terraform init -reconfigure -backend-config="prefix=network/$NETWORK_NAME/bootnode/vm/gcp" >/dev/null

VM_TERRAFORM_ARGS=(
  -var="regions=$GCP_REGIONS_TF_ARG"
  -var="start_script=$BOOTNODE_START_SCRIPT"
  -var="network_name=$NETWORK_NAME"
  -var="peer_id_private_keys=$PRIVATE_KEYS_TF_ARG"
  -var="machine_type="
  -var="project_id=$PROJECT_ID"
  -var="p2p_port=$P2P_PORT"
  -var="l1_chain_id=$L1_CHAIN_ID"
  -var="image_tag=$TAG"
)

if [[ "$DRY_RUN" == "true" ]]; then
    terraform plan "${VM_TERRAFORM_ARGS[@]}" -destroy
else
    terraform apply "${VM_TERRAFORM_ARGS[@]}" --destroy
fi

if [[ "$DESTROY_IP" == "true" ]]; then
    cd "$ROOT/bootnode/ip/gcp"

    terraform init -reconfigure -backend-config="prefix=network/$NETWORK_NAME/bootnode/ip/gcp" >/dev/null

    for INDEX in "${!GCP_REGIONS_ARRAY[@]}"; do
        REGION=${GCP_REGIONS_ARRAY[$INDEX]}
        IP=${GCP_IPS_ARRAY[$INDEX]}
        ADDRESS_NAME="$NETWORK_NAME-bootnodes-$REGION"
        STATE_ADDRESS="module.ip.google_compute_address.static_ip[\"$REGION\"]"

        echo "Deleting static IP $ADDRESS_NAME ($IP) in $REGION"

        if DESCRIBE_OUTPUT=$(gcloud compute addresses describe "$ADDRESS_NAME" --region "$REGION" --project "$PROJECT_ID" 2>&1); then
            run_destructive gcloud compute addresses delete "$ADDRESS_NAME" --region "$REGION" --project "$PROJECT_ID" --quiet
        elif [[ "${DESCRIBE_OUTPUT,,}" == *"not found"* ]]; then
            echo "Static IP $ADDRESS_NAME was not found; removing Terraform state entry if present."
        else
            echo "$DESCRIBE_OUTPUT"
            exit 1
        fi

        if terraform state show "$STATE_ADDRESS" >/dev/null 2>&1; then
            run_destructive terraform state rm "$STATE_ADDRESS"
        else
            echo "Terraform state entry $STATE_ADDRESS not found; skipping state removal."
        fi
    done

    run_destructive terraform apply -auto-approve \
      -var="regions=[]" \
      -var="name=$NETWORK_NAME-bootnodes" \
      -var="project_id=$PROJECT_ID"
fi

if [[ "$DESTROY_PRIVATE_KEY" == "true" ]]; then
    for REGION in "${GCP_REGIONS_ARRAY[@]}"; do
        SECRET_NAME="$NETWORK_NAME-$REGION-bootnode-private-key"

        echo "Deleting secret $SECRET_NAME"

        if DESCRIBE_OUTPUT=$(gcloud secrets describe "$SECRET_NAME" --project "$PROJECT_ID" 2>&1); then
            run_destructive gcloud secrets delete "$SECRET_NAME" --project "$PROJECT_ID" --quiet
        elif [[ "${DESCRIBE_OUTPUT,,}" == *"not found"* ]]; then
            echo "Secret $SECRET_NAME was not found; skipping."
        else
            echo "$DESCRIBE_OUTPUT"
            exit 1
        fi
    done
fi
