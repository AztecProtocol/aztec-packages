---
title: Execution hooks
sidebar_position: 3
tags: [pxe, wallets]
description: How wallets use PXE execution hooks to apply custom policies during client-side simulation.
---

Execution hooks are callbacks that the PXE invokes during client-side simulation when an operation needs a decision from the wallet. They let the wallet apply its own policies before execution proceeds, such as prompting the user, consulting a dynamic allowlist, or inspecting call arguments. All hooks are optional; when a hook is absent, the PXE applies a conservative default: for example it avoids privacy leaks (such as revealing a message's recipient onchain) unless specifically told otherwise.

## Configuring hooks

Pass a `hooks` object when creating the PXE:

```typescript
import { createPXE } from "@aztec/pxe/server";

const pxe = await createPXE(node, config, {
  hooks: {
    // Allow calls to a known helper contract, deny everything else.
    authorizeUtilityCall: async (request) => {
      return request.target.equals(trustedHelper)
        ? { authorized: true }
        : { authorized: false, reason: "Unknown target" };
    },
    // When no onchain handshake is registered for the recipient, fall back to a non-interactive handshake.
    resolveTaggingSecretStrategy: async () => ({ type: "non-interactive-handshake" }),
  },
});
```

## `authorizeUtilityCall`

Called whenever a utility function makes a cross-contract call. A call made by a malicious contract could leak private information, so the hook lets the wallet decide, per call, whether to allow it. A static allowlist would not work here because neither the app nor the wallet can predict ahead of time which contracts will be invoked during execution: permission must be asked after execution has begun. Calls to standard contracts (such as the HandshakeRegistry, which is queried during every contract's sync) bypass this hook and are always authorized.

Unlike [authentication witnesses (authwits)](../../aztec-js/how_to_use_authwit.md), the hook is invoked live, while execution is underway. Authwits can be recorded during simulation and signed once at the end, but the PXE cannot predict what a utility call would return, so it must ask before continuing. Most of the time the wallet should answer on its own, for example against a list of audited or previously trusted contracts, to avoid interrupting execution multiple times asking the user for confirmation.

### Deciding what to authorize

Private state is siloed per contract: a utility function runs on your device with access to its own contract's private state, and nothing else. Reading your own balance through a token contract's utility function is fine, and the hook never fires, because no contract boundary is crossed. The risk appears only when one contract's utility function calls into a *different* contract, because that call can reach private state the caller could not read on its own.

Consider a single cross-contract operation, reading your token balance, made by two different callers. When a DeFi router calls the token's balance utility to quote you a swap, that is a legitimate cross-contract read, and you want it allowed. When an unknown, possibly malicious contract makes the very same call to snoop your balance, you want it denied. The exposed data is identical in both cases; the only thing that differs is *who is making the call*, which is exactly the decision the hook delegates to the wallet.

The wallet makes that decision by inspecting the request, which identifies the caller and target by both address and contract class ID, to judge whether the call is safe to authorize.

### In Noir tests

When testing cross-contract utility calls in Noir using `TestEnvironment`, use `with_authorized_utility_call_targets` on your call options:

```rust
// For private calls:
env.call_private_opts(
    account,
    CallPrivateOptions::new().with_authorized_utility_call_targets([target_address]),
    MyContract::at(caller).some_private_fn(),
);

// For private view calls:
env.view_private_opts(
    account,
    ViewPrivateOptions::new().with_authorized_utility_call_targets([target_address]),
    MyContract::at(caller).some_view_fn(),
);

// For utility calls:
env.execute_utility_opts(
    ExecuteUtilityOptions::new().with_authorized_utility_call_targets([target_address]),
    MyContract::at(caller).some_utility_fn(),
);
```

### In production

Pass an `authorizeUtilityCall` hook when [creating the PXE](#configuring-hooks). It receives a `UtilityCallAuthorizationRequest` with the caller and target addresses, their contract class IDs, the function selector, the function name, the arguments, and the caller context (`'private'`, `'private view'`, or `'utility'`). Return `{ authorized: true }` to allow the call, or `{ authorized: false, reason: '...' }` to deny it with a message.

When the hook is absent, cross-contract utility calls are denied. See [Cross-contract utility call denied](../../aztec-nr/debugging.md#cross-contract-utility-call-denied) for the resulting error.

## `resolveTaggingSecretStrategy`

Called as a fallback for message delivery: a registered onchain handshake's secret is reused directly, so this hook only fires when the sender-recipient pair has none yet. The wallet returns a concrete `TaggingSecretStrategy` (and any material the chosen derivation needs); see [Tagging secret strategy](../../aztec-nr/framework-description/note_delivery.md#tagging-secret-strategy) for the variants, the trade-offs, and the defaults in each environment.

For an unconstrained self-send (the recipient is one of the wallet's own accounts), the PXE always uses an [address-derived shared secret](../../aztec-nr/framework-description/note_delivery.md#tagging-secret-strategy) regardless of what the hook returns: both sides' keys are local, so no handshake is needed.

### In Noir tests

When testing in Noir, leaving the strategy unset makes `TestEnvironment` fall back to the bare PXE default. Set a strategy when creating the environment to exercise a specific one; it affects message delivery in private executions:

```rust
let env = TestEnvironment::new_opts(
    TestEnvironmentOptions::new().with_tagging_secret_strategy(TaggingSecretStrategy::non_interactive_handshake()),
);
```

### In production

Pass a `resolveTaggingSecretStrategy` hook when [creating the PXE](#configuring-hooks). It receives a `TaggingSecretStrategyRequest` with the executing contract's address and the message's sender, recipient, and delivery mode (`'constrained'` or `'unconstrained'`), so a wallet can apply per-application or per-recipient policies, or surface the decision to the user, instead of returning a fixed value.

When the hook is absent, the PXE applies a default: both delivery modes use a [non-interactive handshake](../../aztec-nr/framework-description/note_delivery.md#tagging-secret-strategy) so the recipient can discover the message without prior coordination.

## `resolveCustomRequest`

A general-purpose hook for *custom*, caller-defined requests. A contract reaches for it when it needs something it cannot get on its own: not from its local notes, not from the protocol's existing oracles. The contract gives the request a `kind` and an opaque `payload`, and the wallet returns an opaque response. Because the request is caller-defined, the wallet decides per `kind` how to answer, whether by reading state it holds, contacting another party, or fetching offchain data.

### In production

Pass a `resolveCustomRequest` hook when [creating the PXE](#configuring-hooks). It receives a `CustomRequest` with the issuing contract's address and class ID, the request `kind`, and the opaque `payload`, and returns the response. Because any contract can issue a request, the hook should check both the `kind` and the issuing contract before answering, dispatching on `kind` to the matching resolver.

When the hook is absent, the request cannot be served and simulation fails.

### Example: interactive handshakes

The `HandshakeRegistry`'s `interactive_handshake` uses this hook to obtain the recipient's signed authorization. The payload carries what the signer needs to decide: who the recipient is, the handshake being authorized, and the chain context, but never the sender. The response carries what the registry needs to verify the recipient's signature in-circuit.
