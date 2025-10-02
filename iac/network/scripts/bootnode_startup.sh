#!/usr/bin/env bash

set -e

# Installs required dependencies for running an Aztec Bootnode, creates a start script for starting the bootnode and a systemd entry

# From terraform
LOCATION="${LOCATION}"
SSH_USER="${SSH_USER}"
PUBLIC_IP="${PUBLIC_IP}"
P2P_PORT="${P2P_PORT}"
PEER_ID_PRIVATE_KEY="${PEER_ID_PRIVATE_KEY}"
DATA_STORE_MAP_SIZE_KB="${DATA_STORE_MAP_SIZE_KB}"
L1_CHAIN_ID="${L1_CHAIN_ID}"
NETWORK_NAME="${NETWORK_NAME}"
TAG="${TAG}"
OTEL_COLLECTOR_URL="${OTEL_COLLECTOR_URL}"
REGION="${REGION}"

# Update system packages
echo "Updating system packages..."
sudo apt update -y && sudo apt upgrade -y

# Ensure we have jq and tee
sudo apt install -y jq coreutils

# Install Docker
echo "Installing Docker..."
sudo apt install -y docker.io
sudo systemctl start docker
sudo systemctl enable docker
sudo usermod -aG docker $SSH_USER


# Configure docker log rotation
DOCKER_CONFIG="/etc/docker/daemon.json"

# If it exists, update, otherwise create new
if [ -f "$DOCKER_CONFIG" ]; then
  jq '."log-driver" = "json-file" | ."log-opts" += {"max-size": "10m", "max-file": "5"}' "$DOCKER_CONFIG" > /tmp/daemon.json && sudo mv /tmp/daemon.json "$DOCKER_CONFIG"
else
  LOG_CONFIG='{
    "log-driver": "json-file",
    "log-opts": {
      "max-size": "10m",
      "max-file": "5"
    }
  }'
  echo "$LOG_CONFIG" | sudo tee "$DOCKER_CONFIG" > /dev/null
fi

# Restart docker for changes to take effect
sudo systemctl restart docker

# Ensure Docker starts on reboot
echo "Configuring Docker to start on boot..."
sudo systemctl enable docker.service
sudo systemctl enable containerd.service

if [ "$LOCATION" = "GCP" ]; then
# Install Google Cloud Ops Agent for logging
echo "Installing Google Cloud Ops Agent..."
curl -sSO https://dl.google.com/cloudagents/add-google-cloud-ops-agent-repo.sh
sudo bash add-google-cloud-ops-agent-repo.sh --also-install

