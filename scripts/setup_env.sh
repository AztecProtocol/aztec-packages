#!/bin/bash

# Setup environment variables
echo "Setting up environment variables..."
echo FORCE_COLOR=1 >> $GITHUB_ENV
echo DOCKER_HOST=ssh://build-instance-$1.aztecprotocol.com >> $GITHUB_ENV

# Docker login
echo "Logging in to Docker..."
echo $2 | docker login -u aztecprotocolci --password-stdin

# Configure SSH
echo "Configuring SSH..."
mkdir -p ~/.ssh
echo $3 | base64 -d > ~/.ssh/build_instance_key
chmod 600 ~/.ssh/build_instance_key
cat > ~/.ssh/config <<EOF
IdentityFile ~/.ssh/build_instance_key
StrictHostKeyChecking no
User ubuntu
EOF

# Install earthly
wget -q https://github.com/earthly/earthly/releases/latest/download/earthly-linux-amd64 -O /usr/local/bin/earthly
chmod +x /usr/local/bin/earthly
echo EARTHLY_CONFIG=$(dirname $(realpath $0))/earthly-config.yml >> $GITHUB_ENV
echo alias earthly=earthly -P --disable-remote-registry-proxy --use-inline-cache --save-inline-cache >> $BASH_ENV