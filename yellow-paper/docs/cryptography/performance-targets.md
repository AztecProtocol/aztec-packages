# Honk targets and win conditions

## Introduction & context

Aztec's cryptography tech stack and its associated implementation is an open-ended project with potential for many enhancements, optimisations and scope-creep.

This document is designed to definitively answer the following questions:

1. What are the metrics we care about when measuring our cryptography components?
3. What are minimum satisfiable values for these metrics?
4. What are the aspirational values for these metrics?

# Important Metrics

The following is a list of the relevant properties that affect the performance of the Aztec network:

* Size of a user transaction (in kb)
* Time to generate a user transaction proof
* Memory required to generate a user transaction proof
* Time to generate an Aztec Virtual Machine proof
* Memory required to generate an Aztec Virtual Machine proof
* Time to compute a 2x2 rollup proof
* Memory required to compute a 2x2 rollup proof

<!-- We can break these properties down into metrics linked to specitic cryptographic components:

* Size of Goblin Plonk proofs
* Size of Honk proofs
* Honk prover time
* Goblin Plonk prover time
* Protogalaxy recursion -->

 "MVP" = minimum standards that we can go to main-net with.

Note: gb = gigabytes (not gigabits, gigibits or gigibytes)

| metric | how to measure | MVP (10tps) | ideal (100tps) |
| --- | --- | --- | --- |
| proof size | total size of a user tx incl. goblin plonk proofs | 32kb | 8kb |
| prover time | 8 iterations of protogalaxy with 2^17 circuits (web browser) | 1 min | 10 seconds |
| verifier time | how long does it take the verifier to check a proof (incl. grumpkin IPA MSMs) | 20ms | 1ms |
| client memory consumption | fold 2^19 circuits into an accumulator an arbitrary number of times | 4gb | 1gb |
| size of the kernel circuit | number of gates | 2^17 | 2^15 |
| Aztec Virtual Machine prover time | 1 million VM step circuit | 60 seconds | 6 seconds |
| Aztec Virtual Machine memory consumption | 1 million VM step circuit | 128gb | 16gb |
| 2x2 rollup proving time | 1 2x2 rollup proof | 7.4 seconds | 0.74 seconds |
| 2x2 rollup memory consumption | 1 2x2 rollup proof | 128gb | 16gb |

To come up with the above estimates, we are targetting 10 transactions per second for the MVP and 100 tps for the "ideal" case. We are assuming both block producers and rollup Provers have access to 128-core machines with 128gb of RAM. Additionally, we assume that the various process required to produce a block consume the following: 

| process | percent of block production time allocated to process |
| --- | --- |
| transaction validation | 10% |
| block building (tx simulation) | 20% |
| public VM proof construction time | 20% |
| rollup prover time | 40% |
| UltraPlonk proof compression time | 10% | 

These are very rough estimates that could use further evaluation and validation!

### Proof size

At a tx throughput of 1,024 tx per second, each Aztec node (not sequencer/prover, just a regular node that is sending transactions) needs to download `1024*proof_size` bytes of data to keep track of the mempool. 32kb proofs = 32MB per second which is on the threshold of practical outside of a datacenter. 8MB per second is much more practical.

At launch, the throughput won't be this high, but ideally we architect Aztec such that the network can scale effectively by throwing hardware+resources at bottlenecks (easy to do in a post-decentralisation), without protocol, architecture or tech upgrades ( harder post-decentralisation).

### Prover time

The critical UX factor. 1 minute per user tx is on the cusp of workable. The faster we can get this the better our network's value proposition for users and developers

### Verifier time

This matters because verifying a transaction is effectively free work being performed by sequencers and network nodes that propagate txns to the mempool. If verification time becomes too large it opens up potential DDOS attacks.

If we reserve 10% of the block production time for verifying user proofs, at 10 transaction per seconds this gives us 0.01s per transaction. i.e. 10ms per proof.

If the block producer has access to more than one physical machine that they can use to parallelise verification, we can extend the maximum tolerable verification time. For an MVP that requires 20ms to verify each proof, each block producer would require at least 2 physical machines to successfully build blocks.

100tps with one physical machine would require a verifiation time of 1ms per proof.

### Memory consumption

This is *critical*. Users can tolerate slow proofs, but if Honk consumes too much memory, a user cannot make a proof at all.

safari on iPhone will purge tabs that consume more than 1gb of RAM. The WASM memory cap is 4gb which defines the upper limit for an MVP.

### Kernel circuit size

Not a critical metric, but the prover time + prover memory metrics are predicated on a kernel circuit costing about 2^17 constraints!

### AVM Prover time

Our goal is to hit main-net with a network that can support 10 transactions per second. We need to estimate how many VM computation steps will be needed per transaction to determine the required speed of the VM Prover. The following uses very conservative estimations due to the difficulty of estimating this.

An Ethereum block consists of approximately 1,000 transactions, with a block gas limit of roughly 10 million gas. Basic computational steps in the Ethereum Virtual Machine consume 3 gas. If the entire block gas limit is consumed with basic computation steps (not true but let's assume for a moment), this implies that 1,000 transactions consume 3.33 million computation steps. i.e. 10 transactions per second would require roughly 33,000 steps per second and 3,330 steps per transaction.

An AVM circuit with 1 million steps can therefore accomodate approximately 300 "typical" transactions. If we budget 20% of the block time to constructing AVM public funciton proofs, proof construction time must therefore be approximately 6 seconds to be able to prove all AVM programs in a block and achieve 10 tps.

However, with device parallelisation these numbers can be increased substantially. Assuming the Prover network has access to 10 machines, this scales to 60 seconds.

Note: this measurement assumes we can evaluate multiple public VM function calls in a single VM execution trace.

### AVM Memory consumption

A large AWS instance can consume 128Gb of memory which puts an upper limit for AVM RAM consumption. Ideally consumer-grade hardware can be used to generate AVM proofs i.e. 16 Gb.

### 2x2 rollup proving time

For a rollup block containing $2^d$ transactions, we need to compute 2x2 rollup proofs across $d$ layers (i.e. 2^{d-1} 2x2 proofs, followed by 2^{d-2} proofs, followed by... etc down to requiring 1 2x2 proof). To hit 10tps, we must produce 1 block in $\frac{2^d}{10}$ seconds.

Note: this excludes network coordination costs, latency costs, block construction costs, public VM proof construction costs (must be computed before the 2x2 rollup proofs), cost to compute the final UltraPlonk proof.

To accomodate the above costs, we assume can budget 40% of block production time towards making proofs. Given these constraints, the following table describes maximum allowable proof construction times for a selection of block sizes.

| block size | number of successive 2x2 rollup proofs | number of parallel Prover machines required for base layer proofs | time required to construct a rollup proof |
| --- | --- | --- | --- |
| $1,024$ | $10$ | $512$ | 4.1s |
| $2,048$ | $11$ | $1,024$ | 7.4s |
| $4,096$ | $12$ | $2,048$ | 13.6s |
| $8,192$ | $13$ | $4,096$ | 25.2s |
| $16,384$ | $14$ | $8,192$ | 46.8s |

We must also define the maximum number of physical machines we can reasonably expect to be constructing proofs across the Prover network. If we can assume we can expect $1,024$ machines available, this caps the MPV proof construction time at 7.4 seconds.

Supporting a proof construction time of 4.1s would enable us to reduce minimum hardware requirements for the Prover network to 512 physical machines.

### 2x2 rollup memory consumption

Same rationale as the public VM proof construction time.

