---
title: Accounts
sidebar_position: 1
tags: [accounts]
---

Aztec has native account abstraction. Every account in Aztec is a smart contract.

In this section, you'll learn about Aztec's account abstraction, Aztec accounts and address derivation, how wallets relate to accounts, and how the entrypoints are defined.

## Account Abstraction (AA)

With account abstraction, the identity of a user is usually represented by a smart contract. That makes user's on-chain identity more flexible than simply using private/public keys. For example, Bitcoin has rigid accounts that must be a private key, whereas a user might want their on-chain identity to be controlled by a physical passport.

Among the account parts to be abstracted are authentication (“Who I am”), authorization (“What I am allowed to do”), replay protection, fee payment, and execution.

Some account features unlocked by account abstraction are account recovery, gas sponsorship, and support of signatures other than ECDSA, such as more efficient signatures (e.g. Schnorr, BLS), or more user-friendly ones (e.g. smartphone secure enclave).

### Protocol vs application level

AA can be implemented at the protocol level is called native Account Abstraction. In this case, all the accounts on the network are smart contracts. AA can also be implemented at the smart-contract level, then we call it non-native Account Abstraction. In this case, there might be both EOAs and accounts controlled by smart contracts.

In the case of Aztec, we have native Account Abstraction.

## Aztec Account Abstraction

### Authorization abstraction and DoS attacks

While we talk about “arbitrary verification logic” describing the intuition behind AA, the logic is usually not really arbitrary. The verification logic (i.e. what is checked as an authorization) is limited to make the verification time fast and bounded. If it is not bounded, an attacker can flood the mempool with expensive invalid transactions, clogging the network. That is the case for all chains where transaction validity is checked by the sequencer.

On Aztec, there is no limitation on the complexity of verification logic (what does it mean for the transaction to be valid). Whatever conditions it checks, the proof (that the sequencer needs to verify) is independent of its complexity.

This unlocks a whole universe of new use cases and optimization of existing ones. Whenever the dapp can benefit from moving expensive computations off-chain, Aztec will provide a unique chance for an optimization. That is to say, on traditional chains users pay for each executed opcode, hence more complex operations (e.g. alternative signature verification) are quite expensive. In the case of Aztec, it can be moved off-chain so that it becomes almost free. The user pays for the operations in terms of client-side prover time. However, this refers to Aztec's client-side proving feature and not directly AA.

Couple of examples:

- Multisig contract with an arbitrary number of parties that can verify any number of signatures for free.
- Oracle contract with an arbitrary number of data providers that can verify any number of data entries for free.

## Aztec account

Smart contracts on Aztec are represented by an "address", which is a hexadecimal number that uniquely represents an entity on the Aztec network. An address is derived by hashing information specific to the entity represented by the address. This information includes contract bytecode and the public keys used in private execution for encryption and nullification. This means addresses are deterministic.

Aztec has no concept of EOAs (Externally Owned Accounts). Every account is implemented as a contract.

### Entrypoints

Account contracts usually have a specific function called `entrypoint`. It serves as the interface for interaction with the smart contract and can be called by external users or other smart contracts.

An `entrypoint` function receives the actions to be carried out and an authentication payload. In pseudocode:

```
publicKey: PublicKey;

def entryPoint(payload):
    let { privateCalls, publicCalls, nonce, signature } = payload;
    let payloadHash = hash(privateCalls, publicCalls, nonce);
    validateSignature(this.publicKey, signature, payloadHash);

    foreach privateCall in privateCalls:
        let { to, data, value } = privateCall;
        call(to, data, value);

    foreach publicCall in publicCalls:
        let { to, data, value, gasLimit } = publicCall;
        enqueueCall(to, data, value, gasLimit);
```

A request for executing an action requires:

- The `origin` contract to execute as the first step.
- The initial function to call (usually `entrypoint`).
- The arguments (which encode the private and public calls to run as well as any signatures).

Read more about how to write an account contract [here](../../../developers/tutorials/codealong/contract_tutorials/write_accounts_contract.md).

