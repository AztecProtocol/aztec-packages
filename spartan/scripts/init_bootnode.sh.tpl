#!/bin/bash

# Install Google Cloud Ops Agent
curl -sSO https://dl.google.com/cloudagents/add-google-cloud-ops-agent-repo.sh
sudo bash add-google-cloud-ops-agent-repo.sh --also-install

# Create Cloud Ops Agent config file
cat <<EOF | sudo tee /etc/google-cloud-ops-agent/config.yaml
logging:
  receivers:
    docker-logs:
      type: files
      include_paths:
        - "/var/lib/docker/containers/*/*.log"
  service:
    pipelines:
      default_pipeline:
        receivers: [docker-logs]
EOF

# Restart agent
sudo systemctl restart google-cloud-ops-agent

export STATIC_IP="${STATIC_IP}"
export PEER_ID_PRIVATE_KEY="${PEER_ID_PRIVATE_KEY}"
export DATA_STORE_MAP_SIZE="${DATA_STORE_MAP_SIZE}"

echo "Static Public IP: $STATIC_IP"
echo "Data Store Map Size: $DATA_STORE_MAP_SIZE"

# Install Docker if not installed
if ! command -v docker &> /dev/null
then
  echo "Docker not found. Installing..."
  apt-get update && apt-get install -y docker.io
  systemctl start docker
  systemctl enable docker
fi

mkdir -p /data

bash -i <(curl -s https://install.aztec.network)

export VERSION=latest

aztec start --p2p-bootstrap \
  --p2pBootstrap.udpAnnounceAddress "$STATIC_IP":40400 \
  --p2pBootstrap.peerIdPrivateKey "$PEER_ID_PRIVATE_KEY" \
  --p2pBootstrap.minPeerCount 10 \
  --p2pBootstrap.maxPeerCount 10000 \
  --p2pBootstrap.udpListenAddress "$STATIC_IP":40400 \
  --p2pBootstrap.dataStoreMapSizeKB "$DATA_STORE_MAP_SIZE" \
  --data-directory /data

