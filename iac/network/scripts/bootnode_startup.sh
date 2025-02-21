#!/bin/bash

set -e  # Exit immediately if a command exits with a non-zero status

# Update system packages
echo "Updating system packages..."
sudo apt update -y && sudo apt upgrade -y

# Install Docker
echo "Installing Docker..."
sudo apt install -y docker.io
sudo systemctl start docker
sudo systemctl enable docker
sudo usermod -aG docker $USER

# Ensure Docker starts on reboot
echo "Configuring Docker to start on boot..."
sudo systemctl enable docker.service
sudo systemctl enable containerd.service

LOCATION="${LOCATION}"

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
fi

docker run hello-world




echo "Setup complete!"






# # Define Docker container name and image
# CONTAINER_NAME="bootnode"
# DOCKER_IMAGE="aztecprotocol"  # Change this to your Docker image

# # Pass environment variables received from Terraform
# ENV_VAR_1="${env_var_1}"  # Value passed from Terraform
# ENV_VAR_2="${env_var_2}"

# # Create systemd service for Docker container with environment variables
# echo "Creating systemd service to ensure container runs on startup with environment variables..."
# cat <<EOF | sudo tee /etc/systemd/system/docker-container.service
# [Unit]
# Description=Docker Container Service
# Requires=docker.service
# After=docker.service

# [Service]
# Restart=always
# Environment="MY_ENV_VAR_1=${ENV_VAR_1}"
# Environment="MY_ENV_VAR_2=${ENV_VAR_2}"
# ExecStart=/usr/bin/docker run --rm -p 80:80 --name $CONTAINER_NAME -e MY_ENV_VAR_1=$MY_ENV_VAR_1 -e MY_ENV_VAR_2=$MY_ENV_VAR_2 $DOCKER_IMAGE
# ExecStop=/usr/bin/docker stop $CONTAINER_NAME

# [Install]
# WantedBy=multi-user.target
# EOF

# # Reload systemd and enable the service
# echo "Enabling and starting systemd service..."
# sudo systemctl daemon-reload
# sudo systemctl enable docker-container.service
# sudo systemctl restart docker-container.service
