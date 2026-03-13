# BB

### Why is this needed?

Barretenberg is a library that allows one to create and verify proofs. One way to specify the circuit that one will use to create and verify
proofs over is to use the Barretenberg standard library. Another way, which pertains to this module is to supply the circuit description using an IR called [ACIR](https://github.com/noir-lang/acvm).

This binary will take as input ACIR and witness values described in the IR to create proofs.

### Installation

Follow the installation instructions described [here](../../../../../barretenberg/bbup/README.md#installation).

### Usage prerequisites

Certain `bb` commands will expect the tool `jq` to already be installed. If `jq -V` doesn't return a version number, install it from [here](https://jqlang.github.io/jq/download/).

### Usage

For comprehensive documentation, visit [barretenberg.aztec.network/docs](https://barretenberg.aztec.network/docs/).

#### Quick Start

1. Follow [the Noir docs](https://noir-lang.org/docs/getting_started/quick_start) to compile and generate witness of your Noir program

2. Prove the valid execution of your Noir program:

   ```bash
   bb prove -b ./target/hello_world.json -w ./target/witness-name.gz -o ./target/proof
   ```

3. Compute the verification key:

   ```bash
   bb write_vk -b ./target/hello_world.json -o ./target/vk
   ```

4. Verify your proof:

   ```bash
   bb verify -k ./target/vk -p ./target/proof
   ```

   If successful, the verification will complete in silence; if unsuccessful, the command will trigger logging of the corresponding error.

#### FilePath vs Stdout

For commands which allow you to send the output to a file using `-o {filePath}`, there is also the option to send the output to stdout by using `-o -`.

#### Verifier Targets

Use `--verifier_target` (or `-t`) to configure proofs for different verification environments:

```bash
# For EVM/Solidity verification
bb prove -b ./target/hello_world.json -w ./target/witness-name.gz --verifier_target evm -o ./target/proof

# For recursive verification in Noir circuits
bb prove -b ./target/hello_world.json -w ./target/witness-name.gz --verifier_target noir-recursive -o ./target/proof
```

See the full documentation for details on all available targets and options.

### Maximum circuit size

Currently the binary downloads an SRS that can be used to prove the maximum circuit size. This maximum circuit size parameter is a constant in the code and has been set to $2^{23}$ as of writing. This maximum circuit size differs from the maximum circuit size that one can prove in the browser, due to WASM limits.
