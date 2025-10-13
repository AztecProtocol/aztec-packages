---
title: Private Token Contract
sidebar_position: 1
tags: [privacy, tokens, intermediate]
description: Build a privacy-preserving token for employee mental health benefits that keeps spending habits confidential.
---

## The Privacy Challenge: Mental Health Benefits at Giggle

Giggle (a fictional tech company) wants to support their employees' mental health by providing BOB tokens that can be spent at Bob's Psychology Clinic. However, employees have a crucial requirement: **complete privacy**. They don't want Giggle to know:

- How many BOB tokens they've actually used
- When they're using mental health services
- Their therapy patterns or frequency

In this tutorial, we'll build a token contract that allows Giggle to mint BOB tokens for employees while ensuring complete privacy in how those tokens are spent.

## Prerequisites

This is an intermediate tutorial that assumes you have:
- Completed the [Counter Contract tutorial](./counter_contract.md)
- A running Aztec Sandbox (see the Counter tutorial for setup)
- Basic understanding of Aztec.nr syntax and structure
- Aztec toolchain installed (`aztec-up -v #include_version_without_prefix`)

If you haven't completed the Counter Contract tutorial, please do so first as we'll skip the basic setup steps covered there.

## What We're Building

We'll create BOB tokens with:

- **Public and Private minting**: Giggle can mint tokens in private or public
- **Public and Private transfers**: Employees can spend tokens at Bob's clinic with full privacy

### Project Setup

Let's create a simple yarn + aztec.nr project:

```bash
yarn init
# This is to ensure yarn uses node_modules instead of pnp for dependency installation
yarn config set nodeLinker node-modules
yarn add @aztec/aztec.js@#include_aztec_version @aztec/accounts@#include_aztec_version @aztec/test-wallet@#include_aztec_version @aztec/kv-store@#include_aztec_version
aztec-nargo init --contract
```

## Contract structure

We have a messy, but working structure. In `src/main.nr` we even have a proto-contract. Let's replace it with a simple starting point:

```rust
#include_code start /docs/examples/tutorials/bob_token_contract/src/main.nr raw
    // We'll build the mental health token here
}
```

The `#[aztec]` macro transforms our contract code to work with Aztec's privacy protocol. We'll rename it from `StarterToken` to `BobToken` to reflect our use case.

Let's import the Aztec.nr library by adding it to our dependencies in `Nargo.toml`:

```toml
[package]
name = "bob_token_contract"
type = "contract"

[dependencies]
aztec = { git = "https://github.com/AztecProtocol/aztec-packages/", tag = "#include_aztec_version", directory = "noir-projects/aztec-nr/aztec" }
```

Since we're here, let's import more specific stuff from this library:

```rust
#include_code imports /docs/examples/tutorials/bob_token_contract/src/main.nr raw
}
```

These are the different macros we need to define the visibility of functions, and some handy types and functions.

## Building the Mental Health Token System

### The Privacy Architecture

Before we start coding, let's understand how privacy works in our mental health token system:

1. **Public Layer**: Giggle mints tokens publicly - transparent and auditable
2. **Private Layer**: Employees transfer and spend tokens privately - completely confidential
3. **Cross-layer Transfer**: Employees can move tokens between public and private domains as needed

This architecture ensures that while the initial allocation is transparent (important for corporate governance), the actual usage remains completely private.

:::info Privacy Note
In Aztec, private state uses a UTXO model with "notes" - think of them as encrypted receipts that only the owner can decrypt and spend. When an employee receives BOB tokens privately, they get encrypted notes that only they can see and use.
:::

Let's start building! Remember to import types as needed - your IDE's Noir extension can help with auto-imports.

## Part 1: Public Minting for Transparency

Let's start with the public components that Giggle will use to mint and track initial token allocations.

### Setting Up Storage

First, define the storage for our BOB tokens:

```rust
#include_code public_storage /docs/examples/tutorials/bob_token_contract/src/main.nr raw
}
```

This storage structure allows:

- `owner`: Stores Giggle's admin address (who can mint tokens)
- `public_balances`: Tracks public token balances (employees can verify their allocations)

:::tip Why Public Balances?
While employees want privacy when spending, having public balances during minting allows:

1. Employees to verify they received their mental health benefits
2. Auditors to confirm fair distribution
3. Transparency in the allocation process

:::

### Initializing Giggle as Owner

When deploying the contract, we need to set Giggle as the owner:

