---
sidebar_position: 3
title: Sequencer Management
description: Learn how to manage your sequencer on the Aztec network, including registration, keystore configuration, stake management, and status monitoring.
---

## Overview

This guide covers the lifecycle management of sequencers on the Aztec network, from keystore configuration and node setup through registration, ongoing operations, and eventual exit.

:::tip Prerequisites
Ensure you've reviewed and completed the [prerequisites](./prerequisites.md) for the Docker Compose method before proceeding.
:::

## Keystore Explanation

Sequencers require private keys to identify themselves as valid proposers and attesters. These keys are configured through a keystore file.

### Keystore Structure

The keystore file (`keystore.json`) uses the following structure:

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

### Field Descriptions

#### attester (required)

**Your sequencer's identity.** The Ethereum address derived from this private key uniquely identifies your sequencer in the network. This key is used to sign block proposals and attestations.

- **Format**: Array of Ethereum private keys
- **Purpose**: Signs attestations and proposals
- **Identity**: The corresponding Ethereum address is your sequencer's unique identifier

#### publisher (optional)

Private key for sending block proposals to L1. This account needs ETH funding to pay for L1 gas.

- **Format**: Array of Ethereum private keys
- **Default**: Uses attester key if not specified
- **Requirement**: Must be funded with at least 0.1 ETH to avoid slashing

:::tip
If you're using the same key for both attester and publisher, you can omit the `publisher` field entirely from your keystore.
:::

#### coinbase (optional)

Ethereum address receiving L1 rewards and fees.

- **Format**: Ethereum address
- **Default**: Uses attester address if not specified

#### feeRecipient (required)

Aztec address receiving unburnt transaction fees from blocks you produce.

- **Format**: Aztec address
- **Requirement**: Must be a deployed Aztec account

### Generating Keys

Before creating your keystore file, you'll need to generate the required keys.

#### Ethereum Private Keys

Generate Ethereum private keys using Foundry's `cast` tool:

```bash
# Generate a new wallet with a 24-word mnemonic
cast wallet new-mnemonic --words 24

# This outputs a mnemonic phrase, a derived address, and private key
# Save these securely - you'll need the private key for the keystore
```

At minimum, you need one Ethereum private key for the `attester` field. You can optionally generate a separate key for the `publisher` field.

#### Aztec Fee Recipient Address

