---
title: Generic Proxy
sidebar_position: 5
description: Forwarding layer for account abstraction that routes calls by argument count.
---

In Aztec, account contracts authorize every transaction the user sends and must be able to forward calls to any contract. However, Noir requires function signatures to be known at compile time, so an account contract cannot call an arbitrary function with an arbitrary number of arguments in a single generic entrypoint.

The Generic Proxy contract solves this by providing a fixed set of forwarding functions — one per argument count — that the account contract can call. This avoids hard-coding every possible target function signature while keeping the account contract simple.

```rust
#[aztec]
pub contract GenericProxy {
    #[external("private")]
    fn forward_private_0(target: AztecAddress, selector: FunctionSelector) {
        let _ = self.context.call_private_function_no_args(target, selector);
    }

    #[external("private")]
    fn forward_private_4(target: AztecAddress, selector: FunctionSelector, args: [Field; 4]) {
        let _ = self.context.call_private_function(target, selector, args);
    }

    #[external("private")]
    fn forward_private_4_and_return(
        target: AztecAddress,
        selector: FunctionSelector,
        args: [Field; 4],
    ) -> Field {
        let returns: Field =
            self.context.call_private_function(target, selector, args).get_preimage();
        returns
    }
    // ... forward_private_1 through forward_private_8
}
```

The proxy exposes a family of `forward_private_N` functions, each accepting a different fixed argument count. Because Noir's type system requires array lengths to be known at compile time, the contract implements one overload per arity rather than a single variadic function. The `_and_return` variant captures the return value from the callee and passes it back to the caller.

:::note
The Generic Proxy does not implement any access control by itself. Callers are responsible for ensuring that forwarding to `target` is appropriate. In most protocols, the proxy is called from within an account contract that enforces its own authorization rules before delegating to the proxy.
:::