### Non-standard entrypoints

Since the `entrypoint` interface is not enshrined, there is nothing that differentiates an account contract from an application contract. This allows implementing functions that can be called by any user and are just intended to advance the state of a contract.

For example, a lottery contract, where at some point a prize needs to be paid out to its winners. This `pay` action does not require authentication and does not need to be executed by any user in particular, so anyone could submit a transaction that defines the lottery contract itself as `origin` and `pay` as `entrypoint` function. However, it's on the contract to define how fees for the prize claim will be paid as they won't be paid by the account contract.

For an example of this behavior see our [e2e_crowdfunding_and_claim test](https://github.com/AztecProtocol/aztec-packages/blob/88b5878dd4b95d691b855cd84153ba884adf25f8/yarn-project/end-to-end/src/e2e_crowdfunding_and_claim.test.ts#L322) and the [SignerLess wallet](https://github.com/AztecProtocol/aztec-packages/blob/master/yarn-project/aztec.js/src/wallet/signerless_wallet.ts) implementation. Notice that the Signerless wallet doesn't invoke an `entrypoint` function of an account contract but instead invokes the target contract function directly.

:::info

Entrypoints for the following cases:

- If no contract `entrypoint` is used `msg_sender` is set to `Field.max`.
- In a private to public `entrypoint`, `msg_sender` is the contract making the private to public call.
- When calling the `entrypoint` on an account contract, `msg_sender` is set to the account contract address.

:::

### Account contracts and wallets

Account contracts are tightly coupled to the wallet software that users use to interact with the protocol. Dapps submit to the wallet software one or more function calls to be executed (e.g. "call swap in X contract"), and the wallet encodes and signs the request as a valid payload for the user's account contract. The account contract then validates the request encoded and signed by the wallet, and executes the function calls requested by the dapp.

### Account Initialization

When a user wants to interact with the network's **public** state, they need to deploy their account contract. A contract instance is considered to be publicly deployed when it has been broadcasted to the network via the canonical `ContractInstanceDeployer` contract, which also emits a deployment nullifier associated to the deployed instance.

However, to send fully **private** transactions, it's enough to initialize the account contract (public deployment is not needed). The default state for any given address is to be uninitialized, meaning a function with the [initializer annotation](../../../developers/tutorials/codealong/contract_tutorials/nft_contract.md#initializer) has not been called. The contract is initialized when one of the functions marked with the `#[initializer]` annotation has been invoked. Multiple functions in the contract can be marked as initializers. Contracts may have functions that skip the initialization check (marked with `#[noinitcheck]`).

Account deployment and initialization are not required to receive notes. The user address is deterministically derived from the encryption public key and the account contract they intend to deploy, so that funds can be sent to an account that hasn't been deployed yet.

Users will need to pay transaction fees in order to deploy their account contract. This can be done by sending fee juice to their account contract address (which can be derived deterministically, as mentioned above), so that the account has funds to pay for its own deployment. Alternatively, the fee can be paid for by another account, using [fee abstraction](#fee-abstraction).

## What is an account address

Address is derived from the [address keys](keys.md#address-keys). While the AddressPublicKey is an elliptic curve point of the form (x,y) on the [Grumpkin elliptic curve](https://github.com/AztecProtocol/aztec-connect/blob/9374aae687ec5ea01adeb651e7b9ab0d69a1b33b/markdown/specs/aztec-connect/src/primitives.md), the address is its x coordinate. The corresponding y coordinate can be derived if needed. For x to be a legitimate address, address there should exist a corresponding y that satisfies the curve equation. Any field element cannot work as an address.

### Complete address

Because of the contract address derivation scheme, you can check that a given set of public [keys](keys.md) corresponds to a given address by trying to recompute it.

If Alice wants Bob to send her a note, it's enough to share with him her address (x coordinate of the AddressPublicKey).

However, if Alice wants to spend her notes (i.e. to prove that the nullifier key inside her address is correct) she needs her complete address. It is represented by:

- all the user's public keys,
- [partial address](keys.md#address-keys),
- contract address.

## Authorizing actions

Account contracts are also expected, though not required by the protocol, to implement a set of methods for authorizing actions on behalf of the user. During a transaction, a contract may call into the account contract and request the user authorization for a given action, identified by a hash. This pattern is used, for instance, for transferring tokens from an account that is not the caller.

When executing a private function, this authorization is checked by requesting an authentication witness from the execution oracle, which is usually a signed message. Authentication Witness is a scheme for authenticating actions on Aztec, so users can allow third-parties (e.g. contracts) to execute an action on their behalf.

The user's [Private eXecution Environment (PXE)](../pxe/index.md) is responsible for storing these auth witnesses and returning them to the requesting account contract. Auth witnesses can belong to the current user executing the local transaction, or to another user who shared it out-of-band.

However, during a public function execution, it is not possible to retrieve a value from the local [oracle](../../smart_contracts/oracles/index.md). To support authorizations in public functions, account contracts should save in a public authwit registry what actions have been pre-authorized by their owner.

These two patterns combined allow an account contract to answer whether an action `is_valid_impl` for a given user both in private and public contexts.

You can read more about authorizing actions with authorization witnesses on [this page](../advanced/authwit.md).

:::info

Transaction simulations in the PXE are not currently simulated, this is future work described [here](https://github.com/AztecProtocol/aztec-packages/issues/9133). This means that any transaction simulations that call into a function requiring an authwit will require the user to provide an authwit. Without simulating simulations, the PXE can't anticipate what authwits a transaction may need, so developers will need to manually request these authwits from users. In the future, transactions requiring authwits will be smart enough to ask the user for the correct authwits automatically.

:::

## Nonce and fee abstraction

Beyond the authentication logic abstraction, there are nonce abstraction and fee abstraction.

### Nonce abstraction

Nonce is a unique number and it is utilized for replay protection (i.e. preventing users from executing a transaction more than once and unauthorized reordering).

In particular, nonce management defines what it means for a transaction to be canceled, the rules of transaction ordering, and replay protection. In Ethereum, nonce is enshrined into the protocol. On the Aztec network, nonce is abstracted i.e. if a developer wants to customize it, they get to decide how they handle replay protection, transaction cancellation, as well as ordering.

Take as an example the transaction cancellation logic. It can be done through managing nullifiers. Even though we usually refer to a nullifier as a creature utilized to consume a note, in essence, a nullifier is an emitted value whose uniqueness is guaranteed by the protocol. If we want to cancel a transaction before it was mined, we can send another transaction with higher gas price that emits the same nullifier (i.e. nullifier with the same value, for example, 5). The second transaction will invalidate the original one, since nullifiers cannot be repeated.

Nonce abstraction is mostly relevant to those building wallets. For example, a developer can design a wallet that allows sending big transactions with very low priority fees because the transactions are not time sensitive (i.e. the preference is that a transaction is cheap and doesn't matter if it is slow). If one tries to apply this logic today on Ethereum (under sequential nonces), when they send a large, slow transaction they can't send any other transactions until that first large, slow transaction is processed.

### Fee abstraction

It doesn't have to be the transaction sender who pays the transaction fees. Wallets or dapp developers can choose any payment logic they want using a paymaster. To learn more about fees on Aztec – check [this page](../fees.md).

Paymaster is a contract that can pay for transactions on behalf of users. It is invoked during the private execution stage and set as the fee payer.

- It can be managed by a dapp itself (e.g. a DEX can have its own paymaster) or operate as a third party service available for everyone.
- Fees can be paid publicly or privately.
- Fees can be paid in any token that a paymaster accepts.

Fee abstraction unlocks use cases like:

- Sponsored transactions (e.g. the dapp's business model might assume revenue from other streams besides transaction fees or the dapp might utilize sponsored transaction mechanics for marketing purposes). For example, sponsoring the first ten transactions for every user.
- Flexibility in the currency used in transaction payments (e.g. users can pay for transactions in ERC-20 token).
