# Contract Module

The contract module provides core functionality for working with smart contracts in the Aztec protocol, including contract deployment, addressing, class management, and instance tracking.

## Overview

This module handles:

- **Contract Instances**: Deployed contract instances with addresses and initialization data
- **Contract Classes**: Contract bytecode and verification keys
- **Contract Addresses**: Deterministic address computation
- **Deployment**: Contract instantiation and registration
- **Complete Addresses**: Full account information including encryption keys

## Core Concepts

### Contract Class vs Contract Instance

Understanding the distinction is crucial:

**Contract Class** (like a "template"):
- Contains the contract bytecode and verification keys
- Identified by a `contractClassId` (hash of bytecode + VKs)
- Can be registered once and reused for multiple instances
- Analogous to a "class" in object-oriented programming

**Contract Instance** (like an "object"):
- A specific deployment of a contract class
- Has a unique address derived from class ID, salt, and initialization params
- Contains state specific to that deployment
- References its contract class via `contractClassId`

```typescript
import {
  getContractClassFromArtifact,
  getContractInstanceFromInstantiationParams
} from '@aztec/stdlib';

// 1. Create contract class from artifact (done once per contract)
const contractClass = await getContractClassFromArtifact(artifact);
console.log(contractClass.id);  // Contract class ID

// 2. Create instance from class (done per deployment)
const instance = await getContractInstanceFromInstantiationParams(artifact, {
  salt: Fr.random(),
  publicKeys: accountPublicKeys,
  constructorArgs: [initialOwner]
});
console.log(instance.address);  // Contract instance address
console.log(instance.currentContractClassId);  // References the class
```

## Contract Instance

### Creating a Contract Instance

```typescript
import { getContractInstanceFromInstantiationParams } from '@aztec/stdlib';

const instance = await getContractInstanceFromInstantiationParams(artifact, {
  salt: Fr.random(),                    // Unique salt for address derivation
  publicKeys: await PublicKeys.random(), // Public keys for the contract
  deployer: deployerAddress,            // Address of deployer (optional)
  constructorArgs: [arg1, arg2],        // Constructor arguments
  constructorArtifact: 'constructor'    // Constructor function name (optional)
});

// Instance contains:
console.log(instance.address);                    // Computed contract address
console.log(instance.currentContractClassId);     // Contract class ID
console.log(instance.originalContractClassId);    // Original class (before updates)
console.log(instance.initializationHash);         // Hash of constructor + args
console.log(instance.salt);                       // Deployment salt
console.log(instance.deployer);                   // Deployer address
console.log(instance.publicKeys);                 // Contract public keys
```

### Contract Instance Components

#### 1. Contract Class ID

```typescript
// Current class ID (may change if contract is updated)
const classId = instance.currentContractClassId;

// Original class ID (never changes)
const originalClassId = instance.originalContractClassId;
```

#### 2. Initialization Hash

```typescript
import { computeInitializationHash } from '@aztec/stdlib';

// Computed from constructor selector + arguments
const initHash = await computeInitializationHash(constructorAbi, args);

// Or from pre-encoded arguments
const initHash = await computeInitializationHashFromEncodedArgs(
  constructorSelector,
  encodedArgs
);
```

#### 3. Public Keys

```typescript
import { PublicKeys } from '@aztec/stdlib';

// For contracts that need public keys (e.g., accounts)
const publicKeys = await PublicKeys.random();

// For contracts without keys
const publicKeys = PublicKeys.default();  // All zeros

// Access individual keys
console.log(publicKeys.masterNullifierPublicKey);
console.log(publicKeys.masterIncomingViewingPublicKey);
console.log(publicKeys.masterOutgoingViewingPublicKey);
console.log(publicKeys.masterTaggingPublicKey);
```

## Contract Address

### Address Computation

Contract addresses are deterministically computed:

```typescript
import { computeContractAddressFromInstance } from '@aztec/stdlib';

const address = await computeContractAddressFromInstance(instance);

// Address depends on:
// - Public keys hash
// - Salt
// - Contract class ID
// - Initialization hash
// - Deployer address
```

### Partial Address

The partial address is an intermediate value in address computation:

```typescript
import { computePartialAddress } from '@aztec/stdlib';

// Partial address = hash(contract_class_id, salt, initialization_hash, deployer)
const partialAddress = await computePartialAddress({
  contractClassId: classId,
  salt: deploymentSalt,
  initializationHash: initHash,
  deployer: deployerAddress
});

// Full address = hash(public_keys_hash, partial_address)
```

## Contract Class

### Creating from Artifact

```typescript
import { getContractClassFromArtifact } from '@aztec/stdlib';

const contractClass = await getContractClassFromArtifact(artifact);

// Contract class contains:
console.log(contractClass.id);              // Unique class identifier
console.log(contractClass.artifactHash);    // Hash of the artifact
console.log(contractClass.packedBytecode);  // Public function bytecode
console.log(contractClass.privateFunctions); // Private function VK hashes
console.log(contractClass.version);         // Protocol version
```

### Contract Class ID

```typescript
import { computeContractClassIdWithPreimage } from '@aztec/stdlib';

// Class ID = hash(artifact_hash, private_function_tree_root, public_bytecode_commitment)
const { id, artifactHash, privateFunctionsRoot, publicBytecodeCommitment } =
  await computeContractClassIdWithPreimage(contractClass);
```

### Private Functions

Private functions are identified by their VK hashes:

```typescript
// Each private function has:
contractClass.privateFunctions.forEach(fn => {
  console.log(fn.selector);  // Function selector
  console.log(fn.vkHash);    // Verification key hash
});
```

## Complete Address

Complete addresses include the full information needed to interact with an account:

