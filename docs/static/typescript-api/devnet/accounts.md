# @aztec/accounts

Version: v3.0.0-devnet.6-patch.1

## Quick Import Reference

```typescript
import {
  DefaultAccountContract,
  DefaultAccountInterface,
  EcdsaKAccountContract,
  EcdsaKBaseAccountContract,
  EcdsaRAccountContract,
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
- `getAuthWitnessProvider(address: CompleteAddress) => AuthWitnessProvider` - Returns the auth witness provider for the given address.
- `getContractArtifact() => Promise<ContractArtifact>` - Returns the artifact of this account contract.
- `getInitializationFunctionAndArgs() => Promise<{ constructorArgs: any[]; constructorName: string }>` - Returns the initializer function name and arguments for this instance, or undefined if this contract does not require initialization.
- `getInterface(address: CompleteAddress, chainInfo: ChainInfo) => AccountInterface` - Returns the account interface for this account contract given an instance at the provided address. The account interface is responsible for assembling tx requests given requested function calls, and for creating signed auth witnesses given action identifiers (message hashes).

### DefaultAccountInterface

Default implementation for an account interface. Requires that the account uses the default entrypoint signature, which accept an AppPayload and a FeePayload as defined in noir-libs/aztec-noir/src/entrypoint module
Implements: `AccountInterface`

**Constructor**
```typescript
new DefaultAccountInterface(authWitnessProvider: AuthWitnessProvider, address: CompleteAddress, chainInfo: ChainInfo)
```

**Properties**
- `entrypoint: EntrypointInterface`

**Methods**
- `createAuthWit(messageHash: Fr) => Promise<AuthWitness>` - Computes an authentication witness from either a message hash
- `createTxExecutionRequest(exec: ExecutionPayload, gasSettings: GasSettings, options: DefaultAccountEntrypointOptions) => Promise<TxExecutionRequest>` - Generates an execution request out of set of function calls.
- `getAddress() => AztecAddress` - Returns the address for this account.
- `getChainId() => Fr` - Returns the chain id for this account
- `getCompleteAddress() => CompleteAddress` - Returns the complete address for this account.
- `getVersion() => Fr` - Returns the rollup version for this account

### EcdsaKAccountContract

Account contract that authenticates transactions using ECDSA signatures verified against a secp256k1 public key stored in an immutable encrypted note. Lazily loads the contract artifact

Extends: `EcdsaKBaseAccountContract`

**Constructor**
```typescript
new EcdsaKAccountContract(signingPrivateKey: Buffer)
```

**Methods**
- `getAuthWitnessProvider(_address: CompleteAddress) => AuthWitnessProvider` - Returns the auth witness provider for the given address.
- `getContractArtifact() => Promise<ContractArtifact>` - Returns the artifact of this account contract.
- `getInitializationFunctionAndArgs() => Promise<{ constructorArgs: any[]; constructorName: string }>` - Returns the initializer function name and arguments for this instance, or undefined if this contract does not require initialization.
- `getInterface(address: CompleteAddress, chainInfo: ChainInfo) => AccountInterface` - Returns the account interface for this account contract given an instance at the provided address. The account interface is responsible for assembling tx requests given requested function calls, and for creating signed auth witnesses given action identifiers (message hashes).

### EcdsaKBaseAccountContract

Account contract that authenticates transactions using ECDSA signatures verified against a secp256k1 public key stored in an immutable encrypted note. This abstract version does not provide a way to retrieve the artifact, as it can be implemented with or without lazy loading.

Extends: `DefaultAccountContract`

**Constructor**
```typescript
new EcdsaKBaseAccountContract(signingPrivateKey: Buffer)
```

**Methods**
- `getAuthWitnessProvider(_address: CompleteAddress) => AuthWitnessProvider` - Returns the auth witness provider for the given address.
- `getContractArtifact() => Promise<ContractArtifact>` - Returns the artifact of this account contract.
- `getInitializationFunctionAndArgs() => Promise<{ constructorArgs: any[]; constructorName: string }>` - Returns the initializer function name and arguments for this instance, or undefined if this contract does not require initialization.
- `getInterface(address: CompleteAddress, chainInfo: ChainInfo) => AccountInterface` - Returns the account interface for this account contract given an instance at the provided address. The account interface is responsible for assembling tx requests given requested function calls, and for creating signed auth witnesses given action identifiers (message hashes).

### EcdsaRAccountContract

Account contract that authenticates transactions using ECDSA signatures verified against a secp256k1 public key stored in an immutable encrypted note. Lazily loads the contract artifact

Extends: `EcdsaRBaseAccountContract`

**Constructor**
```typescript
new EcdsaRAccountContract(signingPrivateKey: Buffer)
```

**Methods**
- `getAuthWitnessProvider(_address: CompleteAddress) => AuthWitnessProvider` - Returns the auth witness provider for the given address.
- `getContractArtifact() => Promise<ContractArtifact>` - Returns the artifact of this account contract.
- `getInitializationFunctionAndArgs() => Promise<{ constructorArgs: any[]; constructorName: string }>` - Returns the initializer function name and arguments for this instance, or undefined if this contract does not require initialization.
- `getInterface(address: CompleteAddress, chainInfo: ChainInfo) => AccountInterface` - Returns the account interface for this account contract given an instance at the provided address. The account interface is responsible for assembling tx requests given requested function calls, and for creating signed auth witnesses given action identifiers (message hashes).

### EcdsaRBaseAccountContract

Account contract that authenticates transactions using ECDSA signatures verified against a secp256r1 public key stored in an immutable encrypted note. This abstract version does not provide a way to retrieve the artifact, as it can be implemented with or without lazy loading.

Extends: `DefaultAccountContract`

**Constructor**
```typescript
new EcdsaRBaseAccountContract(signingPrivateKey: Buffer)
```

**Methods**
- `getAuthWitnessProvider(_address: CompleteAddress) => AuthWitnessProvider` - Returns the auth witness provider for the given address.
- `getContractArtifact() => Promise<ContractArtifact>` - Returns the artifact of this account contract.
- `getInitializationFunctionAndArgs() => Promise<{ constructorArgs: any[]; constructorName: string }>` - Returns the initializer function name and arguments for this instance, or undefined if this contract does not require initialization.
- `getInterface(address: CompleteAddress, chainInfo: ChainInfo) => AccountInterface` - Returns the account interface for this account contract given an instance at the provided address. The account interface is responsible for assembling tx requests given requested function calls, and for creating signed auth witnesses given action identifiers (message hashes).

### EcdsaRSSHAccountContract

Account contract that authenticates transactions using ECDSA signatures verified against a secp256r1 public key stored in an immutable encrypted note. Since this implementation relays signatures to an SSH agent, we provide the public key here not for signature verification, but to identify actual identity that will be used to sign authwitnesses. Lazily loads the contract artifact

Extends: `EcdsaRSSHBaseAccountContract`

**Constructor**
```typescript
new EcdsaRSSHAccountContract(signingPublicKey: Buffer)
```

**Methods**
- `getAuthWitnessProvider(_address: CompleteAddress) => AuthWitnessProvider` - Returns the auth witness provider for the given address.
- `getContractArtifact() => Promise<ContractArtifact>` - Returns the artifact of this account contract.
- `getInitializationFunctionAndArgs() => Promise<{ constructorArgs: any[]; constructorName: string }>` - Returns the initializer function name and arguments for this instance, or undefined if this contract does not require initialization.
- `getInterface(address: CompleteAddress, chainInfo: ChainInfo) => AccountInterface` - Returns the account interface for this account contract given an instance at the provided address. The account interface is responsible for assembling tx requests given requested function calls, and for creating signed auth witnesses given action identifiers (message hashes).

### EcdsaRSSHBaseAccountContract

Account contract that authenticates transactions using ECDSA signatures verified against a secp256r1 public key stored in an immutable encrypted note. Since this implementation relays signatures to an SSH agent, we provide the public key here not for signature verification, but to identify actual identity that will be used to sign authwitnesses. This abstract version does not provide a way to retrieve the artifact, as it can be implemented with or without lazy loading.

Extends: `DefaultAccountContract`

**Constructor**
```typescript
new EcdsaRSSHBaseAccountContract(signingPublicKey: Buffer)
```

**Methods**
- `getAuthWitnessProvider(_address: CompleteAddress) => AuthWitnessProvider` - Returns the auth witness provider for the given address.
- `getContractArtifact() => Promise<ContractArtifact>` - Returns the artifact of this account contract.
- `getInitializationFunctionAndArgs() => Promise<{ constructorArgs: any[]; constructorName: string }>` - Returns the initializer function name and arguments for this instance, or undefined if this contract does not require initialization.
- `getInterface(address: CompleteAddress, chainInfo: ChainInfo) => AccountInterface` - Returns the account interface for this account contract given an instance at the provided address. The account interface is responsible for assembling tx requests given requested function calls, and for creating signed auth witnesses given action identifiers (message hashes).

### SchnorrAccountContract

Account contract that authenticates transactions using Schnorr signatures verified against a Grumpkin public key stored in an immutable encrypted note. Lazily loads the contract artifact

Extends: `SchnorrBaseAccountContract`

**Constructor**
```typescript
new SchnorrAccountContract(signingPrivateKey: Fq)
```

**Methods**
- `getAuthWitnessProvider(_address: CompleteAddress) => AuthWitnessProvider` - Returns the auth witness provider for the given address.
- `getContractArtifact() => Promise<ContractArtifact>` - Returns the artifact of this account contract.
- `getInitializationFunctionAndArgs() => Promise<{ constructorArgs: Fr[]; constructorName: string }>` - Returns the initializer function name and arguments for this instance, or undefined if this contract does not require initialization.
- `getInterface(address: CompleteAddress, chainInfo: ChainInfo) => AccountInterface` - Returns the account interface for this account contract given an instance at the provided address. The account interface is responsible for assembling tx requests given requested function calls, and for creating signed auth witnesses given action identifiers (message hashes).

### SchnorrAuthWitnessProvider

Creates auth witnesses using Schnorr signatures.
Implements: `AuthWitnessProvider`

**Constructor**
```typescript
new SchnorrAuthWitnessProvider(signingPrivateKey: Fq)
```

**Methods**
- `createAuthWit(messageHash: Fr) => Promise<AuthWitness>` - Computes an authentication witness from either a message hash

### SchnorrBaseAccountContract

Account contract that authenticates transactions using Schnorr signatures verified against a Grumpkin public key stored in an immutable encrypted note. This abstract version does not provide a way to retrieve the artifact, as it can be implemented with or without lazy loading.

Extends: `DefaultAccountContract`

**Constructor**
```typescript
new SchnorrBaseAccountContract(signingPrivateKey: Fq)
```

**Methods**
- `getAuthWitnessProvider(_address: CompleteAddress) => AuthWitnessProvider` - Returns the auth witness provider for the given address.
- `getContractArtifact() => Promise<ContractArtifact>` - Returns the artifact of this account contract.
- `getInitializationFunctionAndArgs() => Promise<{ constructorArgs: Fr[]; constructorName: string }>` - Returns the initializer function name and arguments for this instance, or undefined if this contract does not require initialization.
- `getInterface(address: CompleteAddress, chainInfo: ChainInfo) => AccountInterface` - Returns the account interface for this account contract given an instance at the provided address. The account interface is responsible for assembling tx requests given requested function calls, and for creating signed auth witnesses given action identifiers (message hashes).

### SingleKeyAccountContract

Account contract that authenticates transactions using Schnorr signatures verified against the note encryption key, relying on a single private key for both encryption and authentication. Lazily loads the contract artifact

Extends: `SingleKeyBaseAccountContract`

**Constructor**
```typescript
new SingleKeyAccountContract(signingPrivateKey: Fq)
```

**Methods**
- `getAuthWitnessProvider(account: CompleteAddress) => AuthWitnessProvider` - Returns the auth witness provider for the given address.
- `getContractArtifact() => Promise<ContractArtifact>` - Returns the artifact of this account contract.
- `getInitializationFunctionAndArgs() => Promise<undefined>` - Returns the initializer function name and arguments for this instance, or undefined if this contract does not require initialization.
- `getInterface(address: CompleteAddress, chainInfo: ChainInfo) => AccountInterface` - Returns the account interface for this account contract given an instance at the provided address. The account interface is responsible for assembling tx requests given requested function calls, and for creating signed auth witnesses given action identifiers (message hashes).

### SingleKeyBaseAccountContract

Account contract that authenticates transactions using Schnorr signatures verified against the note encryption key, relying on a single private key for both encryption and authentication. This abstract version does not provide a way to retrieve the artifact, as it can be implemented with or without lazy loading.

Extends: `DefaultAccountContract`

**Constructor**
```typescript
new SingleKeyBaseAccountContract(encryptionPrivateKey: Fq)
```

**Methods**
- `getAuthWitnessProvider(account: CompleteAddress) => AuthWitnessProvider` - Returns the auth witness provider for the given address.
- `getContractArtifact() => Promise<ContractArtifact>` - Returns the artifact of this account contract.
- `getInitializationFunctionAndArgs() => Promise<undefined>` - Returns the initializer function name and arguments for this instance, or undefined if this contract does not require initialization.
- `getInterface(address: CompleteAddress, chainInfo: ChainInfo) => AccountInterface` - Returns the account interface for this account contract given an instance at the provided address. The account interface is responsible for assembling tx requests given requested function calls, and for creating signed auth witnesses given action identifiers (message hashes).

### StubAccountContract

Account contract that authenticates transactions using Stub signatures verified against a Grumpkin public key stored in an immutable encrypted note. Lazily loads the contract artifact

Extends: `StubBaseAccountContract`

**Constructor**
```typescript
new StubAccountContract()
```

**Methods**
- `getAuthWitnessProvider(_address: CompleteAddress) => AuthWitnessProvider` - Returns the auth witness provider for the given address.
- `getContractArtifact() => Promise<ContractArtifact>` - Returns the artifact of this account contract.
- `getInitializationFunctionAndArgs() => Promise<{ constructorArgs: never[]; constructorName: string }>` - Returns the initializer function name and arguments for this instance, or undefined if this contract does not require initialization.
- `getInterface(address: CompleteAddress, chainInfo: ChainInfo) => AccountInterface` - Returns the account interface for this account contract given an instance at the provided address. The account interface is responsible for assembling tx requests given requested function calls, and for creating signed auth witnesses given action identifiers (message hashes).

### StubAuthWitnessProvider

Creates auth witnesses using Stub signatures.
Implements: `AuthWitnessProvider`

**Constructor**
```typescript
new StubAuthWitnessProvider()
```

**Methods**
- `createAuthWit(messageHash: Fr) => Promise<AuthWitness>` - A fake account always returns an empty authwitness, since it doesn't perform any verification whatsoever

### StubBaseAccountContract

An Account contract that does not perform any authentication of authwits (`is_valid` always returns `true`) It is used to capture authorization data during simulations

Extends: `DefaultAccountContract`

**Constructor**
```typescript
new StubBaseAccountContract()
```

**Methods**
- `getAuthWitnessProvider(_address: CompleteAddress) => AuthWitnessProvider` - Returns the auth witness provider for the given address.
- `getContractArtifact() => Promise<ContractArtifact>` - Returns the artifact of this account contract.
- `getInitializationFunctionAndArgs() => Promise<{ constructorArgs: never[]; constructorName: string }>` - Returns the initializer function name and arguments for this instance, or undefined if this contract does not require initialization.
- `getInterface(address: CompleteAddress, chainInfo: ChainInfo) => AccountInterface` - Returns the account interface for this account contract given an instance at the provided address. The account interface is responsible for assembling tx requests given requested function calls, and for creating signed auth witnesses given action identifiers (message hashes).

## Interfaces

### InitialAccountData

Data for generating an initial account.

**Properties**
- `address: AztecAddress` - Address of the schnorr account contract.
- `salt: Fr` - Contract address salt.
- `secret: Fr` - Secret to derive the keys for the account.
- `signingKey: Fq` - Signing key od the account.

## Functions

### connectToAgent
```typescript
function connectToAgent() => net.Socket
```
Connect to the SSH agent via a TCP socket using the standard env variable

### createStubAccount
```typescript
function createStubAccount(originalAddress: CompleteAddress, chainInfo: ChainInfo) => BaseAccount
```

### generateSchnorrAccounts
```typescript
function generateSchnorrAccounts(numberOfAccounts: number) => Promise<InitialAccountData[]>
```
Generate a fixed amount of random schnorr account contract instance.

### getEcdsaKAccountContractArtifact
```typescript
function getEcdsaKAccountContractArtifact() => Promise<ContractArtifact>
```
Lazily loads the contract artifact

### getEcdsaRAccountContractArtifact
```typescript
function getEcdsaRAccountContractArtifact() => Promise<ContractArtifact>
```
Lazily loads the contract artifact

### getIdentities
```typescript
function getIdentities() => Promise<StoredKey[]>
```
Retrieve the identities stored in the SSH agent.

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

### getSchnorrAccountContractArtifact
```typescript
function getSchnorrAccountContractArtifact() => Promise<ContractArtifact>
```
Lazily loads the contract artifact

### getSingleKeyAccountContractArtifact
```typescript
function getSingleKeyAccountContractArtifact() => Promise<ContractArtifact>
```
Lazily loads the contract artifact

### getStubAccountContractArtifact
```typescript
function getStubAccountContractArtifact() => Promise<ContractArtifact>
```
Lazily loads the contract artifact

### signWithAgent
```typescript
function signWithAgent(keyType: Buffer, curveName: Buffer, publicKey: Buffer, data: Buffer) => Promise<Buffer<ArrayBufferLike>>
```
Sign data using a key stored in the SSH agent. The private signing key is identified by its corresponding public key.

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

### StubAccountContractArtifact
```typescript
type StubAccountContractArtifact = ContractArtifact
```

## Cross-Package References

This package references types from other Aztec packages:

**@aztec/aztec.js**
- `AccountContract`, `AccountInterface`, `BaseAccount`

**@aztec/entrypoints**
- `AuthWitnessProvider`, `ChainInfo`, `DefaultAccountEntrypointOptions`, `EntrypointInterface`

**@aztec/foundation**
- `Fq`, `Fr`

**@aztec/stdlib**
- `AuthWitness`, `AztecAddress`, `CompleteAddress`, `ContractArtifact`, `ExecutionPayload`, `GasSettings`, `TxExecutionRequest`
