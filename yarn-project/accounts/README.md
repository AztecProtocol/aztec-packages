# Accounts

Accounts is a client library that provides implementations for some common account flavors. Use it to acquire a `Wallet` object that corresponds to an account, and use that together with `@aztec/aztec.js` to interact with the network.

## Installing

```
npm install @aztec/accounts
```

## Account types

- **Schnorr**: Uses an Grumpkin private key with Schnorr signatures for authentication, and a separate Grumpkin private key for encryption. Recommended for most use cases.
- **ECDSA**: Uses an ECDSA private key for authentication, and a Grumpkin private key for encryption. Recommended for building integrations with Ethereum wallets.
- **SingleKey**: Uses a single Grumpkin private key for both authentication and encryption. Recommended for testing purposes only.

## Usage

### Deploy a new account

```typescript
import { getSchnorrAccount } from '@aztec/accounts/schnorr';
import { GrumpkinScalar } from '@aztec/foundation/fields';
import { Fr } from '@aztec/stdlib';

const encryptionSecretKey = Fr.random();
const signingPrivateKey = GrumpkinScalar.random();
const wallet = getSchnorrAccount(pxe, encryptionSecretKey, signingPrivateKey)
  .deploy({ deployWallet }) // Use a wallet with funds to pay for the fee for the deployment.
  .wait();
console.log(`New account deployed at ${wallet.getAddress()}`);
```

### Create a wallet object from an already deployed account

```typescript
import { getSchnorrWallet } from '@aztec/accounts/schnorr';

const wallet = getSchnorrWallet(pxe, address, signingPrivateKey);
console.log(`Wallet for ${wallet.getAddress()} ready`);
```
