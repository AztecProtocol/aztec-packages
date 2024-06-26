#!/bin/bash
set -e

cd $(dirname $0)

export NUM_NODES=${1:-10}

gomplate -f docker-compose-template.yml > docker-compose.yml

rm -rf ./data
~/github/cometbft/build/cometbft testnet --v $NUM_NODES --o ./data
cd ./data
for ((i=0; i<$NUM_NODES; ++i)); do
    f=node$i/config/genesis.json
    # jq '.consensus_params.block.max_bytes = "1048576"' "$f" > tmp.$$.json && mv tmp.$$.json "$f"
    # jq '.consensus_params.block.max_bytes = "1300000"' "$f" > tmp.$$.json && mv tmp.$$.json "$f"
    # jq '.consensus_params.block.max_bytes = "2097152"' "$f" > tmp.$$.json && mv tmp.$$.json "$f"
    jq '.consensus_params.block.max_bytes = "4194304"' "$f" > tmp.$$.json && mv tmp.$$.json "$f"
    # jq '.consensus_params.block.max_bytes = "8388608"' "$f" > tmp.$$.json && mv tmp.$$.json "$f"
    mkdir node${i}_app
done

# General node config.
for ((i=0; i<$NUM_NODES; ++i)); do
    f=node$i/config/config.toml
    sed -i -e "s/^max_txs_bytes\s*=.*/max_txs_bytes = 134217728/" "$f"
    sed -i -e 's/^timeout_propose\s*=.*/timeout_propose = "10s"/' "$f"
    # sed -i -e 's/^timeout_propose_delta\s*=.*/timeout_propose_delta = "5s"/' "$f"
    # sed -i -e 's/^timeout_vote\s*=.*/timeout_vote = "5s"/' "$f"
    # sed -i -e 's/^timeout_vote_delta\s*=.*/timeout_vote_delta = "2s"/' "$f"

    # Don't think we ever want this. Just delays next block?
    # sed -i -e 's/^timeout_commit\s*=.*/timeout_commit = "10s"/' "$f"

    # Only keep the first 5 nodes as persistent nodes. i.e. all nodes will connect to these nodes.
    sed -i -e '/persistent_peers/ s/\(persistent_peers = "\([^,]*,\)\{4\}[^,]*\),.*/\1"/' "$f"

    # Boost p2p.
    # sed -i -e "s/^max_packet_msg_payload_size\s*=.*/max_packet_msg_payload_size = 10240/" "$f"
    # sed -i -e "s/^send_rate\s*=.*/send_rate = 51200000/" "$f"
    # sed -i -e "s/^recv_rate\s*=.*/recv_rate = 51200000/" "$f"
    sed -i -e "s/^discard_abci_responses\s*=.*/discard_abci_responses = true/" "$f"
done

# Persistent nodes. Increase peer count to support many nodes.
for ((i=0; i<5; ++i)); do
    f=node$i/config/config.toml
    # These numbers are related. Inbound needs to be > than outbound by approx 4x.
    sed -i -e 's/^max_num_inbound_peers\s*=.*/max_num_inbound_peers = 200/' "$f"
    sed -i -e 's/^max_num_outbound_peers\s*=.*/max_num_outbound_peers = 20/' "$f"
done

# Non persistent nodes. Reduce peer count to save bandwidth.
for ((i=5; i<$NUM_NODES; ++i)); do
    f=node$i/config/config.toml
    # These numbers are related. Inbound needs to be > than outbound by approx 4x.
    sed -i -e 's/^max_num_inbound_peers\s*=.*/max_num_inbound_peers = 20/' "$f"
    sed -i -e 's/^max_num_outbound_peers\s*=.*/max_num_outbound_peers = 5/' "$f"
done

cd ..

# First copy data to root volume.
tar -czf - data | ssh consensus 'rm -rf data && tar -xzf - -C ~'

# Then mount local disks and spread data over them.
ssh consensus <<EOF
for i in 1 2 3 4; do
  if ! mountpoint -q /mnt/\$i; then
    echo Mounting \$i
    sudo mkfs.ext4 /dev/nvme\${i}n1
    sudo mkdir -p /mnt/\$i
    sudo mount /dev/nvme\${i}n1 /mnt/\$i
    sudo chown ubuntu:ubuntu /mnt/\$i
  else
    echo Already mounted \$i, cleaning...
    rm -rf /mnt/\$i/*
  fi
done

for ((i=0; i<$NUM_NODES; ++i)); do
    target=\$(((i % 4) + 1))
    mv ./data/node\$i /mnt/\$target
    mv ./data/node\${i}_app /mnt/\$target
done
EOF