# @aztec/accounts

Version: v4.0.0-devnet.1-patch.0

## Quick Import Reference

```typescript
import {
  DefaultAccountContract,
  EcdsaKAccountContract,
  EcdsaRAccountContract,
  EcdsaRSSHAccountContract,
  SchnorrAccountContract,
  // ... and more
} from '@aztec/accounts';
```

## Classes

### DefaultAccountContract

Base class for implementing an account contract. Requires that the account uses the default entrypoint method signature.
Implements: `AccountContract`

**Constructor**
```typescript
new DefaultAccountContract()
```

**Methods**
- `getAccount(completeAddress: CompleteAddress) => Account` - Returns the account implementation for this account contract given an instance at the provided address. The account is responsible for assembling tx requests given requested function calls, and for creating signed auth witnesses given action identifiers (message hashes).
- `getAuthWitnessProvider(address: CompleteAddress) => AuthWitnessProvider` - Returns the auth witness provider for the given address.
- `getContractArtifact() => Promise<ContractArtifact>` - Returns the artifact of this account contract.
- `getInitializationFunctionAndArgs() => Promise<{ constructorArgs: any[]; constructorName: string } | undefined>` - Returns the initializer function name and arguments for this instance, or undefined if this contract does not require initialization.

### EcdsaKAccountContract

Account contract that authenticates transactions using ECDSA signatures verified against a secp256k1 public key stored in an immutable encrypted note. Eagerly loads the contract artifact

Extends: `EcdsaKBaseAccountContract`

**Constructor**
```typescript
new EcdsaKAccountContract(signingPrivateKey: Buffer)
```

**Methods**
- `getAccount(completeAddress: CompleteAddress) => Account` - Returns the account implementation for this account contract given an instance at the provided address. The account is responsible for assembling tx requests given requested function calls, and for creating signed auth witnesses given action identifiers (message hashes).
- `getAuthWitnessProvider(_address: CompleteAddress) => AuthWitnessProvider`
- `getContractArtifact() => Promise<ContractArtifact>`
- `getInitializationFunctionAndArgs() => Promise<{ constructorArgs: Buffer<ArrayBufferLike>[]; constructorName: string }>`

### EcdsaRAccountContract

Account contract that authenticates transactions using ECDSA signatures verified against a secp256k1 public key stored in an immutable encrypted note. Eagerly loads the contract artifact

Extends: `EcdsaRBaseAccountContract`

**Constructor**
```typescript
new EcdsaRAccountContract(signingPrivateKey: Buffer)
```

**Methods**
- `getAccount(completeAddress: CompleteAddress) => Account` - Returns the account implementation for this account contract given an instance at the provided address. The account is responsible for assembling tx requests given requested function calls, and for creating signed auth witnesses given action identifiers (message hashes).
- `getAuthWitnessProvider(_address: CompleteAddress) => AuthWitnessProvider`
- `getContractArtifact() => Promise<ContractArtifact>`
- `getInitializationFunctionAndArgs() => Promise<{ constructorArgs: Buffer<ArrayBufferLike>[]; constructorName: string }>`

### EcdsaRSSHAccountContract

Account contract that authenticates transactions using ECDSA signatures verified against a secp256r1 public key stored in an immutable encrypted note. Since this implementation relays signatures to an SSH agent, we provide the public key here not for signature verification, but to identify actual identity that will be used to sign authwitnesses. Eagerly loads the contract artifact

Extends: `EcdsaRSSHBaseAccountContract`

**Constructor**
```typescript
new EcdsaRSSHAccountContract(signingPublicKey: Buffer)
```

**Methods**
- `getAccount(completeAddress: CompleteAddress) => Account` - Returns the account implementation for this account contract given an instance at the provided address. The account is responsible for assembling tx requests given requested function calls, and for creating signed auth witnesses given action identifiers (message hashes).
- `getAuthWitnessProvider(_address: CompleteAddress) => AuthWitnessProvider`
- `getContractArtifact() => Promise<ContractArtifact>`
- `getInitializationFunctionAndArgs() => Promise<{ constructorArgs: Buffer<ArrayBufferLike>[]; constructorName: string }>`

