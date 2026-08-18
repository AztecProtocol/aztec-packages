---
id: hardware
title: Hardware spec
description: What your machine actually needs to run an Aztec full node, sequencer, provider, or prover, including the CPU instruction-set floor and the extra disk for co-hosting an L1 node.
displayed_sidebar: operatorsSidebar
---

A single-screen view of what each role needs.

## Sequencer and full node (single machine)

| Resource | Spec |
|---|---|
| CPU | 8 cores / 16 vCPU, **Skylake or newer** |
| RAM | 8 GB |
| Storage | 1 TB SSD (NVMe recommended) |
| Network | 25 Mbps |

These numbers are the same on testnet and mainnet: the node binary and its workload do not change with the network. What changes by network is the L1 node you connect to or co-host (see [Co-hosting an L1 node](#co-hosting-an-l1-node) below).

### One node, many attesters: load stays about the same

The spec above is for one node. Running more attester identities on the same node does **not** multiply the load. Stake scales in units of 200,000 AZTEC, and each unit is a separate attester identity, but the node's heavy work is validating each block proposal, which it does once per proposal regardless of how many of your attesters are on the committee. When several of your attesters are selected together, the node validates the proposal once and then just signs an attestation for each, which is cheap. So one node running 1 attester and one node running 100 attesters need roughly the same CPU and RAM.

What does grow with the number of nodes (not attesters) is running more than one machine, for example for high availability. Size each node to the spec above.

### Disk and IOPS

1 TB is enough for the Aztec node itself. A normal SSD works; NVMe is recommended because random I/O performance matters as much as capacity, and cheap drives without consistent random-write performance can struggle under sustained load. SATA SSDs typically fall short. As a target, aim for **50,000+ random read/write IOPS**.

You need more than 1 TB only if you co-host an L1 node on the same machine, covered next.

### Co-hosting an L1 node

If you run your own Ethereum execution and consensus clients on the **same machine** as the Aztec node (a common way to avoid hosted-RPC cost and rate limits), add the L1 node's disk on top of the Aztec node's 1 TB. The L1 footprint depends on the network:

| Network | L1 node disk (execution + consensus + blobs, approximate) | Total with Aztec node |
|---|---|---|
| Testnet (Sepolia) | around 1.3 TB | ~2 TB |
| Mainnet (Ethereum) | around 2.5 to 3.5 TB, depending on the client | ~4 TB |

These L1 figures are external to Aztec and drift over time as the chains grow; check current Ethereum client guidance when you provision. If you point at a hosted or separate L1 endpoint instead, the Aztec node stays at 1 TB. See [L1 RPC requirements](./l1-rpc) for the endpoints a node needs.

### Network

25 Mbps is the floor. Sustained P2P load spikes above the average at epoch boundaries, so provision headroom; symmetric 100 Mbps is comfortable for production.

## Staking provider

Same per-node spec as the solo sequencer. As above, the number of delegated attester positions you run does not change the per-node load: 10, 100, or 1,000 attesters on one node is roughly the same work, because the node validates each proposal once and signs cheaply per attester.

What multiplies the spec is the number of **nodes**, not attesters:

- Each delegated stake position you operate is a separate attester identity, but they can share a node.
- For high availability, run one publisher plus one or more redundant nodes with a coordinated shared keystore.
- A provider running across 2 HA-paired nodes is operating roughly 2x the spec above because there are 2 machines, not because of the attester count.

Plan for `(number of nodes) x per-node-spec`.

## Prover

The prover has a different architecture: one **prover node** plus one **broker** plus N **prover agents** (the workers that do the heavy proof generation).

| Component | Spec per instance |
|---|---|
| Prover node | 16 cores / 32 vCPU, 16 GB RAM, 1 TB NVMe, 25 Mbps |
| Prover broker | 8 cores / 16 vCPU, 16 GB RAM, 10 GB SSD |
| Prover agent (each) | 32 cores / 64 vCPU, 128 GB RAM, 10 GB SSD |

Agents carry the Skylake-or-newer CPU floor too, and lean on it hardest. They do the heavy lifting, and their hardware scales roughly linearly with how many you run (set with `PROVER_AGENT_COUNT`):

| Agents | Cores | RAM |
|---|---|---|
| 1 | 32 | 128 GB |
| 2 | 64 | 256 GB |
| 3 | 96 | 384 GB |
| 4 | 128 | 512 GB |

### How many agents do you need

A full prover for the heaviest sustained workload runs on the order of 200 agents. Real network load is usually well below that.

If you are provisioning, start with one broker and 2 to 4 agents, then watch the proving queue depth and scale agents up if it grows. The broker exports the queue size as the `aztec.proving_queue.size` OpenTelemetry metric (number of jobs waiting); see the [Job Queue metrics](/operate/operators/monitoring/metrics-reference#job-queue) for the full set.

## See also

- [Prerequisites](/operate/operators/prerequisites): the full operator-prerequisites checklist (OS, Docker, port-forwarding)
- [L1 RPC requirements](./l1-rpc): the execution, consensus, and debug endpoints a node needs
- [Full node setup](/operate/operators/full-node/setup): concrete Docker Compose with these specs
- [Prover overview](/operate/operators/prover/overview): the broker and agent architecture in detail
- [Topology and infrastructure](/operate/operators/setup/high_availability_sequencers): HA patterns for providers
