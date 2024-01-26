---
title: Constructor
---

A special `constructor` function **must** be declared within a contract's scope.
- A constructor doesn't have a name, because its purpose is clear: to initialize contract state.
- In Aztec terminology, a constructor is always a '`private` function' (i.e. it cannot be a `public` function).
- A constructor behaves almost identically to any other function. It's just important for Aztec to be able to identify this function as special: it may only be called once, and will not be deployed as part of the contract.

An example of a somewhat boring constructor is as follows:

#include_code empty-constructor /yarn-project/noir-contracts/contracts/test_contract/src/main.nr rust

Although you can have a constructor that does nothing, you might want to do something with it, such as setting the deployer as an owner.

#include_code constructor /yarn-project/noir-contracts/contracts/escrow_contract/src/main.nr rust

:::danger
It is not possible to call public functions from within a constructor. Beware that the compiler will not throw an error if you do, but the execution will fail!
:::