### SchnorrAccountContract

Account contract that authenticates transactions using Schnorr signatures verified against a Grumpkin public key stored in an immutable encrypted note. Eagerly loads the contract artifact

Extends: `SchnorrBaseAccountContract`

**Constructor**
```typescript
new SchnorrAccountContract(signingPrivateKey: Fq)
```

**Methods**
- `getAccount(completeAddress: CompleteAddress) => Account` - Returns the account implementation for this account contract given an instance at the provided address. The account is responsible for assembling tx requests given requested function calls, and for creating signed auth witnesses given action identifiers (message hashes).
- `getAuthWitnessProvider(_address: CompleteAddress) => AuthWitnessProvider`
- `getContractArtifact() => Promise<ContractArtifact>`
- `getInitializationFunctionAndArgs() => Promise<{ constructorArgs: Fr[]; constructorName: string }>`

### SingleKeyAccountContract

Account contract that authenticates transactions using Schnorr signatures verified against the note encryption key, relying on a single private key for both encryption and authentication. Eagerly loads the contract artifact

Extends: `SingleKeyBaseAccountContract`

**Constructor**
```typescript
new SingleKeyAccountContract(signingPrivateKey: Fq)
```

**Methods**
- `getAccount(completeAddress: CompleteAddress) => Account` - Returns the account implementation for this account contract given an instance at the provided address. The account is responsible for assembling tx requests given requested function calls, and for creating signed auth witnesses given action identifiers (message hashes).
- `getAuthWitnessProvider(account: CompleteAddress) => AuthWitnessProvider`
- `getContractArtifact() => Promise<ContractArtifact>`
- `getInitializationFunctionAndArgs() => Promise<undefined>`

## Interfaces

### InitialAccountData

Data for generating an initial account.

**Properties**
- `address: AztecAddress` - Address of the schnorr account contract.
- `salt: Fr` - Contract address salt.
- `secret: Fr` - Secret to derive the keys for the account.
- `signingKey: Fq` - Signing key od the account.

## Functions

### generateSchnorrAccounts
```typescript
function generateSchnorrAccounts(numberOfAccounts: number) => Promise<Promise<InitialAccountData[]>>
```
Generate a fixed amount of random schnorr account contract instance.

### getInitialTestAccountsData
```typescript
function getInitialTestAccountsData() => Promise<InitialAccountData[]>
```
Gets the basic information for initial test accounts.

### getSchnorrAccountContractAddress
```typescript
function getSchnorrAccountContractAddress(secret: Fr, salt: Fr, signingPrivateKey?: Fq) => Promise<AztecAddress>
```
Compute the address of a schnorr account contract.

## Types

### EcdsaKAccountContractArtifact
```typescript
type EcdsaKAccountContractArtifact = ContractArtifact
```

### EcdsaRAccountContractArtifact
```typescript
type EcdsaRAccountContractArtifact = ContractArtifact
```

### INITIAL_TEST_ACCOUNT_SALTS
```typescript
type INITIAL_TEST_ACCOUNT_SALTS = Fr[]
```

### INITIAL_TEST_ENCRYPTION_KEYS
```typescript
type INITIAL_TEST_ENCRYPTION_KEYS = Fq[]
```

### INITIAL_TEST_SECRET_KEYS
```typescript
type INITIAL_TEST_SECRET_KEYS = Fr[]
```

### INITIAL_TEST_SIGNING_KEYS
```typescript
type INITIAL_TEST_SIGNING_KEYS = Fq[]
```

### SchnorrAccountContractArtifact
```typescript
type SchnorrAccountContractArtifact = ContractArtifact
```

### SchnorrSingleKeyAccountContractArtifact
```typescript
type SchnorrSingleKeyAccountContractArtifact = ContractArtifact
```

## Cross-Package References

This package references types from other Aztec packages:

**@aztec/aztec.js**
- `Account`, `AccountContract`

**@aztec/entrypoints**
- `AuthWitnessProvider`

**@aztec/foundation**
- `Fq`, `Fr`

**@aztec/stdlib**
- `AztecAddress`, `CompleteAddress`, `ContractArtifact`
