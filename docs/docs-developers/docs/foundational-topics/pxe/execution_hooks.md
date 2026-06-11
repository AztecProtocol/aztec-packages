---
title: Execution hooks
sidebar_position: 3
tags: [pxe, wallets]
description: How wallets use PXE execution hooks to apply custom policies during client-side simulation.
---

Execution hooks are callbacks that the PXE invokes during client-side simulation when an operation needs a decision from the wallet. They let the wallet apply its own policies before execution proceeds, such as prompting the user, consulting a dynamic allowlist, or inspecting call arguments. Every hook is optional, and when a hook is absent the PXE applies a safe default.

## Configuring hooks

Pass a `hooks` object when creating the PXE:

```typescript
import { createPXE } from "@aztec/pxe/server";
import { DeliveryPrivacyPreference } from "@aztec/pxe/config";

const pxe = await createPXE(node, config, {
  hooks: {
    // Allow calls to a known helper contract, deny everything else.
    authorizeUtilityCall: async (request) => {
      return request.target.equals(trustedHelper)
        ? { authorized: true }
        : { authorized: false, reason: "Unknown target" };
    },
    // Accept the privacy leak of on-the-fly handshakes so messages reach recipients that haven't registered the sender.
    getDeliveryPrivacyPreference: async () => DeliveryPrivacyPreference.BEST_EFFORT,
  },
});
```

## `authorizeUtilityCall`

Called whenever a utility function makes a cross-contract call. A call made by a malicious contract could leak private information, so the hook lets the wallet decide, per call, whether to allow it. A static allowlist would not work here because neither the app nor the wallet can predict ahead of time which contracts will be invoked during execution: permission must be asked after execution has begun. Calls to standard contracts (such as the HandshakeRegistry, which is queried during every contract's sync) bypass this hook and are always authorized.

Unlike [authentication witnesses (authwits)](../../aztec-js/how_to_use_authwit.md), the hook is invoked live, while execution is underway. Authwits can be recorded during simulation and signed once at the end, but the PXE cannot predict what a utility call would return, so it must ask before continuing. Most of the time the wallet can answer on its own, for example against a list of audited or previously trusted contracts, without involving the user.

### In production

Pass an `authorizeUtilityCall` hook when [creating the PXE](#configuring-hooks). It receives a `UtilityCallAuthorizationRequest` with the caller and target addresses, their contract class IDs, the function selector, the function name, the arguments, and the caller context (`'private'`, `'private view'`, or `'utility'`). Return `{ authorized: true }` to allow the call, or `{ authorized: false, reason: '...' }` to deny it with a message.

When the hook is absent, cross-contract utility calls are denied. See [Cross-contract utility call denied](../../aztec-nr/debugging.md#cross-contract-utility-call-denied) for the resulting error.

### In Noir tests

The hook only exists on a real PXE. When testing cross-contract utility calls in the Noir test environment (TXE), use `with_authorized_utility_call_targets` on your call options:

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

## `getDeliveryPrivacyPreference`

Called when message delivery needs a tagging secret and the executing contract has not pinned a tag-secret derivation. The hook lets the wallet choose between maximum privacy and delivery that requires no sender-recipient coordination; see [Delivery privacy preference](../../aztec-nr/framework-description/note_delivery.md#delivery-privacy-preference) for the trade-offs and the defaults in each environment.

### In production

Pass a `getDeliveryPrivacyPreference` hook when [creating the PXE](#configuring-hooks). It receives a `DeliveryPrivacyPreferenceRequest` with the executing contract's address and the message's sender, recipient, and delivery mode (`'constrained'` or `'unconstrained'`), so a wallet can apply per-application or per-recipient policies, or surface the decision to the user, instead of returning a fixed value.

When the hook is absent, the PXE assumes `DeliveryPrivacyPreference.MAX_PRIVACY`, so privacy is never weakened without the wallet opting in.

### In Noir tests

The hook only exists on a real PXE. In the Noir test environment (TXE), which defaults to max privacy like a bare PXE, set the preference on the test environment; it affects message delivery in subsequent private executions:

```rust
env.set_delivery_privacy_preference(DeliveryPrivacyPreference::best_effort());
```
