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

| metric | how to measure | MVP | ideal |
| --- | --- | --- | --- |
| proof size | total size of a user tx incl. goblin plonk proofs | 32kb | 8kb |
| prover time | 8 iterations of protogalaxy with 2^17 circuits (web browser) | 1 min | 10 seconds |
| verifier time | how long does it take the verifier to check a proof (incl. grumpkin IPA MSMs) | 25ms | 1ms |
| memory consumption | fold 2^17 circuits into an accumulator an arbitrary number of times | 2gb | 512mb |
| size of the kernel circuit | number of gates | 2^17 | 2^15 |
| Aztec Virtual Machine prover time | 1 million VM step circuit | 30 seconds | 5 seconds |
| Aztec Virtual Machine memory consumption | 1 million VM step circuit | 128Gb | 16Gb |

### Proof size

At a tx throughput of 1,024 tx per second, each Aztec node (not sequencer/prover, just a regular node that is sending transactions) needs to download `1024*proof_size` bytes of data to keep track of the mempool. 32kb proofs = 32MB per second which is on the threshold of practical outside of a datacenter. 8MB per second is much more practical.

At launch, the throughput won't be this high, but ideally we architect Aztec such that the network can scale effectively by throwing hardware+resources at bottlenecks (easy to do in a post-decentralisation), without protocol, architecture or tech upgrades ( harder post-decentralisation).

### Prover time

The critical UX factor. 1 minute per user tx is on the cusp of workable. The faster we can get this the better our network's value proposition for users and developers

### Verifier time

This matters because verifying a transaction is effectively free work being performed by sequencers and network nodes that propagate txns to the mempool. If verification time becomes too large it opens up potential DDOS attacks.

At a 1,024 transactions per second and 20ms verification time, a block builder needs to run 20 machines in parallel just to verify natively all of the proofs in a block! Not ideal but probably tolerable given this problem has a "more hardware go brrrr" solution.

### Memory consumption

This is *critical*. Users can tolerate slow proofs, but if Honk consumes too much memory, a user cannot make a proof at all.

safari on iPhone will purge tabs that consume more than 1gb of RAM. 2gb will work in web browsers and some phones (but not all). 512mb will allow most phones to make proofs.

### Kernel circuit size

Not a critical metric, but the prover time + prover memory metrics are predicated on a kernel circuit costing about 2^17 constraints!

### AVM Prover time

Our goal is to hit main-net with a network that can support 10 transactions per second. We need to estimate how many VM computation steps will be needed per transaction to determine the required speed of the VM Prover. The following uses very conservative estimations due to the difficulty of estimating this.

An Ethereum block consists of approximately 1,000 transactions, with a block gas limit of roughly 10 million gas. Basic computational steps in the Ethereum Virtual Machine consume 3 gas. If the entire block gas limit is consumed with basic computation steps (not true but let's assume for a moment), this implies that 1,000 transactions consume 3.33 million computation steps. i.e. 10 transactions per second would require roughly 33,000 steps per second and 3,330 steps per transaction.

An AVM circuit with 1 million steps can therefore accomodate approximately 300 transactions. Proof construction time must therefore be approximately 30 seconds to be able to prove all AVM programs in a block and achieve 10 tps.

### AVM Memory consumption

A large AWS instance can consume 128Gb of memory which puts an upper limit for AVM RAM consumption. Ideally consumer-grade hardware can be used to generate AVM proofs i.e. 16 Gb.


<!-- # Digging deeper: what does halycon success look like?

Honk is not naturally the fastest cryptosystem of all available options (Starks/Hypernova) as we are selecting for other properties that these systems lack (small proofs, efficiently fold arbitrary instances).

That being said...we can get close (and perhaps more with good engineering). apples-to-apples benchmark comparisons against these proving systems can be made. Once core Honk is built, we can work on whittling away the performance gap.

All Prover speed-ups directly translate into a better Aztec user experience and  have intrinsic value.

We can perform much more rigorous analysis on Honk's performance by building a detailed internal benchmarking suite, that we can also use to compare against other projects in the space.

There were conversations at ZCon about ideal benchmarking suites, and there was a (very small) amount of consensus on the following being useful benchmarks:

1. Benchmark circuits that evaluate the following algorithms (with varying input sizes)

| Benchmark | Input data format | Input ranges |
| --- | --- | --- | 
| SHA256 | number of hash blocks | 1, 2, 4, 8, 16 etc blocks |
| Keccak256 | number of hash blocks | 1, 2, 4, 8, 16 etc blocks |
| SNARK-friendly hash | number of hash blocks | 1, 2, 4, 8, 16 etc blocks |
| Merkle tree proofs (depth 32 tree) | number of membership proofs | 1, 2, 4, 8, 16 proofs etc  |
| ECDSA over secp256k1 | number of signatures | 1, 2, 4, 8, 16 sigs etc  |
| ECDSA over secp256r1 | number of signatures | 1, 2, 4, 8, 16 sigs etc  |
| RSA | number of signatures | 1, 2, 4, 8, 16 sigs etc  |
| JSON parsing | kb of input data | 1, 2, 4, 8, 16 kb etc  |

We can skip RSA and JSON due to the lack of a gadget (one for the Noir team!).

2. Benchmark **incremental verifiable computation** schemes that evaluate the above table of algorithms but recursively (e.g. each "block" is a recursive IVC step)

The benchmarks ideally measure the following:

1. Proving time (native)
2. Proving time (wasm)
3. Proof size
4. Prover memory
5. Verifier time

 -->
