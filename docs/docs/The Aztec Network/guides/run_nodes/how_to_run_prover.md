---
sidebar_position: 2
title: How to Run a Prover Node
description: A comprehensive guide to setting up and running an Aztec Prover node on testnet or mainnet, including hardware requirements, configuration options, and performance optimization tips.
keywords:
  [
    aztec,
    prover,
    node,
    blockchain,
    L2,
    scaling,
    ethereum,
    zero-knowledge,
    ZK,
    setup,
    tutorial,
  ]
tags:
  - prover
  - node
  - tutorial
  - infrastructure
---

Prover nodes are a critical part of the Aztec network's infrastructure. They generate cryptographic proofs that attest to the correctness of public transactions, ultimately producing a single rollup proof that is submitted to Ethereum.

Operating a prover node requires a solid grasp of blockchain protocols, cryptographic systems, DevOps best practices, and high-performance hardware. It’s a resource-intensive role typically undertaken by experienced engineers or specialized teams due to its technical and operational complexity.

## Prerequisites

Before following this guide, make sure you:

- Have the `aztec` tool [installed](../../../developers/getting_started.md#install-the-sandbox)
- Fully understand the [concepts](../../concepts/provers-and-sequencers/) on proving and sequencing
- Have sufficient hardware resources for proving operations
- Your confidence level is expected to be around "I'd be able to run a Prover _without_ this guide"

## Understanding Prover Architecture

The Aztec prover involves three key components: the Prover Node, the Proving Broker, and the Proving Agent.

#### Prover Node

The Prover Node is responsible for polling the L1 for unproven epochs and initiating the proof process. When an epoch is ready to be proven, the prover node creates proving jobs and distributes them to the broker. The Prover Node is also responsible for submitting the final rollup proof to the rollup contract.

The Prover Node is relatively lightweight and is expected to use up to 8 cores and 16GB of memory. The Prover Node, like any other node, stores state so it would need some disk space. We recommend 1TB for the prover node.

#### Proving Broker

The Proving Broker acts as an intermediary, managing the queue of proving jobs and distributing them to available agents. The broker receives results from agents and sends them back to the prover node.

The Proving Broker is relatively lightweight and is expected to use up to 4 cores and 16GB of memory. For alpha-testnet, the proving broker needs around 1GB of disk space.

#### Proving Agents

The Proving Agent is responsible for executing the proof for a given job. It requests jobs from the broker, and sends the result back to the broker.

The Proving Agent is very resource intensive, with each agent using up to 16cores and 128GB of memory.

## Setting Up Your Prover

Aztec provides a modular CLI command, `aztec start`, which makes it easy to launch and configure the prover system. Each component can run independently or together on a single machine, depending on your architecture.

Here are the main flags and what they control:

| Flag                                             | Description                                                             |
| ------------------------------------------------ | ----------------------------------------------------------------------- |
| `--network <network>`                            | Selects the Docker image for the target network (e.g., `alpha-testnet`) |
| `--l1-rpc-urls`                                  | The URL(s) of your L1 execution node                                    |
| `--l1-consensus-host-urls`                       | The URL(s) of your L1 consensus node                                    |
| `--archiver`                                     | Starts the archiver service to store synced data                        |
| `--prover-node`                                  | Starts a prover node                                                    |
| `--prover-broker`                                | Starts a prover broker                                                  |
| `--prover-agent`                                 | Starts a proving agent                                                  |
| `--p2p.p2pIp <your-ip>`                          | Your node's public IP                                                   |
| `--proverNode.publisherPrivateKey <private-key>` | Your private key for submitting proofs to L1                            |

You can run all components on the same machine. However, you can tweak the environment in many ways to achieve multi-machine proving clusters (ex. running just with `--prover-agent` and setting `--proverAgent.proverBrokerUrl` to a central broker).

#### L1 Access

Before running a prover, it’s important to understand that it must interface directly with Ethereum (Layer 1) to detect epochs ready to prove and to publish proofs. To do this, the prover requires access to both:

- An L1 execution client (for reading transactions and state). It can be specified via the env var `ETHEREUM_HOSTS` or the `--l1-rpc-urls` flag when using `aztec start`.

- An L1 consensus client (for blobs). It can be specified via the env var `L1_CONSENSUS_HOST_URLS` or the `--l1-consensus-host-urls` flag when using `aztec start`.

These are typically provided via RPC endpoints — often from infrastructure providers like Alchemy, Infura, or your own hosted clients.

:::tip
If you're hosting your own Ethereum execution or consensus client locally (rather than using an external RPC like Alchemy), you need to ensure that the prover node inside Docker can reach it.

By default, Docker runs containers on a bridge network that isolates them from the host machine’s network interfaces. This means localhost inside the container won’t point to the host’s localhost.

To fix this:

Option 1: Use the special hostname host.docker.internal
This tells Docker to route traffic from the container to the host machine. For example:

```bash
--l1-rpc-urls http://host.docker.internal:8545
```

Option 2: Add a host network entry to your Docker Compose file (advanced users)
This gives your container direct access to the host’s network stack, but removes Docker’s network isolation. In your `docker-compose.yml`, add:

```yaml
network_mode: "host"
```

⚠️ Note: network_mode: "host" only works on Linux. On macOS and Windows, use `host.docker.internal`.

Make sure your local node is listening on 0.0.0.0, not just 127.0.0.1. Otherwise, it won’t be accessible from Docker.
:::

### Example Command

Here's an example of a complete command to run a prover on the alpha-testnet.

```bash
aztec start \
  --network alpha-testnet \
  --l1-rpc-urls https://eth-sepolia.g.alchemy.com/v2/your-key \
  --l1-consensus-host-urls \
  --prover-node \
  --prover-broker \
  --prover-agent \
  --archiver \
  --p2p.p2pIp your-ip \
  --proverNode.publisherPrivateKey 0xyour-private-key
```

:::tip
For production environments, consider distributing your prover agents across multiple machines to improve throughput and reliability.
:::

## Advanced Configuration

### Using Environment Variables

Each flag in the `aztec start` command corresponds to an environment variable. You can see their names by running `aztec start --help`. For example:

- `--l1-rpc-urls` maps to `ETHEREUM_HOSTS`
- `--proverNode.publisherPrivateKey` maps to `L1_PRIVATE_KEY`

You can create a `.env` file with these variables:

```bash
ETHEREUM_HOSTS=https://eth-sepolia.g.alchemy.com/v2/your-key
L1_PRIVATE_KEY=0xyour-private-key
# Add other configuration variables as needed
```

Then source this file before running your command:

```bash
source .env
aztec start --network alpha-testnet --prover-node --prover-broker --prover-agent --archiver
```

For a complete review of all environment variables, refer to the [Configuration](URL/HERE/)

### Customization Options

Using environment variables or command flags, you can customize:

- Hardware resource allocation for proving operations
- Network ports and connection settings
- Storage paths and database configurations
- Proving parallelism and optimization levels
- And many more options

Run `aztec start --help` for a complete list of available options.

## Monitoring and Maintenance

For optimal operation:

- Monitor your prover node's performance and resource usage
- Regularly check logs for errors or inefficiencies
- Keep your system updated with the latest patches
- Set up alerts for any downtime or performance degradation

## Troubleshooting

:::tip
Please make sure you are in the Discord server and that you have been assigned one of the testnet roles. Turn on notifications for the announcements channel.
:::

If you encounter any errors or bugs, please try basic troubleshooting steps like restarting your node, checking ports and configs.

If issues persist, please share on the discord channel you've been assigned to.

Some issues are fairly light, the group and ourselves can help you within 60 minutes. If the issue isn't resolved, please send more information:

- **Error Logs**: Attach any relevant error logs. If possible, note the timestamp when the issue began.
- **Error Description**: Briefly describe the issue. Include details like what you were doing when it started, and any unusual behaviors observed.
- **Steps to Reproduce (if known)**: If there's a clear way to reproduce the error, please describe it.
- **System Information**: Share details like your system's operating system, hardware specs, and any other relevant environment information.

That way we can dedicate more time to troubleshoot and open Github issues if no known fix is available.
