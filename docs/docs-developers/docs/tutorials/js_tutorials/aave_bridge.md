---
title: "Deposit to Aave from Aztec"
sidebar_position: 2
description: "Build a cross-chain DeFi integration that deposits tokens into Aave from Aztec L2 and claims yield back."
tags: [defi, cross-chain, messaging, portals, advanced]
references: ["docs/examples/contracts/aave_bridge/src/main.nr", "docs/examples/ts/aave_bridge/contracts/AavePortal.sol", "docs/examples/ts/aave_bridge/scripts/index.ts"]
---

## Why DeFi from Aztec?

Imagine you hold DAI on Aztec L2. Gas is cheap, transactions are private, but your tokens are just sitting there. What if you could deposit them into Aave on Ethereum, earn yield, and then bring those yield-bearing tokens back to Aztec?

In this tutorial, you'll build exactly that: a **cross-chain DeFi bridge** that moves tokens between Aztec and Aave's lending pool on Ethereum. By the end, you'll understand how to compose L1 DeFi protocols with Aztec's cross-chain messaging system.

## What You'll Build

The diagram below shows the full round-trip, starting from tokens the user already holds on L2:

```mermaid
graph LR
    subgraph Ethereum["Ethereum (L1)"]
        Portal["🌉 AavePortal"]
        Aave["🏦 Aave Pool"]
    end

    subgraph Aztec["Aztec (L2)"]
        Bridge["🔗 AaveBridge"]
        Token["🪙 Token"]
    end

    Bridge -->|"1. Burn tokens"| Token
    Bridge -->|"2. L2→L1 Message"| Portal
    Portal -->|"3. Deposit"| Aave

    Aave -.->|"4. Withdraw + Yield"| Portal
    Portal -.->|"5. L1→L2 Message"| Bridge
    Bridge -.->|"6. Mint (with yield)"| Token

    style Bridge fill:#4ade80,stroke:#22c55e,stroke-width:3px
    style Portal fill:#4ade80,stroke:#22c55e,stroke-width:3px
    style Token fill:#f0f0f0,stroke:#999,stroke-width:2px
    style Aave fill:#f0f0f0,stroke:#999,stroke-width:2px
```

You'll create:

- **AaveBridge (L2)** — A Noir contract that burns/mints tokens and sends/consumes cross-chain messages
- **AavePortal (L1)** — A Solidity contract that interacts with Aave and handles L1↔L2 messaging
- **Mock Aave contracts** — Simplified mocks of Aave's lending pool for local testing
- **Integration script** — A TypeScript script that deploys everything and runs the full flow

## Prerequisites

