---
title: Generate a Solidity Verifier
description:
  Learn how to run the verifier as a smart contract on the blockchain. Compile a Solidity verifier
  contract for your Noir program and deploy it on any EVM blockchain acting as a verifier smart
  contract. Read more to find out
keywords:
  [
    solidity verifier,
    smart contract,
    blockchain,
    compiler,
    plonk_vk.sol,
    EVM blockchain,
    verifying Noir programs,
    proving backend,
    Barretenberg,
  ]
sidebar_position: 0
---

This guide shows how to generate a Solidity Verifier with Barretenberg and deploy it using [Foundry](https://book.getfoundry.sh/).

:::tip[Complete Working Example]

For a complete, production-ready example with Foundry tests and deployment scripts, check out the [noir-examples/solidity-example](https://github.com/noir-lang/noir-examples/tree/master/solidity-example) repository. This repository demonstrates the full workflow from circuit compilation to on-chain verification.

:::

It is assumed that:

- You are comfortable with the Solidity programming language and understand how contracts are deployed on the Ethereum network
- You have Noir installed and you have a Noir program. If you don't, [get started](https://noir-lang.org/docs/getting_started/quick_start) with Nargo, then follow through the [Barretenberg quick start](../index.md)
- You have [Foundry](https://book.getfoundry.sh/getting-started/installation) installed. If you don't, run `curl -L https://foundry.paradigm.xyz | bash` and then `foundryup`

## Rundown

Generating a Solidity Verifier with Barretenberg is straightforward, but there are important considerations for compilation and deployment. Here's the rundown of this guide:

1. How to generate a Solidity verifier contract
2. How to set up a Foundry project
3. How to compile and test the verifier with Foundry
4. How to deploy it to a network

## Step 1 - Generate a solidity contract

First, compile your Noir circuit, then generate the verification key and Solidity verifier:

```sh
# Compile the circuit
nargo compile

# Generate the verification key. You need to pass the `--oracle_hash keccak` flag when generating vkey and proving
# to instruct bb to use keccak as the hash function, which is more optimal in Solidity
bb write_vk --oracle_hash keccak -b ./target/<noir_artifact_name>.json -o ./target

# Generate the Solidity verifier from the vkey
bb write_solidity_verifier -k ./target/vk -o ./target/Verifier.sol
```

replacing `<noir_artifact_name>` with the name of your Noir project. A `Verifier.sol` contract is now in the target folder and can be deployed to any EVM blockchain acting as a verifier smart contract.

## Step 2 - Set up a Foundry project

If you don't already have a Foundry project, create one:

```sh
# Create a new Foundry project
forge init my-verifier-project
cd my-verifier-project

# Copy the generated Verifier.sol into the src directory
cp ../target/Verifier.sol src/
```

If you already have a Foundry project, simply copy the `Verifier.sol` file into your `src` directory.

## Step 3 - Compile with Foundry

The Solidity verifier requires optimization to compile successfully. You need to configure Foundry to use the optimizer with a sufficient number of runs.

Create or update your `foundry.toml` file:

```toml
[profile.default]
src = "src"
out = "out"
libs = ["lib"]
optimizer = true
optimizer_runs = 200

# For production deployments, you may want to use more runs
# This reduces gas costs at the expense of a larger contract
[profile.production]
optimizer = true
optimizer_runs = 5000
```

Now compile the verifier:

```sh
forge build
```

:::info[Optimizer Settings]

The verifier contract is complex and requires optimization to avoid "stack too deep" errors. The noir-examples repository uses 5000 optimizer runs for production deployments, which optimizes for lower gas costs during verification at the expense of slightly higher deployment costs.

- **200 runs**: Good for development and testing
- **5000+ runs**: Recommended for production deployments where verification gas costs matter

:::

## Step 4 - Deploy the verifier

At this point we have a compiled contract ready to deploy. Foundry provides several options for deployment.

### Deploy to a local network (Anvil)

For testing, you can deploy to a local Anvil instance:

```sh
# In one terminal, start Anvil
anvil

# In another terminal, deploy the verifier
forge create --rpc-url http://localhost:8545 \
  --private-key 0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80 \
  src/Verifier.sol:UltraVerifier
```

### Deploy to a testnet or mainnet

To deploy to a real network, you'll need:
- An RPC URL for your target network
- A private key with funds for gas (use a dedicated deployment wallet, not your main wallet)

```sh
# Example: Deploy to Base Sepolia testnet
forge create --rpc-url https://sepolia.base.org \
  --private-key $PRIVATE_KEY \
  src/Verifier.sol:UltraVerifier \
  --legacy

# Example: Deploy to Base Mainnet (use with caution!)
forge create --rpc-url https://mainnet.base.org \
  --private-key $PRIVATE_KEY \
  src/Verifier.sol:UltraVerifier \
  --legacy
```

:::warning[Private Key Security]

Never hardcode private keys in scripts or commit them to version control. Use environment variables or Foundry's keystore feature:

```sh
# Create an encrypted keystore
cast wallet import myKeystore --interactive

# Use the keystore for deployment
forge create --rpc-url $RPC_URL \
  --account myKeystore \
  src/Verifier.sol:UltraVerifier
```

:::

### Using deployment scripts

For more complex deployments, create a Foundry script. Create `script/Deploy.s.sol`:

```solidity
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "forge-std/Script.sol";
import "../src/Verifier.sol";

contract DeployScript is Script {
    function run() external {
        vm.startBroadcast();

        UltraVerifier verifier = new UltraVerifier();
        console.log("Verifier deployed at:", address(verifier));

        vm.stopBroadcast();
    }
}
```

Then deploy using:

```sh
forge script script/Deploy.s.sol:DeployScript --rpc-url $RPC_URL --broadcast --legacy
```

### Verify contract on block explorer

After deploying to a public network, you can verify your contract on the block explorer using Foundry:

```sh
# Get your contract address from the deployment
forge verify-contract \
  --chain-id 84532 \
  --compiler-version v0.8.20 \
  --optimizer-runs 200 \
  <CONTRACT_ADDRESS> \
  src/Verifier.sol:UltraVerifier \
  --etherscan-api-key $ETHERSCAN_API_KEY
```

For networks like Base, you can use Basescan:

```sh
forge verify-contract \
  --chain-id 8453 \
  --compiler-version v0.8.20 \
  --optimizer-runs 5000 \
  <CONTRACT_ADDRESS> \
  src/Verifier.sol:UltraVerifier \
  --verifier-url https://api.basescan.org/api \
  --etherscan-api-key $BASESCAN_API_KEY
```

## Step 5 - Testing the verifier

### Generate a proof

To verify a proof using the Solidity verifier contract, we first need to generate a proof. The verifier expects to call:

```solidity
function verify(bytes calldata _proof, bytes32[] calldata _publicInputs) external view returns (bool)
```

Generate a proof with `bb`. We need a `Prover.toml` file for our inputs:

```bash
nargo check
```

This will generate a `Prover.toml` you can fill with the values you want to prove. We can now execute the circuit with `nargo` and then use the proving backend to prove:

```bash
nargo execute <witness-name>
bb prove --oracle_hash keccak -b ./target/<circuit-name>.json -w ./target/<witness-name>.gz -o ./target
```

### Binary Output Format

Barretenberg outputs `proof` and `public_inputs` files in binary format. The binary format is fields-compatible, meaning it can be split into 32-byte chunks where each chunk represents a field element.

### Create a Foundry test

Create a test file `test/Verifier.t.sol`:

```solidity
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "forge-std/Test.sol";
import "../src/Verifier.sol";

contract VerifierTest is Test {
    UltraVerifier public verifier;

    function setUp() public {
        verifier = new UltraVerifier();
    }

    function testVerifyProof() public {
        // Read the proof from file
        bytes memory proof = vm.readFileBinary("../target/proof");

        // Read and parse public inputs from file
        bytes memory publicInputsBytes = vm.readFileBinary("../target/public_inputs");
        bytes32[] memory publicInputs = new bytes32[](publicInputsBytes.length / 32);

        for (uint i = 0; i < publicInputs.length; i++) {
            bytes32 chunk;
            uint offset = i * 32;
            assembly {
                chunk := mload(add(publicInputsBytes, add(32, offset)))
            }
            publicInputs[i] = chunk;
        }

        // Verify the proof
        bool result = verifier.verify(proof, publicInputs);
        assertTrue(result, "Proof verification failed");
    }
}
```

Run the test:

```sh
forge test --optimize --optimizer-runs 5000 --gas-report -vvv
```

:::tip[Gas Reporting]

The `--gas-report` flag provides detailed gas cost information for your verification. This is useful for understanding the on-chain costs of proof verification.

:::

A programmatic example of how the `verify` function is called in a real application can be seen in the example zk voting application [here](https://github.com/noir-lang/noir-examples/blob/33e598c257e2402ea3a6b68dd4c5ad492bce1b0a/foundry-voting/src/zkVote.sol#L35):

```solidity
function castVote(bytes calldata proof, uint proposalId, uint vote, bytes32 nullifierHash) public returns (bool) {
  // ...
  bytes32[] memory publicInputs = new bytes32[](4);
  publicInputs[0] = merkleRoot;
  publicInputs[1] = bytes32(proposalId);
  publicInputs[2] = bytes32(vote);
  publicInputs[3] = nullifierHash;
  require(verifier.verify(proof, publicInputs), "Invalid proof");
```

:::info[Return Values]

A circuit doesn't have the concept of a return value. Return values are just syntactic sugar in Noir.

Under the hood, the return value is passed as an input to the circuit and is checked at the end of the circuit program.

For example, if you have Noir program like this:

```rust
fn main(
    // Public inputs
    pubkey_x: pub Field,
    pubkey_y: pub Field,
    // Private inputs
    priv_key: Field,
) -> pub Field
```

the `verify` function will expect the public inputs array (second function parameter) to be of length 3, the two inputs and the return value.

Passing only two inputs will result in an error such as `PUBLIC_INPUT_COUNT_INVALID(3, 2)`.

In this case, the inputs parameter to `verify` would be an array ordered as `[pubkey_x, pubkey_y, return]`.

:::

:::tip[Structs]

You can pass structs to the verifier contract. They will be flattened so that the array of inputs is 1-dimensional array.

For example, consider the following program:

```rust
struct Type1 {
  val1: Field,
  val2: Field,
}

struct Nested {
  t1: Type1,
  is_true: bool,
}

fn main(x: pub Field, nested: pub Nested, y: pub Field) {
  //...
}
```

The order of these inputs would be flattened to: `[x, nested.t1.val1, nested.t1.val2, nested.is_true, y]`

:::

The other function you can call is our entrypoint `verify` function, as defined above.

:::tip

It's worth noticing that the `verify` function is actually a `view` function. A `view` function does not alter the blockchain state, so it doesn't need to be distributed (i.e. it will run only on the executing node), and therefore doesn't cost any gas.

This can be particularly useful in some situations. If Alice generated a proof and wants Bob to verify its correctness, Bob doesn't need to run Nargo, NoirJS, or any Noir specific infrastructure. He can simply make a call to the blockchain with the proof and verify it is correct without paying any gas.

It would be incorrect to say that a Noir proof verification costs any gas at all. However, most of the time the result of `verify` is used to modify state (for example, to update a balance, a game state, etc). In that case the whole network needs to execute it, which does incur gas costs (calldata and execution, but not storage).

:::

## Compatibility with different EVM chains

Barretenberg proof verification requires the `ecMul`, `ecAdd`, `ecPairing`, and `modexp` EVM precompiles. You can deploy and use the verifier contract on all EVM chains that support the precompiles.

EVM Diff provides a great table of which EVM chains support which precompiles: https://www.evmdiff.com/features?feature=precompiles

Some EVM chains manually tested to work with the Barretenberg verifier include:

- Optimism
- Arbitrum
- Polygon PoS
- Scroll
- Celo
- BSC
- Blast L2
- Avalanche C-Chain
- Mode
- Linea
- Moonbeam

Pull requests to update this section is welcome and appreciated if you have compatibility updates on existing / new chains to contribute: https://github.com/noir-lang/noir

## Complete Workflow Summary

Here's the complete workflow from circuit to on-chain verification:

```sh
# 1. Compile your circuit
cd circuits
nargo compile

# 2. Generate verifier
bb write_vk --oracle_hash keccak -b ./target/<circuit>.json -o ./target
bb write_solidity_verifier -k ./target/vk -o ../contract/src/Verifier.sol

# 3. Set up Foundry project (if not already done)
cd ../contract
forge init # or skip if project exists

# 4. Compile with Foundry
forge build --optimize --optimizer-runs 5000

# 5. Generate proof
cd ../circuits
nargo execute witness
bb prove --oracle_hash keccak -b ./target/<circuit>.json -w ./target/witness.gz -o ./target

# 6. Test locally
cd ../contract
forge test --optimize --optimizer-runs 5000 --gas-report -vvv

# 7. Deploy
forge script script/Deploy.s.sol --rpc-url $RPC_URL --broadcast --legacy

# 8. Verify on block explorer (optional)
forge verify-contract --chain-id <CHAIN_ID> \
  --compiler-version v0.8.20 \
  --optimizer-runs 5000 \
  <CONTRACT_ADDRESS> \
  src/Verifier.sol:UltraVerifier \
  --etherscan-api-key $API_KEY
```

## What's next

Now that you know how to generate, compile, test, and deploy a Noir Solidity Verifier using Foundry, you're ready to integrate proof verification into your applications.

### Production-Ready Examples

For a complete, working example with Foundry integration, automated testing, and deployment scripts, explore the [noir-examples/solidity-example](https://github.com/noir-lang/noir-examples/tree/master/solidity-example) repository. This example includes:

- Build scripts for automated verifier generation
- Foundry tests for proof verification
- Deployment scripts for mainnet/testnet
- JavaScript utilities for proof generation with bb.js
- Gas cost benchmarks and optimization settings

### Additional Resources

You can find other tools, examples, boilerplates and libraries in the [awesome-noir](https://github.com/noir-lang/awesome-noir) repository.
