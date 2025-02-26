#!/usr/bin/env bash

NETWORK_NAME=${1:-}
GCP_REGIONS=${2:-}
GCP_MACHINE_TYPE=${3:-}
STATIC_S3_BUCKET=${4:-}
L1_CHAIN_ID=${5:-}
PROJECT_ID=${6:-}

echo "NETWORK_NAME: $NETWORK_NAME"
echo "GCP_REGIONS: $GCP_REGIONS"

if [[ -z "$NETWORK_NAME" ]]; then
    echo "NETWORK_NAME is required"
    exit 1
fi

if [[ -z "$STATIC_S3_BUCKET" ]]; then
    echo "STATIC_S3_BUCKET is required"
    exit 1
fi

if [[ -z "$PROJECT_ID" ]]; then
    echo "PROJECT_ID is required"
    exit 1
fi


# Here we ensure the common stuff is created. This is common across all networks an includes
# 1. SSH key
# 2. Service account
# 3. Firewall rules

P2P_UDP_PORT=40400
P2P_TCP_PORT=40400
P2P_UDP_PORTS="[\"$P2P_UDP_PORT\"]"
P2P_TCP_PORTS="[\"$P2P_TCP_PORT\"]"

cd ./common/gcp

terraform init -backend-config="prefix=network/common"

terraform apply -var "ssh_user=aztec" \
  -var "ssh_secret_name=ssh-key-nodes" \
  -var "sa_account_id=service-acc-nodes" \
  -var "p2p_tcp_ports=$P2P_TCP_PORTS" \
  -var "p2p_udp_ports=$P2P_UDP_PORTS" \

echo $PWD
cd ../../ip/gcp

echo $PWD

ls -l

terraform init -backend-config="prefix=network/$NETWORK_NAME/ip/bootnode"

terraform apply -var="regions=$GCP_REGIONS" -var="name=$NETWORK_NAME-bootnodes"

# Output is in the form:
  # + ip_addresses = {
  #     + africa-south1        = (known after apply)
  #     + asia-east1           = (known after apply)
  #     + australia-southeast1 = (known after apply)
  #   }

OUTPUT=$(terraform output -json ip_addresses)

cd ../../

echo "We are here $PWD"

gcloud config set project $PROJECT_ID

GCP_PRIVATE_KEYS_ARRAY=()
GCP_REGIONS_ARRAY=()
ENR_ARRAY=()


while read -r REGION IP; do
    echo "Region: $REGION"
    echo "IP: $IP"

    SECRET_NAME="$NETWORK_NAME-$REGION-bootnode-private-key"
    PRIVATE_KEY=$(cd scripts && ./generate_private_key.sh)

    # Check if the secret exists
    EXISTING_SECRET=$(gcloud secrets describe "$SECRET_NAME" --format="value(name)" 2>/dev/null)

    if [[ -z "$EXISTING_SECRET" ]]; then
        echo "Secret '${SECRET_NAME}' does not exist. Creating it now..."
        # Create the secret
        gcloud secrets create "${SECRET_NAME}" --replication-policy="automatic"
        # Add the secret value
        echo -n "${PRIVATE_KEY}" | gcloud secrets versions add "${SECRET_NAME}" --data-file=-
        echo "Secret '${SECRET_NAME}' created successfully."
    else
        echo "Secret '${SECRET_NAME}' already exists. Skipping creation."
    fi

    PRIVATE_KEY=$(gcloud secrets versions access latest --secret="${SECRET_NAME}")

    # Now we can generate the enr
    UDP_ANNOUNCE="$IP:$P2P_UDP_PORT"
    ENR=$(cd scripts && ./generate_encoded_enr.sh "$PRIVATE_KEY" "$UDP_ANNOUNCE" "$L1_CHAIN_ID")

    echo "ENR: $ENR"

    GCP_PRIVATE_KEYS_ARRAY+=("$PRIVATE_KEY")
    GCP_REGIONS_ARRAY+=("$REGION")
    ENR_ARRAY+=("$ENR");

done < <(echo "$OUTPUT" | jq -r 'to_entries | .[] | "\(.key) \(.value)"')

BOOTNODE_START_SCRIPT="$PWD/scripts/bootnode_startup.sh"


PRIVATE_KEYS_JSON=$(jq --compact-output --null-input '$ARGS.positional' --args -- "${GCP_PRIVATE_KEYS_ARRAY[@]}")
GCP_REGIONS_JSON=$(jq --compact-output --null-input '$ARGS.positional' --args -- "${GCP_REGIONS_ARRAY[@]}")
ENR_JSON=$(jq --compact-output --null-input '$ARGS.positional' --args -- "${ENR_ARRAY[@]}")

echo "GCP_REGIONS_JSON: $GCP_REGIONS_JSON"
echo "ENR_JSON: $ENR_JSON"

cd ./bootnode/vm/gcp

FULL_ENR_JSON=$(jq -n --argjson enrs "$ENR_JSON" '{"bootnodes": $enrs}')

echo $FULL_ENR_JSON > ./enrs.json

aws s3 cp ./enrs.json $STATIC_S3_BUCKET/$NETWORK_NAME/bootnodes.json

rm ./enrs.json

terraform init -backend-config="prefix=network/$NETWORK_NAME/vm/bootnode"

terraform apply \
  -var="regions=$GCP_REGIONS_JSON" \
  -var="start_script=$BOOTNODE_START_SCRIPT" \
  -var="network_name=$NETWORK_NAME" \
  -var="peer_id_private_keys=$PRIVATE_KEYS_JSON" \
  -var="machine_type=$GCP_MACHINE_TYPE" \
  -var="project_id=$PROJECT_ID" \
  -var="p2p_udp_port=$P2P_UDP_PORT" \
  -var="l1_chain_id=$L1_CHAIN_ID"
