---
title: Simulate without signing prompts
tags: [simulation, authwit, wallet]
sidebar_position: 6
description: How to call .simulate() on a view function or estimate gas without prompting the user to sign authentication witnesses.
---

You want to call `.simulate()` from an app and not have the user's wallet pop up a signing prompt. This page covers the symptoms that lead to that prompt, why the obvious workarounds do not work, and the right fix.

For the conceptual model of what kernelless simulation is, see [Kernelless simulations](../foundational-topics/pxe/kernelless_simulations.md).

## Symptoms

You are probably here because of one of these:

- The wallet prompts the user for a signature on every `.simulate()` call, including reads of view-style functions.
- `.simulate()` fails with one of:
  - `Account "0x0000…0000" does not exist on this wallet.` (from `EmbeddedWallet`)
  - `Account not found in wallet for address: 0x0000…0000` (from other wallets built on `BaseWallet`)
  - `Circuit execution failed: min_revertible_side_effect_counter must not be 0 for tail_to_public` (from a custom wallet that does not intercept the zero address, where the call reaches the kernel)

All three are the same root cause: passing `from: AztecAddress.ZERO`.

- A custom fee payment method breaks during simulation because `from` is `AztecAddress.ZERO`.
- Simulations take long enough that you want to skip the kernel circuits entirely.

## The wrong fix

Do not pass `from: AztecAddress.ZERO`. That value was the old way to express "no account context," and it is no longer a supported input for `.simulate()`. The replacement is `NO_FROM` (from `@aztec/aztec.js/account`), which tells the wallet to execute the payload through the default entrypoint with no account contract mediation. `NO_FROM` is still only appropriate for calls that genuinely have no sender; use a real account address for everything else.

## The right fix

A simulation uses a **stub account contract override**: the wallet provides a `SimulationOverrides` payload whose `contracts` map swaps the caller's account contract for a stub whose `is_valid` always returns true, and the PXE applies that override during the kernelless simulation. With the stub in place, authwit validity checks pass without a signature, and the wallet collects any `CallAuthorizationRequest` offchain effects emitted during the run to turn them into real authentication witnesses for the eventual `.send()`.

`EmbeddedWallet` installs this override automatically on every `.simulate()` call, so most apps do not need to construct overrides themselves. The two ways to wire this up below correspond to "use the default" and "implement it in your own wallet."

### Calling .simulate() from an app

For a normal `.simulate()` you do not need to pass overrides yourself. The default simulation path is already kernelless, and wallets such as `EmbeddedWallet` install the stub-account override internally for you. Three things to remember:

- Pass a real account address as `from`, or `NO_FROM` if the call genuinely has no sender. Do not use `AztecAddress.ZERO`.
- For simple reads, you can omit the `fee` block.
- For a transaction whose real fee path uses a fee payment contract (FPC) with private side effects (the FPC emits notes during fee payment), include that FPC in the simulation's fee options so gas estimation accounts for the FPC's side effects. Kernelless still applies; the gas number stays accurate.
- If you have a stale call site that uses `from: AztecAddress.ZERO` plus a no-op fee payment method as a workaround, replace it with a real `from` (or `NO_FROM`) and drop the no-op fee contract.

```typescript title="simulate-view-without-signing" showLineNumbers 
// Reading a private view function would normally route through the account
// contract's entrypoint, whose is_valid check would prompt the user to sign.
// With EmbeddedWallet, .simulate() runs kernelless with a stub-account
// override applied to alice's account, so no signing prompt is triggered.
const { result: decimals } = await tokenContract.methods
  .private_get_decimals()
  .simulate({ from: aliceAddress });

console.log("Token decimals (read via private view):", decimals);
```
> <sup><sub><a href="https://github.com/AztecProtocol/aztec-packages/blob/v5.0.0-rc.2/docs/examples/ts/aztecjs_kernelless_simulation/index.ts#L44-L54" target="_blank" rel="noopener noreferrer">Source code: docs/examples/ts/aztecjs_kernelless_simulation/index.ts#L44-L54</a></sub></sup>


If you genuinely need to construct your own `SimulationOverrides` (for example, to combine a contract-instance swap with a `fastForwardContractUpdate` for upgrade testing), you can pass them through `.simulate()`:

```typescript
import { SimulationOverrides } from "@aztec/aztec.js/wallet";

const { result } = await contract.methods
  .transfer_in_private(sender, recipient, amount, nonce)
  .simulate({
    from: sender,
    overrides: new SimulationOverrides({
      /* contracts and/or publicStorage */
    }),
  });
```

