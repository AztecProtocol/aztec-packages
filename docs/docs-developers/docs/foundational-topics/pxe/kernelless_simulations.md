---
title: Kernelless simulations
sidebar_position: 2
tags: [pxe, simulation, gas estimation]
description: How the PXE simulates transactions without running the private kernel circuits, why it is the default for .simulate(), and what it skips.
references: ["yarn-project/pxe/src/contract_function_simulator/*", "yarn-project/stdlib/src/tx/simulated_tx.ts", "yarn-project/wallets/src/embedded/embedded_wallet.ts", "noir-projects/labs/noir-contracts/contracts/account/simulated_schnorr_account_contract/*", "noir-projects/labs/noir-contracts/contracts/account/simulated_ecdsa_account_contract/*"]
---

This page explains what kernelless simulation is in the Private eXecution Environment (PXE), how it differs from a full simulation, and where it does and does not apply. If you are looking for the recipe to make `.simulate()` succeed without signing prompts, see [Simulate without signing prompts](../../aztec-js/how_to_simulate_without_signing.md).

## Overview

A "full" simulation in the PXE runs the user's private function bytecode, then runs every private kernel circuit (init, inner, reset, tail) over the resulting execution trace. The kernels enforce protocol rules such as side-effect counter sequencing.

A **kernelless simulation** runs the same private bytecode, but skips the kernel circuits. Instead, the PXE computes the values the kernel would have produced in TypeScript via `generateSimulatedProvingResult`. The output of a kernelless simulation is the same shape as a full simulation, so callers can read return values, offchain effects, and gas estimates from it without caring which path produced them.

Kernelless simulation is the **default** for `PXE.simulateTx`. The `skipKernels` option in `SimulateTxOpts` defaults to `true`, and `BaseWallet` inherits that default. In normal use, every call to `.simulate()` on a contract method already runs without the kernels.

The main consequence is speed. Skipping the kernels removes the most expensive part of simulation, so a kernelless run is faster than a full run on typical transactions.

## What the PXE still does

A kernelless simulation is not a partial execution. The PXE still:

- runs the real ACIR bytecode for every private function in the call chain
- executes oracles, decrypts notes, builds nullifiers, and captures offchain effects
- simulates public calls against an ephemeral fork of public state
- runs `node.isValidTx` against the resulting transaction, unless `skipTxValidation` is set
- at the raw `PXE.simulateTx` level, enforces fee payer presence unless `skipFeeEnforcement` is set. Contract `.simulate()` calls through `BaseWallet` already pass `skipFeeEnforcement: true` for estimation, so you do not need to provide a fee block for normal read simulations

What it skips with `skipKernels: true`:

- the private kernel init, inner, reset, and tail circuits
- the proof generation associated with those kernels

The kernels themselves do not check authentication witnesses. Authwit validity is checked by user-contract code (the `is_valid` call that the `#[authorize_once]` macro injects into the called function). What lets a kernelless simulation skip the signing prompt is the **stub-account override**, not the absence of the kernels: replacing the caller's account contract with a stub whose `is_valid` always returns true lets that user-contract check pass without a signature.

## Simulation overrides

A kernelless simulation accepts an optional `SimulationOverrides` payload that lets you replace pieces of the state the PXE would otherwise read from chain. The shape (in `yarn-project/stdlib/src/tx/simulated_tx.ts`) is:

```typescript
type ContractOverrides = Record<
  string,
  { instance: ContractInstanceWithAddress }
>;

class SimulationOverrides {
  publicStorage?: PublicStorageOverride[];
  contracts?: ContractOverrides;
}
```

Two parts:

- `publicStorage` rewrites slots in the ephemeral public-data fork before simulation. This is compatible with kernel execution; you can use it with or without `skipKernels`.
- `contracts` swaps a contract instance in the simulator's contract DB by replacing its `currentContractClassId`. There is no `artifact` field; the new class id must already be registered with the PXE via `pxe.registerContractClass(...)` so the simulator can resolve the bytecode. This requires `skipKernels: true`: PXE explicitly rejects contract overrides combined with kernel execution, because the kernels would fail validations against the swapped class.

