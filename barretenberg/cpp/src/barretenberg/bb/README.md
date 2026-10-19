# BB

`bb` proves and verifies Noir programs: it takes [ACIR](https://github.com/noir-lang/noir/tree/master/acvm-repo/acir) bytecode and a witness and writes proofs, verification keys and Solidity verifiers.

### Installation

Follow the installation instructions described [here](../../../../../barretenberg/bbup/README.md#installation).

### Usage

For full documentation, visit [barretenberg.aztec.network/docs](https://barretenberg.aztec.network/docs/). `bb --help` lists the subcommands; `bb <subcommand> --help` lists their options, and `--help-extended` adds the advanced and Aztec-specific ones.

#### Quick Start

1. Follow [the Noir docs](https://noir-lang.org/docs/getting_started_manually) to compile your Noir program and generate its witness. `nargo execute` writes the bytecode to `target/<package>.json` and the witness to `target/<package>.gz`.

2. Compute the verification key. `-o` is a directory:

   ```bash
   bb write_vk -b ./target/hello_world.json -o ./target/vk
   ```

3. Prove the valid execution of your Noir program:

   ```bash
   bb prove -b ./target/hello_world.json -w ./target/hello_world.gz -k ./target/vk/vk -o ./target/proof
   ```

4. Verify your proof:

   ```bash
   bb verify -k ./target/vk/vk -p ./target/proof/proof -i ./target/proof/public_inputs
   ```

   On success, `bb verify` prints `Proof verified successfully` and exits with code 0.

To compute the verification key in the same step, pass `--write_vk` to `bb prove` (and drop `-k`). Add `--verify` to verify the proof natively right after proving.

#### Output files

| Command | Writes into the `-o` directory |
| --- | --- |
| `write_vk` | `vk`, `vk_hash` |
| `prove` | `proof`, `public_inputs` (plus `vk`, `vk_hash` with `--write_vk`) |

`prove` and `write_vk` do not write to stdout. `write_solidity_verifier -o -` prints the contract to stdout.

#### Verifier Targets

Use `--verifier_target` (or `-t`) to configure proofs for different verification environments. Pass the same target to `bb verify` (e.g. `bb verify -t evm ...`).

```bash
# For EVM/Solidity verification
bb prove -b ./target/hello_world.json -w ./target/hello_world.gz --verifier_target evm --write_vk -o ./target/proof

# For recursive verification in Noir circuits
bb prove -b ./target/hello_world.json -w ./target/hello_world.gz --verifier_target noir-recursive --write_vk -o ./target/proof
```

| Target | Use |
| --- | --- |
| `evm`, `evm-no-zk` | Ethereum/Solidity (keccak), with or without ZK |
| `noir-recursive`, `noir-recursive-no-zk` | Recursive verification in Noir circuits (poseidon2) |
| `noir-rollup`, `noir-rollup-no-zk` | Rollup circuits, with IPA (poseidon2) |
| `starknet`, `starknet-no-zk` | Starknet via Garaga |

#### Other subcommands

- `check`: check that a witness satisfies a circuit, row by row.
- `gates`: print gate counts for the bytecode.
- `write_solidity_verifier`: write a Solidity verifier for a verification key.
- `proof_stats`: print proof statistics (compressed size, number of public inputs).
- `batch_verify`: batch-verify multiple Chonk proofs.
- `msgpack`: the msgpack API interface.

### SRS

`bb` downloads only as many SRS points as the circuit needs and caches them in `~/.bb-crs`. Override the location with `--crs_path` or `CRS_PATH`. The maximum circuit size you can prove in the browser is lower, due to WASM limits.
