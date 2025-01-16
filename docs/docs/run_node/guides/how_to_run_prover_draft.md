---
sidebar_position: 2
title: How to run a prover node
draft: true
---

!! We will update and publish this when ready !!

It is recommended to read the concepts before running a node, specifically the [provers and sequencers](../concepts/provers-and-sequencers/index.md) section.

The Aztec client can be run as a Prover Node. In this mode, the client will automatically monitor L1 for unclaimed epochs and propose bids (i.e. EpochProofQuote) for proving them. The prover node watches the L1 to see when a bid they submitted has been accepted by a sequencer, the prover node will then kick off an epoch proving job which performs the following tasks:

- Downloads the transaction hashes in the epoch and all L1 to L2 messages from L1.
- Downloads the transaction objects with their ClientIVC proofs from a remote node (to be replaced by loading them from the P2P pool).
- Executes transactions in the epoch in order, generating proving jobs for each of them.
- Generates the inputs for each circuit and kicks off individual proving jobs to prover agents, recursively proving until it gets to the root rollup proof.
- Submits the root rollup proof to L1 to advance the proven chain.

```mermaid
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

The Aztec client needed to run a prover node is shipped as a [docker image](https://hub.docker.com/r/aztecprotocol/aztec) The image exposes the Aztec CLI as its `ENTRYPOINT`, which includes a `start` command for starting different components. You can download it directly or use the sandbox scripts which will automatically pull the image and add the aztec shell script to your path.

Once the `aztec` command is available, you can run a prover node via:

```bash
aztec start --prover-node --archiver
```

To run a prover agent, either run `aztec start --prover`, or add the `--prover` flag to the command above to start an in-process prover.

## Configuration

The Aztec client is configured via environment variables, the following ones being relevant for the prover node:

- **ETHEREUM_HOST**: URL to an Ethereum node.
- **L1_CHAIN_ID**: Chain ID for the L1 Ethereum chain.
- **DATA_DIRECTORY**: Local folder where archive and world state data is stored.
- **AZTEC_PORT**: Port where the JSON-RPC APIs will be served.
- **PROVER_PUBLISHER_PRIVATE_KEY**: Private key used for publishing proofs to L1. Ensure it corresponds to an address with ETH to pay for gas.
- **PROVER_AGENT_ENABLED**: Whether to run a prover agent process on the same host running the Prover Node. We recommend setting to `false` and running prover agents on separate hosts.
- **P2P_ENABLED**: Set to `true` so that your node can discover peers, receive tx data and gossip quotes to sequencers.
- **PROVER_COORDINATION_NODE_URL**: Send quotes via http. Only used if `P2P_ENABLED` is `false`.
- **BOOT_NODE_URL**: The URL of the boot node for peer discovery.
- **AZTEC_NODE_URL**: Used by the Prover Node to fetch the L1 contract addresses if they were not manually set via environment variables.

::note
> For S&P Testnet, we will be providing an Ethereum host, a Boot Node URL and a specific Aztec Image.
::

The prover agent, on the other hand, relies on the following environment variables:

- **PROVER_BROKER_HOST**: URL to the Prover Node that acts as a proving job source.
- **PROVER_AGENT_CONCURRENCY**: Maximum concurrency for this given prover agent. Defaults to `1`.

Both the prover node and agent also rely on the following:

- **PROVER_REAL_PROOFS**: Whether to generate actual proofs, as opposed to only simulating the circuit and outputting fake proofs. **Set to `true` for the scope of the S&P Testnet.**
- **LOG_LEVEL**: One of `debug`, `verbose`, `info`, `warn`, or `error`.
- **LOG_JSON**: Set to `true` to output logs in JSON format (unreleased).
- **OTEL_EXPORTER_OTLP_METRICS_ENDPOINT**: Optional URL for pushing telemetry data to a remote OpenTelemetry data collector.