#include_code setup /docs/examples/tutorials/bob_token_contract/src/main.nr rust

The `#[initializer]` decorator ensures this runs once during deployment. Only Giggle's address will have the power to mint new BOB tokens for employees.

### Minting BOB Tokens for Employees

Giggle needs a way to allocate mental health tokens to employees:

#include_code mint_public /docs/examples/tutorials/bob_token_contract/src/main.nr rust

This public minting function:

1. Verifies that only Giggle (the owner) is calling
2. Transparently adds tokens to the employee's public balance
3. Creates an auditable record of the allocation

:::info Real-World Scenario
Imagine Giggle allocating 100 BOB tokens to each employee at the start of the year. This public minting ensures employees can verify they received their benefits, while their actual usage remains private.
:::

### Public Transfers (Optional Transparency)

While most transfers will be private, we'll add public transfers for cases where transparency is desired:

#include_code transfer_public /docs/examples/tutorials/bob_token_contract/src/main.nr rust

This might be used when:

- An employee transfers tokens to a colleague who's comfortable with transparency
- Bob's clinic makes a public refund
- Any scenario where privacy isn't required

### Admin Transfer (Future-Proofing)

In case Giggle's mental health program administration changes:

#include_code transfer_ownership /docs/examples/tutorials/bob_token_contract/src/main.nr rust

## Your First Deployment - Let's See It Work

### Compile Your Contract

You've written enough code to have a working token! Let's compile and test it:

```bash
aztec-nargo compile
aztec-postprocess-contract
```

### Generate TypeScript Interface

```bash
aztec codegen target --outdir artifacts
```

You should now have a nice typescript interface in a new `artifacts` folder. Pretty useful!

### Deploy and Test

Create `index.ts`. We will connect to our running sandbox and its PXE, then deploy the test accounts and get three wallets out of it.

Then we will use the `giggleWallet` to deploy our contract, mint 100 BOB to Alice, then transfer 10 of those to Bob's Clinic publicly... for now. Let's go:

```typescript
import { BobTokenContract } from './artifacts/BobToken.js';
import { AztecAddress, createAztecNodeClient } from '@aztec/aztec.js';
import { getInitialTestAccountsData } from '@aztec/accounts/testing';
import { TestWallet } from '@aztec/test-wallet/server';
import { openTmpStore } from '@aztec/kv-store/lmdb';

async function main() {
    // Connect to sandbox
    const node = createAztecNodeClient('http://localhost:8080');

    const store = await openTmpStore();

    const wallet = await TestWallet.create(node, undefined, {
        store,
    });

    const [giggleWalletData, aliceWalletData, bobClinicWalletData] = await getInitialTestAccountsData();
    const giggleAccount = await wallet.createSchnorrAccount(giggleWalletData.secret, giggleWalletData.salt);
    const aliceAccount = await wallet.createSchnorrAccount(aliceWalletData.secret, aliceWalletData.salt);
    const bobClinicAccount = await wallet.createSchnorrAccount(bobClinicWalletData.secret, bobClinicWalletData.salt);

    const giggleAddress = (await giggleAccount.getAccount()).getAddress();
    const aliceAddress = (await aliceAccount.getAccount()).getAddress();
    const bobClinicAddress = (await bobAccount.getAccount()).getAddress();

    const bobToken = await BobTokenContract
        .deploy(
            wallet,
        )
        .send({ from: giggleAddress })
        .deployed();

    await bobToken.methods
        .mint_public(aliceAddress, 100n)
        .send({ from: giggleAddress })
        .wait();

    await bobToken.methods
        .transfer_public(bobClinicAddress, 10n)
        .send({ from: aliceAddress })
        .wait();
}

main().catch(console.error);
```

Run your test:

```bash
npx tsx index.ts
```

:::tip

What's this `tsx` dark magic? Well, it just compiles and runs typescript using reasonable defaults. Pretty cool for small snippets like this!

:::

### 🎉 Celebrate

Congratulations! You've just deployed a working token contract on Aztec! You can:

- ✅ Mint BOB tokens as Giggle
- ✅ Transfer tokens between employees
- ✅ Track balances publicly

But there's a problem... **Giggle can see everything!** They know:

- Who's transferring tokens
- How much is being spent
- When mental health services are being used

This defeats the whole purpose of our mental health privacy initiative. Let's fix this by adding private functionality!

## Part 2: Adding Privacy - The Real Magic Begins

