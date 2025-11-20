---
id: sequencer_management
sidebar_position: 1
title: Running a Sequencer
description: Learn how to manage your sequencer on the Aztec network, including registration, keystore configuration, stake management, and status monitoring.
---

## Overview

This guide covers sequencer lifecycle management on the Aztec network: keystore configuration, node setup, registration, ongoing operations, and eventual exit.

Sequencer nodes are critical infrastructure responsible for ordering transactions and producing blocks. They perform three key actions:

1. Assemble unprocessed transactions and propose the next block
2. Attest to correct execution of transactions in proposed blocks (when part of the sequencer committee)
3. Submit successfully attested blocks to L1

Before publication, blocks must be validated by a committee of sequencer nodes who re-execute public transactions and verify private function proofs. Committee members attest to validity by signing the block header.

Once sufficient attestations are collected (two-thirds of the committee plus one), the block can be submitted to L1.

### Minimum Hardware Requirements

- 8 core / 16 vCPU (released in 2015 or later)
- 16 GB RAM
- 1 TB NVMe SSD
- 25 Mbps network connection

These requirements are subject to change as the network throughput increases.

**Before proceeding:** Ensure you've reviewed and completed the [prerequisites](../prerequisites.md) for the Docker Compose method. This guide uses Docker Compose, which is the recommended approach for sequencer nodes.

## Keystore Explanation

Sequencers require private keys to identify themselves as valid proposers and attesters. These keys are configured through a keystore file.

### Keystore Structure

The keystore file (`keystore.json`) uses the following structure:

```json
{
  "schemaVersion": 1,
  "validators": [
    {
      "attester": {
        "eth": "ETH_PRIVATE_KEY",
        "bls": "BLS_PRIVATE_KEY"
      },
      "coinbase": "ETH_ADDRESS"
    }
  ]
}
```

:::info
The attester field contains both Ethereum keys (for node operation) and BLS keys (for staking).
:::

### Field Descriptions

#### attester (required)

**Your sequencer's identity.** Contains both Ethereum and BLS keys:

- **Format**: Object with `eth` and `bls` fields
- **eth**: Ethereum private key used to sign block proposals and attestations - the derived address is your sequencer's unique identifier
- **bls**: BLS private key required for staking onchain (automatically generated)
- **Purpose**: Signs attestations and proposals (eth), participates in staking (bls)

#### publisher (optional)

Private key for sending block proposals to L1. This account needs ETH funding to pay for L1 gas.

- **Format**: Array of Ethereum private keys
- **Default**: Uses attester key if not specified
  **Rule of thumb**: Ensure every publisher account maintains at least 0.1 ETH per attester account it serves. This balance allows the selected publisher to successfully post transactions when chosen.

:::tip
If you're using the same key for both attester and publisher, you can omit the `publisher` field entirely from your keystore, but you will still need to fund the attester account according to the rule of thumb above.
:::

#### coinbase (optional)

Ethereum address that receives all L1 block rewards and tx fees.

- **Format**: Ethereum address
- **Default**: Uses attester address if not specified

### Generating Keys

Use the Aztec CLI's keystore utility to generate keys:

```bash
aztec validator-keys new \
  --fee-recipient [YOUR_AZTEC_FEE_RECIPIENT_ADDRESS]
```

This command:
- Automatically generates a mnemonic for key derivation (or provide your own with `--mnemonic`)
- Creates a keystore with Ethereum keys (for node operation) and BLS keys (for staking)
- Outputs your attester address and BLS public key
- Saves the keystore to `~/.aztec/keystore/key1.json` by default

**Save the following from the output:**
- **Attester address**: Your sequencer's identity (needed for registration)
- **BLS public key**: Required for staking registration

:::tip Provide Your Own Mnemonic
For deterministic key generation or to recreate keys later, provide your own mnemonic:
```bash
aztec validator-keys new \
  --fee-recipient [YOUR_AZTEC_FEE_RECIPIENT_ADDRESS] \
  --mnemonic "your twelve word mnemonic phrase here"
```
:::

For detailed instructions, advanced options, and complete examples, see the [Creating Sequencer Keystores guide](../operation/keystore/creating_keystores.md).

## Setup with Docker Compose

### Step 1: Set Up Directory Structure

Create the directory structure for sequencer data storage:

```bash
mkdir -p aztec-sequencer/keys aztec-sequencer/data
cd aztec-sequencer
touch .env
```

### Step 2: Move Keystore to Docker Directory

If you haven't already generated your keystore with BLS keys, do so now (see [Generating Keys](#generating-keys) above).

Move or generate your keystore directly in the Docker directory:

```bash
# Option 1: Move existing keystore
cp ~/.aztec/keystore/key1.json aztec-sequencer/keys/keystore.json

# Option 2: Generate directly in the Docker directory
aztec validator-keys new \
  --fee-recipient [YOUR_AZTEC_FEE_RECIPIENT_ADDRESS] \
  --mnemonic "your twelve word mnemonic phrase here" \
  --data-dir aztec-sequencer/keys \
  --file keystore.json
```

Your keystore will have this structure:

```json
{
  "schemaVersion": 1,
  "validators": [
    {
      "attester": {
        "eth": "ETH_PRIVATE_KEY",
        "bls": "BLS_PRIVATE_KEY"
      },
      "feeRecipient": "YOUR_AZTEC_FEE_RECIPIENT"
    }
  ]
}
```

Note: By default, no publisher keys are generated. The attester key will be used for both sequencing and publishing to L1. If you want dedicated publisher keys, add `--publisher-count N` when generating the keystore.

:::warning Manual Keystore Creation Not Recommended
We strongly recommend using the Aztec CLI to generate keystores. Manual creation requires properly formatted BLS keys and signatures, which is error-prone. Use the CLI utility unless you have specific advanced requirements.
:::

:::warning
Publisher accounts submit block proposals to L1. Each publisher operates independently, and the system does not retry with another publisher if a transaction fails due to insufficient funds.

**Examples**:

- 3 attesters with 1 publisher → Maintain ≥ 0.3 ETH in that publisher account
- 3 attesters with 2 publishers → Maintain ≥ 0.15 ETH in each publisher account (0.3 ETH total)

Maintaining these minimum balances prevents failed block publications caused by low gas funds.
:::

### Step 3: Configure Environment Variables

Add the following to your `.env` file:

```bash
DATA_DIRECTORY=./data
KEY_STORE_DIRECTORY=./keys
LOG_LEVEL=info
ETHEREUM_HOSTS=[your L1 execution endpoint, or a comma separated list if you have multiple]
L1_CONSENSUS_HOST_URLS=[your L1 consensus endpoint, or a comma separated list if you have multiple]
P2P_IP=[your external IP address]
P2P_PORT=40400
AZTEC_PORT=8080
AZTEC_ADMIN_PORT=8880
```

:::tip
Find your public IP address with: `curl ipv4.icanhazip.com`
:::

### Step 4: Create Docker Compose File

Create a `docker-compose.yml` file in your `aztec-sequencer` directory:

```yaml
services:
  aztec-sequencer:
    image: "aztecprotocol/aztec:2.0.4"
    container_name: "aztec-sequencer"
    ports:
      - ${AZTEC_PORT}:${AZTEC_PORT}
      - ${AZTEC_ADMIN_PORT}:${AZTEC_ADMIN_PORT}
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
      AZTEC_ADMIN_PORT: ${AZTEC_ADMIN_PORT}
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

This configuration includes only essential settings. The `--network testnet` flag applies network-specific defaults—see the [CLI reference](../reference/cli_reference.md) for all available configuration options.

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

Use the Aztec CLI to register your sequencer onchain. You'll need:

- Your attester address (from your keystore at `validators[0].attester.eth`)
- A withdrawer address (typically the same as your attester address)
- Your BLS private key (from your keystore at `validators[0].attester.bls`)
- An L1 RPC endpoint
- A funded Ethereum account to pay for the registration transaction
- The rollup contract address for your network

**Register your sequencer:**

```bash
aztec add-l1-validator \
  --l1-rpc-urls [YOUR_L1_RPC_URL] \
  --network [NETWORK_NAME] \
  --private-key [FUNDING_PRIVATE_KEY] \
  --attester [YOUR_ATTESTER_ADDRESS] \
  --withdrawer [YOUR_WITHDRAWER_ADDRESS] \
  --bls-secret-key [YOUR_BLS_PRIVATE_KEY] \
  --rollup [ROLLUP_CONTRACT_ADDRESS]