The override map itself has to be built by code that knows the contract class id and live contract instance. That is normally the wallet, not the app. Note that `overrides` does not apply to [utility functions](../foundational-topics/pxe/kernelless_simulations.md#where-kernelless-does-not-apply), those are simulated through `wallet.executeUtility`, which rejects `SimulationOverrides`. If your wallet does not handle the override path for you and you are tempted to reimplement it in app code, read the next section instead.

### Implementing the override in a custom wallet

`EmbeddedWallet` (`yarn-project/wallets/src/embedded/embedded_wallet.ts`, in `@aztec/wallets`) is the canonical implementation of the override pattern and the reference any custom wallet should follow. The three pieces it wires up are:

1. **Register the stub contract class with the PXE at wallet startup.** Inside `initStubClasses`, `EmbeddedWallet` calls `pxe.registerContractClass` for each supported account type's stub artifact and caches the resulting class id by account type.
2. **Build an override map for every account in scope.** Inside `buildAccountOverrides`, it fetches the live contract instance for each scoped address and returns a `ContractOverrides` map that copies the instance with `currentContractClassId` rewritten to the stub class id. The map covers every account in scope, not only `from`.
3. **Use the stub entrypoint and pass the override to `pxe.simulateTx`.** Inside the overridden `simulateViaEntrypoint`, it constructs the `TxExecutionRequest` through the stub account's `DefaultAccountEntrypoint` (so the request is signed by the stub's empty-signature provider) and calls `pxe.simulateTx` with the resulting `SimulationOverrides`.

The key constraints on this path:

- `skipKernels` must be `true` to use `contracts` overrides. The PXE rejects the combination otherwise. `pxe.simulateTx` already defaults `skipKernels` to `true`.
- The stub contract class must be registered with the PXE before you reference it in an override.
- The override map must cover every scoped account, not only `from`.

## Collecting authwit requests

A simulation with the stub override active will reach `#[authorize_once]` call sites in app and token contracts without prompting for signatures. Each such site emits a `CallAuthorizationRequest` as an offchain effect, which the wallet can collect and turn into a real authentication witness for the eventual `.send()`.

The example below uses the canonical contract-mediated pattern: Alice calls `Crowdfunding.donate(amount)`, which internally calls `transfer_in_private(alice, crowdfunding, amount, 0)` with `msg_sender = crowdfunding`. The token's `#[authorize_once]` macro requires an authwit from Alice authorizing the crowdfunding contract. Because Alice is the transaction sender, her PXE already has her notes and nullifier key, so the simulation can run end-to-end against her own state without any cross-wallet state sharing.

Run the simulation and filter the offchain effects by the `CallAuthorizationRequest` selector:

```typescript title="simulate-and-collect-effects" showLineNumbers 
// Alice calls Crowdfunding.donate(amount). Internally the contract calls
// transfer_in_private(alice, crowdfunding, amount, 0) with msg_sender =
// crowdfunding, so the token's #[authorize_once] macro requires an authwit
// from Alice authorizing the crowdfunding contract. Alice is the sender, so
// her PXE has her notes and nullifier key — no cross-wallet state sharing
// is required.

// With kernelless + stub override (default in EmbeddedWallet), the simulation
// runs without prompting Alice to sign; the macro emits a
// CallAuthorizationRequest as an offchain effect that the wallet can turn
// into a real authwit before .send().
const donationAmount = 100n;
const donateAction = crowdfundingContract.methods.donate(donationAmount);

const { offchainEffects } = await donateAction.simulate({
  from: aliceAddress,
  includeMetadata: true,
});

// Filter offchain effects for authwit requests by selector.
const authwitSelector = await CallAuthorizationRequest.getSelector();
const authwitEffects = offchainEffects.filter(
  (effect) =>
    effect.data.length > 0 && effect.data[0].equals(authwitSelector.toField()),
);

if (authwitEffects.length !== 1) {
  throw new Error(
    `Expected exactly one CallAuthorizationRequest, got ${authwitEffects.length}`,
  );
}
```
> <sup><sub><a href="https://github.com/AztecProtocol/aztec-packages/blob/v5.0.0-rc.2/docs/examples/ts/aztecjs_kernelless_simulation/index.ts#L82-L114" target="_blank" rel="noopener noreferrer">Source code: docs/examples/ts/aztecjs_kernelless_simulation/index.ts#L82-L114</a></sub></sup>


Decode each effect into a `CallAuthorizationRequest`. The `innerHash` field is the piece the authorizing account needs to sign:

```typescript title="decode-call-authorization" showLineNumbers 
// Decode each effect into a CallAuthorizationRequest. The inner hash is the
// piece the authorizing account (Alice) needs to sign.
const authorizationRequests = await Promise.all(
  authwitEffects.map((effect) =>
    CallAuthorizationRequest.fromFields(effect.data),
  ),
);

for (const request of authorizationRequests) {
  console.log("Authwit needed:", {
    onBehalfOf: request.onBehalfOf.toString(),
    msgSender: request.msgSender.toString(),
    functionSelector: request.functionSelector.toString(),
  });
}

if (!authorizationRequests[0].onBehalfOf.equals(aliceAddress)) {
  throw new Error(
    `Expected onBehalfOf to be alice (${aliceAddress.toString()}), got ${authorizationRequests[0].onBehalfOf.toString()}`,
  );
}
```
> <sup><sub><a href="https://github.com/AztecProtocol/aztec-packages/blob/v5.0.0-rc.2/docs/examples/ts/aztecjs_kernelless_simulation/index.ts#L116-L138" target="_blank" rel="noopener noreferrer">Source code: docs/examples/ts/aztecjs_kernelless_simulation/index.ts#L116-L138</a></sub></sup>


Build a real authentication witness from each inner hash and send the transaction with the collected witnesses attached:

```typescript title="build-authwits-and-send" showLineNumbers 
// Alice creates a real authentication witness from each inner hash. The
// `consumer` is the contract that consumes the authwit — here, the token,
// because that's where the inner transfer_in_private (and its #[authorize_once]
// site) runs.
const authWitnesses = await Promise.all(
  authorizationRequests.map((request) =>
    wallet.createAuthWit(request.onBehalfOf, {
      consumer: tokenContract.address,
      innerHash: request.innerHash,
    }),
  ),
);

// Alice now sends the real donate transaction with the collected authwits
// attached.

// Note: EmbeddedWallet.sendTx already runs this pre-simulation + authwit
// collection internally, so passing `authWitnesses` here is redundant for
// EmbeddedWallet. We pass them explicitly anyway because this is the pattern
// a wallet that does not auto-collect needs to follow.
await donateAction.send({
  from: aliceAddress,
  authWitnesses,
});
```
> <sup><sub><a href="https://github.com/AztecProtocol/aztec-packages/blob/v5.0.0-rc.2/docs/examples/ts/aztecjs_kernelless_simulation/index.ts#L140-L165" target="_blank" rel="noopener noreferrer">Source code: docs/examples/ts/aztecjs_kernelless_simulation/index.ts#L140-L165</a></sub></sup>


The app does not need to know which calls require authwits ahead of time. The simulation discovers them; the wallet signs them at send time.

`EmbeddedWallet.sendTx` runs this same simulate-then-collect flow internally before delegating to `BaseWallet.sendTx`, so an app that uses `EmbeddedWallet` does not need to call `.simulate()` manually and pass `authWitnesses` to `.send()`. The explicit pattern above is the one a wallet that does not auto-collect must implement, either inside its `sendTx` (as `EmbeddedWallet` does) or inside the app call site.

## Things to watch out for

- **`AztecAddress.ZERO` is not "no sender".** Use `NO_FROM` (from `@aztec/aztec.js/account`) for calls that genuinely have no account context, and a real account address otherwise.
- **A private FPC needs to be included in fee options for accurate gas.** Kernelless simulation matches full simulation on gas, but only if the simulation sees the same fee path as the real transaction. If the user will pay through a fee payment contract (FPC) that emits private notes, pass that FPC in the simulation's fee options so its side effects are accounted for. Kernelless plus a private FPC is the supported path; you do not need a full simulation to get accurate gas.
- **`profile()` is not kernelless.** If you call `.profile()` to count circuit gates, the kernels run regardless. Use `.simulate()` if you only need return values, offchain effects, or gas estimates.
- **Utility functions reject overrides.** `FunctionType.UTILITY` calls go through `wallet.executeUtility`, and `ContractFunctionInteraction.simulate` throws `overrides are not supported for utility function simulation` if you pass non-empty `overrides.publicStorage` or `overrides.contracts`. Utility functions do not need an override anyway, since they do not run through an account contract.

## Related

- [Kernelless simulations](../foundational-topics/pxe/kernelless_simulations.md) for the conceptual model.
- [Reading contract data](./how_to_read_data.md) for the basic `.simulate()` API.
- [Authentication witnesses](../foundational-topics/advanced/authwit.md) for what `CallAuthorizationRequest` represents.
