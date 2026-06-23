# @aztec/accounts

Version: v5.0.0-rc.1

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
Implements: `unknown`

**Constructor**
```typescript
new DefaultAccountContract()
```

**Methods**
- `getAccount(completeAddress: CompleteAddress) => Account`
- `getAuthWitnessProvider(address: CompleteAddress) => AuthWitnessProvider`
- `getContractArtifact() => Promise<ContractArtifact>`
- `getImmutablesHash() => Promise<any>` - Accounts without immutables (the default) contribute to their address via an on-chain initializer instead. Account contracts that commit immutables into their address override this.
- `getInitializationFunctionAndArgs() => Promise<{ constructorArgs: any[]; constructorName: string } | undefined>`

### EcdsaKAccountContract

Account contract that authenticates transactions using ECDSA signatures verified against a secp256k1 public key stored in an immutable encrypted note. Eagerly loads the contract artifact

Extends: `EcdsaKBaseAccountContract`

**Constructor**
```typescript
new EcdsaKAccountContract(signingPrivateKey: Buffer)
```

**Methods**
- `getAccount(completeAddress: CompleteAddress) => Account`
- `getAuthWitnessProvider(_address: CompleteAddress) => AuthWitnessProvider`
- `getContractArtifact() => Promise<ContractArtifact>`
- `getImmutablesHash() => Promise<any>` - Accounts without immutables (the default) contribute to their address via an on-chain initializer instead. Account contracts that commit immutables into their address override this.
- `getInitializationFunctionAndArgs() => Promise<{ constructorArgs: any[][]; constructorName: string }>`

### EcdsaRAccountContract

Account contract that authenticates transactions using ECDSA signatures verified against a secp256k1 public key stored in an immutable encrypted note. Eagerly loads the contract artifact

Extends: `EcdsaRBaseAccountContract`

**Constructor**
```typescript
new EcdsaRAccountContract(signingPrivateKey: Buffer)
```

**Methods**
- `getAccount(completeAddress: CompleteAddress) => Account`
- `getAuthWitnessProvider(_address: CompleteAddress) => AuthWitnessProvider`
- `getContractArtifact() => Promise<ContractArtifact>`
- `getImmutablesHash() => Promise<any>` - Accounts without immutables (the default) contribute to their address via an on-chain initializer instead. Account contracts that commit immutables into their address override this.
- `getInitializationFunctionAndArgs() => Promise<{ constructorArgs: any[][]; constructorName: string }>`

### EcdsaRSSHAccountContract

Account contract that authenticates transactions using ECDSA signatures verified against a secp256r1 public key stored in an immutable encrypted note. Since this implementation relays signatures to an SSH agent, we provide the public key here not for signature verification, but to identify actual identity that will be used to sign authwitnesses. Eagerly loads the contract artifact

Extends: `EcdsaRSSHBaseAccountContract`

**Constructor**
```typescript
new EcdsaRSSHAccountContract(signingPublicKey: Buffer)
```

**Methods**
- `getAccount(completeAddress: CompleteAddress) => Account`
- `getAuthWitnessProvider(_address: CompleteAddress) => AuthWitnessProvider`
- `getContractArtifact() => Promise<ContractArtifact>`
- `getImmutablesHash() => Promise<any>` - Accounts without immutables (the default) contribute to their address via an on-chain initializer instead. Account contracts that commit immutables into their address override this.
- `getInitializationFunctionAndArgs() => Promise<{ constructorArgs: number[][]; constructorName: string }>`

### SchnorrAccountContract

Account contract that authenticates transactions using Schnorr signatures verified against a Grumpkin public key stored in an immutable encrypted note. Eagerly loads the contract artifact

Extends: `SchnorrBaseAccountContract`

**Constructor**
```typescript
new SchnorrAccountContract(signingPrivateKey: GrumpkinScalar)
```

**Properties**
- `signingPrivateKey: GrumpkinScalar`

**Methods**
- `getAccount(completeAddress: CompleteAddress) => Account`
- `getAuthWitnessProvider(_address: CompleteAddress) => AuthWitnessProvider`
- `getContractArtifact() => Promise<ContractArtifact>`
- `getImmutablesHash() => Promise<any>` - Accounts without immutables (the default) contribute to their address via an on-chain initializer instead. Account contracts that commit immutables into their address override this.
- `getInitializationFunctionAndArgs() => Promise<{ constructorArgs: any[]; constructorName: string } | undefined>`
- `getSigningPublicKey() => any` - The Grumpkin public key this account verifies signatures against.

### SchnorrInitializerlessAccountContract

Account contract that authenticates transactions using Schnorr signatures verified against a Grumpkin public key stored in an immutable encrypted note. Eagerly loads the contract artifact

Extends: `SchnorrBaseAccountContract`

**Constructor**
```typescript
new SchnorrInitializerlessAccountContract(signingPrivateKey: GrumpkinScalar)
```

**Properties**
- `signingPrivateKey: GrumpkinScalar`

**Methods**
- `getAccount(completeAddress: CompleteAddress) => Account`
- `getAuthWitnessProvider(_address: CompleteAddress) => AuthWitnessProvider`
- `getContractArtifact() => Promise<ContractArtifact>`
- `getImmutablesHash() => Promise<Fr>` - Accounts without immutables (the default) contribute to their address via an on-chain initializer instead. Account contracts that commit immutables into their address override this.
- `getInitializationFunctionAndArgs() => Promise<undefined>`
- `getSigningPublicKey() => any` - The Grumpkin public key this account verifies signatures against.

## Interfaces

### InitialAccountData

Data for generating an initial account.

**Properties**
- `address: AztecAddress` - Address of the schnorr account contract.
- `salt: Fr` - Contract address salt.
- `secret: Fr` - Secret to derive the keys for the account.
- `signingKey: GrumpkinScalar` - Signing key od the account.
- `type?: InitialAccountType` - Account contract variant.

## Functions

### generateSchnorrAccounts
```typescript
function generateSchnorrAccounts(numberOfAccounts: number, type: InitialAccountType) => Promise<InitialAccountData[]>
```
Generate a fixed amount of random schnorr account contract instances of the given type

### getInitialTestAccountsData
```typescript
function getInitialTestAccountsData() => Promise<InitialAccountData[]>
```
Gets the basic information for initial test accounts.

### getSchnorrAccountContractAddress
```typescript
function getSchnorrAccountContractAddress(secret: Fr, salt: Fr, signingPrivateKey?: any) => Promise<AztecAddress>
```
Compute the address of a schnorr account contract.

### getSchnorrInitializerlessAccountContractAddress
```typescript
function getSchnorrInitializerlessAccountContractAddress(secret: Fr, salt: Fr, signingPrivateKey?: any) => Promise<AztecAddress>
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
type INITIAL_TEST_ACCOUNT_SALTS = any[]
```

### INITIAL_TEST_ENCRYPTION_KEYS
```typescript
type INITIAL_TEST_ENCRYPTION_KEYS = any[]
```

### INITIAL_TEST_SECRET_KEYS
```typescript
type INITIAL_TEST_SECRET_KEYS = any[]
```

### INITIAL_TEST_SIGNING_KEYS
```typescript
type INITIAL_TEST_SIGNING_KEYS = any[]
```

### InitialAccountType
```typescript
type InitialAccountType = "schnorr" | "schnorr_initializerless"
```
The schnorr account contract variant a test account uses.

### SchnorrAccountContractArtifact
```typescript
type SchnorrAccountContractArtifact = any
```

### SchnorrInitializerlessAccountContractArtifact
```typescript
type SchnorrInitializerlessAccountContractArtifact = any
```
