---
id: sequencer_management
sidebar_position: 1
title: Running a Sequencer
description: Learn how to manage your sequencer on the Aztec network, including registration, keystore configuration, stake management, and status monitoring.
references: ["yarn-project/node-keystore/src/config.ts"]
---

## Overview

This guide covers sequencer lifecycle management on the Aztec network: keystore configuration, node setup, registration, ongoing operations, and eventual exit.

:::danger Minimum Stake Requirement
To participate as a sequencer on the Aztec network, you must stake a minimum of **200,000 AZTEC tokens**. Ensure you have sufficient tokens before proceeding with sequencer setup and registration.
:::

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

**Before proceeding:** Ensure you've reviewed and completed the [prerequisites](../prerequisites.md).

## Keystore Explanation

Sequencers require private keys to identify themselves as valid proposers and attesters. These keys are configured through a private keystore file.

### Private Keystore Structure

The private keystore file (`keystore.json`) uses the following structure:

```json
{
  "schemaVersion": 1,
  "validators": [
    {
      "attester": {
        "eth": "ETH_PRIVATE_KEY",
        "bls": "BLS_PRIVATE_KEY"
      },
      "publisher": ["PUBLISHER_PRIVATE_KEY"],  // Optional: defaults to attester key
      "feeRecipient": "0x0000000000000000000000000000000000000000000000000000000000000000",  // Not currently used, set to all zeros
      "coinbase": "ETH_ADDRESS"
    }
  ]
}
```

:::info
The attester field contains both Ethereum and BLS keys:
- **ETH key**: Derives the address that serves as your sequencer's unique identifier in the protocol
- **BLS key**: Used to sign proposals and attestations, as well as for staking operations
:::

### Field Descriptions

#### attester (required)

**Your sequencer's identity.** Contains both Ethereum and BLS keys:

- **Format**: Object with `eth` and `bls` fields
- **eth**: Ethereum private key - the derived address serves as your sequencer's unique identifier in the protocol
- **bls**: BLS private key - actually signs proposals and attestations, and is used for staking operations (validator registration and proof of possession)
- **Purpose**: The ETH address identifies your sequencer, while the BLS key performs the cryptographic signing of consensus messages

#### publisher (optional)

Separate private key(s) for submitting BLS-signed messages to L1. The publisher just pays gas to post already-signed proposals and attestations.

