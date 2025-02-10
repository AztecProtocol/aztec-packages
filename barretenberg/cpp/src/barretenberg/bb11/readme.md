# BB

### Why is this needed?

Barretenberg is a library that allows one to create and verify proofs. One way to specify the circuit that one will use to create and verify
proofs over is to use the Barretenberg standard library. Another way, which pertains to this module is to supply the circuit description using an IR called [ACIR](https://github.com/noir-lang/acvm).

This binary will take as input ACIR and witness values described in the IR to create proofs.

### Installation

Follow the installation instructions described [here](../../../../../barretenberg/bbup/README.md#installation).

### Usage prerequisites

Certain `bb` commands will expect the tool `jq` to already be installed. If `jq -V` doesn't return a version number, install it from [here](https://jqlang.github.io/jq/download/).

### Version compatibility with Noir

TODO: https://github.com/AztecProtocol/aztec-packages/issues/7511

For quick reference:

- Noir v0.38.0 <> BB v0.61.0
- Noir v0.37.0 <> BB v0.61.0
- Noir v0.36.0 <> BB v0.58.0
- Noir v0.35.0 <> BB v0.56.0
- Noir v0.34.0 <> BB v0.55.0
- Noir v0.33.0 <> BB v0.47.1
- Noir v0.32.0 <> BB v0.46.1
- Noir v0.31.0 <> BB v0.41.0

### Usage

TODO: https://github.com/AztecProtocol/aztec-packages/issues/7600

All available `bb` commands:
https://github.com/AztecProtocol/aztec-packages/blob/barretenberg-v0.55.0/barretenberg/cpp/src/barretenberg/bb/main.cpp#L1369-L1512

#### FilePath vs Stdout

For commands which allow you to send the output to a file using `-o {filePath}`, there is also the option to send the output to stdout by using `-o -`.

#### Usage with UltraHonk

Documented with Noir v0.33.0 <> BB v0.47.1:

##### Proving and verifying

1. Follow [the Noir docs](https://noir-lang.org/docs/getting_started/hello_noir/) to compile and generate witness of your Noir program

2. Prove the valid execution of your Noir program running:

   ```bash
   bb prove_ultra_honk -b ./target/hello_world.json -w ./target/witness-name.gz -o ./target/proof
   ```

3. Compute the verification key for your Noir program running:

   ```bash
   bb write_vk_ultra_honk -b ./target/hello_world.json -o ./target/vk
   ```

4. Verify your proof running:

   ```bash
   bb verify_ultra_honk -k ./target/vk -p ./target/proof
   ```

   If successful, the verification will complete in silence; if unsuccessful, the command will trigger logging of the corresponding error.

Refer to all available `bb` commands linked above for full list of functionality.

##### Generating proofs for verifying in Solidity

Barretenberg UltraHonk comes with the capability to verify proofs in Solidity, i.e. in smart contracts on EVM chains.

1. Follow [the Noir docs](https://noir-lang.org/docs/getting_started/hello_noir/) to compile and generate witness of your Noir program

2. Prove the valid execution of your Noir program running:

   ```bash
   bb prove_ultra_keccak_honk -b ./target/hello_world.json -w ./target/witness-name.gz -o ./target/proof
   ```

   > **Note:** `prove_ultra_keccak_honk` is used to generate UltraHonk proofs with Keccak hashes, as it is what the Solidity verifier is designed to be compatible with given the better gas efficiency when verifying on-chain; `prove_ultra_honk` in comparison generates proofs with Poseidon hashes, more efficient in recursions but not on-chain verifications.

3. Compute the verification key for your Noir program running:

   ```bash
   bb write_vk_ultra_honk -b ./target/hello_world.json -o ./target/vk
   ```

4. Generate Solidity verifier
   **WARNING:** Contract incomplete, do not use in production!

   ```bash
   bb contract_ultra_honk -k ./target/vk -c $CRS_PATH -b ./target/hello_world.json -o ./target/Verifier.sol
   ```

#### Usage with MegaHonk

Use `bb <command>_mega_honk`.

Refer to all available `bb` commands linked above for full list of functionality.

Note that MegaHonk:

- Generates insecure recursion circuits when Goblin recursive verifiers are not present
- Will not have a Solidity verifier, as the proving system is intended for use with apps deploying on Aztec only

### Maximum circuit size

Currently the binary downloads an SRS that can be used to prove the maximum circuit size. This maximum circuit size parameter is a constant in the code and has been set to $2^{23}$ as of writing. This maximum circuit size differs from the maximum circuit size that one can prove in the browser, due to WASM limits.
