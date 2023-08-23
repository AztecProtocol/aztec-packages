# Writing an Account Contract

This tutorial will take you through the process for writing your own account contract in Noir, along with the Javascript glue code required for using it within a [wallet](./main.md).

Writing your own account contract allows you to define the rules by which user transactions are authorised and paid for, as well as how their keys are managed and can be potentially rotated or recovered. In other words, lets you make the most out of [account abstraction](../../concepts/foundation/accounts/main.md#what-is-account-abstraction) in the Aztec network.

It is highly recommended that you understand how an [account](../../concepts/foundation/accounts/main.md) is defined in Aztec, as well as the differences between privacy and authentication [keys](../../concepts/foundation/accounts/keys.md). You will also need to know how to write a [contract in Noir](../contracts/main.md), as well as some basic [Typescript](https://www.typescriptlang.org/).

- ECDSA with hardcoded pubkey using noble for signing