# Cloud Logging Configuration (Ops Agent)
echo "Configuring Cloud Logging with Ops Agent..."
cat <<EOF | sudo tee /etc/google-cloud-ops-agent/config.yaml
logging:
  receivers:
    docker_logs:
      type: files
      include_paths:
        - /var/lib/docker/containers/*/*.log

  service:
    pipelines:
      default_pipeline:
        receivers: [docker_logs]


metrics:
  receivers:
    hostmetrics:
      type: hostmetrics
  service:
    pipelines:
      default_pipeline:
        receivers: [hostmetrics]
EOF

# Enable and start Ops Agent
sudo systemctl enable google-cloud-ops-agent
sudo systemctl restart google-cloud-ops-agent
elif [ "$LOCATION" = "AWS" ]; then
  echo "Placeholder for AWS instances"
fi

# Create a start script to be run by systemd
CONTAINER_NAME="aztec-bootnode"
REPO=aztecprotocol
IMAGE=aztec
LOG_LEVEL=verbose
OTEL_RESOURCE_ATTRIBUTES="region=${REGION},ip=${PUBLIC_IP},network=${NETWORK_NAME}"

cat <<EOF > /home/$SSH_USER/tag.sh
#!/usr/bin/env bash
export TAG=$TAG
EOF
chmod +x /home/$SSH_USER/tag.sh

if [[ -n "$OTEL_COLLECTOR_URL" ]]; then
  export OTEL_EXPORTER_OTLP_METRICS_ENDPOINT="$OTEL_COLLECTOR_URL/v1/metrics"
fi

cat << 'EOF' > /home/$SSH_USER/start.sh
#!/usr/bin/env bash
source ./tag.sh
echo "Starting bootnode container..."
JSON=$(curl -s http://static.aztec.network/$NETWORK_NAME/bootnodes.json)
export BOOTSTRAP_NODES=$(echo "$JSON" | jq -r '.bootnodes | join(",")')
echo "Bootnode enrs: $BOOTSTRAP_NODES"
docker system prune -f
docker pull $REPO/$IMAGE:$TAG
docker run \
 --restart=always \
 --name $CONTAINER_NAME \
 --volume $DATA_DIRECTORY:$DATA_DIRECTORY \
 --publish $AZTEC_PORT:$AZTEC_PORT \
 --publish $P2P_PORT:$P2P_PORT/udp \
 --env DATA_DIRECTORY \
 --env DATA_STORE_MAP_SIZE_KB \
 --env P2P_IP \
 --env P2P_PORT \
 --env PEER_ID_PRIVATE_KEY \
 --env L1_CHAIN_ID \
 --env AZTEC_PORT \
 --env BOOTSTRAP_NODES \
 --env LOG_LEVEL \
 --env OTEL_EXPORTER_OTLP_METRICS_ENDPOINT \
 --env OTEL_RESOURCE_ATTRIBUTES \
 $REPO/$IMAGE:$TAG start --p2p-bootstrap
EOF
chmod +x /home/$SSH_USER/start.sh


DATA_DIRECTORY=/home/$SSH_USER/data

P2P_IP="$PUBLIC_IP"

mkdir -p $DATA_DIRECTORY

# Create systemd service for bootnode
echo "Creating systemd service to ensure container runs on startup with environment variables..."
cat <<EOF | sudo tee /etc/systemd/system/aztec-bootnode.service
[Unit]
Description=Aztec Bootnode Service
Requires=docker.service
After=docker.service

[Service]
Restart=always
RestartSec=10
WorkingDirectory=/home/$SSH_USER
Environment="PEER_ID_PRIVATE_KEY=$PEER_ID_PRIVATE_KEY"
Environment="DATA_STORE_MAP_SIZE_KB=$DATA_STORE_MAP_SIZE_KB"
Environment="DATA_DIRECTORY=$DATA_DIRECTORY"
Environment="P2P_IP=$P2P_IP"
Environment="P2P_PORT=$P2P_PORT"
Environment="L1_CHAIN_ID=$L1_CHAIN_ID"
Environment="AZTEC_PORT=80"
Environment="LOG_LEVEL=$LOG_LEVEL"
Environment="NETWORK_NAME=$NETWORK_NAME"
Environment="REPO=$REPO"
Environment="IMAGE=$IMAGE"
Environment="TAG=$TAG"
Environment="CONTAINER_NAME=$CONTAINER_NAME"
Environment="OTEL_EXPORTER_OTLP_METRICS_ENDPOINT=$OTEL_EXPORTER_OTLP_METRICS_ENDPOINT"
Environment="OTEL_RESOURCE_ATTRIBUTES=$OTEL_RESOURCE_ATTRIBUTES"
ExecStartPre=-/usr/bin/docker rm -f $CONTAINER_NAME
ExecStart=/home/$SSH_USER/start.sh
ExecStop=/usr/bin/docker stop $CONTAINER_NAME

[Install]
WantedBy=multi-user.target
EOF

# Reload systemd and enable the service
echo "Enabling and starting aztec-bootnode service..."
sudo systemctl daemon-reload
sudo systemctl enable aztec-bootnode.service
sudo systemctl restart aztec-bootnode.service
echo "Startup Completed!"