```

**Parameter descriptions:**

- `--l1-rpc-urls`: Your Ethereum L1 RPC endpoint
- `--network`: Network identifier (e.g., `testnet`, `staging-public`)
- `--private-key`: Private key of an Ethereum account with ETH to pay for gas (this is NOT your sequencer key)
- `--attester`: Your sequencer's attester address from the keystore
- `--withdrawer`: Ethereum address that can withdraw your stake (typically same as attester)
- `--bls-secret-key`: Your BLS private key from the keystore (`validators[0].attester.bls`)
- `--rollup`: The rollup contract address for your network

**Extract values from your keystore:**

```bash
# Get your attester address
jq -r '.validators[0].attester.eth' aztec-sequencer/keys/keystore.json

# Get your BLS private key (this will be used for --bls-secret-key)
jq -r '.validators[0].attester.bls' aztec-sequencer/keys/keystore.json
```

:::warning Funding Account vs Sequencer Keys
The `--private-key` parameter is for a **funding account** that pays for the registration transaction gas fees. This should NOT be your sequencer's attester or publisher key. Use a separate account with ETH specifically for funding this transaction.
:::

Your sequencer will be added to the validator set once the transaction is confirmed onchain.

### Preparing BLS Keys for Staking Dashboard

The staking dashboard requires your BLS keys from the keystore you created earlier (in [Step 2](#step-2-move-keystore-to-docker-directory)) to be converted into an expanded JSON format with G1 and G2 public key points.

**What you need:**

From your keystore at `aztec-sequencer/keys/keystore.json`, you have:
- `attester.eth`: Your Ethereum attester address
- `attester.bls`: Your BLS private key (64-character hex string)

**What the staking dashboard needs:**

The staking dashboard requires this JSON format with expanded BLS key material:

```json
[
  {
    "attester": "0xYOUR_ATTESTER_ADDRESS",
    "publicKeyG1": {
      "x": "FIELD_ELEMENT_AS_DECIMAL_STRING",
      "y": "FIELD_ELEMENT_AS_DECIMAL_STRING"
    },
    "publicKeyG2": {
      "x0": "FIELD_ELEMENT_AS_DECIMAL_STRING",
      "x1": "FIELD_ELEMENT_AS_DECIMAL_STRING",
      "y0": "FIELD_ELEMENT_AS_DECIMAL_STRING",
      "y1": "FIELD_ELEMENT_AS_DECIMAL_STRING"
    },
    "proofOfPossession": {
      "x": "FIELD_ELEMENT_AS_DECIMAL_STRING",
      "y": "FIELD_ELEMENT_AS_DECIMAL_STRING"
    }
  }
]
```

This includes:
- **`attester`**: Your Ethereum attester address
- **`publicKeyG1`**: BLS public key on the G1 curve (x, y coordinates as decimal strings)
- **`publicKeyG2`**: BLS public key on the G2 curve (x0, x1, y0, y1 coordinates as decimal strings)
- **`proofOfPossession`**: Proof of possession signature to prevent rogue key attacks (x, y coordinates as decimal strings)

### Generating Registration JSON Automatically

Use the `aztec validator-keys staker` command to automatically generate the complete registration JSON with all required fields:

```bash
aztec validator-keys staker \
  --from aztec-sequencer/keys/keystore.json \
  --gse-address [GSE_CONTRACT_ADDRESS] \
  --l1-rpc-urls [YOUR_L1_RPC_URL] \
  --l1-chain-id [CHAIN_ID] \
  --output registration.json
```

**Parameters:**
- `--from`: Path to your keystore file
- `--gse-address`: The GSE (Governance Staking Escrow) contract address for your network
- `--l1-rpc-urls`: Your Ethereum L1 RPC endpoint (e.g., `https://sepolia.infura.io/v3/YOUR_API_KEY`)
- `--l1-chain-id`: The L1 chain ID (e.g., `11155111` for Sepolia)
- `--output`: (Optional) Output file path. If not specified, JSON is written to stdout

This command automatically:
1. Extracts your attester address from the keystore
2. Computes G1 and G2 public keys from your BLS private key
3. Generates the proof of possession signature by calling the GSE contract
4. Outputs the complete registration JSON ready for the staking dashboard

**Example for Sepolia testnet:**