```typescript
import { CompleteAddress } from '@aztec/stdlib';

// Create from components
const completeAddress = new CompleteAddress(
  address,          // AztecAddress
  publicKeys,       // PublicKeys
  partialAddress    // Fr
);

// Access components
console.log(completeAddress.address);
console.log(completeAddress.publicKeys);
console.log(completeAddress.partialAddress);

// Serialize/deserialize
const buffer = completeAddress.toBuffer();
const restored = CompleteAddress.fromBuffer(buffer);

// Random for testing
const randomAddress = await CompleteAddress.random();
```

## Contract Metadata

### Artifact Hash

```typescript
import { computeArtifactHash } from '@aztec/stdlib';

// Hash of the entire contract artifact
const artifactHash = await computeArtifactHash(artifact);

// Used to verify artifact authenticity
```

### Function Membership Proofs

Prove that a function belongs to a contract:

```typescript
import { computePrivateFunctionMembershipProof } from '@aztec/stdlib';

// Prove a private function is part of the contract class
const proof = await computePrivateFunctionMembershipProof(
  functionSelector,
  artifact
);

// Proof contains:
console.log(proof.selector);           // Function selector
console.log(proof.vkHash);            // VK hash
console.log(proof.siblingPath);       // Merkle path
console.log(proof.privateFunctionsTreeRoot); // Tree root
```

## Deployment Information

Track deployment details:

```typescript
import { DeploymentInfo } from '@aztec/stdlib';

const deploymentInfo = new DeploymentInfo(
  deployer,           // Who deployed
  blockNumber,        // When deployed
  transactionHash     // Deployment tx hash
);
```

## Contract Updates

Contracts can be updated to new class implementations:

```typescript
import { SerializableContractInstanceUpdate } from '@aztec/stdlib';

// Update to new contract class
const update = new SerializableContractInstanceUpdate(
  contractAddress,
  newContractClassId
);

// After update:
// - instance.currentContractClassId = newContractClassId
// - instance.originalContractClassId = unchanged
```

## Common Patterns

### 1. Deploy a New Contract

```typescript
// Step 1: Prepare deployment parameters
const salt = Fr.random();
const publicKeys = await PublicKeys.random();
const constructorArgs = [initialOwner, initialBalance];

// Step 2: Get contract class
const contractClass = await getContractClassFromArtifact(artifact);

// Step 3: Create instance
const instance = await getContractInstanceFromInstantiationParams(artifact, {
  salt,
  publicKeys,
  constructorArgs
});

// Step 4: Deploy via PXE or node
await pxe.registerContract({ artifact, instance });
```

### 2. Compute Contract Address Before Deployment

```typescript
// Useful for counterfactual addresses
const instance = await getContractInstanceFromInstantiationParams(artifact, {
  salt,
  publicKeys,
  constructorArgs
});

const predictedAddress = instance.address;
// Address can be computed before actual deployment
```

### 3. Verify Contract Class

```typescript
// Recompute class from artifact
const recomputedClass = await getContractClassFromArtifact(artifact);

// Compare with registered class
if (recomputedClass.id.equals(registeredClassId)) {
  console.log('Contract class verified');
}
```

### 4. Check Contract Updates

```typescript
// Original deployment
const originalInstance = { /* ... */ };

// After update
const currentInstance = await pxe.getContractInstance(address);

// Check if updated
if (!currentInstance.currentContractClassId.equals(
  currentInstance.originalContractClassId
)) {
  console.log('Contract has been updated');
  console.log('Original class:', currentInstance.originalContractClassId);
  console.log('Current class:', currentInstance.currentContractClassId);
}
```

## Security Considerations

### 1. Salt Randomness

```typescript
// GOOD: Use cryptographically secure random
const salt = Fr.random();

// BAD: Predictable salt allows address front-running
const salt = new Fr(1);
```

### 2. Constructor Arguments

```typescript
// Initialization hash commits to constructor arguments
// Changes to args result in different address
const instance1 = await getContractInstanceFromInstantiationParams(artifact, {
  salt,
  constructorArgs: [owner1]  // Different address
});

const instance2 = await getContractInstanceFromInstantiationParams(artifact, {
  salt,
  constructorArgs: [owner2]  // Different address
});

// instance1.address !== instance2.address
```

### 3. Public Keys

```typescript
// For account contracts: Use proper public keys
const publicKeys = await derivePublicKeysFromSecret(secretKey);

// For non-account contracts: Can use default (all zeros)
const publicKeys = PublicKeys.default();
```

## Performance Considerations

### 1. Contract Class Caching

```typescript
// Expensive: Recompute for each deployment
for (let i = 0; i < 10; i++) {
  const contractClass = await getContractClassFromArtifact(artifact); // Slow
}

// Better: Compute once, reuse
const contractClass = await getContractClassFromArtifact(artifact);
for (let i = 0; i < 10; i++) {
  // Use cached contractClass
}
```

### 2. VK Hash Computation

```typescript
// VK hash computation is expensive
// Cache function artifacts with VK hashes when possible
const privateFunctions = await Promise.all(
  artifact.functions.map(getContractClassPrivateFunctionFromArtifact)
);
```

## Related Modules

- **abi/**: Contract ABIs, encoding, and selectors
- **aztec-address/**: Address types and utilities
- **keys/**: Public and private key management
- **hash/**: Hashing utilities for contract data

## Additional Resources

- [Aztec Contract Deployment](https://docs.aztec.network/developers/contracts/deploying)
- [Contract Addresses](https://docs.aztec.network/protocol-specs/addresses-and-keys/address)
- [Contract Classes](https://docs.aztec.network/protocol-specs/contract-deployment/classes)
