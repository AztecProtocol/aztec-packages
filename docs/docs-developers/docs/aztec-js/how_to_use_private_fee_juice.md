---
title: Pay Fees Privately
tags: [fees, privacy, fpc]
sidebar_position: 8
description: Learn how private fee payment works on Aztec and walk through an example using a community-built fully private Fee Payment Contract.
---

import { General, Fees } from '@site/src/components/Snippets/general_snippets';

This guide explains how private fee payment works on Aztec and walks through a concrete example. A fully private FPC can pay transaction fees without revealing the payer: it has no public functions, no owner, and no offchain agent. Because the contract is fully private, **no onchain deployment transaction is required**. Every app just derives the address deterministically from the class hash and a shared salt, and users interact with it privately.

To illustrate the pattern, this guide uses [`PrivateFPC`](https://github.com/alejoamiras/ecosystem-tooling/tree/main/packages/private-fee-juice), a community-maintained implementation published on npm as [`@alejoamiras/private-fee-juice`](https://www.npmjs.com/package/@alejoamiras/private-fee-juice). You could write your own private FPC following the same design principles.

## Prerequisites

- <General.AztecJSPrerequisites />
- Familiarity with [fee concepts](../foundational-topics/fees.md) and [Paying Fees](./how_to_pay_fees.md)

:::info
<Fees.FeeAsset_NonTransferrable />
:::

## Why a fully private FPC?

On Aztec, the transaction's setup phase is non-revertible, and a protocol-level allowlist controls which public function calls are permitted during it. Public token functions (like `transfer_in_public` and `_increase_public_balance`) have been removed from the default allowlist; custom FPCs may only call protocol-contract setup functions like those on `AuthRegistry` and `FeeJuice`. The reference [`FPC` contract](https://github.com/AztecProtocol/aztec-packages/blob/#include_aztec_version/noir-projects/noir-contracts/contracts/fees/fpc_contract/src/main.nr) collects user payment during setup by calling those token functions, so its flow is now rejected on public networks. The `PrivateFeePaymentMethod` shipped in `@aztec/aztec.js/fee` (which targets that contract) is therefore deprecated. See the [migration note](../resources/migration_notes.md#custom-token-fpcs-removed-from-default-public-setup-allowlist) for details.

A fully private FPC side-steps the allowlist entirely. Instead of collecting payment from the user during setup, it holds Fee Juice as its own internal private balance (funded earlier by the user through the Fee Juice portal). When a transaction runs, the FPC just verifies that a **Fee Juice claim nullifier** exists in the nullifier tree (proof that the L1 deposit was consumed on L2) and deducts from its private note-based balance. No public cross-contract token calls happen during setup, so the allowlist never blocks anything.

## How a private FPC works

This section describes the design pattern using the community `PrivateFPC` as an example. The contract stores an internal, note-based `BalanceSet` of Fee Juice per user. There is no constructor, no admin, and no public surface.

### Two salts, not one

Two different salt values show up in this flow; it's worth naming them up front so they don't get confused:

- **Deployment salt.** Used to derive the FPC's contract address. Once a community agrees on the bytecode and this salt, everyone can derive the same address locally without an onchain deployment tx. The convention for the community `PrivateFPC` is `Fr.ZERO` (see [Recommended salt](#recommended-salt-0)).
- **Bridge salt.** A random value the user chooses per L1 deposit. Combined with the user's Aztec address, it derives the _bridge secret_ (`secret = poseidon2([salt, claimer], DOM_SEP__FPC_BRIDGE_SECRET)`), whose hash is passed as the `secretHash` on the L1 deposit. Only the user knows the preimage, so only the user can later produce the `secret` that `FeeJuice.claim` requires to consume the L1-to-L2 message.

`PrivateFPC.mint(amount, salt, leaf_index)` and `PrivateFPC.mint_and_pay_fee(amount, salt, leaf_index)` take the **bridge** salt (along with the leaf index and the user's claimer address, which is `msg_sender`) to reconstruct the Fee Juice claim nullifier and verify the bridge was consumed.

### Two flows

1. **Bridge + mint + pay** (run once to seed the user's private Fee Juice balance inside the FPC, and run again each time that balance runs low and the user wants to add more by bridging another deposit from L1):
   1. **L1 deposit.** Call `FeeJuicePortal.depositToAztecPublic(_to = fpcAddress, _amount = amount, _secretHash = computeSecretHash(bridgeSecret))` where `bridgeSecret = poseidon2([bridgeSalt, claimer], DOM_SEP__FPC_BRIDGE_SECRET)`. The FPC is the _recipient_ of the deposit, the user is the _claimer_.
   2. **L2 claim.** In a normal L2 transaction, call `FeeJuice.claim(fpcAddress, amount, bridgeSecret, leafIndex)` directly. This consumes the L1-to-L2 message, credits Fee Juice to the FPC's **public** Fee Juice balance, and emits the claim nullifier. The fee for this transaction is paid by whatever mechanism the user normally uses (their own Fee Juice, `FeeJuicePaymentMethodWithClaim` on a _separate_ bridge they control, the Sponsored FPC on devnet/testnet, and so on). The `PrivateFPC` does _not_ sponsor this call, because at this point the user has no balance with it yet.
   3. **Mint.** In a follow-up L2 transaction, call `PrivateFPC.mint(amount, bridgeSalt, leafIndex)` (again paid by whatever mechanism the user normally uses). `mint` does **not** call `FeeJuice.claim` again, because the claim already happened in step 1.2. The contract recomputes the same nullifier value that the earlier `claim` emitted (possible because the user supplies the `bridgeSalt` that originally produced it), asserts that nullifier exists in the nullifier tree as proof the L1 deposit was consumed, emits its own FPC-scoped nullifier to prevent double-minting the same bridge credit, and credits `amount` to the claimer's private balance inside the FPC.
   4. **Pay.** From that point on, the user can pass `new FPCFeePaymentMethod(fpcAddress)` as the payment method on any transaction. Under the hood, the method calls `PrivateFPC.pay_fee()` in setup, which deducts `max_gas_cost` from the user's private balance and makes the FPC the fee payer.
2. **Cold-start** (single-transaction equivalent of steps 2–4 above, for first-time users who have only done the L1 deposit):
   1. **L1 deposit.** Same as step 1.1 above.
   2. **Single L2 transaction.** Pass `new PrivateMintAndPayFeePaymentMethod(fpcAddress, amount, bridgeSecret, bridgeSalt, leafIndex)` as the payment method on the user's first real transaction. The SDK bundles two calls into the setup phase of that single transaction:
      - `FeeJuice.claim(fpcAddress, amount, bridgeSecret, leafIndex)`: consumes the L1-to-L2 message, crediting Fee Juice to the FPC and emitting the claim nullifier (pending within the same tx).
      - `PrivateFPC.mint_and_pay_fee(amount, bridgeSalt, leafIndex)`: asserts the (pending) claim nullifier, credits `amount - max_gas_cost` to the user's private balance in the FPC, and marks the FPC as fee payer.

      The bridged amount itself funds this transaction's fee, so the user doesn't need prior Fee Juice or a sponsor to bootstrap. Any remaining credit (`amount - max_gas_cost`) is available for subsequent transactions via `FPCFeePaymentMethod`.

Cold-start exists for users who have no other way to pay fees: the bridged amount itself funds that very first transaction, but `max_gas_cost` of it is consumed in the process. For top-ups (when the user already has another fee mechanism), the three-step `claim → mint → pay` path is preferable because it credits the full `amount` rather than `amount - max_gas_cost`, and it decouples the L1 bridge from the first app transaction (useful for privacy). For protocol details and the full API surface, see the [SDK README](https://github.com/alejoamiras/ecosystem-tooling/blob/main/packages/private-fee-juice/src/ts/README.md) and [PRD](https://github.com/alejoamiras/ecosystem-tooling/blob/main/packages/private-fee-juice/docs/private-product-requirements.md).

Because neither `pay_fee` nor `mint_and_pay_fee` makes public cross-contract token calls in setup (they only deduct from the FPC's internal private balance and invoke `set_as_fee_payer`), the [setup-phase allowlist](../foundational-topics/transactions.md#setup-phase-non-revertible) never blocks these flows.

:::note No refund
`PrivateFPC.pay_fee()` deducts the full `max_gas_cost` and does not refund unused gas. Read `gasUsed` from a simulation (see [Estimate mana costs](./how_to_pay_fees.md#estimate-mana-costs)) to right-size your limits.
:::

## Share one FPC address across the ecosystem

Privacy on Aztec comes from indistinguishability. Private calldata and user identities are hidden. What an observer sees of a private call is its onchain *footprint*: the number of nullifiers and note commitments it emits, any logs, and its public gas usage. They do not learn which contract or which function produced those. Any two transactions whose footprints match are indistinguishable, even if they originated from entirely different contracts or functions, so an anonymity set at the private layer can span many unrelated contract–function pairs.

Fee payments add one extra observable: the transaction's fee payer address, set via `set_as_fee_payer()`, is recorded onchain by the protocol. Every fee paid through a given FPC address is therefore publicly tagged with that address. If your app uses its own copy of the private FPC at a unique address, that tag distinguishes your users' fee payments from everyone else's. If every app derives the *same* FPC address and routes fees through it, every private fee payment in the ecosystem shares the same public fee-payer tag and joins a single, much larger shared set.

This is the whole point of a fully private FPC. Because you don't have to deploy it on L2, there is no race to "be the deployer": the only thing that matters is that everyone agrees on the address.

## Recommended salt: `0`

Two parties derive the same contract address if and only if they use the same compiled artifact and the same deployment salt. For any fully private FPC, using a common salt maximizes the shared privacy set. The community convention for `PrivateFPC` is `Fr.ZERO`.

This is a convention, not a protocol-enforced default. It is up to each developer to pass the salt when registering the contract with their PXE, just as they choose any other deployment parameter. Following the convention means your users' private fee payments join the same privacy set as every other app that follows it.

:::danger Version-specific addresses
The `PrivateFPC` address depends on the compiled contract bytecode. A different Aztec version produces different bytecode and therefore a **different address**. Sending Fee Juice to the wrong address means **unrecoverable loss**. Before using a derived address on a given network, verify the network runs the same Aztec version as the `private-fee-juice` SDK version you have installed.
:::

## Example: pay fees with the community `PrivateFPC`

The SDK exports two payment methods plus a `registerPrivateContract` helper that registers the FPC with your PXE using the shared deployment salt, with no deployment transaction needed:

- `new FPCFeePaymentMethod(fpcAddress)`: for users who already have a private balance in the FPC. Wraps `PrivateFPC.pay_fee()`.
- `new PrivateMintAndPayFeePaymentMethod(fpcAddress, amount, bridgeSecret, bridgeSalt, leafIndex)`: for cold-start. Bundles `FeeJuice.claim` and `PrivateFPC.mint_and_pay_fee` into the setup phase of a single transaction.

For installation, the complete bridge-claim-mint-pay flow, required `send()` options (including `additionalScopes` and `gasSettings`), and a runnable end-to-end example, see the [SDK README](https://github.com/alejoamiras/ecosystem-tooling/blob/main/packages/private-fee-juice/src/ts/README.md) and the [integration test](https://github.com/alejoamiras/ecosystem-tooling/blob/main/packages/private-fee-juice/src/ts/test/private.test.ts).

:::note Transaction behavior
| Scenario | Status | Execution result | Fee paid? |
| --- | --- | --- | --- |
| Private revert | `DROPPED` (not included in block) | N/A | No |
| Public revert | `PROPOSED` | `REVERTED` | Yes (FPC pays) |
| Success | `PROPOSED` | `SUCCESS` | Yes (FPC pays) |
:::

## Reference implementation

The [`private-fee-juice` package](https://github.com/alejoamiras/ecosystem-tooling/tree/main/packages/private-fee-juice) ships detailed documentation for this design and its security properties:

- [Private FPC Product Requirements](https://github.com/alejoamiras/ecosystem-tooling/blob/main/packages/private-fee-juice/docs/private-product-requirements.md): problem statement, requirements matrix, cryptographic design (secret derivation, nullifier reconstruction, double-spend prevention), and security properties
- [`PrivateFPC` Noir source](https://github.com/alejoamiras/ecosystem-tooling/blob/main/packages/private-fee-juice/src/nr/private_contract/src/main.nr): the contract itself, annotated with the full bridge-to-mint-to-pay flow
- [`src/ts/README.md`](https://github.com/alejoamiras/ecosystem-tooling/blob/main/packages/private-fee-juice/src/ts/README.md): SDK reference with every exported class and utility
- [Integration test `private.test.ts`](https://github.com/alejoamiras/ecosystem-tooling/blob/main/packages/private-fee-juice/src/ts/test/private.test.ts): canonical end-to-end example of the bridge, claim, mint, sponsor flow

## Next steps

- Learn about [fee concepts](../foundational-topics/fees.md) in detail
- Review the other [fee payment methods](./how_to_pay_fees.md) available in `aztec.js`
- Browse the [`private-fee-juice` package](https://github.com/alejoamiras/ecosystem-tooling/tree/main/packages/private-fee-juice) for the Noir source, TypeScript SDK, and integration examples
