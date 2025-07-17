---
title: How to use recursion on NoirJS
description: Learn how to implement recursion with BB.JS, a powerful tool for creating smart contracts on the EVM blockchain. This guide assumes familiarity with NoirJS, solidity verifiers, and the Barretenberg proving backend. Discover how to generate both final and intermediate proofs using `noir_js` and `bb.js`.
keywords:
  [
    "NoirJS",
    "EVM blockchain",
    "smart contracts",
    "recursion",
    "solidity verifiers",
    "Barretenberg backend",
    "noir_js",
    "intermediate proofs",
    "final proofs",
    "nargo compile",
    "json import",
    "recursive circuit",
    "recursive app"
  ]
---

This guide shows you how to prove recursive programs using `bb.js`. We will be using Noir as the frontend language.

For the sake of clarity, it is assumed that:

- You already have a NoirJS app. If you don't, please visit the [NoirJS tutorial](https://noir-lang.org/docs/tutorials/noirjs_app) and the [reference](https://noir-lang.org/docs/reference/NoirJS/noir_js).
- You are familiar with what are recursive proofs and you have read the [recursion explainer](../explainers/recursive_aggregation.md)
- You already built a recursive circuit following [the reference](https://noir-lang.org/docs/noir/standard_library/recursion), and understand how it works.

It is also assumed that you're **not** using `noir_wasm` for compilation, and instead you've used [`nargo compile`](https://noir-lang.org/docs/reference/nargo_commands#nargo-compile) to generate the `json` you're now importing into your project.

## Step 1: Setup

In a standard recursive app, you're dealing with at least two circuits:

- `main` or `inner`: a circuit of type `assert(x != y)`, which we want to embed in another circuit recursively.
- `recursive` or `outer`: a circuit that verifies `main`.

First, let's import the necessary modules and set up our circuits:

```typescript
import { UltraHonkBackend, ProofData, Barretenberg, RawBuffer, deflattenFields } from '@aztec/bb.js';
import { Noir } from '@noir-lang/noir_js';
```


Then we need to load our circuit bytecode and set up the Noir instances:

```typescript
// Load main circuit bytecode
const mainCircuitPath = path.join(__dirname, 'fixtures/main/target/program.json');
const mainCircuitJson = JSON.parse(readFileSync(mainCircuitPath, 'utf8'));
const mainBytecode = mainCircuitJson.bytecode;

// Load recursive circuit bytecode
const recursiveCircuitPath = path.join(__dirname, 'fixtures/recursive/target/recursive.json');
const recursiveCircuitJson = JSON.parse(readFileSync(recursiveCircuitPath, 'utf8'));
const recursiveBytecode = recursiveCircuitJson.bytecode;

// Create Noir instances
mainNoir = new Noir(mainCircuitJson);
recursiveNoir = new Noir(recursiveCircuitJson);
```


The first program can be anything, so we should focus on the second one. The circuit could be something like so:

```rust
global HONK_VK_SIZE: u32 = 112;
global HONK_PROOF_SIZE: u32 = 507;
global HONK_IDENTIFIER: u32 = 1;

fn main(
    verification_key: [Field; HONK_VK_SIZE],
    proof: [Field; HONK_PROOF_SIZE],
    public_inputs: pub [Field; 1],
) {
    std::verify_proof_with_type(
        verification_key,
        proof,
        public_inputs,
        0x0,
        HONK_IDENTIFIER,
    );
}
```

A common scenario is one where you want to create a proof of multiple proof verifications, like a binary tree. Some projects and demos like [billion zk voters](https://github.com/jordan-public/billion-zk-voters) and [the 2023 progcrypto activation demo](https://github.com/signorecello/progcrypto23-act) are examples of 2-in-1 circuits.

:::info Proof Types

Different proof systems can have different proof and VK sizes and types. You need to plan this in advance depending on your proof.

In this case we're using the default HONK proof.

:::

## Step 2: Witness generation

As with every Noir program, you need to execute it and generate the witness. This is no different from a regular `noir.js` program, except you want to do it twice:

```typescript
// Generate witness for main circuit
const { witness: mainWitness } = await mainNoir.execute({ x: 1, y: 2 });

// Note: recursiveWitness will be generated later after we have the proof inputs
// const { witness: recursiveWitness } = await recursiveNoir.execute(recursiveInputs);
```


:::warning

Noir will generate a witness which doesn't mean it is constrained or valid. The proving backend (in this case Barretenberg) is responsible for the generation of the proof.

This is why you should refer this technique as "recursive aggregation" instead of "recursion".

:::

:::warning

Always keep in mind what is actually happening on your development process, otherwise you'll quickly become confused about what circuit we are actually running and why!

In this case, you can imagine that Alice (running the `main` circuit) is proving something to Bob (running the `recursive` circuit), and Bob is verifying her proof within his proof.

With this in mind, it becomes clear that our intermediate proof is the one *meant to be verified within another circuit*, so it must be Alice's. Actually, the only final proof in this theoretical scenario would be the last one, sent on-chain.

:::

## Step 3 - Proving Backend

With the witness, we are now moving into actually proving. In this example, we will be using `bb.js` for generating the proof and the verification key of the inner circuit.

Since we're using Honk proofs, let's instantiate the UltraHonkBackend just as in the [browser how-to-guide](./on-the-browser.md):

```typescript
// Setup backend for main circuit (inner circuit)
mainBackend = new UltraHonkBackend(
  mainBytecode,
  { threads: 8 },
  { recursive: true }
);

// Setup backend for recursive circuit (outer circuit)
recursiveBackend = new UltraHonkBackend(
  recursiveBytecode,
  { threads: 8 },
  { recursive: false }
);
```


:::tip

We're setting 8 threads here, but you can use the `os.cpus()` object in nodejs or `navigator.hardwareConcurrency` on the browser to make the most out of those cpu cores

:::

We can now generate the proof and the verification key (VK), for example:

```typescript
// Generate proof for main circuit with keccakZK for recursive verification
const mainProofData = await mainBackend.generateProof(mainWitness, { keccakZK: true });

// Generate verification key for main circuit
const mainVerificationKey = await mainBackend.getVerificationKey({ keccakZK: true });
```


:::info

One common mistake is to forget *who* generates the verification key.

In a situation where Alice and Bob are playing a battleships game and Alice is proving to Bob that he shot an aircraft carrier, **Bob** should generate the verification key himself. If Bob just accepts the proof and the VK from Alice, this means Alice could prove any circuit (i.e. 1 != 2) instead of the actual "proof that Bob sinked my ship"

:::

We now need to prepare our inputs to be fed correctly into the recursive program. This means getting the VK and the proof as fields. We can use the default Barretenberg API for this:

```typescript
// Convert proof and VK to fields for recursive circuit
const barretenbergAPI = await Barretenberg.new({ threads: 1 });
const proofAsFields = deflattenFields(new RawBuffer(mainProofData.proof));
const vkAsFields = (await barretenbergAPI.acirVkAsFieldsUltraHonk(new RawBuffer(mainVerificationKey)))
  .map(field => field.toString());

// Prepare inputs for recursive circuit
const recursiveInputs = {
  proof: proofAsFields,
  public_inputs: [2],
  verification_key: vkAsFields
};

await barretenbergAPI.destroy();
```


## Step 4 - Recursive proof generation

Having the proof and the VK in the correct format, generating a recursive proof is no different from a normal proof. You simply use the `backend` (with the recursive circuit) to generate it:

```typescript
// Generate witness for recursive circuit
const { witness: recursiveWitness } = await recursiveNoir.execute(recursiveInputs);

// Generate recursive proof
const recursiveProofData = await recursiveBackend.generateProof(recursiveWitness);
```


You can obviously chain this proof into another proof. In fact, if you're using recursive proofs, you're probably interested of using them this way!

## Example

You can find a non-exaustive example of recursive aggregation in the [noir-examples](https://github.com/noir-lang/noir-examples/tree/master/recursion) repository.

Keep in mind that recursive proof aggregation is very much an experimental way of using Barretenberg, and you may need to tweak or downgrade versions.

[Join the Noir discord](https://discord.gg/noirlang) for discussions, feedback and questions about anything regarding Noir and BB.
