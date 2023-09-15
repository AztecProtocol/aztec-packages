---
title: Visibility
---

# Visibility

`internal`

Similar to Solidity, internal functions and vars can be accessed within the contract itself. While technically callable from other contracts, there is a dynamic check that validates the caller to ensure it's the same contract.

`external`

External is not used explicitly as it is in Solidity, but things not marked as `internal` will be external.

`#[aztec(public)]` and `#[aztec(private)]`

These are used to annotate functions so that they are compliant with Aztec ABIs. They inject `PublicContext` and `PrivateContext` for use in contracts.
