---
sidebar_position: 1
title: How to Run a Sequencer Node
description: A comprehensive guide to setting up and running an Aztec Sequencer node on testnet or mainnet, including infrastructure requirements, configuration options, and troubleshooting tips.
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

Starting a Sequencer node is not too different from starting a [sandbox](../../../developers/getting_started.md). While the sandbox starts all the components needed for local development, the Sequencer workflow is more focused on testnet and mainnet features and provides more flexibility to suit your own environment.

## Prerequisites

Before following this guide, make sure you:

- Have the `aztec` tool [installed](../../../developers/getting_started.md#install-the-sandbox) and updated to the latest version
- Understand how [Provers and Sequencers](../../concepts/provers-and-sequencers/) work
- Are running a Linux or MacOS machine with access to a terminal

## Getting Started

The `aztec` CLI tool is a one-stop-shop for pretty much everything, from setting up a local dev environment to running a prover node with multiple agents.

Running a sequencer is simply a matter of "assembling" a basic command that will boot a Docker container with the right services: node, sequencer, and optionally an archiver.

### Step 1: Prepare Your Infrastructure

#### Grab Your RPC URLs

Sequencing involves fetching data from both L2 and L1. You'll need to provide your own infrastructure or subscribe to a service that will provide these RPC endpoints:

- **Ethereum Execution Node RPC**: For example from [DRPC](https://drpc.org/chainlist/ethereum) or [Alchemy](https://www.alchemy.com/ethereum). This is where the new state will be sent and verified when you produce a block.
- **Ethereum Beacon Node RPC**: For example [DRPC](https://drpc.org/chainlist/eth-beacon-chain#eth-beacon-chain-sepolia) provides one. The beacon node is required to fetch data from the blob space.

:::warning

The `free` route will likely get you rate-limited, making it impossible to sync properly. You will need to set up a paid plan use a pay-as-you-go service for reliable operation.

:::

:::info

You can run your own Sepolia ETH Node. However, at the moment only [`geth`](https://github.com/ethereum/go-ethereum) and [`reth`](https://github.com/paradigmxyz/reth) nodes are confirmed to work reliably with Aztec.

:::

#### Get Some Sepolia ETH

You'll need Sepolia ETH to cover gas costs. Here are some options:

- Use a PoW faucet like [Sepolia PoW Faucet](https://sepolia-faucet.pk910.de/)
- Ask in our Discord community (and remember to pay it forward when you can!)

### Step 2: Run Your Sequencer

To boot up a sequencer, you'll need to use the following flags:

| Flag                                            | Env Var                  | Description                                                                                                                                      |
| ----------------------------------------------- | ------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| `--network <network>`                           | `NETWORK`                | Selects the Docker image for the target network (e.g., `alpha-testnet`). Sets default values for contract addresses, bootnodes, L1 ChainID, etc. |
| `--node`                                        | n/a                      | Starts the node service that fetches data from L1 RPCs                                                                                           |
| `--archiver`                                    | n/a                      | Starts the archiver service to store synced blocks                                                                                               |
| `--sequencer`                                   | n/a                      | Starts the sequencer module                                                                                                                      |
| `--l1-rpc-urls <execution-node>`                | `ETHEREUM_HOSTS`         | The URL of your L1 execution node. Multiple can be provided, as a comma seperated list                                                           |
| `--l1-consensus-host-urls <beacon-node>`        | `L1_CONSENSUS_HOST_URLS` | The URL of your L1 beacon node. Multiple can be provided, as a comma seperated list                                                              |
| `--archiver.blobSinkUrl <url>`                  | `BLOB_SINK_URL`          | URL for the blob sink containing blobs that have expired from the consensus host (specific to alpha testnet)                                     |
| `--sequencer.validatorPrivateKey <private-key>` | `VALIDATOR_PRIVATE_KEY`  | Your sequencer's private key for signing attestations and blocks                                                                                 |
| `--sequencer.coinbase <address>`                | `COINBASE`               | Address to receive any block rewards                                                                                                             |
| `--p2p.p2pIp <your-ip>`                         | `P2P_IP`                 | Your node's public IP so other nodes can connect                                                                                                 |

:::info
If you are using a consensus node provider that requires non standard ways to supply an api key, such as google cloud's hosted service, there are extra environment variables to perform that:
| Flag | Env Var | Description |
| ------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| `--l1-consensus-host-api-key-headers <header-key>` | `L1_CONSENSUS_HOST_API_KEYS` | If your beacon RPC requires an API key in a header, provide the header name here (e.g., "API-KEY"). Leave empty if using query parameters (comma seperated list) |
| `--l1-consensus-host-api-keys <api-key>` | `L1_CONSENSUS_HOST_API_KEY_HEADERS` | The beacon node API key. Can be omitted if included in the URL, (Comma seperated list) |

When providing multiple urls that require api key headers, the index in the comma seperated list must correspond to the index of the `--l1-consensus-host-urls` that are being provided.
:::

#### Example Command

Here's an example of a complete command to start a sequencer node:

```bash
aztec start \
  --network alpha-testnet \
  --l1-rpc-urls https://eth-sepolia.g.alchemy.com/v2/your-key \
  --l1-consensus-host-url https://lb.drpc.org/rest/your-key/eth-beacon-chain-sepolia \
  --archiver \
  --archiver.blobSinkUrl http://34.82.117.158:5052 \
  --node \
  --sequencer \
  --sequencer.validatorPrivateKey your-private-key \
  --p2p.p2pIp your-ip \
  --sequencer.coinbase your-coinbase-address
```

:::tip

If you are unable to determine your public ip. Running the command `curl ifconfig.me` can retreive it for you.
If your IP changes frequently, consider using a dynamic DNS service like [NoIP](https://www.noip.com/) to assign a fixed hostname.
:::

Your node will sync from the genesis block of the Aztec network, which may take several hours. This is a good time to take a break or work on something else.

### Step 3: Register as a Validator

Once your node is fully synced, you can register as a validator using the `add-l1-validator` command:

```bash
aztec add-l1-validator \
  --network alpha-testnet \
  --l1-rpc-urls https://eth-sepolia.g.alchemy.com/v2/your-key \
  --private-key your-private-key \
  --validator your-validator-address \
  --faucet your-faucet-address
```

The key parameters are:

| Flag                             | Env Var                        | Description                                                                 |
| -------------------------------- | ------------------------------ | --------------------------------------------------------------------------- |
| `--network <network>`            | `NETWORK`                      | Same network as your sequencer                                              |
| `--l1-rpc-urls <execution-node>` | `ETHEREUM_HOSTS`               | L1 node endpoint (can be the same as used for the sequencer)                |
| `--private-key` or `--mnemonic`  | `L1_PRIVATE_KEY` \| `MNEMONIC` | The private key or seed phrase to deploy your forwarder contract            |
| `--validator <address>`          | n/a                            | Your validator address (derived from the `--sequencer.validatorPrivateKey`) |
| `--faucet <address>`             | n/a                            | For alpha-testnet, this will mint and deposit funds on your behalf          |

## Advanced Configuration

### Using Environment Variables

Every flag in the `aztec start` command corresponds to an environment variable. You can see the variable names by running `aztec start --help`. [A reference is provided](./cli_reference.md).

For example:

- `--l1-rpc-urls` maps to `ETHEREUM_HOSTS`
- `--l1-consensus-host-urls` maps to `L1_CONSENSUS_HOSTS_URLS`

You can create a `.env` file with these variables:

```bash
ETHEREUM_HOSTS=https://eth-sepolia.g.alchemy.com/v2/your-key
L1_CONSENSUS_HOST_URLS=https://lb.drpc.org/rest/your-key/eth-beacon-chain-sepolia
# Add other configuration variables as needed
```

Then source this file before running your command:

```bash
source .env
aztec start --network alpha-testnet --archiver --node --sequencer # other flags...
```

### Using a Docker Compose
If you would like to, you can use a configuration like the one below:

```
name: aztec-node
services:
  network_mode: host # Optional, run with host networking
  node:
    image: aztecprotocol/aztec:0.84.0-alpha-testnet.3
    environment:
      ETHEREUM_HOSTS: ""
      L1_CONSENSUS_HOST_URLS: ""
      DATA_DIRECTORY: /var/lib/aztec
      VALIDATOR_PRIVATE_KEY: $VALIDATOR_PRIVATE_KEY
      P2P_IP: $P2P_IP
    entrypoint: >
      sh -c 'node --no-warnings /usr/src/yarn-project/aztec/dest/bin/index.js start --network alpha-testnet start --node --archiver --sequencer'
    ports:
      - 40400:40400/tcp
      - 40400:40400/udp
      - 8080:8080

  volumes:
    - aztec_data:/var/lib/aztec
```

### Customization Options

Using environment variables or command flags, you can customize:

- Ports for various services
- Log levels and output format
- Resource limits for Docker containers
- P2P network configuration
- Database storage paths
- And many more options

Run `aztec start --help` for a complete list of available options.

## Troubleshooting

If you encounter issues:

- Check that your RPC endpoints are working and not rate-limited
- Ensure you have enough Sepolia ETH for gas costs
- Verify your network connectivity and firewall settings
- Join our Discord community for real-time help

Happy sequencing!
