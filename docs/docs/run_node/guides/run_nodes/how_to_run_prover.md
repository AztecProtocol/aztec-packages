---
sidebar_position: 2
title: How to run a prover node
---

Prover nodes are core for the Aztec network. They orchestrate different prover nodes that prove every single public transaction and roll them up to a root proof that is then published to L1. Aztec is mathematics.

Running a prover means having deep understanding of blockchain technology, crypto economics, devops and hardware. It is an expensive endeavour that is often run by highly skilled engineers or teams.

## Prerequisites

- You need to fully understand the [protocol specs](../../../protocol-specs/intro.md).
- Your confidence level is expected to be around "I'd be able to run a Prover _without_ this guide"

TODO hardware prerequisites

## Getting started

Running an Aztec Prover node means that the client will automatically monitor L1 for unclaimed epochs and propose bids (i.e. EpochProofQuote) for proving them. The prover node watches the L1 to see when a bid they submitted has been accepted by a sequencer, and will then kick off an epoch proving job which performs the following tasks:

- Downloads the transaction hashes in the epoch and all L1 to L2 messages from L1.
- Downloads the transaction objects with their ClientIVC proofs from a remote node (to be replaced by loading them from the P2P pool).
- Executes transactions in the epoch in order, generating proving jobs for each of them.
- Generates the inputs for each circuit and kicks off individual proving jobs to prover agents, recursively proving until it gets to the root rollup proof.
- Submits the root rollup proof to L1 to advance the proven chain.

```mermaid
flowchart TD
    style prover-node stroke:#333,stroke-width:4px

    prover-node[Prover Node]
    proving-job[Proving Job]
    tx-provider[Tx Provider]
    l1-publisher[L1 Publisher]
    l2-block-source[L2 Block Source]
    world-state[World State DB]
    tx-processor[Tx Processor]
    prover-client[Proving Orchestrator]
    proving-queue[Proof Broker]
    prover-agent[Prover Agent]
    bb[Barretenberg]

    prover-node --trigger--> proving-job
    proving-job --"process-tx"--> tx-processor --"add-tx"--> prover-client
    proving-job --start-batch--> prover-client
    proving-job --get-tx-hashes--> l2-block-source
    proving-job --"advance-to"--> world-state
    proving-job --"get-txs"--> tx-provider
    tx-processor --rw--> world-state
    world-state --"get-blocks"--> l2-block-source
    prover-client --"rw"--> world-state
    proving-job --publish-proof--> l1-publisher
    prover-client --"push-job"--> proving-queue
    %%prover-agent --"pull-job"--> proving-queue
        proving-queue <--"pull-jobs"--o prover-agent
    subgraph "Prover Agent"
        prover-agent --"prove"--> bb
    end

    %% p2p-client --> tx-pool --"save-tx"--> tx-db
    %% p2p-client --get-blocks--> l2-block-source
```

As complex as it is, the command is actually fairly straightforward thanks to the modular nature of the `aztec start` command:

```bash
aztec start --prover-node --archiver
```

This will start the prover node, which doesn't mean it proves anything. To prove, it needs agents. To run a prover agent, add the `--prover` flag to the command above to start an in-process prover.



## Configuration

The Aztec client is configured via environment variables, the following ones being relevant for the prover node:

- **ETHEREUM_HOSTS**: List of URLs of Ethereum nodes (comma separated).
- **L1_CHAIN_ID**: Chain ID for the L1 Ethereum chain.
- **DATA_DIRECTORY**: Local folder where archive and world state data is stored.
- **AZTEC_PORT**: Port where the JSON-RPC APIs will be served.
- **PROVER_PUBLISHER_PRIVATE_KEY**: Private key used for publishing proofs to L1. Ensure it corresponds to an address with ETH to pay for gas.
- **PROVER_AGENT_ENABLED**: Whether to run a prover agent process on the same host running the Prover Node. We recommend setting to `false` and running prover agents on separate hosts.
- **P2P_ENABLED**: Set to `true` so that your node can discover peers, receive tx data and gossip quotes to sequencers.
- **PROVER_COORDINATION_NODE_URL**: Send quotes via http. Only used if `P2P_ENABLED` is `false`.
- **BOOT_NODE_URL**: The URL of the boot node for peer discovery.
- **AZTEC_NODE_URL**: Used by the Prover Node to fetch the L1 contract addresses if they were not manually set via environment variables.

:::note
For S&P Testnet, we will be providing an Ethereum host, a Boot Node URL and a specific Aztec Image.
:::

The prover agent, on the other hand, relies on the following environment variables:

- **PROVER_BROKER_HOST**: URL to the Prover Node that acts as a proving job source.
- **PROVER_AGENT_CONCURRENCY**: Maximum concurrency for this given prover agent. Defaults to `1`.

Both the prover node and agent also rely on the following:

- **PROVER_REAL_PROOFS**: Whether to generate actual proofs, as opposed to only simulating the circuit and outputting fake proofs. **Set to `true` for the scope of the S&P Testnet.**
- **LOG_LEVEL**: One of `debug`, `verbose`, `info`, `warn`, or `error`.
- **LOG_JSON**: Set to `true` to output logs in JSON format (unreleased).
- **OTEL_EXPORTER_OTLP_METRICS_ENDPOINT**: Optional URL for pushing telemetry data to a remote OpenTelemetry data collector.




### Prover Config

Please refer to the [Prover Guide](./how_to_run_prover.md) for info on how to setup your prover node.

## Governance Upgrades

During a governance upgrade, we'll announce details on the discord. At some point we'll also write AZIPs (Aztec Improvement Proposals) and post them to either the github or forum to collect feedback.

We'll deploy the payload to the L1 and share the address of the payload with the sequencers on discord.

To participate in the governance vote, sequencers must change the variable `GOVERNANCE_PROPOSER_PAYLOAD_ADDRESS` in the Sequencer Client to vote during the L2 slot they've been assigned sequencer duties.

## Troubleshooting

:::tip
Please make sure you are in the Discord server and that you have been assigned the role `S&P Participant`. Say gm in the `sequencer-and-prover` channel and turn on notifications for the announcements channel.
:::

If you encounter any errors or bugs, please try basic troubleshooting steps like restarting your node, checking ports and configs.

If issue persists, please share on the sequencer-and-prover channel and tag [Amin](discordapp.com/users/65773032211231539).

Some issues are fairly light, the group and ourselves can help you within 60 minutes. If the issue isn't resolved, please send more information:

**Error Logs**: Attach any relevant error logs. If possible, note the timestamp when the issue began.
**Error Description**: Briefly describe the issue. Include details like what you were doing when it started, and any unusual behaviors observed.
**Steps to Reproduce (if known)**: If there’s a clear way to reproduce the error, please describe it.
**System Information**: Share details like your system’s operating system, hardware specs, and any other relevant environment information.

That way we can dedicate more time to troubleshoot and open Github issues if no known fix.