- **Format**: Array of Ethereum private keys
- **Default**: Uses attester key if not specified
- **Purpose**: Posts signed messages to L1 and pays for gas (doesn't participate in signing)
- **Rule of thumb**: Ensure every publisher account maintains at least 0.1 ETH per attester account it serves. This balance allows the selected publisher to successfully post transactions when chosen.

:::tip
If you're using the attester ETH key for publishing (no separate publisher keys), you can omit the `publisher` field entirely from your keystore, but you will still need to fund the attester account according to the rule of thumb above.
:::

#### feeRecipient

Aztec address that would receive L2 transaction fees.

- **Format**: 32-byte Aztec address (64 hex characters)
- **Current status**: Not currently used by the protocol - set to `0x0000000000000000000000000000000000000000000000000000000000000000`
- **Purpose**: Reserved for future fee distribution mechanisms

#### coinbase (optional)

Ethereum address that receives all L1 block rewards and tx fees.

- **Format**: Ethereum address
- **Default**: Uses attester address if not specified

### Generating Keys

Use the Aztec CLI's keystore utility to generate both your private and public keystores:

```bash
aztec validator-keys new \
  --fee-recipient 0x0000000000000000000000000000000000000000000000000000000000000000 \
  --staker-output \
  --gse-address 0xa92ecFD0E70c9cd5E5cd76c50Af0F7Da93567a4f \
  --l1-rpc-urls $ETH_RPC
```

**Relevant parameters:**
- `--fee-recipient`: Set to all zeros (not currently used by the protocol)
- `--staker-output`: Generate the public keystore for the staking dashboard
- `--gse-address`: The GSE (Governance Staking Escrow) contract address (`0xa92ecFD0E70c9cd5E5cd76c50Af0F7Da93567a4f` for mainnet)
- `--l1-rpc-urls`: Your Ethereum L1 RPC endpoint
  - Set `ETH_RPC` environment variable, or replace `$ETH_RPC` with your RPC URL (e.g., `https://mainnet.infura.io/v3/YOUR_API_KEY`)
- `--count`: Number of validator identities to generate (default: 1)
  - Use this to generate multiple attester identities in a single keystore
  - Example: `--count 5` generates 5 validator identities with sequential addresses
  - All identities are derived from the same mnemonic using different derivation paths
  - Useful for operators running multiple sequencer identities or delegated staking providers


**This command creates two JSON files:**
1. **Private keystore** (`~/.aztec/keystore/keyN.json`) - Contains your ETH and BLS private keys for running the node
2. **Public keystore** (`~/.aztec/keystore/keyN_staker_output.json`) - Contains only public information (public keys and proof of possession) for the staking dashboard

Where `N` is an auto-incrementing number (e.g., `key1.json`, `key2.json`, etc.)

**What gets generated:**
- Automatically generates a mnemonic for key derivation (or provide your own with `--mnemonic`)
- Creates an ETH key (for your sequencer identifier) and BLS key (for signing)
- Computes BLS public keys (G1 and G2) and proof of possession
- Outputs your attester address and BLS public key to the console

**Example output (single validator):**
```
No mnemonic provided, generating new one...
Using new mnemonic:

word1 word2 word3 word4 word5 word6 word7 word8 word9 word10 word11 word12

Wrote validator keystore to /Users/aztec/.aztec/keystore/key1.json
Wrote staker output for 1 validator(s) to /Users/aztec/.aztec/keystore/key1_staker_output.json

acc1:
  attester:
    eth: 0xA55aB561877E479361BA033c4ff7B516006CF547
    bls: 0xa931139040533679ff3990bfc4f40b63f50807815d77346e3c02919d71891dc1
```

**Example output (multiple validators with `--count 3`):**
```
No mnemonic provided, generating new one...
Using new mnemonic:

word1 word2 word3 word4 word5 word6 word7 word8 word9 word10 word11 word12

Wrote validator keystore to /Users/aztec/.aztec/keystore/key1.json
Wrote staker output for 3 validator(s) to /Users/aztec/.aztec/keystore/key1_staker_output.json

acc1:
  attester:
    eth: 0xA55aB561877E479361BA033c4ff7B516006CF547
    bls: 0xa931139040533679ff3990bfc4f40b63f50807815d77346e3c02919d71891dc1
acc2:
  attester:
    eth: 0xB66bC672988F590472CA144e5D8d9F82307DA658
    bls: 0xb842240151644780ff4991cfd5f51c74f61918926e88457f4d13020e82902ed2
acc3:
  attester:
    eth: 0xC77cD783999F601583DB255f6E9e0F93418EB769
    bls: 0xc953351262755891ff5aa2dfe6f62d85f72a29a37f99568f5e24131f93a13fe3
```

**Critical: Save your mnemonic phrase!**
- The mnemonic is the **only thing you must save** - it can regenerate all your keys, addresses, and keystores
- Store it securely offline (not on the server running the node)

**For convenience, note:**
- **Attester address** (eth): Your sequencer's identifier (e.g., `0xA55aB...F547`) - useful for registration and monitoring
- **File paths**: Where the keystores were saved

All other information (BLS keys, public keys, addresses) can be re-derived from the mnemonic if needed.

:::tip Provide Your Own Mnemonic
For deterministic key generation or to recreate keys later, provide your own mnemonic:
```bash
aztec validator-keys new \
  --fee-recipient 0x0000000000000000000000000000000000000000000000000000000000000000 \
  --staker-output \
  --gse-address 0xa92ecFD0E70c9cd5E5cd76c50Af0F7Da93567a4f \
  --l1-rpc-urls $ETH_RPC \
  --mnemonic "your twelve word mnemonic phrase here"
```
:::

:::tip Generate Multiple Validator Identities
To generate multiple validator identities (useful for delegated staking providers or operators running multiple sequencers):
```bash
# Generate 5 validator identities from the same mnemonic
aztec validator-keys new \
  --fee-recipient 0x0000000000000000000000000000000000000000000000000000000000000000 \
  --staker-output \
  --gse-address 0xa92ecFD0E70c9cd5E5cd76c50Af0F7Da93567a4f \
  --l1-rpc-urls $ETH_RPC \
  --count 5
```

Each identity gets a unique attester address derived from sequential derivation paths. All identities are included in:
- The same private keystore file (`keyN.json`)
- The same public keystore file (`keyN_staker_output.json`)
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

### Step 2: Generate and Move Private Keystore to Docker Directory

If you haven't already generated your private and public keystores, do so now (see [Generating Keys](#generating-keys) above).

Move the private keystore (not the public keystore) into the Docker directory:

```bash
# Move the private keystore to Docker directory (replace N with your key number)
cp ~/.aztec/keystore/keyN.json aztec-sequencer/keys/keystore.json

# Keep the public keystore for later use with the staking dashboard
# It will be at ~/.aztec/keystore/keyN_staker_output.json
```

### Step 3: Fund Your Publisher Account

Your sequencer needs ETH to pay for gas when submitting blocks to L1. Fund the account that will act as the publisher.

**Determine which address to fund:**

```bash
# Get your attester address (this will be your publisher if no separate publisher is configured)
jq -r '.validators[0].attester.eth' aztec-sequencer/keys/keystore.json

# If you have a separate publisher configured:
jq -r '.validators[0].publisher[0]' aztec-sequencer/keys/keystore.json
```

**Funding requirements:**
- **Rule of thumb**: Maintain at least **0.1 ETH per attester account** in each publisher account
- Publisher accounts submit blocks to L1 and pay for gas fees
- The system does not retry with another publisher if a transaction fails due to insufficient funds

**Examples:**
- 1 attester with 1 publisher (or using attester as publisher) → Maintain ≥ 0.1 ETH
- 3 attesters with 1 publisher → Maintain ≥ 0.3 ETH in that publisher account
- 3 attesters with 2 publishers → Maintain ≥ 0.15 ETH in each publisher account (0.3 ETH total)

:::tip
Set up monitoring or alerts to notify you when the publisher balance falls below the recommended threshold to prevent failed block publications.
:::

### Step 4: Configure Environment Variables

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

### Step 5: Create Docker Compose File

Create a `docker-compose.yml` file in your `aztec-sequencer` directory:

```yaml
services:
  aztec-sequencer:
    image: "aztecprotocol/aztec:2.1.9"
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
      AZTEC_ADMIN_PORT: ${AZTEC_ADMIN_PORT}
    entrypoint: >-
      node
      --no-warnings
      /usr/src/yarn-project/aztec/dest/bin/index.js
      start
      --node
      --archiver
      --sequencer
      --network mainnet
    networks:
      - aztec
    restart: always

networks:
  aztec:
    name: aztec
```

:::warning Security: Admin Port Not Exposed
The admin port (8880) is intentionally **not exposed** to the host machine for security reasons. The admin API provides sensitive operations like configuration changes and database rollbacks that should never be accessible from outside the container.

If you need to access admin endpoints, use `docker exec`:
```bash
docker exec -it aztec-sequencer curl -X POST http://localhost:8880 \
  -H 'Content-Type: application/json' \
  -d '{"jsonrpc":"2.0","method":"nodeAdmin_getConfig","params":[],"id":1}'
```
:::

This configuration includes only essential settings. The `--network mainnet` flag applies network-specific defaults—see the [CLI reference](../reference/cli_reference.md) for all available configuration options.

### Step 6: Start the Sequencer

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
docker compose logs -f --tail 100 aztec-sequencer
```

## Next Steps: Registering Your Sequencer

Now that your sequencer node is set up and running, you need to register it with the network. There are two ways to participate as a sequencer:

### Option 1: Self-Staking via Staking Dashboard

Register your sequencer and provide your own stake through the staking dashboard. This is the most common approach for individual operators.

**→ [Register Your Sequencer (Self-Staking)](../operation/sequencer_management/registering_sequencer.md)**

You'll use the **public keystore** file (`keyN_staker_output.json`) that was generated when you created your keys.

### Option 2: Running with Delegated Stake

Operate sequencers backed by tokens from delegators. This non-custodial system allows you to run sequencer infrastructure while delegators provide the economic backing.

**→ [Run with Delegated Stake](../operation/sequencer_management/running_delegated_stake.md)**

As a provider, you'll register with the Staking Registry and manage a queue of sequencer identities that activate when delegators stake to you.

:::tip Which Option Should I Choose?
- **Self-staking**: You have tokens and want to run your own sequencer
- **Delegated staking**: You want to operate sequencer infrastructure and earn commission from delegators' stake

Both options use the same node setup from this guide.
:::

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

### Private keystore issues

**Issue**: Private keystore not loading or errors about invalid keys.

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

## Additional Resources

After setting up and registering your sequencer:

- **[Register Your Sequencer](../operation/sequencer_management/registering_sequencer.md)** - Complete registration via staking dashboard
- **[Monitor Sequencer Status](#monitoring-sequencer-status)** - Track performance and attestation rate
- **[Operator FAQ](../operation/operator_faq.md)** - Common issues and resolutions
- **[Creating and Voting on Proposals](../operation/sequencer_management/creating_and_voting_on_proposals.md)** - Participate in governance
- **[High Availability Setup](./high_availability_sequencers.md)** - Run your sequencer across multiple nodes for redundancy
- **[Advanced Keystore Patterns](../operation/keystore/advanced_patterns.md)** - Manage multiple sequencer identities

**Community support:**
- Join the [Aztec Discord](https://discord.gg/aztec) for operator support and network updates