Now let's add the privacy features that make our mental health benefits truly confidential.

### Understanding Private Notes

Here's where Aztec's privacy magic happens. Unlike public balances (a single number), private balances are collections of encrypted "notes". Think of it this way:

- **Public balance**: "Alice has 100 BOB tokens" (visible to everyone)
- **Private balance**: Alice has encrypted notes [Note1: 30 BOB, Note2: 50 BOB, Note3: 20 BOB] that only she can decrypt

When Alice spends 40 BOB tokens at Bob's clinic:

1. She consumes Note1 (30 BOB) and Note2 (50 BOB) = 80 BOB total
2. She creates a new note for Bob's clinic (40 BOB)
3. She creates a "change" note for herself (40 BOB)
4. The consumed notes are nullified (marked as spent)

In this case, all that the network sees (including Giggle) is just "something happening to some state in some contract". How cool is that?

### Updating Storage for Privacy

For something like balances, you can use a simple library called `easy_private_state` which abstracts away a custom private Note. A Note is at the core of how private state works in Aztec and you can read about it [here](../../concepts/storage/notes.md). For now, let's just import the library in `Nargo.toml`:

```toml
[dependencies]
easy_private_state = { git = "https://github.com/AztecProtocol/aztec-packages/", tag = "#include_aztec_version", directory = "noir-projects/aztec-nr/easy-private-state" }
```

Then import `EasyPrivateUint` in our contract:

```rust
use aztec::macros::aztec;

#[aztec]
pub contract BobToken {
    // ... other imports
    use easy_private_state::EasyPrivateUint;
    // ...
}
```

We need to update the contract storage to have private balances as well:

#include_code storage /docs/examples/tutorials/bob_token_contract/src/main.nr rust

The `private_balances` use `EasyPrivateUint` which manages encrypted notes automatically.

### Moving Tokens to Privateland

Great, now our contract knows about private balances. Let's implement a method to allow users to move their publicly minted tokens there:

#include_code public_to_private /docs/examples/tutorials/bob_token_contract/src/main.nr rust

And the helper function:

#include_code _deduct_public_balance /docs/examples/tutorials/bob_token_contract/src/main.nr rust

By calling `public_to_private` we're telling the network "deduct this amount from my balance" while simultaneously creating a Note with that balance in privateland.

### Private Transfers

Now for the crucial privacy feature - transferring BOB tokens in privacy. This is actually pretty simple:

#include_code transfer_private /docs/examples/tutorials/bob_token_contract/src/main.nr rust

This function simply nullifies the sender's notes, while adding them to the recipient.

:::info Real-World Impact

When an employee uses 50 BOB tokens at Bob's clinic, this private transfer ensures Giggle has no visibility into:

- The fact that the employee is seeking mental health services
- The frequency of visits
- The amount spent on treatment

:::

### Checking Balances

Employees can check their BOB token balances without hitting the network by using utility unconstrained functions:

#include_code check_balances /docs/examples/tutorials/bob_token_contract/src/main.nr rust

## Part 3: Securing Private Minting

Let's make this a little bit harder, and more interesting. Let's say Giggle doesn't want to mint the tokens in public. Can we have private minting on Aztec?

Sure we can. Let's see.

### Understanding Execution Domains

Our BOB token system operates in two domains:

1. **Public Domain**: Where Giggle mints tokens transparently
2. **Private Domain**: Where employees spend tokens confidentially

The key challenge: How do we ensure only Giggle can mint tokens when the minting happens in a private function?

:::warning Privacy Trade-off

Private functions can't directly read current public state (like who the owner is). They can only read historical public state or enqueue public function calls for validation.

:::

### The Access Control Challenge

We want Giggle to mint BOB tokens directly to employees' private balances (for maximum privacy), but we need to ensure only Giggle can do this. The challenge: ownership is stored publicly, but private functions can't read current public state.

Let's use a clever pattern where private functions enqueue public validation checks. First we make a little helper function in public. Remember, public functions always run _after_ private functions, since private functions run client-side.

#include_code _assert_is_owner /docs/examples/tutorials/bob_token_contract/src/main.nr rust

Now we can add a secure private minting function. It looks pretty easy, and it is, since the whole thing will revert if the public function fails:

#include_code mint_private /docs/examples/tutorials/bob_token_contract/src/main.nr rust

This pattern ensures:

