#!/usr/bin/env bash

curl -s https://install.aztec.network | NON_INTERACTIVE=1 bash -s
docker compose -f $HOME/.aztec/docker-compose.local-network.yml pull

if ! grep -q "PXE_URL" ~/.bashrc; then
    echo "export PXE_URL=https://\$CODESPACE_NAME-8080.preview.\$GITHUB_CODESPACES_PORT_FORWARDING_DOMAIN" >> ~/.bashrc
fi


corepack enable