```bash
aztec validator-keys staker \
  --from aztec-sequencer/keys/keystore.json \
  --gse-address 0x1234567890123456789012345678901234567890 \
  --l1-rpc-urls https://sepolia.infura.io/v3/YOUR_API_KEY \
  --l1-chain-id 11155111 \
  --output registration.json
```

The generated `registration.json` file can be directly uploaded to the staking dashboard for sequencer registration.

:::tip Password-Protected Keystores
If your keystore is password-protected, provide the password with the `--password` flag:

```bash
aztec validator-keys staker \
  --from aztec-sequencer/keys/keystore.json \
  --password "your-keystore-password" \
  --gse-address [GSE_CONTRACT_ADDRESS] \
  --l1-rpc-urls [YOUR_L1_RPC_URL] \
  --l1-chain-id [CHAIN_ID]
```

If the password is stored in the keystore file itself, you don't need to provide it explicitly.

## Monitoring Sequencer Status

You can query the status of any sequencer (attester) using the Rollup and GSE (Governance Staking Escrow) contracts on L1.

### Prerequisites

- Foundry installed (`cast` command)
- Ethereum RPC endpoint
- Registry contract address for your network

### Get Contract Addresses

First, get the canonical Rollup contract address from the Registry:

```bash
# Get the canonical rollup address
cast call [REGISTRY_CONTRACT_ADDRESS] "getCanonicalRollup()" --rpc-url [YOUR_RPC_URL]
```

Then get the GSE contract address from the Rollup:

```bash
# Get the GSE contract address
cast call [ROLLUP_ADDRESS] "getGSE()" --rpc-url [YOUR_RPC_URL]
```

### Query Sequencer Status

Check the complete status and information for a specific sequencer:

```bash
# Get full attester view (status, balance, exit info, config)
cast call [ROLLUP_ADDRESS] "getAttesterView(address)" [ATTESTER_ADDRESS] --rpc-url [YOUR_RPC_URL]
```

This returns an `AttesterView` struct containing:

1. **status** - The sequencer's current status (see Status Codes below)
2. **effectiveBalance** - The sequencer's effective stake balance
3. **exit** - Exit information (if the sequencer is exiting)
4. **config** - Attester configuration (withdrawer address and public key)

#### Status Codes

| Status | Name       | Meaning                                                                                                                         |
| ------ | ---------- | ------------------------------------------------------------------------------------------------------------------------------- |
| 0      | NONE       | The sequencer does not exist in the sequencer set                                                                               |
| 1      | VALIDATING | The sequencer is currently active and participating in consensus                                                                |
| 2      | ZOMBIE     | The sequencer is not active (balance fell below ejection threshold, possibly due to slashing) but still has funds in the system |
| 3      | EXITING    | The sequencer has initiated withdrawal and is in the exit delay period                                                          |

### Performance Monitoring

Track your sequencer's performance by monitoring:

- **Effective balance** - Should remain above the ejection threshold
- **Status** - Should be VALIDATING for active participation
- **Attestation rate** - How many attestations you've successfully submitted
- **Proposal success rate** - How many of your proposed blocks were accepted
- **Network participation metrics** - Overall participation in network consensus

## Exiting a Sequencer

:::warning
Information about the exit process will be added when the mechanism is finalized. Check the [Aztec Discord](https://discord.gg/aztec) for the latest information on exiting the sequencer set.
:::

## Troubleshooting

### Port forwarding not working

**Issue**: Your node cannot connect to peers.

**Solutions**:

- Verify your external IP address matches the `P2P_IP` setting
- Check firewall rules on your router and local machine
- Test connectivity using: `nc -zv [your-ip] 40400`

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

- Ensure `keystore.json` is properly formatted
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

See the [Operator FAQ](../operation/operator_faq.md) for additional common issues and resolutions.

## Next Steps

- Monitor your sequencer's performance and attestation rate
- Join the [Aztec Discord](https://discord.gg/aztec) for operator support
- Review [creating and voting on proposals](../operation/sequencer_management/creating_and_voting_on_proposals.md) for participating in governance
- Set up [high availability](./high_availability_sequencers.md) to run your sequencer across multiple nodes for redundancy
- Learn about [advanced keystore patterns](../operation/keystore/advanced_patterns.md) for running multiple sequencer identities or complex configurations