1. The private minting executes first (creating the proof)
2. The public ownership check executes after
3. If the check fails, the entire transaction (including the private part) reverts
4. Only Giggle can successfully mint BOB tokens

## Part 4: Converting Back to Public

For the sake of completeness, let's also have a function that brings the tokens back to publicland:

#include_code private_to_public /docs/examples/tutorials/bob_token_contract/src/main.nr rust

Now you've made changes to your contract, you need to recompile your contract.

Here are the steps from above, for reference:

```bash
aztec-nargo compile
aztec-postprocess-contract
aztec codegen target --outdir artifacts
```

## Testing the Complete Privacy System

Now that you've implemented all the privacy features, let's update our test script to showcase the full privacy flow:

### Update Your Test Script

Let's stop being lazy and add a nice little "log" function that just spits out everyone's balances to the console, for example:

```typescript
// at the top of your file
async function getBalances(contract: BobTokenContract, aliceAddress: AztecAddress, bobAddress: AztecAddress) {
    Promise.all([
        contract.methods
            .public_balance_of(aliceAddress)
            .simulate({ from: aliceAddress }),
        contract.methods
            .private_balance_of(aliceAddress)
            .simulate({ from: aliceAddress }),
        contract.methods
            .public_balance_of(bobAddress)
            .simulate({ from: bobAddress }),
        contract.methods
            .private_balance_of(bobAddress)
            .simulate({ from: bobAddress })
    ]).then(([alicePublicBalance, alicePrivateBalance, bobPublicBalance, bobPrivateBalance]) => {
        console.log(`📊 Alice has ${alicePublicBalance} public BOB tokens and ${alicePrivateBalance} private BOB tokens`);
        console.log(`📊 Bob's Clinic has ${bobPublicBalance} public BOB tokens and ${bobPrivateBalance} private BOB tokens`);
    });
}
```

Looks ugly but it does what it says: prints Alice's and Bob's balances. This will make it easier to see our contract working.

Now let's add some more stuff to our `index.ts`:

```typescript
async function main() {
    // ...etc
    await bobToken.methods
        .mint_public(aliceAddress, 100n)
        .send({ from: giggleAddress })
        .wait();
    await getBalances(bobToken, aliceAddress, bobClinicAddress);

    await bobToken.methods
        .transfer_public(bobClinicAddress, 10n)
        .send({ from: aliceAddress })
        .wait();
    await getBalances(bobToken, aliceAddress, bobClinicAddress);

    await bobToken.methods
        .public_to_private(90n)
        .send({ from: aliceAddress })
        .wait();
    await getBalances(bobToken, aliceAddress, bobClinicAddress);

    await bobToken.methods
        .transfer_private(bobClinicAddress, 50n)
        .send({ from: aliceAddress })
        .wait();
    await getBalances(bobToken, aliceAddress, bobClinicAddress);

    await bobToken.methods
        .private_to_public(10n)
        .send({ from: aliceAddress })
        .wait();
    await getBalances(bobToken, aliceAddress, bobClinicAddress);

    await bobToken.methods
        .mint_private(aliceAddress, 100n)
        .send({ from: giggleAddress })
        .wait();
    await getBalances(bobToken, aliceAddress, bobClinicAddress);
}

main().catch(console.error);
```

The flow is something like:

- Giggle mints Alice 100 BOB in public
- Alice transfers 10 BOB to Bob in public
- Alice makes the remaining 90 BOB private
- Alice transfers 50 of those to Bob, in private
- Of the remaining 40 BOB, she makes 10 public again
- Giggle mints 100 BOB tokens for Alice, in private

Let's give it a try:

```bash
npx tsx index.ts
```

You should see the complete privacy journey from transparent allocation to confidential usage!

## Summary

You've built a privacy-preserving token system that solves a real-world problem: enabling corporate mental health benefits while protecting employee privacy. This demonstrates Aztec's unique ability to provide both transparency and privacy where each is most needed.

The BOB token shows how blockchain can enable new models of corporate benefits that weren't possible before - where verification and privacy coexist, empowering employees to seek help without fear of judgment or career impact.

### What You Learned

- How to create tokens with both public and private states
- How to bridge between public and private domains
- How to implement access control across execution contexts
- How to build real-world privacy solutions on Aztec

### Continue Your Journey

- Explore [cross-chain communication](../../concepts/communication/cross_chain_calls.md) to integrate with existing health systems
- Learn about [account abstraction](../../concepts/accounts/index.md) for recovery mechanisms
