---
sidebar_position: 2
title: How to Run a Sequencer Node
description: A comprehensive guide to setting up and running an Aztec Sequencer node on testnet, including infrastructure requirements, configuration options, and troubleshooting tips.
keywords:
  [
    aztec,
    sequencer,
    node,
    blockchain,
    L2,
    scaling,
    ethereum,
    validator,
    setup,
    tutorial,
  ]
tags:
  - sequencer
  - node
  - tutorial
  - infrastructure
---

## Background

This guide covers the steps required to run a sequencer node on the Aztec network.

The Aztec sequencer node is critical infrastructure responsible for ordering transactions and producing blocks.

The sequencer node performs three key actions:

1. Assembles unprocessed transactions and proposes the next block
2. Attests to correct execution of transactions in proposed blocks (when part of the sequencer committee)
3. Submits successfully attested blocks to L1

Sequencer nodes bundle transactions into blocks while checking constraints like gas limits, block size, and validity. Before publication, blocks must be validated by a committee of sequencer nodes who re-execute public transactions and verify private function proofs. Committee members attest to validity by signing the block header. Once sufficient attestations are collected (two-thirds of the committee plus one), the block can be submitted to L1.

The archiver component complements this process by maintaining historical chain data. It continuously monitors L1 for new blocks, processes them, and maintains a synchronized view of the chain state. This includes managing contract data, transaction logs, and L1-to-L2 messages, making it essential for network synchronization and data availability.

## Prerequisites

Minimum hardware requirements:

- 2 core / 4 vCPU (released in 2015 or later)
- 16 GB RAM
- 1TB NVMe SSD
- 25 Mbps network connection

Please note that these requirements are subject to change as the network throughput increases.

This guide assumes you are using a standard Linux distribution (Debian or Ubuntu).

### Required Software

