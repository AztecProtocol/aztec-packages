---
title: Profiling Transactions
sidebar_position: 5
tags: [contracts, profiling]
---

# Profiling Transactions

An Aztec transaction typically consists of a private and a public part. The private part is where the user executes contract logic within the PXE and generates a proof of execution, which is then sent to the sequencer.

Since proof generation is an expensive operation that needs to be done on the client side, it is important to optimize the private contract logic. That is, it is desirable to keep the gate count of circuits representing the private contract logic as low as possible.

A private transaction can involve multiple function calls. It starts with an account `entrypoint()` which may call several private functions to execute the application logic, which in turn might call other functions. Moreover, every private function call has to go through a round of kernel circuits. Read more about the transaction lifecycle [here](../../../aztec/concepts/transactions.md).

In this guide, we will look at how to profile the private execution of a transaction, allowing you to get the gate count of each private function within the transaction, including the kernel circuits.

## Prerequisites

- `aztec-nargo` installed (go to [Sandbox section](../../../reference/developer_references/sandbox_reference/sandbox-reference.md) for installation instructions)
- `aztec-wallet` installed (installed as part of the Sandbox)
- Aztec Sandbox running with **proving enabled** (go to [Sandbox PXE Proving](../local_env/sandbox_proving.md) for instructions)

## Profiling using aztec-wallet

The profiling tool is integrated into the `aztec-wallet`.

In this example, we will profile a "private token transfer" transaction where an `operator` transfers tokens from a `user` account using [Authwit](../../../aztec/concepts/accounts/authwit.md).

Let's deploy the necessary account and token contracts first:

```bash
# Deploy account contracts for the user, owner (token deployer and minter),
# and an operator (who uses authwit to transfer token from user's account)
aztec-wallet create-account -a owner
aztec-wallet create-account -a user
aztec-wallet create-account -a operator

# Deploy a token contract and mint 100 tokens to the user
aztec-wallet deploy token_contract@Token --args accounts:owner Test TST 18 -f owner -a token
aztec-wallet send mint_to_private -ca token --args accounts:owner accounts:user 100 -f owner

# Create an authwit for the operator to transfer tokens from the user's account (to operator's own acc)
aztec-wallet create-secret -a auth_nonce
aztec-wallet create-authwit transfer_from operator -ca token --args accounts:user accounts:operator 100 secrets:auth_nonce -f user
aztec-wallet add-authwit authwits:last user -f operator
```

Running the above will add an Authwit that allows the `operator` to transfer 100 TST tokens from the `user`'s account. The `operator` can now transfer tokens by running:

```bash
# operator transfers 100 TST tokens to themselves
aztec-wallet send transfer_from -ca token --args accounts:user accounts:operator 100 secrets:auth_nonce -f operator
```

Instead of sending the transaction, you can simulate it by running the `simulate` command with the same parameters, and then add a `--profile` flag to profile the gate count of each private function in the transaction.

```bash
aztec-wallet simulate --profile transfer_from -ca token --args accounts:user accounts:operator 100 secrets:auth_nonce -f operator
```

This will print the following results after some time:

```bash
Gate count per circuit:
   SchnorrAccount:entrypoint                          Gates: 26,363     Acc: 26,363
   private_kernel_init                                Gates: 34,866     Acc: 61,229
   Token:transfer_from                                Gates: 128,094    Acc: 189,323
   private_kernel_inner                               Gates: 57,508     Acc: 246,831
   SchnorrAccount:verify_private_authwit              Gates: 12,646     Acc: 259,477
   private_kernel_inner                               Gates: 57,508     Acc: 316,985
   private_kernel_reset                               Gates: 86,599     Acc: 403,584
   private_kernel_tail                                Gates: 13,042     Acc: 416,626

Total gates: 416,626
```

Here you can see the gate count of each private function call in the transaction along with the kernel circuits needed in between, and the total gate count.

This will help you understand which parts of your transaction are bottlenecks and optimize the contract logic accordingly.