- [Aztec local network running at version #include_aztec_version](../../../getting_started_on_local_network.md) (includes the Aztec CLI, and the Node.js version it requires)
- Yarn 4, through Corepack: `npm install -g corepack && corepack enable` (Node.js 25 and later no longer include Corepack)
- Familiarity with the [Token Bridge tutorial](./token_bridge.md) (recommended)
- Basic understanding of [cross-chain messaging](../../foundational-topics/ethereum-aztec-messaging/index.md)

## Understanding the Flow

The bridge has two directions: **depositing** tokens from L2 into Aave on L1, and **claiming** them back (with yield) on L2.

### Deposit Flow (L2 → Aave)

```mermaid
sequenceDiagram
    participant User
    participant Bridge as AaveBridge (L2)
    participant Token as Token (L2)
    participant Outbox as Outbox
    participant Portal as AavePortal (L1)
    participant Aave as Aave Pool (L1)

    User->>Bridge: exit_to_l1_public(amount)
    Bridge->>Outbox: message_portal(content)
    Bridge->>Token: burn_public(user, amount)
    Note over Outbox: Wait for epoch to be submitted to L1
    User->>Portal: depositToAave(amount, proof)
    Portal->>Outbox: consume(message)
    Portal->>Aave: supply(underlying, amount)
    Aave-->>Portal: aTokens
```

### Claim Flow (Aave → L2)

```mermaid
sequenceDiagram
    participant User
    participant Portal as AavePortal (L1)
    participant Aave as Aave Pool (L1)
    participant Inbox as Inbox
    participant Bridge as AaveBridge (L2)
    participant Token as Token (L2)

    User->>Portal: claimFromAavePublic(aTokenAmount)
    Portal->>Aave: withdraw(aTokenAmount)
    Aave-->>Portal: underlying + yield
    Portal->>Inbox: sendL2Message(content)
    Note over Inbox: Wait for an L2 block to include the message (12-30s)
    User->>Bridge: claim_public(amount_with_yield)
    Bridge->>Inbox: consume_l1_to_l2_message
    Bridge->>Token: mint_to_public(user, amount_with_yield)
```

## Project Setup

The Ethereum side is a [Hardhat](https://hardhat.org) project, and the Aztec contract goes in its `contracts/aztec` folder. Create the project folder, with an empty `yarn.lock` so Yarn treats it as a project of its own even inside another one:

```bash
mkdir aztec-aave-bridge
cd aztec-aave-bridge
touch yarn.lock
```

Create `package.json`:

```json title="package.json"
{
  "name": "aztec-aave-bridge",
  "private": true,
  "type": "module",
  "packageManager": "yarn@4.13.0"
}
```

Create `.yarnrc.yml`. It installs into a plain `node_modules` folder, runs no install scripts from your dependencies, and only takes package versions published at least 7 days ago, except the Aztec packages, which you install at your network's version:

```yaml title=".yarnrc.yml"
nodeLinker: node-modules
enableScripts: false
npmMinimalAgeGate: 7d
npmPreapprovedPackages: ["@aztec-labs/*", "@aztec-foundation/*"]
```

Install Hardhat, the sources of Aztec's L1 contracts, and the Aztec packages:

```bash
yarn add hardhat@3.21.2 @aztec-foundation/l1-artifacts@#include_foundation_version_without_prefix @aztec-labs/aztec.js@#include_version_without_prefix @aztec-labs/accounts@#include_version_without_prefix @aztec-labs/wallets@#include_version_without_prefix @aztec-labs/stdlib@#include_version_without_prefix @aztec-labs/foundation@#include_version_without_prefix @aztec-labs/ethereum@#include_version_without_prefix @aztec-labs/noir-contracts.js@#include_version_without_prefix @aztec/viem@2.38.2 tsx@4.23.15
```

Yarn notes that it skipped the build scripts of a few dependencies (`YN0004`). They ship prebuilt binaries, so this tutorial needs none of those scripts.

The portal's Aztec interfaces come from `@aztec-foundation/l1-artifacts`, so they match the contracts deployed by your running network. Hardhat applies none of your remappings to files inside `node_modules`, so link those sources into the project:

```bash
ln -sfn node_modules/@aztec-foundation/l1-artifacts/l1-contracts l1-contracts
```

Create `hardhat.config.ts`:

#include_code hardhat_config /docs/examples/ts/aave_bridge/hardhat.config.ts typescript

Create `remappings.txt`. It resolves the `@oz/` and `@aztec/` imports, in your contracts and in the l1-contracts sources, through that link:

#include_code remappings /docs/examples/ts/aave_bridge/remappings.txt text

When complete, your project will have this structure:

```
aztec-aave-bridge/
  package.json
  .yarnrc.yml
  hardhat.config.ts
  remappings.txt
  l1-contracts -> node_modules/@aztec-foundation/l1-artifacts/l1-contracts
  contracts/                     # Solidity contracts
    MockERC20.sol
    MockAToken.sol
    MockAavePool.sol
    AavePortal.sol
  contracts/aztec/               # Noir contracts
    aave_bridge/
      Nargo.toml                 # workspace
      aave_bridge_contract/
        Nargo.toml
        src/main.nr
        src/config.nr
      aave_bridge_test/
        Nargo.toml
        src/lib.nr
    artifacts/                   # Generated by aztec codegen
  scripts/
    index.ts                     # Integration script
  artifacts/                     # Generated by npx hardhat compile
```

Start the local network in another terminal:

```bash
aztec start --local-network
```

## Part 1: The L2 Bridge Contract

The L2 bridge is the simpler side. It doesn't know anything about Aave — it just burns/mints tokens and passes messages. All the Aave-specific logic lives on L1.

:::note
The L2 bridge is intentionally protocol-agnostic — it just burns/mints tokens and relays messages. All Aave-specific logic lives on L1. This means you can compose with any L1 protocol without changing your L2 contract. If you've completed the [Token Bridge tutorial](./token_bridge.md), you'll recognize the pattern and can skim to [Part 2](#part-2-the-ethereum-side).
:::

Create the bridge contract:

```bash
aztec new contracts/aztec/aave_bridge
cd contracts/aztec/aave_bridge
```

The `aztec new` command creates a workspace with an `aave_bridge_contract` crate and an `aave_bridge_test` crate. Replace the generated test file at `aave_bridge_test/src/lib.nr` with a basic constructor test:

```rust
use aztec::protocol::address::{AztecAddress, EthAddress};
use aztec::protocol::traits::FromField;
use aztec::test::helpers::test_environment::TestEnvironment;
use aave_bridge_contract::AaveBridge;

#[test]
unconstrained fn test_constructor() {
    let mut env = TestEnvironment::new();
    let deployer = env.create_light_account();

    let token = AztecAddress::from_field(1);
    let portal = EthAddress::from_field(2);

    let initializer = AaveBridge::interface().constructor(token, portal);
    let _contract_address =
        env.deploy("@aave_bridge_contract/AaveBridge").with_public_initializer(deployer, initializer);
}
```

The test crate must depend on the same `aztec` source as the contract, or `aztec compile` fails with "`PublicCall` and `PublicCall` are distinct types". Set `contracts/aztec/aave_bridge/aave_bridge_test/Nargo.toml` to:

```toml
[package]
name = "aave_bridge_test"
type = "lib"

[dependencies]
aztec = { git="https://github.com/aztec-labs-eng/aztec-node", tag = "#include_aztec_version", directory = "noir-projects/aztec-nr/aztec" }
aave_bridge_contract = { path = "../aave_bridge_contract" }
```

The bridge reuses the existing `Token` contract and the `token_portal_content_hash_lib` for content hash functions. Add these dependencies to `contracts/aztec/aave_bridge/aave_bridge_contract/Nargo.toml`:

```toml
[dependencies]
aztec = { git="https://github.com/aztec-labs-eng/aztec-node", tag = "#include_aztec_version", directory = "noir-projects/aztec-nr/aztec" }
token_portal_content_hash_lib = { git="https://github.com/aztec-labs-eng/aztec-node", tag = "#include_aztec_version", directory = "noir-projects/noir-contracts/contracts/libs/token_portal_content_hash_lib" }
token = { git="https://github.com/aztec-labs-eng/aztec-node", tag = "#include_aztec_version", directory = "noir-projects/noir-contracts/contracts/app/token_contract" }
```

### Bridge Storage

The bridge stores two things: the L2 token address and the L1 portal address. First, create the config module at `contracts/aztec/aave_bridge/aave_bridge_contract/src/config.nr`:

#include_code config /docs/examples/contracts/aave_bridge/src/config.nr rust

Then replace `contracts/aztec/aave_bridge/aave_bridge_contract/src/main.nr`:

<!-- wrapped in a code block to add a "}" at the end -->

```rust
#include_code bridge_setup /docs/examples/contracts/aave_bridge/src/main.nr raw
}
```

:::warning Assembling the Contract
The code above shows the contract opening — imports, storage, constructor, and a getter — followed by a closing `}`. In the sections below, you'll add more functions **inside** this contract body. Place them before the final `}` so they are part of `pub contract AaveBridge { ... }`.
:::

### Public Claim and Exit

Add the following functions inside the `AaveBridge` contract body (before the closing `}`). `claim_public` consumes an L1→L2 message and mints tokens. `exit_to_l1_public` burns tokens and sends an L2→L1 message:

#include_code claim_public /docs/examples/contracts/aave_bridge/src/main.nr rust

#include_code exit_to_l1_public /docs/examples/contracts/aave_bridge/src/main.nr rust

The `authwit_nonce` parameter supports [authentication witnesses](../../aztec-js/how_to_use_authwit.md). When the caller is the token owner (`msg.sender`), pass `0` — no authorization witness is needed. If a third party calls this function on behalf of the owner, they must provide a valid nonce from an authwit the owner previously created.

### Private Claim and Exit

Still inside the contract body, add the private variants. They work the same way but use private token operations. The recipient's address is hidden when claiming privately:

#include_code claim_private /docs/examples/contracts/aave_bridge/src/main.nr rust

#include_code exit_to_l1_private /docs/examples/contracts/aave_bridge/src/main.nr rust

:::info Content Hash Matching

The content hash is the critical link between L1 and L2. Both sides must produce the exact same hash for a message to be consumed. The `token_portal_content_hash_lib` handles this by encoding parameters identically to the Solidity side's `abi.encodeWithSignature`. For example, `get_mint_to_public_content_hash(to, amount)` on L2 matches `Hash.sha256ToField(abi.encodeWithSignature("mint_to_public(bytes32,uint256)", to, amount))` on L1.

:::

### Compile

```bash
aztec compile
```

Generate TypeScript bindings:

```bash
aztec codegen target --outdir ../artifacts
```

:::note Token Contract
The integration script imports `TokenContract` from `@aztec-labs/noir-contracts.js`, which provides pre-built bindings for the standard Token contract. Only the custom `AaveBridge` contract needs codegen.
:::

## Part 2: The Ethereum Side

Go back to the project root:

```bash
cd ../../..
```

### Mock Aave Contracts

For local testing, you'll use simplified mocks of Aave's lending pool. The mock pool accepts deposits and returns them with a configurable yield — 10% in this tutorial (1000 basis points, where 10000 bps = 100%).

:::tip Mock vs Real Aave

In production, replace `MockAavePool` with Aave V3's `IPool` interface at `0x87870Bca3F3fD6335C3F4ce8392D69350B4fA4E2` (Ethereum mainnet). The portal contract's `IAavePool` interface already matches Aave V3's function signatures. For realistic testing, fork mainnet with `aztec-anvil --fork-url <your-rpc-url>` (the Aztec installer ships Foundry's `anvil` as `aztec-anvil`; substitute your own `anvil` if its version matches `aztec-anvil --version`).

:::

Create the following mock contracts in `contracts/`.

`contracts/MockERC20.sol` — a minimal ERC20 with public minting:

#include_code mock_erc20 /docs/examples/ts/aave_bridge/contracts/MockERC20.sol solidity

`contracts/MockAToken.sol` — Aave's yield-bearing token mock:

#include_code mock_atoken /docs/examples/ts/aave_bridge/contracts/MockAToken.sol solidity

`contracts/MockAavePool.sol` — simplified Aave lending pool that returns a configurable yield:

#include_code mock_aave_pool /docs/examples/ts/aave_bridge/contracts/MockAavePool.sol solidity

### AavePortal Contract

The portal is where the magic happens. It bridges Aztec's cross-chain messages with Aave's lending pool. Create `contracts/AavePortal.sol`:

<!-- wrapped in a code block to add a "}" at the end -->

```solidity
#include_code portal_setup /docs/examples/ts/aave_bridge/contracts/AavePortal.sol raw
}
```

:::warning Assembling the Contract
Like the L2 contract, the code above shows the contract opening — imports, state variables, and `initialize()`. The subsequent function snippets go **inside** this contract body, before the closing `}`.
:::

The portal has three key functions. First, `depositToAave` consumes an L2→L1 message (proving the user burned tokens on L2) and deposits the underlying tokens into Aave:

#include_code portal_deposit_to_aave /docs/examples/ts/aave_bridge/contracts/AavePortal.sol solidity

Then, `claimFromAavePublic` withdraws from Aave (including any yield earned) and sends an L1→L2 message so the user can mint tokens on L2:

#include_code portal_claim_public /docs/examples/ts/aave_bridge/contracts/AavePortal.sol solidity

There's also a private variant that lets the user claim without revealing their L2 address:

#include_code portal_claim_private /docs/examples/ts/aave_bridge/contracts/AavePortal.sol solidity

### Compile

```bash
npx hardhat compile
```

The compiler warns about EIP-1153 transient storage in `TransientSlot.sol`. That warning is expected: the file is OpenZeppelin code bundled with l1-contracts, which the portal reaches through the `IRollup` interface.

:::note Solidity Artifact Paths
Hardhat compiles Solidity contracts to `artifacts/contracts/` by default. The integration script imports ABIs from this location (e.g., `../artifacts/contracts/AavePortal.sol/AavePortal.json`).
:::

## Part 3: Deploying and Testing

Create `scripts/index.ts` to run the full flow. This script deploys all contracts, initializes them, deposits tokens into Aave from L2, and claims them back with yield.

### Setup

#include_code setup /docs/examples/ts/aave_bridge/scripts/index.ts typescript

:::note About EmbeddedWallet
`EmbeddedWallet` is a simplified wallet for local development. It handles key management, transaction signing, and proof generation in-process. Code written against `EmbeddedWallet` works with any `Wallet` implementation, so your application logic transfers directly to production.
:::

### Deploy L1 Contracts

#include_code deploy_l1 /docs/examples/ts/aave_bridge/scripts/index.ts typescript

### Deploy L2 Contracts

#include_code deploy_l2 /docs/examples/ts/aave_bridge/scripts/index.ts typescript

### Initialize

#include_code initialize /docs/examples/ts/aave_bridge/scripts/index.ts typescript

### Fund the User

For this tutorial, you need tokens in two places:

- **L2 tokens for the user** — The user needs tokens on L2 to burn and bridge to L1. In production, these would come from a prior bridge operation.
- **L1 underlying tokens at the portal** — When the portal calls `depositToAave`, it transfers underlying tokens to Aave. The portal must already hold these tokens. In production, the tokens would arrive via a separate bridging mechanism.

For simplicity, mint directly to both:

#include_code fund_user /docs/examples/ts/aave_bridge/scripts/index.ts typescript

### Deposit to Aave (L2 → L1)

Now for the main flow. Burn tokens on L2 and send a message to L1.

:::info Why is the portal the recipient?
The `recipient` in `exit_to_l1_public` is the L1 address that receives the withdrawal message. Since the AavePortal contract needs to deposit the tokens into Aave, the portal itself is the recipient. Setting `caller_on_l1` to `EthAddress.ZERO` means anyone can relay the message on L1 — there's no access restriction on who calls `depositToAave`.
:::

#include_code deposit_to_aave /docs/examples/ts/aave_bridge/scripts/index.ts typescript

Compute the membership witness to prove the message on L1:

#include_code get_deposit_witness /docs/examples/ts/aave_bridge/scripts/index.ts typescript

Execute the deposit on L1:

#include_code execute_deposit_l1 /docs/examples/ts/aave_bridge/scripts/index.ts typescript

### Claim from Aave with Yield (L1 → L2)

Before withdrawing from Aave, generate a random secret and compute its hash. The secret hash is included in the L1-to-L2 message — only someone who knows the pre-image (the secret) can consume the message on L2. This prevents front-running: without the secret, no one else can claim your tokens.

Withdraw from Aave on L1 and send the message to L2. The mock pool returns 10% yield:

#include_code claim_from_aave_l1 /docs/examples/ts/aave_bridge/scripts/index.ts typescript

Extract the message leaf index:

#include_code get_claim_leaf_index /docs/examples/ts/aave_bridge/scripts/index.ts typescript

On the local network, L2 blocks are only produced when transactions are submitted. An L1-to-L2 message can only be consumed once an L2 block includes it, and the network waits until the message is at least 12 seconds old before including it. This utility deploys two dummy contracts (with random salts for unique addresses) to force block production. On devnet or testnet, blocks are produced continuously and this step is unnecessary:

#include_code mine_blocks /docs/examples/ts/aave_bridge/scripts/index.ts typescript

Claim the tokens (with yield) on L2:

#include_code claim_on_l2 /docs/examples/ts/aave_bridge/scripts/index.ts typescript

### Verify

#include_code verify /docs/examples/ts/aave_bridge/scripts/index.ts typescript

Run the full flow:

```bash
npx hardhat run scripts/index.ts --network localhost
```

You should see the user start with 1000 tokens, deposit 500 to Aave, and end up with 1050 tokens (500 remaining + 550 from Aave with 10% yield).

## What You Built

A complete cross-chain DeFi integration with:

1. **L2 Bridge** (Noir) — Burns/mints tokens and handles cross-chain messages. Supports both public and private operations.
2. **L1 Portal** (Solidity) — Deposits into Aave and withdraws with yield. Handles message consumption and creation.
3. **Mock Aave** (Solidity) — Simulates yield generation for local testing.
4. **Full Flow** — Deposit tokens from L2 into Aave, earn yield, and claim back on L2.

:::warning Production Considerations

This tutorial uses mock contracts for simplicity. In production:

- Replace `MockAavePool` with a real Aave V3 pool address
- Handle Aave's variable interest rates (the withdrawn amount may differ from expectations)
- Add slippage protection and error handling for failed messages
- Consider that funds are "in flight" between chains — implement recovery mechanisms
- Add proper access controls to the portal contract

:::

## Troubleshooting

### Script hangs waiting for block to be published

The deposit flow waits for the L2 block containing your exit transaction to be included in an epoch that is submitted to L1. On the local network, this typically takes 30–60 seconds. If it takes longer, check that your local network is running and producing blocks.

### Content hash mismatch — L1 message consumption reverts

This is the most common cross-chain debugging issue. The content hash computed on L2 (via `get_withdraw_content_hash`) must exactly match what the L1 portal reconstructs via `abi.encodeWithSignature`. Double-check that:
- The function signature string matches on both sides (e.g., `"withdraw(address,uint256,address)"`)
- Parameters are in the same order and encoded as the same types
- The `caller_on_l1` value matches: `EthAddress.ZERO` on L2 corresponds to `address(0)` on L1

### "Minter not set" — L2 claim fails

If `claim_public` reverts, ensure you called `set_minter(l2Bridge.address, true)` on the Token contract **after** deploying the bridge. The bridge must be authorized as a minter before it can mint tokens on claim.

### L1→L2 message not found — claim reverts after mining blocks

An L1-to-L2 message becomes consumable once an L2 block includes it, which takes 12 to 30 seconds after the L1 transaction. Make sure `mine2Blocks` runs before the claim. If the issue persists, verify the `messageLeafIndex` extracted from the `MessageSent` event is correct.

## Next Steps

- **Test with a mainnet fork**: Use `aztec-anvil --fork-url` (or your own `anvil` install) to test against real Aave
- **Add private deposits**: Use the `claim_private` and `exit_to_l1_private` functions for privacy-preserving DeFi
- **Build a frontend**: Add a web UI for easy depositing and claiming
- **Compose with other protocols**: The same pattern works for Uniswap, Compound, or any L1 DeFi protocol

:::tip Learn More

- [Cross-chain messaging](../../foundational-topics/ethereum-aztec-messaging/index.md)
- [Token Bridge Tutorial](./token_bridge.md)
- [State management](../../foundational-topics/state_management.md)

:::
