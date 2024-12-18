---
title: Profiling Transactions
sidebar_position: 1
tags: [contracts, profiling]
---

An Aztec transaction typically consists of a private and a public part. The private part is where the user executes contract logic within the PXE and generates a proof of execution, which is then sent to the sequencer.

Since proof generation is an expensive operation that needs to be done on the client side, it is important to optimize the private contract logic. It is desirable to keep the gate count of circuits representing the private contract logic as low as possible.

A private transaction can involve multiple function calls. It starts with an account `entrypoint()` which may call several private functions to execute the application logic, which in turn might call other functions. Moreover, every private function call has to go through a round of kernel circuits. Read more about the transaction lifecycle [here](../../../aztec/concepts/transactions.md).

In this guide, we will look at how to profile the private execution of a transaction, allowing you to get the gate count of each private function within the transaction, including the kernel circuits.

## Prerequisites

- `aztec-nargo` installed (go to [Sandbox section](../../../reference/developer_references/sandbox_reference/sandbox-reference.md) for installation instructions)
- `aztec-wallet` installed (installed as part of the Sandbox)
- Aztec Sandbox running with **proving enabled** (go to [Sandbox PXE Proving](../local_env/sandbox_proving.md) for instructions)

## Profiling using aztec-wallet

The profiling tool is integrated into the `aztec-wallet`.

In this example, we will profile a simple "private token transfer" transaction which uses the [transfer](https://github.com/AztecProtocol/aztec-packages/blob/master/noir-projects/noir-contracts/contracts/token_contract/src/main.nr#L269) method in the token contract.
If you want to follow along, you'll need to clone the Aztec [monorepo](https://github.com/AztecProtocol/aztec-packages) and [compile](./how_to_compile_contract.md) the `token_contract` in `noir-projects/noir-contracts` by running `aztec-nargo compile --package token_contract`.

Let's deploy the necessary account and token contracts first:

```bash
# Deploy accounts
aztec-wallet create-account -a owner
aztec-wallet create-account -a user

# Deploy a token contract and mint 100 tokens to the user
aztec-wallet deploy token_contract@Token --args accounts:owner Test TST 18 -f owner -a token
aztec-wallet send mint_to_private -ca token --args accounts:owner accounts:user 100 -f owner
```

Now, the `user` can transfer tokens by running:

```bash
# Send the tokens back to the owner
aztec-wallet send transfer -ca token --args accounts:owner 40 -f user
```

Instead of sending the above transaction, you can simulate it by running the `simulate` command with the same parameters, and then add a `--profile` flag to profile the gate count of each private function in the transaction.

```bash
aztec-wallet simulate --profile transfer -ca token --args accounts:owner 40 -f user
```

This will print the following results after some time:

```bash
Gate count per circuit:
   SchnorrAccount:entrypoint                          Gates: 26,363     Acc: 26,363
   private_kernel_init                                Gates: 34,887     Acc: 61,250
   Token:transfer                                     Gates: 28,229     Acc: 89,479
   private_kernel_inner                               Gates: 57,530     Acc: 147,009
   private_kernel_reset                               Gates: 86,600     Acc: 233,609
   private_kernel_tail                                Gates: 13,045     Acc: 246,654

Total gates: 246,654
```

Here you can see the gate count of each private function call in the transaction along with the kernel circuits needed in between, and the total gate count.

This will help you understand which parts of your transaction are bottlenecks and optimize the contract logic accordingly.
