---
title: Account Contract
sidebar_position: 4
tags: [accounts]
---

This tutorial will take you through the process of writing your own account contract in Aztec.nr, along with the Typescript glue code required for using it within a wallet.

You will learn:

- How to write a custom account contract in Aztec.nr
- The entrypoint function for transaction authentication and call execution
- The AccountActions module and entrypoint payload structs, necessary inclusions for any account contract
- Customizing authorization validation within the `is_valid` function (using Schnorr signatures as an example)
- Typescript glue code to format and authenticate transactions
- Deploying and testing the account contract

This tutorial is compatible with the Aztec version `v1.0.0-staging.0`. Install the correct version with `aztec-up -v 1.0.0-staging.0`. Or if you'd like to use a different version, you can find the relevant tutorial by clicking the version dropdown at the top of the page.

Writing your own account contract allows you to define the rules by which user transactions are authorized and paid for, as well as how user keys are managed (including key rotation and recovery). In other words, writing an account contract lets you make the most out of account abstraction in the Aztec network.

It is highly recommended that you understand how an [account](../../../../aztec/concepts/accounts/index.md) is defined in Aztec, as well as the differences between privacy and authentication [keys](../../../../aztec/concepts/accounts/keys.md). You will also need to know how to write a contract in Noir, as well as some basic [Typescript](https://www.typescriptlang.org/).

For this tutorial, we will write an account contract that uses Schnorr signatures for authenticating transaction requests.

Every time a transaction payload is passed to this account contract's `entrypoint` function, the account contract requires a valid Schnorr signature, whose signed message matches the transaction payload, and whose signer matches the account contract owner's public key. If the signature fails, the transaction will fail.

For the sake of simplicity, we will hardcode the signing public key into the contract, but you could store it [in a private note](../../../../aztec/concepts/accounts/keys.md#using-a-private-note), [in an immutable note](../../../../aztec/concepts/accounts/keys.md#using-an-immutable-private-note), or [on a separate keystore](../../../../aztec/concepts/accounts/keys.md#using-a-separate-keystore), to mention a few examples.

## Contract

Let's start with the account contract itself in Aztec.nr. Create a new Aztec.nr contract project that will contain a file with the code for the account contract, with a hardcoded public key:

```rust title="contract" showLineNumbers 
// Account contract that uses Schnorr signatures for authentication using a hardcoded public key.
use dep::aztec::macros::aztec;

#[aztec]
pub contract SchnorrHardcodedAccount {
    use dep::authwit::{
        account::AccountActions,
        auth_witness::get_auth_witness,
        entrypoint::{app::AppPayload, fee::FeePayload},
    };
    use dep::aztec::prelude::PrivateContext;

    use dep::aztec::macros::functions::{private, view};
    use std::embedded_curve_ops::EmbeddedCurvePoint;

    global public_key: EmbeddedCurvePoint = EmbeddedCurvePoint {
        x: 0x16b93f4afae55cab8507baeb8e7ab4de80f5ab1e9e1f5149bf8cd0d375451d90,
        y: 0x208d44b36eb6e73b254921134d002da1a90b41131024e3b1d721259182106205,
        is_infinite: false,
    };

    // Note: If you globally change the entrypoint signature don't forget to update account_entrypoint.ts
    #[private]
    fn entrypoint(app_payload: AppPayload, fee_payload: FeePayload, cancellable: bool) {
        let actions = AccountActions::init(&mut context, is_valid_impl);
        actions.entrypoint(app_payload, fee_payload, cancellable);
    }

    #[private]
    #[view]
    fn verify_private_authwit(inner_hash: Field) -> Field {
        let actions = AccountActions::init(&mut context, is_valid_impl);
        actions.verify_private_authwit(inner_hash)
    }

    #[contract_library_method]
    fn is_valid_impl(_context: &mut PrivateContext, outer_hash: Field) -> bool {
        // Load auth witness and format as an u8 array

        // Safety: The witness is only used as a "magical value" that makes the signature verification below pass.
        // Hence it's safe.
        let witness: [Field; 64] = unsafe { get_auth_witness(outer_hash) };
        let mut signature: [u8; 64] = [0; 64];
        for i in 0..64 {
            signature[i] = witness[i] as u8;
        }

        // Verify signature using hardcoded public key
        schnorr::verify_signature(public_key, signature, outer_hash.to_be_bytes::<32>())
    }
}
```
> <sup><sub><a href="https://github.com/AztecProtocol/aztec-packages/blob/v1.0.0-staging.0/noir-projects/noir-contracts/contracts/account/schnorr_hardcoded_account_contract/src/main.nr#L1-L55" target="_blank" rel="noopener noreferrer">Source code: noir-projects/noir-contracts/contracts/account/schnorr_hardcoded_account_contract/src/main.nr#L1-L55</a></sub></sup>


For this to compile, you will need to add the following dependencies to your `Nargo.toml`:

```toml
[dependencies]
aztec = { git="https://github.com/AztecProtocol/aztec-packages/", tag="v1.0.0-staging.0", directory="noir-projects/aztec-nr/aztec" }
authwit = { git="https://github.com/AztecProtocol/aztec-packages/", tag="v1.0.0-staging.0", directory="noir-projects/aztec-nr/authwit" }
schnorr = { git = "https://github.com/noir-lang/schnorr", tag = "v0.1.1" }
```

The important part of this contract is the `entrypoint` function, which will be the first function executed in any transaction originated from this account. This function has two main responsibilities: authenticating the transaction and executing calls. It receives a `payload` with the list of function calls to execute, and requests a corresponding authentication witness from an oracle to validate it. Authentication witnesses are used for authorizing actions for an account, whether it is just checking a signature, like in this case, or granting authorization for another account to act on an accounts behalf (e.g. token approvals). You will find this logic implemented in the `AccountActions` module, which use the `AppPayload` and `FeePayload` structs:

```rust title="entrypoint" showLineNumbers 
pub fn entrypoint(self, app_payload: AppPayload, fee_payload: FeePayload, cancellable: bool) {
    let valid_fn = self.is_valid_impl;

    let combined_payload_hash = poseidon2_hash_with_separator(
        [app_payload.hash(), fee_payload.hash()],
        GENERATOR_INDEX__COMBINED_PAYLOAD,
    );
    assert(valid_fn(self.context, combined_payload_hash));

    fee_payload.execute_calls(self.context);
    self.context.end_setup();
    app_payload.execute_calls(self.context);
    if cancellable {
        let tx_nullifier = poseidon2_hash_with_separator(
            [app_payload.tx_nonce],
            GENERATOR_INDEX__TX_NULLIFIER,
        );
        self.context.push_nullifier(tx_nullifier);
    }
}
```
> <sup><sub><a href="https://github.com/AztecProtocol/aztec-packages/blob/v1.0.0-staging.0/noir-projects/aztec-nr/authwit/src/account.nr#L40-L61" target="_blank" rel="noopener noreferrer">Source code: noir-projects/aztec-nr/authwit/src/account.nr#L40-L61</a></sub></sup>


```rust title="app-payload-struct" showLineNumbers 
#[derive(Serialize)]
pub struct AppPayload {
    function_calls: [FunctionCall; ACCOUNT_MAX_CALLS],
    // A nonce that enables transaction cancellation. When the cancellable flag is enabled, this nonce is used to
    // compute a nullifier that is then emitted. This guarantees that we can cancel the transaction by using the same
    // nonce.
    pub tx_nonce: Field,
}
```
> <sup><sub><a href="https://github.com/AztecProtocol/aztec-packages/blob/v1.0.0-staging.0/noir-projects/aztec-nr/authwit/src/entrypoint/app.nr#L19-L28" target="_blank" rel="noopener noreferrer">Source code: noir-projects/aztec-nr/authwit/src/entrypoint/app.nr#L19-L28</a></sub></sup>


```rust title="fee-payload-struct" showLineNumbers 
#[derive(Serialize)]
pub struct FeePayload {
    function_calls: [FunctionCall; MAX_FEE_FUNCTION_CALLS],
    tx_nonce: Field,
    is_fee_payer: bool,
}
```
> <sup><sub><a href="https://github.com/AztecProtocol/aztec-packages/blob/v1.0.0-staging.0/noir-projects/aztec-nr/authwit/src/entrypoint/fee.nr#L17-L24" target="_blank" rel="noopener noreferrer">Source code: noir-projects/aztec-nr/authwit/src/entrypoint/fee.nr#L17-L24</a></sub></sup>


:::info
Using the `AccountActions` module and the payload structs is not mandatory. You can package the instructions to be carried out by your account contract however you want. However, using these modules can save you a lot of time when writing a new account contract, both in Noir and in Typescript.
:::

The `AccountActions` module provides default implementations for most of the account contract methods needed, but it requires a function for validating an auth witness. In this function you will customize how your account validates an action: whether it is using a specific signature scheme, a multi-party approval, a password, etc.

```rust title="is-valid" showLineNumbers 
#[contract_library_method]
fn is_valid_impl(_context: &mut PrivateContext, outer_hash: Field) -> bool {
    // Load auth witness and format as an u8 array

    // Safety: The witness is only used as a "magical value" that makes the signature verification below pass.
    // Hence it's safe.
    let witness: [Field; 64] = unsafe { get_auth_witness(outer_hash) };
    let mut signature: [u8; 64] = [0; 64];
    for i in 0..64 {
        signature[i] = witness[i] as u8;
    }

    // Verify signature using hardcoded public key
    schnorr::verify_signature(public_key, signature, outer_hash.to_be_bytes::<32>())
}
```
> <sup><sub><a href="https://github.com/AztecProtocol/aztec-packages/blob/v1.0.0-staging.0/noir-projects/noir-contracts/contracts/account/schnorr_hardcoded_account_contract/src/main.nr#L37-L53" target="_blank" rel="noopener noreferrer">Source code: noir-projects/noir-contracts/contracts/account/schnorr_hardcoded_account_contract/src/main.nr#L37-L53</a></sub></sup>


For our account contract, we will take the hash of the action to authorize, request the corresponding auth witness from the oracle, and validate it against our hardcoded public key. If the signature is correct, we authorize the action.

:::info

Transaction simulations in the PXE are not currently simulated, this is future work described [here](https://github.com/AztecProtocol/aztec-packages/issues/9133). This means that any transaction simulations that call into a function requiring an authwit will require the user to provide an authwit. Without simulating simulations, the PXE can't anticipate what authwits a transaction may need, so developers will need to manually request these authwits from users. In the future, transactions requiring authwits will be smart enough to ask the user for the correct authwits automatically.

:::

### Fee Abstraction

The `FeePayload`, being distinct from the `AppPayload`, allows for fee abstraction, meaning the account paying the fee for the transaction can be different than the account that is initiating the transaction. This is also useful for maintaining privacy, as fee payments on the network must be public. For example, Alice could pay a relayer transaction fees in private, and the relayer could pay the transaction fee in public. This also allows for accounts without Fee Juice to use another asset to pay for fees, provided they can find a relayer willing to accept the asset as payment (or do it for free).

### Nonce Abstraction

The protocol enforces uniqueness of transactions by checking that the transaction hash is unique. Transactions with the same transaction hash will be rejected. Handling transaction ordering via nonces is left to the account contract implementation. Account contracts can require incremental nonces, or have no requirements at all and not enforce transaction ordering.

A side-effect of not having nonces at the protocol level is that it is not possible to cancel pending transactions by submitting a new transaction with higher fees and the same nonce.

## Typescript

Now that we have a valid account contract, we need to write the typescript glue code that will take care of formatting and authenticating transactions so they can be processed by our contract, as well as deploying the contract during account setup. This takes the form of implementing the `AccountContract` interface from `@aztec/aztec.js`:

```typescript title="account-contract-interface" showLineNumbers 
/**
 * An account contract instance. Knows its artifact, deployment arguments, how to create
 * transaction execution requests out of function calls, and how to authorize actions.
 */
export interface AccountContract {
  /**
   * Returns the artifact of this account contract.
   */
  getContractArtifact(): Promise<ContractArtifact>;

  /**
   * Returns the deployment function name and arguments for this instance, or undefined if this contract does not require deployment.
   */
  getDeploymentFunctionAndArgs(): Promise<
    | {
        /** The name of the function used to deploy the contract */
        constructorName: string;
        /** The args to the function used to deploy the contract */
        constructorArgs: any[];
      }
    | undefined
  >;

  /**
   * Returns the account interface for this account contract given a deployment at the provided address.
   * The account interface is responsible for assembling tx requests given requested function calls, and
   * for creating signed auth witnesses given action identifiers (message hashes).
   * @param address - Address where this account contract is deployed.
   * @param nodeInfo - Info on the chain where it is deployed.
   * @returns An account interface instance for creating tx requests and authorizing actions.
   */
  getInterface(address: CompleteAddress, nodeInfo: NodeInfo): AccountInterface;

  /**
   * Returns the auth witness provider for the given address.
   * @param address - Address for which to create auth witnesses.
   */
  getAuthWitnessProvider(address: CompleteAddress): AuthWitnessProvider;
}
```
> <sup><sub><a href="https://github.com/AztecProtocol/aztec-packages/blob/v1.0.0-staging.0/yarn-project/aztec.js/src/account/account_contract.ts#L10-L50" target="_blank" rel="noopener noreferrer">Source code: yarn-project/aztec.js/src/account/account_contract.ts#L10-L50</a></sub></sup>


However, if you are using the default `AccountActions` module, then you can leverage the `DefaultAccountContract` class from `@aztec/accounts` and just implement the logic for generating an auth witness that matches the one you wrote in Noir:

```typescript title="account-contract" showLineNumbers 
const PRIVATE_KEY = GrumpkinScalar.fromHexString('0xd35d743ac0dfe3d6dbe6be8c877cb524a00ab1e3d52d7bada095dfc8894ccfa');

/** Account contract implementation that authenticates txs using Schnorr signatures. */
class SchnorrHardcodedKeyAccountContract extends DefaultAccountContract {
  constructor(private privateKey = PRIVATE_KEY) {
    super();
  }

  override getContractArtifact(): Promise<ContractArtifact> {
    return Promise.resolve(SchnorrHardcodedAccountContractArtifact);
  }

  getDeploymentFunctionAndArgs() {
    // This contract has no constructor
    return Promise.resolve(undefined);
  }

  getAuthWitnessProvider(_address: CompleteAddress): AuthWitnessProvider {
    const privateKey = this.privateKey;
    return {
      async createAuthWit(messageHash: Fr): Promise<AuthWitness> {
        const signer = new Schnorr();
        const signature = await signer.constructSignature(messageHash.toBuffer(), privateKey);
        return Promise.resolve(new AuthWitness(messageHash, [...signature.toBuffer()]));
      },
    };
  }
}
```
> <sup><sub><a href="https://github.com/AztecProtocol/aztec-packages/blob/v1.0.0-staging.0/yarn-project/end-to-end/src/guides/writing_an_account_contract.test.ts#L17-L46" target="_blank" rel="noopener noreferrer">Source code: yarn-project/end-to-end/src/guides/writing_an_account_contract.test.ts#L17-L46</a></sub></sup>


As you can see in the snippet above, to fill in this base class, we need to define three things:

- The build artifact for the corresponding account contract.
- The deployment arguments.
- How to create an auth witness.

In our case, the auth witness will be generated by Schnorr-signing over the message identifier using the hardcoded key. To do this, we are using the `Schnorr` signer from the `@aztec/stdlib` package to sign over the payload hash. This signer maps to exactly the same signing scheme that Noir's standard library expects in `schnorr::verify_signature`.

:::info
More signing schemes are available in case you want to experiment with other types of keys. Check out Noir's [documentation on cryptographic primitives](https://noir-lang.org/docs/noir/standard_library/cryptographic_primitives).
:::

## Trying it out

Let's try creating a new account backed by our account contract, and interact with a simple token contract to test it works.

To create and deploy the account, we will use the `AccountManager` class, which takes an instance of an Private Execution Environment (PXE), a [privacy private key](../../../../aztec/concepts/accounts/keys.md#incoming-viewing-keys), and an instance of our `AccountContract` class:

```typescript title="account-contract-deploy" showLineNumbers 
const secretKey = Fr.random();
const account = await AccountManager.create(pxe, secretKey, new SchnorrHardcodedKeyAccountContract());

if (await account.isDeployable()) {
  // The account has no funds. Use a funded wallet to pay for the fee for the deployment.
  await account.deploy({ deployWallet: fundedWallet }).wait();
} else {
  // The contract has no constructor. Deployment is not required.
  // Register it in the PXE Service to start using it.
  await account.register();
}

const wallet = await account.getWallet();
const address = wallet.getAddress();
```
> <sup><sub><a href="https://github.com/AztecProtocol/aztec-packages/blob/v1.0.0-staging.0/yarn-project/end-to-end/src/guides/writing_an_account_contract.test.ts#L60-L75" target="_blank" rel="noopener noreferrer">Source code: yarn-project/end-to-end/src/guides/writing_an_account_contract.test.ts#L60-L75</a></sub></sup>


Note that we used a funded wallet to deploy the account contract and pay for the transaction fee. The new account doesn't have any funds yet. We will continue using the funded wallet to deploy the token contract:

```typescript title="token-contract-deploy" showLineNumbers 
const token = await TokenContract.deploy(fundedWallet, fundedWallet.getAddress(), 'TokenName', 'TokenSymbol', 18)
  .send()
  .deployed();
logger.info(`Deployed token contract at ${token.address}`);

const mintAmount = 50n;
const from = fundedWallet.getAddress(); // we are setting from here because we need a sender to calculate the tag
await token.methods.mint_to_private(from, address, mintAmount).send().wait();

const balance = await token.methods.balance_of_private(address).simulate();
logger.info(`Balance of wallet is now ${balance}`);
```
> <sup><sub><a href="https://github.com/AztecProtocol/aztec-packages/blob/v1.0.0-staging.0/yarn-project/end-to-end/src/guides/writing_an_account_contract.test.ts#L78-L90" target="_blank" rel="noopener noreferrer">Source code: yarn-project/end-to-end/src/guides/writing_an_account_contract.test.ts#L78-L90</a></sub></sup>


If we run this, we get `Balance of wallet is now 150`, which shows that the `mint` call was successfully executed for our account contract.

To make sure that we are actually validating the provided signature in our account contract, we can try signing with a different key. To do this, we will set up a new `Account` instance pointing to the contract we already deployed but using a wrong signing key:

```typescript title="account-contract-fails" showLineNumbers 
const wrongKey = GrumpkinScalar.random();
const wrongAccountContract = new SchnorrHardcodedKeyAccountContract(wrongKey);
const wrongAccount = await AccountManager.create(pxe, secretKey, wrongAccountContract, account.salt);
const wrongWallet = await wrongAccount.getWallet();
const tokenWithWrongWallet = token.withWallet(wrongWallet);

try {
  await tokenWithWrongWallet.methods.mint_to_public(address, 200).prove();
} catch (err) {
  logger.info(`Failed to send tx: ${err}`);
}
```
> <sup><sub><a href="https://github.com/AztecProtocol/aztec-packages/blob/v1.0.0-staging.0/yarn-project/end-to-end/src/guides/writing_an_account_contract.test.ts#L93-L105" target="_blank" rel="noopener noreferrer">Source code: yarn-project/end-to-end/src/guides/writing_an_account_contract.test.ts#L93-L105</a></sub></sup>


Lo and behold, we get `Error: Assertion failed: 'verification == true'` when running the snippet above, pointing to the line in our account contract where we verify the Schnorr signature.

## Next Steps

### Optional: Learn more about concepts mentioned here

- [ECDSA signer account contract (GitHub link)](https://github.com/AztecProtocol/aztec-packages/blob/v1.0.0-staging.0/noir-projects/noir-contracts/contracts/ecdsa_account_contract/src/main.nr)
- [Schnorr signer account contract (GitHub link)](https://github.com/AztecProtocol/aztec-packages/tree/v1.0.0-staging.0/noir-projects/noir-contracts/contracts/account/schnorr_account_contract)
- [Account abstraction](../../../../aztec/concepts/accounts/index.md#account-abstraction-aa)
- [Authentication witness](../../../../aztec/concepts/advanced/authwit.md)