Follow the [Getting Started on Testnet](../developers/getting_started_on_testnet.md#getting-started-on-testnet) guide to create and deploy an Aztec account, then use that account's address as your `feeRecipient`.

:::warning Save Account Recovery Information
When you create your Aztec account for the `feeRecipient`, make sure to save:
- The contract artifact version you used for deployment
- The deployment information (address, secret key, etc.)

This information is required to recover your account in the future and access your sequencer fees.
:::

## Setup with Docker Compose

### Step 1: Set Up Directory Structure

Create the directory structure for sequencer data storage:

```bash
mkdir -p aztec-sequencer/keys aztec-sequencer/data
cd aztec-sequencer
touch .env
```

### Step 2: Create Keystore File

Create a `keystore.json` file in your `aztec-sequencer/keys` folder with your generated keys:

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

Replace the placeholder values with your actual keys and addresses generated in the previous section.

:::warning
Because the publisher posts block proposals to L1, the account needs to be funded with ETH. Ensure the account holds at least 0.1 ETH during operation of the sequencer to avoid being slashed.
:::

### Step 3: Configure Environment Variables

Add the following to your `.env` file:

```bash
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
Find your public IP address with: `curl ipv4.icanhazip.com`
:::

### Step 4: Create Docker Compose File

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

:::note
This configuration includes only essential settings. The `--network testnet` flag applies network-specific defaults. See the [CLI reference](./reference/cli_reference.md) for all available configuration options.
:::

### Step 5: Start the Sequencer

Start the sequencer:

```bash
docker compose up -d
```

## Verification

Once your sequencer is running, verify it's working correctly:

### Check Sync Status

Check the current sync status (this may take a few minutes):

```bash
curl -s -X POST -H 'Content-Type: application/json' \
-d '{"jsonrpc":"2.0","method":"node_getL2Tips","params":[],"id":67}' \
http://localhost:8080 | jq -r ".result.proven.number"
```

Compare the output with block explorers like [Aztec Scan](https://aztecscan.xyz/) or [Aztec Explorer](https://aztecexplorer.xyz/).

### Check Node Status

```bash
curl http://localhost:8080/status
```

### View Logs

```bash
docker compose logs -f aztec-sequencer
```

## Registering a Sequencer

After your sequencer node is set up and running, you must register it with the network to join the sequencer set.

### Registration Process

Complete the onboarding process at [testnet.aztec.network](https://testnet.aztec.network) using zkPassport.

This process will:
1. Verify your identity using zkPassport
2. Register your sequencer's attester address with the network
3. Add you to the sequencer set once approved

:::note
Your sequencer's identity is determined by the attester address derived from the private key in your keystore file.
:::

## Monitoring Sequencer Status

You can query the status of any sequencer using the Rollup contract on L1.

### Prerequisites

- Foundry installed (`cast` command)
- Ethereum RPC endpoint
- Rollup contract address

### Get Rollup Contract Address

First, get the Registry contract address for your network, then query for the Rollup contract:

```bash
cast call <RegistryContractAddress> "getCanonicalRollup()" --rpc-url <YOUR_RPC_URL>
```

### Query Sequencer Status

Check the status of a specific sequencer:

```bash
cast call <RollupAddress> "getInfo(address)" <SequencerAddress> --rpc-url <YOUR_RPC_URL>
```

This returns (in order):
1. The sequencer's balance
2. Their `withdrawer` address
3. Their `proposer` address
4. Their current status

### Status Codes

| Status | Meaning |
| ------ | ------- |
| 0 | The sequencer is not in the sequencer set |
| 1 | The sequencer is currently active in the sequencer set |
| 2 | The sequencer is not active in the set (may have initiated withdrawal and is awaiting final exit) |
| 3 | The sequencer has completed their exit delay and can be exited from the sequencer set |

### List All Sequencers

Retrieve a list of all sequencers in the set:

```bash
cast call <RollupAddress> "getAttesters()" --rpc-url <YOUR_RPC_URL>
```

### Performance Monitoring

Monitor your sequencer's performance by tracking:
- Attestation rate (how many attestations you've successfully submitted)
- Proposal success rate (how many of your proposed blocks were accepted)
- Network participation metrics

## Exiting a Sequencer

:::warning
Information about the exit process will be added when the mechanism is finalized. Check the [Aztec Discord](https://discord.gg/aztec) for the latest information on exiting the sequencer set.
:::

Based on the status codes above, the exit process involves:
1. Initiating a withdrawal (status moves from 1 to 2)
2. Waiting for the exit delay period (status remains at 2)
3. Completing the exit once the delay has passed (status moves to 3)
4. Final exit from the sequencer set

## Troubleshooting

### Port forwarding not working

**Issue**: Your node cannot connect to peers.

**Solutions**:
- Verify your external IP address matches the `P2P_IP` setting
- Check firewall rules on your router and local machine
- Test connectivity using: `nc -zv <your-ip> 40400`

### Sequencer not syncing

**Issue**: Your node is not synchronizing with the network.

**Solutions**:
- Check L1 endpoint connectivity
- Verify both execution and consensus clients are fully synced
- Review logs for specific error messages
- Ensure L1 endpoints support high throughput

### Keystore issues

**Issue**: Keystore not loading or errors about invalid keys.

**Solutions**:
- Ensure keystore.json is properly formatted
- Verify private keys are valid Ethereum private keys
- Check file permissions on the keys directory

### Docker issues

**Issue**: Container won't start or crashes.

**Solutions**:
- Ensure Docker and Docker Compose are up to date
- Check disk space availability
- Verify the `.env` file is properly formatted
- Review container logs: `docker compose logs aztec-sequencer`

### Common Issues

See the [Operator FAQ](./reference/operator_faq.md) for additional common issues and resolutions.

## Next Steps

- Monitor your sequencer's performance and attestation rate
- Join the [Aztec Discord](https://discord.gg/aztec) for operator support
- Review [reacting to upgrades](./reference/reacting_to_upgrades.md) for handling network upgrades
- Learn about [advanced sequencer configurations](./advanced_sequencer_setup.md) for high availability and running multiple sequencers