- Docker and the Aztec toolchain installed via aztec-up (see the [getting started section](../../index.md))
- Docker Compose ([installation guide](https://docs.docker.com/compose/install/))
- Access to L1 node endpoints (execution and consensus clients). See [Eth Docker's guide](https://ethdocker.com/Usage/QuickStart) if you need to set these up.

## Configure the Sequencer

Setting up a sequencer involves configuring keys, environment variables, and Docker Compose.

### Setup Steps

1. Define private keys and accounts for sequencer duties
2. Configure node settings via environment variables
3. Enable auto-update and auto-restart functionality
4. Deploy with Docker Compose

First, create the directory structure for sequencer data storage:

```sh
mkdir -p aztec-sequencer/keys aztec-sequencer/data
cd aztec-sequencer
touch .env
```

### Define Private Keys and Accounts

Sequencers require private keys to identify themselves as valid proposers or attesters. Configure these through a keystore file.

Create a `keystore.json` file in your `aztec-sequencer/keys` folder:

```json
{
  "schemaVersion": 1,
  "validators": [
    {
      "attester": ["ETH_PRIVATE_KEY_0"],
      "publisher": ["ETH_PRIVATE_KEY_1"],
      "coinbase": "ETH_ADDRESS_2",
      "feeRecipient": "AZTEC_ADDRESS_0"
    }
  ]
}
```

The keystore defines keys and addresses for sequencer operation:

- `attester`: Private key for signing block proposals and attestations. The corresponding Ethereum address identifies the sequencer.
- `publisher`: Private key for sending block proposals to L1. Defaults to attester key if not set.
- `coinbase`: Ethereum address receiving L1 rewards and fees. Defaults to attester address if not set.
- `feeRecipient`: Aztec address receiving unburnt transaction fees from blocks.

Replace the placeholder values with your actual keys and addresses.

:::warning

Because the publisher posts block proposals to L1, the account needs to be funded with ETH. Ensure the account holds at least 0.1 ETH during operation of the sequencer to avoid being slashed.

:::

### Node Configuration

Required environment variables:

- `DATA_DIRECTORY`: the folder where the data of the sequencer is stored
- `KEY_STORE_DIRECTORY`: can be a path to the file or directory where keystores are located. In our case it is the path to the folder containing the `keystore.json` file created above
- `LOG_LEVEL`: the desired level of logging for the sequencer. It defaults to `INFO`.
- `ETHEREUM_HOSTS`: The execution RPC endpoints
- `L1_CONSENSUS_HOST_URLS`: The consensus RPC endpoints
- `P2P_IP`: The IP address of this sequencer
- `P2P_PORT`: The port that P2P communication happens on
- `AZTEC_PORT`: The port that the sequencer node API is exposed on

Add the following to your `.env` file (using default ports 8080 and 40400):

```sh
DATA_DIRECTORY=./data
KEY_STORE_DIRECTORY=./keys
LOG_LEVEL=info
ETHEREUM_HOSTS=<your L1 execution endpoint, or a comma separated list if you have multiple>
L1_CONSENSUS_HOST_URLS=<your L1 consensus endpoint, or a comma separated list if you have multiple>
P2P_IP=<your external IP address>
P2P_PORT=40400
AZTEC_PORT=8080
```

:::tip
You MUST forward ports for P2P connectivity. Configure your router to forward both UDP and TCP traffic on the port specified by `P2P_PORT` to your local IP address.

To find your public IP address, run: `curl ipv4.icanhazip.com`
:::

### Enable Auto-Update and Auto-Restart

The sequencer's auto-update functionality is critical for network coordination. This background module enables:

- Configuration updates across all nodes
- Automated image updates via controlled shutdowns
- Rapid hot-fix deployment
- Coordinated resets after governance upgrades

**Important**: Do NOT set `AUTO_UPDATE_URL` or `AUTO_UPDATE` environment variables. These must use their default values for proper operation.

Since Docker Compose doesn't respect pull policies on container restarts, install Watchtower for automatic updates:

```sh
docker run -d \
  --name watchtower \
  -v /var/run/docker.sock:/var/run/docker.sock \
  containrrr/watchtower
```

### Deploy with Docker Compose

Create a `docker-compose.yml` file in your `aztec-sequencer` directory:

```yaml
services:
  aztec-sequencer:
    image: "aztecprotocol/aztec:latest"
    container_name: "aztec-sequencer"
    ports:
      - ${AZTEC_PORT}:${AZTEC_PORT}
      - ${P2P_PORT}:${P2P_PORT}
      - ${P2P_PORT}:${P2P_PORT}/udp
    volumes:
      - ${DATA_DIRECTORY}:/var/lib/data
      - ${KEY_STORE_DIRECTORY}:/var/lib/keystore
    environment:
      KEY_STORE_DIRECTORY: /var/lib/keystore
      DATA_DIRECTORY: /var/lib/data
      LOG_LEVEL: ${LOG_LEVEL}
      ETHEREUM_HOSTS: ${ETHEREUM_HOSTS}
      L1_CONSENSUS_HOST_URLS: ${L1_CONSENSUS_HOST_URLS}
      P2P_IP: ${P2P_IP}
      P2P_PORT: ${P2P_PORT}
      AZTEC_PORT: ${AZTEC_PORT}
    entrypoint: >-
      node
      --no-warnings
      /usr/src/yarn-project/aztec/dest/bin/index.js
      start
      --node
      --archiver
      --sequencer
      --network testnet
    networks:
      - aztec
    restart: always

networks:
  aztec:
    name: aztec
```

**Note**: This configuration includes only essential settings. The `--network testnet` flag applies network-specific defaults. See the [CLI reference](../../reference/cli_reference.md) for all available options.

Start the sequencer:

```sh
docker compose up -d
```

## Verification

To verify your sequencer is running correctly:

1. Check the current sync status (this may take a few minutes):

```sh
curl -s -X POST -H 'Content-Type: application/json' \
-d '{"jsonrpc":"2.0","method":"node_getL2Tips","params":[],"id":67}' \
http://localhost:8080 | jq -r ".result.proven.number"
```

Compare the output with block explorers like [Aztec Scan](https://aztecscan.xyz/) or [Aztec Explorer](https://aztecexplorer.xyz/).

2. View sequencer logs:

```sh
docker compose logs -f aztec-sequencer
```

3. Check node status:

```sh
curl http://localhost:8080/status
```

## Troubleshooting

### Common Issues

**Port forwarding not working:**

- Verify your external IP address matches the `P2P_IP` setting
- Check firewall rules on your router and local machine
- Test connectivity using: `nc -zv <your-ip> <p2p-port>`

**Sequencer not syncing:**

- Check L1 endpoint connectivity
- Verify both execution and consensus clients are fully synced
- Review logs for specific error messages

**Keystore issues:**

- Ensure keystore.json is properly formatted
- Verify private keys are valid Ethereum private keys
- Check file permissions on the keys directory

**Docker issues:**

- Ensure Docker and Docker Compose are up to date
- Check disk space availability
- Verify container has sufficient resources

## Join the Sequencer Set

After setting up your node, you must request to be added to the sequencer set.

Complete the onboarding process at [testnet.aztec.network](https://testnet.aztec.network) using zkPassport.

## Next Steps

- Monitor your sequencer's performance and attestation rate
- Join the [Aztec Discord](https://discord.gg/aztec) for operator support
- Review the [Governance and Proposal Process](../../creating_and_voting_on_proposals.md) guide
- Consider implementing monitoring and alerting for production deployments