The `contracts` override path is what makes "simulate without signing" possible. Replacing the caller's account contract with a stub whose `is_valid` always returns true lets the simulation reach `#[authorize_once]` call sites without prompting the user to sign anything.

For the cheat that simulates a contract as if it had already been upgraded to a new class, see [`fastForwardContractUpdate`](../../aztec-js/how_to_test.md#fast-forwarding-a-contract-update), which returns a `SimulationOverrides` covering both the registry storage rewrite and the upgraded instance entry.

## Stub account contracts

The stub-account pattern is the standard way to drive a kernelless simulation without authwit prompts.

The Noir sources live at `noir-projects/labs/noir-contracts/contracts/account/simulated_schnorr_account_contract/` and `simulated_ecdsa_account_contract/`. Both implement `is_valid` to always return `IS_VALID_SELECTOR`, so authwit validity checks pass without a real signature. Their constructors deliberately emit the same shape of side effects as the real account contracts (one nullifier for the contract init, one nullifier for the `SinglePrivateImmutable` signing-key state, one note hash for the key note, and a private log) so that gas estimation against the stub produces the same numbers as the real account.

## Authwit requests come from the app, not the stub

The `CallAuthorizationRequest` offchain effects you see during a kernelless simulation are emitted by the **app or token contract's `#[authorize_once]` macro** during private execution. The stub account's only job is to let the validity check pass so the simulation can reach those call sites in the first place. The wallet then collects the requests via `collectOffchainEffects(privateExecutionResult)`, filters them by `CallAuthorizationRequest.getSelector()`, and decodes each one to build a real `AuthWitness`.

## Where kernelless does not apply

The default applies to `simulateTx`, but not to every entry point that looks like simulation:

- **`profileTx`** is not kernelless. `PXE.profileTx` always runs the private kernels after private execution; `skipProofGeneration` controls only whether a proof is produced, not whether kernel logic runs. If you call `.profile()` to measure circuit gates, expect the full kernel cost.
- **Public-only fast path**. When `BaseWallet.simulateTx` detects a leading run of public static calls, it sends them straight to `node.simulatePublicCalls` through `simulateViaNode`, bypassing the PXE private path entirely. There is no kernel to skip. `SimulationOverrides` still applies on that path.
- **Utility functions**. `FunctionType.UTILITY` calls go through `wallet.executeUtility`, not `pxe.simulateTx`. `ContractFunctionInteraction.simulate` rejects `overrides.publicStorage` and `overrides.contracts` for utility functions.

## Gas estimation parity

If the real transaction will pay through a fee payment contract (FPC) with private side effects (the FPC emits notes during fee payment), include that FPC in the simulation's fee options. The FPC's side effects feed into gas estimation, and you can run kernelless with the FPC attached to get both the speed benefit and accurate gas numbers. The default of "omit the fee block" only produces accurate gas for transactions whose fee path has no private side effects.

## Multi-account scopes

A simulation can run with multiple scoped accounts via `additionalScopes`. If you build a stub-account override for the sender only, the simulation will still prompt for authwits from any other in-scope account it touches. The override map must cover every account in scope, not just `from`.

The canonical implementation is `EmbeddedWallet.buildAccountOverrides` in `yarn-project/wallets/src/embedded/embedded_wallet.ts`: for each scoped address, fetch the live contract instance from the PXE, copy it, and rewrite `currentContractClassId` to point at the stub class id registered at wallet startup. When implementing overrides in your own wallet, follow this pattern and make sure the scope list you build against matches the one the simulation will run with.

## When you might still want a full simulation

Kernelless is the right default. Reach for `skipKernels: false` only when you are validating kernel-level behavior itself. For everything else, including accurate gas estimation through a fee payment contract with private side effects, run kernelless with the appropriate fee options.

## Related

- [Simulate without signing prompts](../../aztec-js/how_to_simulate_without_signing.md) for the recipe-oriented version of this page.
- [Reading contract data](../../aztec-js/how_to_read_data.md) for the basic `.simulate()` API.
- [Wallets](../wallets.md) for the wallet's role in capturing private authorizations during simulation.
