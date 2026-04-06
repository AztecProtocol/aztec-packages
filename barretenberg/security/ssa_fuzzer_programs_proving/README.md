# SSA Fuzzer Programs Proving Workers

Workers that consume Noir programs from Redis queue and validate them using Barretenberg (bb).

## Purpose

These workers complement the [ssa_fuzzer](https://github.com/noir-lang/noir/tree/master/tooling/ssa_fuzzer) by:

1. **Consuming fuzzer output**: Retrieving Noir programs and witnesses from Redis queue
2. **Proof generation**: Using `bb prove` to generate proofs for the programs
3. **Native proof verification**: Validating proofs with `bb verify`
4. **Solidity verifier verification**: Generating an EVM verifier and checking it accepts the same proof and public inputs
5. **Continuous validation**: Running as background workers to process fuzzer output in real-time

## Runtime requirements

The worker image now includes the packages needed for EVM-side verification:

- `bb` for native proving and verification
- `node` plus npm dependencies (`ethers`, `solc`) for compiling and deploying the generated verifier
- `anvil` for running a local EVM during Solidity verification

## Configuration

- `ENABLE_SOLIDITY_VERIFY=1` enables the Solidity verification stage after native verification
- `SOLIDITY_VERIFIER_TARGET=evm-no-zk` selects the EVM verifier flavor; use `evm` to exercise the ZK verifier path instead
- `SOLIDITY_VERIFIER_OPTIMIZED=1` enables the optimized Solidity verifier for `evm-no-zk`