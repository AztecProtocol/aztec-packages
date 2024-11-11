#!/usr/bin/env bash

TYPE=$1
NAME=$2

curl -s install.aztec.network | NON_INTERACTIVE=1 bash -s
docker compose -f $HOME/.aztec/docker-compose.sandbox.yml pull

if ! grep -q "PXE_URL" ~/.bashrc; then
    echo "export PXE_URL=https://\$CODESPACE_NAME-8080.preview.\$GITHUB_CODESPACES_PORT_FORWARDING_DOMAIN" >> ~/.bashrc
fi


corepack enable

if [ "$TYPE" != "sandbox_only" ]; then
    source ~/.bashrc
    yes | npx aztec-app -t $TYPE -n $NAME -s
    mv $NAME/* $NAME/.* .
    rm -rf $NAME

    yarn

    npx -y playwright install --with-deps
    yarn add @aztec/builder
    yarn prep
fi
