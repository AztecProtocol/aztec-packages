#! /bin/bash

if [ -n "$K8S_MODE" ] && [ "$K8S_MODE" = "true" ]; then
    cp -r /genesis-template /genesis &&
    mkdir -p /data/validators &&
    mkdir -p /data/secrets &&
    cp -r /validator-setup/keys/* /data/validators &&
    cp -r /validator-setup/secrets/* /data/secrets &&
    base64 -d /genesis/genesis-ssz > /genesis/genesis.ssz
else
    echo "making data folder"
    mkdir -p /data/validators
    mkdir -p /data/secrets
    cp -r /validator_setup/validators/* /data/validators
    cp -r /validator_setup/secrets/* /data/secrets
fi

echo "validators: $(ls -la /data/validators)"
echo "secrets: $(ls -la /data/secrets)"

echo $ETH_BEACON_URL

lighthouse vc \
    --datadir="/data" \
    --beacon-nodes=${ETH_BEACON_URL} \
    --testnet-dir=/genesis \
    --init-slashing-protection \
    --suggested-fee-recipient="0xff00000000000000000000000000000000c0ffee" \
    --log-format=JSON \
    --debug-level=debug