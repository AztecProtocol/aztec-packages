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

- `aztec-nargo` installed (go to [Sandbox section](../../reference/environment_reference/sandbox-reference.md) for installation instructions)
- `aztec-wallet` installed (installed as part of the Sandbox)

## Profiling using aztec-wallet

The profiling tool is integrated into the `aztec-wallet`.

In this example, we will profile a simple "private token transfer" transaction which uses the [transfer](https://github.com/AztecProtocol/aztec-packages/blob/master/noir-projects/noir-contracts/contracts/app/token_contract/src/main.nr#L263) method in the token contract.
Let us start by deploying the token contarct (included in the Sandbox) and minting some tokens to the test account.

```bash
# Import some test accounts included in cli-wallet
aztec-wallet import-test-accounts

# Deploy a token contract.
aztec-wallet deploy TokenContractArtifact --from accounts:test0 --args accounts:test0 TestToken TST 18 -a token

# Mint some tokens to the test0 account
aztec-wallet send mint_to_private -ca token --args accounts:test0 accounts:test0 100 -f test0
```

Now, the `test0` account can transfer tokens by running:

```bash
# Send 40 tokens from test0 to test1
aztec-wallet send transfer -ca token --args accounts:test1 40 -f accounts:test0
```

Instead of sending the above transaction, you can profile it by running the `profile` command with the same parameters.


```bash
aztec-wallet profile transfer -ca token --args accounts:test1 40 -f accounts:test0
```

This will print the following results after some time:

```bash
Gate count per circuit:
   SchnorrAccount:entrypoint                          Gates: 21,724     Acc: 21,724
   private_kernel_init                                Gates: 45,351     Acc: 67,075
   Token:transfer                                     Gates: 31,559     Acc: 98,634
   private_kernel_inner                               Gates: 78,452     Acc: 177,086
   private_kernel_reset                               Gates: 91,444     Acc: 268,530
   private_kernel_tail                                Gates: 31,201     Acc: 299,731

Total gates: 299,731
```

Here you can see the gate count of each private function call in the transaction along with the kernel circuits needed in between, and the total gate count.

This will help you understand which parts of your transaction are bottlenecks and optimize the contract logic accordingly.

## Profiling in aztec.js

Call the `.profile` method on a contract interaction or deployment, specifying the `ProfileMethodOptions`:

```javascript title="profile-method-options" showLineNumbers 
export type ProfileMethodOptions = SimulateMethodOptions & {
  /** Whether to return gates information or the bytecode/witnesses. */
  profileMode: 'gates' | 'execution-steps' | 'full';
  /** Whether to generate a ClientIVC proof or not */
  skipProofGeneration?: boolean;
};
```
> <sup><sub><a href="https://github.com/AztecProtocol/aztec-packages/blob/v1.0.0/yarn-project/aztec.js/src/contract/interaction_options.ts#L60-L67" target="_blank" rel="noopener noreferrer">Source code: yarn-project/aztec.js/src/contract/interaction_options.ts#L60-L67</a></sub></sup>


It will return a `TxProfileResult`:

```## title="tx-profile-result" showLineNumbers 
export class TxProfileResult {
  constructor(
    public executionSteps: PrivateExecutionStep[],
    public stats: ProvingStats,
  ) {}
```
> <sup><sub><a href="https://github.com/AztecProtocol/aztec-packages/blob/v1.0.0/yarn-project/stdlib/src/tx/profiling.ts#L81-L87" target="_blank" rel="noopener noreferrer">Source code: yarn-project/stdlib/src/tx/profiling.ts#L81-L87</a></sub></sup>


## Flamegraph

While the `aztec-wallet` provides a way to profile the gate count of each private function in a transaction, flamegraph tool lets you visualize the gate count of each operation within a private function.

You can run the flamegraph tool by running the following command:

```bash
aztec flamegraph <artifact_path> <function_name>
```

For example, if you want to flamegraph the `cast_vote` function [aztec-starter](https://github.com/AztecProtocol/aztec-starter/blob/main/src/main.nr), you can do

```bash
aztec-nargo compile
aztec flamegraph target/easy_private_voting_contract-EasyPrivateVoting.json cast_vote
```

This will generate a flamegraph of the `cast_vote` function and save the output svg to the `target` directory. You can open the svg file in your browser to visualize the flamegraph.

You can also run the same command with `SERVE=1` to serve the flamegraph on a local server.

```bash
SERVE=1 aztec flamegraph target/easy_private_voting_contract-EasyPrivateVoting.json cast_vote
```
This will serve the flamegraph on `http://localhost:8000`.
