#! /bin/bash

lighthouse vc \
    --datadir="/data" \
    --beacon-nodes=$ETH_BEACON_URL \
    --testnet-dir=/genesis \
    --init-slashing-protection \
    --suggested-fee-recipient="0xff00000000000000000000000000000000c0ffee" \
    --debug-level=debug