---
title: Pay Fees Privately
tags: [fees, privacy, fpc]
sidebar_position: 8
description: Learn how private fee payment works on Aztec and walk through an example using a community-built fully private Fee Payment Contract.
---

import { General, Fees } from '@site/src/components/Snippets/general_snippets';

This guide explains how private fee payment works on Aztec and walks through a concrete example. A fully private FPC can pay transaction fees without revealing the payer — it has no public functions, no owner, and no offchain agent. Because the contract is fully private, **no onchain deployment transaction is required**. Every app just derives the address deterministically from the class hash and a shared salt, and users interact with it privately.

To illustrate the pattern, this guide uses [`PrivateFPC`](https://github.com/defi-wonderland/aztec-fee-payment) — a community-built implementation by [DeFi Wonderland](https://github.com/defi-wonderland). You could write your own private FPC following the same design principles.

## Prerequisites

- <General.AztecJSPrerequisites />
- Familiarity with [fee concepts](../foundational-topics/fees.md) and [Paying Fees](./how_to_pay_fees.md)

:::info
<Fees.FeeAsset_NonTransferrable />
:::

## Why a fully private FPC?

The `PrivateFeePaymentMethod` shipped in `@aztec/aztec.js/fee` (now deprecated) targets the reference [`FPC` contract](https://github.com/AztecProtocol/aztec-packages/blob/v4.2.0/noir-projects/noir-contracts/contracts/fees/fpc_contract/src/main.nr), which accepts an arbitrary asset and calls custom token functions (like `transfer_to_public`) during the setup phase of a transaction. Since Aztec v4.2.0, token functions are no longer in the default public setup allowlist, so that flow is rejected on public networks. See the [migration note](../resources/migration_notes.md#custom-token-fpcs-removed-from-default-public-setup-allowlist) for details.

A fully private FPC avoids the problem entirely by holding Fee Juice claimed from L1 as an internal private balance and never making cross-contract calls during setup — it only verifies a Fee Juice nullifier exists and deducts from its own private balance, so it passes the allowlist on every network.

## How a private FPC works

This section describes the design pattern using Wonderland's `PrivateFPC` as an example. The contract stores an internal, note-based `BalanceSet` of Fee Juice per user. There is no constructor, no admin, and no public surface.

Two flows are supported:

1. **Bridge + mint + pay** (recommended steady state):
    1. On L1, deposit Fee Juice to the `FeeJuicePortal`, targeting the FPC's Aztec address as the recipient and using a claimer-bound secret hash.
    2. On L2, call `FeeJuice.claim(...)` to emit the Fee Juice nullifier.
    3. Call `PrivateFPC.mint(amount, salt, leaf_index)` to convert the bridge claim into private Fee Juice balance inside the FPC, credited to the claimer.
    4. From that point on, every transaction can call `PrivateFPC.pay_fee()` to deduct `max_gas_cost` from the internal balance and have the FPC set itself as the transaction's fee payer.
2. **Cold-start:** First call `FeeJuice.claim(...)` so the Fee Juice nullifier lands onchain, then in a follow-up transaction call `PrivateFPC.mint_and_pay_fee(amount, salt, leaf_index)`. The contract verifies the nullifier exists, credits `amount - max_gas_cost` to the claimer, and pays the fee — useful when the user has no prior balance with the FPC.

Because `pay_fee` never makes cross-contract calls — it only deducts from the FPC's internal private balance and calls `set_as_fee_payer` — no custom token calls ever happen during the setup phase.

:::note No refund
`PrivateFPC.pay_fee()` deducts the full `max_gas_cost` and does not refund unused gas. Use `estimateGas` (see [Estimate mana costs](./how_to_pay_fees.md#estimate-mana-costs)) to right-size your limits.
:::

## Share one FPC address across the ecosystem

Privacy on Aztec comes from indistinguishability. When two transactions call the *same* contract with the *same* function selector and argument shape, they are indistinguishable to an outside observer. If your app derives its own copy of a private FPC with a unique salt, that copy has its own (tiny) anonymity set. If every app derives the *same* FPC address and routes fees through it, every private fee payment in the ecosystem looks the same, and they all share a single, much larger privacy set.

This is the whole point of a fully private FPC: because you don't have to deploy it on L2, there is no race to "be the deployer" — the only thing that matters is that everyone agrees on the address.

## Recommended salt: `0`

Two parties derive the same contract address if and only if they use the same compiled artifact and the same deployment salt. For any fully private FPC, using a common salt maximizes the shared privacy set. The community convention for Wonderland's `PrivateFPC` is `Fr.ZERO`.

This is a convention, not a protocol-enforced default. It is up to each developer to pass the salt when registering the contract with their PXE, just as they choose any other deployment parameter. Following the convention means your users' private fee payments join the same privacy set as every other app that follows it.

:::danger Version-specific addresses
The `PrivateFPC` address depends on the compiled contract bytecode. A different Aztec version produces different bytecode and therefore a **different address**. Sending Fee Juice to the wrong address means **unrecoverable loss**. Before using a derived address on a given network, verify the network runs the same Aztec version as the Wonderland SDK version you have installed.
:::

## Example: pay fees with Wonderland's `PrivateFPC`

The SDK exports two payment methods (`FPCFeePaymentMethod` for users who already have a private balance, and `PrivateMintAndPayFeePaymentMethod` for cold-start) plus a `registerPrivateContract` helper that registers the FPC with your PXE using the shared salt — no deployment transaction needed.

For installation, the complete bridge-claim-mint-pay flow, required `send()` options (including `additionalScopes` and `gasSettings`), and a runnable end-to-end example, see the [SDK README](https://github.com/defi-wonderland/aztec-fee-payment/blob/dev/src/ts/README.md) and the [integration test](https://github.com/defi-wonderland/aztec-fee-payment/blob/dev/src/ts/test/private.test.ts).

:::note Transaction behavior
| Scenario | Status | Execution result | Fee paid? |
| --- | --- | --- | --- |
| Private revert | `DROPPED` (not included in block) | — | No |
| Public revert | `PROPOSED` | `REVERTED` | Yes (FPC pays) |
| Success | `PROPOSED` | `SUCCESS` | Yes (FPC pays) |
:::

## Reference implementation

Wonderland's repository ships detailed documentation for this design and its security properties:

- [Private FPC Product Requirements](https://github.com/defi-wonderland/aztec-fee-payment/blob/dev/docs/private-product-requirements.md) — problem statement, requirements matrix, cryptographic design (secret derivation, nullifier reconstruction, double-spend prevention), and security properties
- [`PrivateFPC` Noir source](https://github.com/defi-wonderland/aztec-fee-payment/blob/dev/src/nr/private_contract/src/main.nr) — the contract itself, annotated with the full bridge-to-mint-to-pay flow
- [`src/ts/README.md`](https://github.com/defi-wonderland/aztec-fee-payment/blob/dev/src/ts/README.md) — SDK reference with every exported class and utility
- [Integration test `private.test.ts`](https://github.com/defi-wonderland/aztec-fee-payment/blob/dev/src/ts/test/private.test.ts) — canonical end-to-end example of the bridge → claim → mint → sponsor flow

## Next steps

- Learn about [fee concepts](../foundational-topics/fees.md) in detail
- Review the other [fee payment methods](./how_to_pay_fees.md) available in `aztec.js`
- Browse Wonderland's [`aztec-fee-payment`](https://github.com/defi-wonderland/aztec-fee-payment) repository for the Noir source, TypeScript SDK, and integration examples
