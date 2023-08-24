# Wallets

Wallets are the applications through which users manage their accounts. They also implement the interface for dapps to perform actions on behalf of a user. And in addition to these usual responsibilities present in other blockchains, wallets in Aztec also need to manage privacy keys and private state, as well as producing local proofs.

In this page we will cover the main responsibilities of a wallet in the Aztec network. Refer to [_writing an account contract_](./writing_an_account_contract.md) for a tutorial on how to write a contract to back a user's account, or to [_wallet architecture](./architecture.md) for an overview of its architecture and a reference on the interface a wallet must implement.

## Account setup

The first step for any wallet is to let the user set up their [accounts](../../concepts/foundation/accounts/main.md). An account in Aztec is implemented by its corresponding account contract that the user must deploy to begin interacting with the network. A wallet must support at least one specific [account contract implementation](./writing_an_account_contract.md), which means being able to deploy such a contract, as well as formatting transactions for it.

However, users must be able to receive funds in Aztec before deploying their account. A wallet should let a user generate a [deterministic complete address](../../concepts/foundation/accounts/keys.md#addresses-partial-addresses-and-public-keys) without having to interact with the network, so they can share it with others to receive funds. This requires that the wallet pins a specific contract implementation, its initialisation arguments, a deployment salt, and a privacy key. These values yield a deterministic address, so when the account contract is actually deployed, it is available at the precalculated address. Once the account contract is deployed, the user can start sending transactions using it as the transaction origin.

## Transaction lifecycle

Every transaction in Aztec is broadcast to the network as a zero-knowledge proof of correct execution, in order to preserve privacy. This means that transaction proofs are generated on the wallet and not on a remote node. This is one of the biggest differences with regard to EVM chain wallets.

A wallet is responsible for first **creating** an [execution request](../../concepts/foundation/accounts/main.md#execution-requests). This means going from an intent, such as _call transfer on this contract_, to an authenticated transaction formatted for the user's account contract. As an example, given an [ECDSA-based account](https://github.com/AztecProtocol/aztec-packages/blob/95d1350b23b6205ff2a7d3de41a37e0bc9ee7640/yarn-project/noir-contracts/src/contracts/ecdsa_account_contract/src/main.nr#L1), an execution request has the account contract as `origin`, calls its `entrypoint` function, and encodes the user intent as `payload`, which is signed using ECDSA with a private key managed by the wallet.

Once the execution request is created, it is **simulated** to retrieve an execution trace. This provides the user with a list of the side effects of a transaction if it is successfully mined, and a trace to be fed into the prover. During this simulation, the wallet is responsible of providing data to the virtual machine, such as private notes, encryption keys, or nullifier secrets.

:::info
Since private executions rely on a UTXO model, the side effects of a transaction cannot change when mined. However, the transaction can be dropped due to attempting to consume a private note that another transaction consumes before it is mined. Also, any side effects that arise from its public execution _can_ change, as in any EVM-based chain.
:::

After the user greenlights the transaction, the wallet generates a **proof** for it that guarantees correct execution and hides all private information, which gets **sent** to the P2P network for inclusion in a next block.

:::warning
There are no proofs generated as of the Sandbox release. This will be included in a future release before testnet.
:::
## Key management

As in EVM-based chains, wallets are expected to manage user keys, or provide an interface to hardware wallets or alternative key stores. Keep in mind that in Aztec each account requires [two sets of keys](../../concepts/foundation/accounts/keys.md): privacy keys and authentication keys. Privacy keys are mandated by the protocol and used for encryption and nullification, whereas authentication keys are dependent on the account contract implementation rolled out by the wallet. Should the account contract support it, wallets must provide the user with the means to rotate or recover their authentication keys.

:::info
Due to limitations in the current architecture, privacy keys need to be available in the wallet software itself and cannot be punted to an external keystore. This restriction may be lifted in a future release.
:::
## Recipient encryption keys

Wallets are also expected to manage the public encryption keys of any recipients of local transactions. When creating an encrypted note for a recipient given their address, the wallet needs to provide their [complete address](../../concepts/foundation/accounts/keys.md#addresses-partial-addresses-and-public-keys). This requires keeping a local registry of complete addresses for all recipients that the user intends to interact with.

:::info
There is no built-in mechanism for broadcasting public encryption keys at the moment. In a future release, clients may automatically track the complete address that corresponds to an account contract deployment, though it will still be needed to manually add recipients who have not yet deployed their account contracts.
:::

## Private state

Last but not least, wallets also track the user's private state. Wallets currently rely on brute force decryption, where every new block is downloaded and its encrypted data blobs are attempted to be decrypted with the user decryption keys. Whenever a blob is decrypted properly, it is added to the corresponding account's private state.

:::info
At the time of this writing, all private state is encrypted and broadcasted through the network, and eventually committed to L1. This means that a wallet can reconstruct its entire private state out of its encryption keys in the event of local data loss.
:::

Note that wallets must also scan for private state in blocks prior to the deployment of a user's account contract, since users may have received private state before deployment.
