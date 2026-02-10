# @aztec/stdlib

Version: v4.0.0-nightly.20260210

## Quick Import Reference

```typescript
import {
  AllContractDeploymentData,
  AuthorizationSelector,
  AztecAddress,
  BlockHash,
  BlockHeader,
  // ... and more
} from '@aztec/stdlib';
```

## Classes

### AllContractDeploymentData

Class containing both revertible and non-revertible registration/deployment data.

**Constructor**
```typescript
new AllContractDeploymentData(nonRevertibleContractDeploymentData: ContractDeploymentData, revertibleContractDeploymentData: ContractDeploymentData)
```

**Properties**
- `readonly nonRevertibleContractDeploymentData: ContractDeploymentData`
- `readonly revertibleContractDeploymentData: ContractDeploymentData`

**Methods**
- `static fromTx(tx: Tx) => AllContractDeploymentData` - Extracts all contract registration/deployment data from a tx separated by revertibility. This includes contract class logs and private logs. This method handles both private-only transactions and transactions with public calls, properly splitting logs between revertible and non-revertible categories.
- `getNonRevertibleContractDeploymentData() => ContractDeploymentData`
- `getRevertibleContractDeploymentData() => ContractDeploymentData`

### AuthorizationSelector

An authorization selector is the first 4 bytes of the hash of an authorization struct signature.

Extends: `Selector`

**Constructor**
```typescript
new AuthorizationSelector(value: number)
```

**Properties**
- `_branding: "AuthorizationSelector"` - Brand.
- `static schema: unknown`
- `static SIZE: number` - The size of the selector in bytes.
- `value: number`

**Methods**
- `[custom]() => string`
- `static empty() => AuthorizationSelector` - Creates an empty selector.
- `equals(other: Selector) => boolean` - Checks if this selector is equal to another.
- `static fromBuffer(buffer: Buffer<ArrayBufferLike> | BufferReader) => AuthorizationSelector` - Deserializes from a buffer or reader, corresponding to a write in cpp.
- `static fromField(fr: Fr) => AuthorizationSelector` - Converts a field to selector.
- `static fromSignature(signature: string) => Promise<AuthorizationSelector>` - Creates a selector from a signature.
- `static fromString(selector: string) => AuthorizationSelector` - Create a Selector instance from a hex-encoded string.
- `isEmpty() => boolean` - Checks if the selector is empty (all bytes are 0).
- `static random() => AuthorizationSelector` - Creates a random selector.
- `toBuffer(bufferSize: number) => Buffer` - Serialize as a buffer.
- `toField() => Fr` - Returns a new field with the same contents as this EthAddress.
- `toJSON() => string`
- `toString() => string` - Serialize as a hex string.

### AztecAddress

AztecAddress represents a 32-byte address in the Aztec Protocol. It provides methods to create, manipulate, and compare addresses, as well as conversion to and from strings, buffers, and other formats. Addresses are the x coordinate of a point in the Grumpkin curve, and therefore their maximum is determined by the field modulus. An address with a value that is not the x coordinate of a point in the curve is a called an 'invalid address'. These addresses have a greatly reduced feature set, as they cannot own secrets nor have messages encrypted to them, making them quite useless. We need to be able to represent them however as they can be encountered in the wild.

**Constructor**
```typescript
new AztecAddress(buffer: Fr | Buffer<ArrayBufferLike>)
```

**Properties**
- `_branding: "AztecAddress"` - Brand.
- `static schema: unknown`
- `size: unknown`
- `static SIZE_IN_BYTES: number`
- `static ZERO: AztecAddress`

**Methods**
- `[custom]() => string`
- `equals(other: AztecAddress) => boolean`
- `static fromBigInt(value: bigint) => AztecAddress`
- `static fromBuffer(buffer: Buffer<ArrayBufferLike> | BufferReader) => AztecAddress`
- `static fromField(fr: Fr) => AztecAddress`
- `static fromFields(fields: FieldReader | Fr[]) => AztecAddress`
- `static fromNumber(value: number) => AztecAddress`
- `static fromPlainObject(obj: any) => AztecAddress` - Creates an AztecAddress from a plain object without Zod validation. This method is optimized for performance and skips validation, making it suitable for deserializing trusted data (e.g., from C++ via MessagePack). Handles buffers, strings, or existing instances.
- `static fromString(buf: string) => AztecAddress`
- `static isAddress(str: string) => boolean`
- `isValid() => Promise<boolean>`
- `isZero() => boolean`
- `static random() => Promise<AztecAddress>`
- `toAddressPoint() => Promise<Point>`
- `toBigInt() => bigint`
- `toBuffer() => Buffer<ArrayBufferLike>`
- `toField() => Fr`
- `toJSON() => string`
- `toString() => string`
- `static zero() => AztecAddress`

### BlockHash

Hash of an L2 block.

Extends: `Fr`

**Constructor**
```typescript
new BlockHash(hash: Fr)
```

**Properties**
- `_branding: "Fr"` - Brand.
- `readonly [BLOCK_HASH_BRAND]: true`
- `static MAX_FIELD_VALUE: Fr`
- `static MODULUS: bigint`
- `static ONE: Fr`
- `static schema: unknown`
- `size: unknown`
- `static SIZE_IN_BYTES: number`
- `value: unknown`
- `static ZERO: Fr`

**Methods**
- `[custom]() => string`
- `add(rhs: Fr) => Fr` - Arithmetic
- `static cmp(lhs: BaseField, rhs: BaseField) => -1 | 0 | 1`
- `div(rhs: Fr) => Fr`
- `ediv(rhs: Fr) => Fr`
- `equals(rhs: BaseField) => boolean`
- `static fromBuffer(buffer: Buffer<ArrayBufferLike> | BufferReader) => Fr`
- `static fromBufferReduce(buffer: Buffer) => Fr`
- `static fromHexString(buf: string) => Fr` - Creates a Fr instance from a hex string.
- `static fromPlainObject(obj: any) => Fr` - Creates an Fr instance from a plain object without Zod validation. This method is optimized for performance and skips validation, making it suitable for deserializing trusted data (e.g., from C++ via MessagePack). Handles buffers, strings, numbers, bigints, or existing instances.
- `static fromString(str: string) => BlockHash` - Creates a Fr instance from a string.
- `static isBlockHash(value: unknown) => boolean` - Type guard that checks if a value is a BlockHash instance. Uses Symbol.for to ensure cross-module compatibility.
- `isEmpty() => boolean`
- `static isZero(value: Fr) => boolean`
- `lt(rhs: BaseField) => boolean`
- `modulus() => bigint`
- `mul(rhs: Fr) => Fr`
- `negate() => Fr`
- `static random() => BlockHash`
- `sqrt() => Promise<Fr | null>` - Computes a square root of the field element.
- `square() => Fr`
- `sub(rhs: Fr) => Fr`
- `toBigInt() => bigint`
- `toBool() => boolean`
- `toBuffer() => Buffer` - Converts the bigint to a Buffer.
- `toField() => this`
- `toFr() => Fr`
- `toFriendlyJSON() => string`
- `toJSON() => string`
- `toNumber() => number` - Converts this field to a number. Throws if the underlying value is greater than MAX_SAFE_INTEGER.
- `toNumberUnsafe() => number` - Converts this field to a number. May cause loss of precision if the underlying value is greater than MAX_SAFE_INTEGER.
- `toShortString() => string`
- `toString() => string`
- `static zero() => Fr`

### BlockHeader

A header of an L2 block.

**Constructor**
```typescript
new BlockHeader(lastArchive: AppendOnlyTreeSnapshot, state: StateReference, spongeBlobHash: Fr, globalVariables: GlobalVariables, totalFees: Fr, totalManaUsed: Fr)
```

**Properties**
- `readonly globalVariables: GlobalVariables` - Global variables of an L2 block.
- `readonly lastArchive: AppendOnlyTreeSnapshot` - Snapshot of archive before the block is applied.
- `static schema: unknown`
- `readonly spongeBlobHash: Fr` - Hash of the sponge blob after the tx effects of this block has been applied. May contain tx effects from the previous blocks in the same checkpoint.
- `readonly state: StateReference` - State reference.
- `readonly totalFees: Fr` - Total fees in the block, computed by the root rollup circuit
- `readonly totalManaUsed: Fr` - Total mana used in the block, computed by the root rollup circuit

**Methods**
- `[custom]() => string`
- `clone() => BlockHeader`
- `static empty(fields: Partial<FieldsOf<BlockHeader>>) => BlockHeader`
- `equals(other: this) => boolean`
- `static from(fields: FieldsOf<BlockHeader>) => BlockHeader`
- `static fromBuffer(buffer: Buffer<ArrayBufferLike> | BufferReader) => BlockHeader`
- `static fromFields(fields: FieldReader | Fr[]) => BlockHeader`
- `static fromString(str: string) => BlockHeader`
- `getBlockNumber() => BlockNumber`
- `static getFields(fields: FieldsOf<BlockHeader>) => readonly []`
- `getSize() => number`
- `getSlot() => SlotNumber`
- `hash() => Promise<BlockHash>`
- `isEmpty() => boolean`
- `static random(overrides: Partial<FieldsOf<BlockHeader>> & Partial<FieldsOf<GlobalVariables>>) => BlockHeader`
- `setHash(hashed: Fr) => void` - Manually set the hash for this block header if already computed
- `toBuffer() => Buffer<ArrayBufferLike>`
- `toFields() => Fr[]`
- `toInspect() => { globalVariables: { blockNumber: BlockNumber; chainId: number; ... }; lastArchive: string; ... }`
- `toString() => string` - Serializes this instance into a string.

### Body

**Constructor**
```typescript
new Body(txEffects: TxEffect[])
```

**Properties**
- `static schema: unknown`
- `txEffects: TxEffect[]`

**Methods**
- `[custom]() => string`
- `static empty() => Body`
- `equals(other: Body) => boolean`
- `static fromBuffer(buf: Buffer<ArrayBufferLike> | BufferReader) => Body` - Deserializes a block from a buffer
- `static fromTxBlobData(txBlobData: TxBlobData[]) => Body` - Decodes a block from blob fields.
- `static random(__namedParameters: { makeTxOptions?: (txIndex: number) => Partial<{ maxEffects?: number; numContractClassLogs?: number; ... } | undefined>; txsPerBlock?: number } & Partial<{ maxEffects?: number; numContractClassLogs?: number; ... }>) => Promise<Body>`
- `toBuffer() => Buffer<ArrayBufferLike>` - Serializes a block body
- `toTxBlobData() => TxBlobData[]` - Returns a flat packed array of fields of all tx effects - used for blobs.

### CallContext

Call context.

**Constructor**
```typescript
new CallContext(msgSender: AztecAddress, contractAddress: AztecAddress, functionSelector: FunctionSelector, isStaticCall: boolean)
```

**Properties**
- `contractAddress: AztecAddress` - The contract address being called.
- `functionSelector: FunctionSelector` - Function selector of the function being called.
- `isStaticCall: boolean` - Determines whether the call is modifying state.
- `msgSender: AztecAddress` - Address of the account which represents the entity who invoked the call.
- `static schema: unknown`

**Methods**
- `[custom]() => string`
- `static empty() => CallContext` - Returns a new instance of CallContext with zero msg sender, storage contract address.
- `equals(callContext: CallContext) => boolean`
- `static from(fields: FieldsOf<CallContext>) => CallContext`
- `static fromBuffer(buffer: Buffer<ArrayBufferLike> | BufferReader) => CallContext` - Deserialize this from a buffer.
- `static fromFields(fields: FieldReader | Fr[]) => CallContext`
- `static getFields(fields: FieldsOf<CallContext>) => readonly []`
- `isEmpty() => boolean`
- `static random() => Promise<CallContext>`
- `toBuffer() => Buffer<ArrayBufferLike>` - Serialize this as a buffer.
- `toFields() => Fr[]`

### Capsule

Read-only data that is passed to the contract through an oracle during a transaction execution. Check whether this is always used to represent a transient capsule and if so, rename to TransientCapsule.

**Constructor**
```typescript
new Capsule(contractAddress: AztecAddress, storageSlot: Fr, data: Fr[])
```

**Properties**
- `readonly contractAddress: AztecAddress` - The address of the contract the capsule is for
- `readonly data: Fr[]` - Data passed to the contract
- `static schema: unknown`
- `readonly storageSlot: Fr` - The storage slot of the capsule

**Methods**
- `static fromBuffer(buffer: Buffer<ArrayBufferLike> | BufferReader) => Capsule`
- `static fromString(str: string) => Capsule`
- `toBuffer() => Buffer<ArrayBufferLike>`
- `toJSON() => string`
- `toString() => string`

### CheckpointedL2Block

Encapsulates an L2 Block along with the checkpoint data associated with it.

**Constructor**
```typescript
new CheckpointedL2Block(checkpointNumber: CheckpointNumber, block: L2Block, l1: L1PublishedData, attestations: CommitteeAttestation[])
```

**Properties**
- `attestations: CommitteeAttestation[]`
- `block: L2Block`
- `checkpointNumber: CheckpointNumber`
- `l1: L1PublishedData`
- `static schema: unknown`

**Methods**
- `static fromBuffer(bufferOrReader: Buffer<ArrayBufferLike> | BufferReader) => CheckpointedL2Block`
- `static fromFields(fields: FieldsOf<CheckpointedL2Block>) => CheckpointedL2Block`
- `toBuffer() => Buffer`

### ChonkProof

**Constructor**
```typescript
new ChonkProof(fields: Fr[])
```

**Properties**
- `fields: Fr[]`
- `static schema: unknown`

**Methods**
- `attachPublicInputs(publicInputs: Fr[]) => ChonkProofWithPublicInputs`
- `static empty() => ChonkProof`
- `static fromBuffer(buffer: Buffer<ArrayBufferLike> | BufferReader) => ChonkProof`
- `isEmpty() => boolean`
- `static random() => ChonkProof`
- `toBuffer() => Buffer<ArrayBufferLike>`
- `toJSON() => Buffer<ArrayBufferLike>`

### ChonkProofWithPublicInputs

**Constructor**
```typescript
new ChonkProofWithPublicInputs(fieldsWithPublicInputs: Fr[])
```

**Properties**
- `fieldsWithPublicInputs: Fr[]`
- `static schema: unknown`

**Methods**
- `static empty() => ChonkProofWithPublicInputs`
- `static fromBuffer(buffer: Buffer<ArrayBufferLike> | BufferReader) => ChonkProofWithPublicInputs`
- `static fromBufferArray(fields: Uint8Array<ArrayBufferLike>[]) => ChonkProofWithPublicInputs`
- `getPublicInputs() => Fr[]`
- `isEmpty() => boolean`
- `removePublicInputs() => ChonkProof`
- `toBuffer() => Buffer<ArrayBufferLike>`
- `toJSON() => Buffer<ArrayBufferLike>`

### CommitteeAttestation

**Constructor**
```typescript
new CommitteeAttestation(address: EthAddress, signature: Signature)
```

**Properties**
- `readonly address: EthAddress`
- `static schema: unknown`
- `readonly signature: Signature`

**Methods**
- `static empty() => CommitteeAttestation`
- `equals(other: CommitteeAttestation) => boolean`
- `static fromAddress(address: EthAddress) => CommitteeAttestation`
- `static fromAddressAndSignature(address: EthAddress, signature: Signature) => CommitteeAttestation`
- `static fromBuffer(buffer: Buffer<ArrayBufferLike> | BufferReader) => CommitteeAttestation`
- `static fromPacked(packed: ViemCommitteeAttestations, committeeSize: number) => CommitteeAttestation[]`
- `static fromSignature(signature: Signature) => CommitteeAttestation`
- `static fromViem(viem: ViemCommitteeAttestation) => CommitteeAttestation`
- `static random() => CommitteeAttestation`
- `toBuffer() => Buffer`
- `toViem() => ViemCommitteeAttestation`

### CommitteeAttestationsAndSigners
Implements: `Signable`

**Constructor**
```typescript
new CommitteeAttestationsAndSigners(attestations: CommitteeAttestation[])
```

**Properties**
- `attestations: CommitteeAttestation[]`
- `static schema: unknown`

**Methods**
- `static empty() => CommitteeAttestationsAndSigners`
- `getPackedAttestations() => ViemCommitteeAttestations` - Packs an array of committee attestations into the format expected by the Solidity contract
- `getPayloadToSign(domainSeparator: SignatureDomainSeparator) => Buffer`
- `getSignedAttestations() => CommitteeAttestation[]`
- `getSigners() => EthAddress[]`
- `toString() => void` - Returns a string representation of an object.

### CompleteAddress

A complete address is a combination of an Aztec address, a public key and a partial address.

**Properties**
- `address: AztecAddress` - Contract address (typically of an account contract)
- `partialAddress: Fr` - Partial key corresponding to the public key to the address.
- `publicKeys: PublicKeys` - User public keys
- `static schema: unknown`
- `static readonly SIZE_IN_BYTES: number` - Size in bytes of an instance

**Methods**
- `static create(address: AztecAddress, publicKeys: PublicKeys, partialAddress: Fr) => Promise<CompleteAddress>`
- `equals(other: CompleteAddress) => boolean` - Determines if this CompleteAddress instance is equal to the given CompleteAddress instance. Equality is based on the content of their respective buffers.
- `static fromBuffer(buffer: Buffer<ArrayBufferLike> | BufferReader) => Promise<CompleteAddress>` - Creates an CompleteAddress instance from a given buffer or BufferReader. If the input is a Buffer, it wraps it in a BufferReader before processing. Throws an error if the input length is not equal to the expected size.
- `static fromSecretKeyAndInstance(secretKey: Fr, instance: Pick<ContractInstance, "salt" | "deployer" | "originalContractClassId" | "initializationHash"> | { originalContractClassId: Fr; saltedInitializationHash: Fr }) => Promise<CompleteAddress>`
- `static fromSecretKeyAndPartialAddress(secretKey: Fr, partialAddress: Fr) => Promise<CompleteAddress>`
- `static fromString(address: string) => Promise<CompleteAddress>` - Create a CompleteAddress instance from a hex-encoded string. The input 'address' should be prefixed with '0x' or not, and have exactly 128 hex characters representing the x and y coordinates. Throws an error if the input length is invalid or coordinate values are out of range.
- `getPreaddress() => Promise<Fr>`
- `static random() => Promise<CompleteAddress>`
- `toBuffer() => Buffer` - Converts the CompleteAddress instance into a Buffer. This method should be used when encoding the address for storage, transmission or serialization purposes.
- `toJSON() => string`
- `toReadableString() => string` - Gets a readable string representation of the complete address.
- `toString() => string` - Convert the CompleteAddress to a hexadecimal string representation, with a "0x" prefix. The resulting string will have a length of 66 characters (including the prefix).
- `validate() => Promise<void>` - Throws if the address is not correctly derived from the public key and partial address.

### ContractClassLog

**Constructor**
```typescript
new ContractClassLog(contractAddress: AztecAddress, fields: ContractClassLogFields, emittedLength: number)
```

**Properties**
- `contractAddress: AztecAddress`
- `emittedLength: number`
- `fields: ContractClassLogFields`
- `static schema: unknown`
- `static SIZE_IN_BYTES: number`

**Methods**
- `[custom]() => string`
- `static empty() => ContractClassLog`
- `equals(other: ContractClassLog) => boolean`
- `static from(fields: FieldsOf<ContractClassLog>) => ContractClassLog`
- `static fromBlobFields(emittedLength: number, fields: FieldReader | Fr[]) => ContractClassLog`
- `static fromBuffer(buffer: Buffer<ArrayBufferLike> | BufferReader) => ContractClassLog`
- `static fromFields(fields: FieldReader | Fr[]) => ContractClassLog`
- `static fromPlainObject(obj: any) => ContractClassLog` - Creates a ContractClassLog from a plain object without Zod validation. This method is optimized for performance and skips validation, making it suitable for deserializing trusted data (e.g., from C++ via MessagePack).
- `getEmittedFields() => Fr[]`
- `hash() => Promise<Fr>`
- `isEmpty() => boolean`
- `static random() => Promise<ContractClassLog>`
- `toBlobFields() => Fr[]`
- `toBuffer() => Buffer`
- `toFields() => Fr[]`

### ContractClassLogFields

**Constructor**
```typescript
new ContractClassLogFields(fields: Fr[])
```

**Properties**
- `fields: Fr[]`
- `static schema: unknown`

**Methods**
- `clone() => ContractClassLogFields`
- `static empty() => ContractClassLogFields`
- `equals(other: ContractClassLogFields) => boolean`
- `static fromBuffer(buffer: Buffer<ArrayBufferLike> | BufferReader) => ContractClassLogFields`
- `static fromEmittedFields(emittedFields: Fr[]) => ContractClassLogFields`
- `static fromFields(fields: FieldReader | Fr[]) => ContractClassLogFields`
- `static fromPlainObject(obj: any) => ContractClassLogFields` - Creates a ContractClassLogFields from a plain object without Zod validation. This method is optimized for performance and skips validation, making it suitable for deserializing trusted data (e.g., from C++ via MessagePack).
- `getEmittedFields(emittedLength: number) => Fr[]`
- `hash() => Promise<Fr>`
- `isEmpty() => boolean`
- `static random(emittedLength: number) => ContractClassLogFields`
- `toBuffer() => Buffer<ArrayBufferLike>`
- `toFields() => Fr[]`

### ContractDeploymentData

Class containing contract class logs and private logs which are both relevant for contract registrations and deployments.

**Constructor**
```typescript
new ContractDeploymentData(contractClassLogs: ContractClassLog[], privateLogs: PrivateLog[])
```

**Properties**
- `readonly contractClassLogs: ContractClassLog[]`
- `readonly privateLogs: PrivateLog[]`
- `static schema: unknown`

**Methods**
- `static empty() => ContractDeploymentData`
- `static from(args: { contractClassLogs: ContractClassLog[]; privateLogs: PrivateLog[] }) => ContractDeploymentData`
- `static fromPlainObject(obj: any) => ContractDeploymentData` - Creates a ContractDeploymentData from a plain object without Zod validation. This method is optimized for performance and skips validation, making it suitable for deserializing trusted data (e.g., from C++ via MessagePack).
- `getContractClassLogs() => ContractClassLog[]`
- `getPrivateLogs() => PrivateLog[]`

### CountedContractClassLog
Implements: `IsEmpty`

**Constructor**
```typescript
new CountedContractClassLog(log: ContractClassLog, counter: number)
```

**Properties**
- `counter: number`
- `log: ContractClassLog`
- `static schema: unknown`

**Methods**
- `static from(fields: { counter: number; log: ContractClassLog }) => CountedContractClassLog`
- `isEmpty() => boolean`

### DebugLog

**Constructor**
```typescript
new DebugLog(contractAddress: AztecAddress, level: "silent" | "fatal" | "error" | "warn" | "info" | "verbose" | "debug" | "trace", message: string, fields: Fr[])
```

**Properties**
- `contractAddress: AztecAddress`
- `fields: Fr[]`
- `level: "silent" | "fatal" | "error" | "warn" | "info" | "verbose" | "debug" | "trace"`
- `message: string`
- `static schema: unknown`

**Methods**
- `static fromPlainObject(obj: any) => DebugLog` - Creates a DebugLog from a plain object without Zod validation. This method is optimized for performance and skips validation, making it suitable for deserializing trusted data (e.g., from C++ via MessagePack).

### DirectionalAppTaggingSecret

Directional application tagging secret used for log tagging. "Directional" because the derived secret is bound to the recipient address: A→B differs from B→A even with the same participants and app. Note: It's a bit unfortunate that this type resides in `stdlib` as the rest of the tagging functionality resides in `pxe/src/tagging`. We need to use this type in `PreTag` that in turn is used by other types in stdlib hence there doesn't seem to be a good way around this.

**Properties**
- `readonly value: Fr`

**Methods**
- `static compute(localAddress: CompleteAddress, localIvsk: Fq, externalAddress: AztecAddress, app: AztecAddress, recipient: AztecAddress) => Promise<DirectionalAppTaggingSecret>` - Derives shared tagging secret and from that, the app address and recipient derives the directional app tagging secret.
- `static fromString(str: string) => DirectionalAppTaggingSecret`
- `toString() => string`

### EmptyTxValidator
Implements: `TxValidator<T>`

**Constructor**
```typescript
new EmptyTxValidator()
```

**Methods**
- `validateTx(_tx: T) => Promise<TxValidationResult>`

### EthAddress

Represents an Ethereum address as a 20-byte buffer and provides various utility methods for converting between different representations, generating random addresses, validating checksums, and comparing addresses. EthAddress can be instantiated using a buffer or string, and can be serialized/deserialized from a buffer or BufferReader.

**Constructor**
```typescript
new EthAddress(buffer: Buffer)
```

**Properties**
- `static schema: unknown`
- `static SIZE_IN_BYTES: number` - The size of an Ethereum address in bytes.
- `static ZERO: EthAddress` - Represents a zero Ethereum address with 20 bytes filled with zeros.

**Methods**
- `[custom]() => string`
- `static areEqual(a: string | EthAddress, b: string | EthAddress) => boolean`
- `static checkAddressChecksum(address: string) => boolean` - Checks if the given Ethereum address has a valid checksum. The input 'address' should be prefixed with '0x' or not, and have exactly 40 hex characters. Returns true if the address has a valid checksum, false otherwise.
- `equals(rhs: EthAddress) => boolean` - Checks whether the given EthAddress instance is equal to the current instance. Equality is determined by comparing the underlying byte buffers of both instances.
- `static fromBuffer(buffer: Buffer<ArrayBufferLike> | BufferReader) => EthAddress` - Deserializes from a buffer or reader, corresponding to a write in cpp.
- `static fromField(fr: Fr) => EthAddress` - Converts a field to a eth address.
- `static fromFields(fields: FieldReader | Fr[]) => EthAddress`
- `static fromNumber(num: number | bigint) => EthAddress` - Converts a number into an address. Useful for testing.
- `static fromPlainObject(obj: any) => EthAddress` - Creates an EthAddress from a plain object without Zod validation. This method is optimized for performance and skips validation, making it suitable for deserializing trusted data (e.g., from C++ via MessagePack). Handles buffers (20 or 32 bytes), strings, or existing instances.
- `static fromString(address: string) => EthAddress` - Creates an EthAddress instance from a valid Ethereum address string. The input 'address' can be either in checksum format or lowercase, and it can be prefixed with '0x'. Throws an error if the input is not a valid Ethereum address.
- `static isAddress(address: string) => boolean` - Determines if the given string represents a valid Ethereum address. A valid address should meet the following criteria: 1. Contains exactly 40 hex characters (excluding an optional '0x' prefix). 2. Is either all lowercase, all uppercase, or has a valid checksum based on EIP-55.
- `isZero() => boolean` - Checks if the EthAddress instance represents a zero address. A zero address consists of 20 bytes filled with zeros and is considered an invalid address.
- `static random() => EthAddress` - Create a random EthAddress instance with 20 random bytes. This method generates a new Ethereum address with a randomly generated set of 20 bytes. It is useful for generating test addresses or unique identifiers.
- `toBuffer() => Buffer<ArrayBufferLike>` - Returns a 20-byte buffer representation of the Ethereum address.
- `toBuffer32() => Buffer<ArrayBuffer>` - Returns a 32-byte buffer representation of the Ethereum address, with the original 20-byte address occupying the last 20 bytes and the first 12 bytes being zero-filled. This format is commonly used in smart contracts when handling addresses as 32-byte values.
- `static toChecksumAddress(address: string) => string` - Converts an Ethereum address to its checksum format. The input 'address' should be prefixed with '0x' or not, and have exactly 40 hex characters. The checksum format is created by capitalizing certain characters in the hex string based on the hash of the lowercase address. Throws an error if the input address is invalid.
- `toChecksumString() => string` - Returns the Ethereum address as a checksummed string. The output string will have characters in the correct upper or lowercase form, according to EIP-55. This provides a way to verify if an address is typed correctly, by checking the character casing.
- `toField() => Fr` - Returns a new field with the same contents as this EthAddress.
- `toJSON() => string`
- `toString() => string` - Converts the Ethereum address to a hex-encoded string. The resulting string is prefixed with '0x' and has exactly 40 hex characters. This method can be used to represent the EthAddress instance in the widely used hexadecimal format.

### EventSelector

An event selector is the first 4 bytes of the hash of an event signature.

Extends: `Selector`

**Constructor**
```typescript
new EventSelector(value: number)
```

**Properties**
- `_branding: "EventSelector"` - Brand.
- `static schema: unknown`
- `static SIZE: number` - The size of the selector in bytes.
- `value: number`

**Methods**
- `[custom]() => string`
- `static empty() => EventSelector` - Creates an empty selector.
- `equals(other: Selector) => boolean` - Checks if this selector is equal to another.
- `static fromBuffer(buffer: Buffer<ArrayBufferLike> | BufferReader) => EventSelector` - Deserializes from a buffer or reader, corresponding to a write in cpp.
- `static fromField(fr: Fr) => EventSelector` - Converts a field to selector.
- `static fromSignature(signature: string) => Promise<EventSelector>` - Creates a selector from a signature.
- `static fromString(selector: string) => EventSelector` - Create a Selector instance from a hex-encoded string.
- `isEmpty() => boolean` - Checks if the selector is empty (all bytes are 0).
- `static random() => EventSelector` - Creates a random selector.
- `toBuffer(bufferSize: number) => Buffer` - Serialize as a buffer.
- `toField() => Fr` - Returns a new field with the same contents as this EthAddress.
- `toJSON() => string`
- `toString() => string` - Serialize as a hex string.

### ExecutionPayload

Represents data necessary to perform an action in the network successfully. This class can be considered Aztec's "minimal execution unit".

**Constructor**
```typescript
new ExecutionPayload(calls: FunctionCall[], authWitnesses: AuthWitness[], capsules: Capsule[], extraHashedArgs: HashedValues[], feePayer?: AztecAddress)
```

**Properties**
- `authWitnesses: AuthWitness[]` - Any transient auth witnesses needed for this execution
- `calls: FunctionCall[]` - The function calls to be executed.
- `capsules: Capsule[]` - Data passed through an oracle for this execution.
- `extraHashedArgs: HashedValues[]` - Extra hashed values to be injected in the execution cache
- `feePayer?: AztecAddress` - The address that is paying for the fee in this execution payload (if any). If undefined, the wallet software executing the payload will have to add a fee payment method

**Methods**
- `static empty() => ExecutionPayload`

### ExtendedContractClassLog

Represents an individual contract class log entry extended with info about the block and tx it was emitted in.

**Constructor**
```typescript
new ExtendedContractClassLog(id: LogId, log: ContractClassLog)
```

**Properties**
- `readonly id: LogId` - Globally unique id of the log.
- `readonly log: ContractClassLog` - The data contents of the log.
- `static schema: unknown`

**Methods**
- `equals(other: ExtendedContractClassLog) => boolean` - Checks if two ExtendedContractClassLog objects are equal.
- `static from(fields: FieldsOf<ExtendedContractClassLog>) => ExtendedContractClassLog`
- `static fromBuffer(buffer: Buffer<ArrayBufferLike> | BufferReader) => ExtendedContractClassLog` - Deserializes log from a buffer.
- `static fromString(data: string) => ExtendedContractClassLog` - Deserializes `ExtendedContractClassLog` object from a hex string representation.
- `static random() => Promise<ExtendedContractClassLog>`
- `toBuffer() => Buffer` - Serializes log to a buffer.
- `toString() => string` - Serializes log to a string.

### ExtendedPublicLog

Represents an individual public log entry extended with info about the block and tx it was emitted in.

**Constructor**
```typescript
new ExtendedPublicLog(id: LogId, log: PublicLog)
```

**Properties**
- `readonly id: LogId` - Globally unique id of the log.
- `readonly log: PublicLog` - The data contents of the log.
- `static schema: unknown`

**Methods**
- `equals(other: ExtendedPublicLog) => boolean` - Checks if two ExtendedPublicLog objects are equal.
- `static from(fields: FieldsOf<ExtendedPublicLog>) => ExtendedPublicLog`
- `static fromBuffer(buffer: Buffer<ArrayBufferLike> | BufferReader) => ExtendedPublicLog` - Deserializes log from a buffer.
- `static fromString(data: string) => ExtendedPublicLog` - Deserializes `ExtendedPublicLog` object from a hex string representation.
- `static random() => Promise<ExtendedPublicLog>`
- `toBuffer() => Buffer` - Serializes log to a buffer.
- `toHumanReadable() => string` - Serializes log to a human readable string.
- `toString() => string` - Serializes log to a string.

### FlatPublicLogs

**Constructor**
```typescript
new FlatPublicLogs(length: number, payload: Fr[])
```

**Properties**
- `length: number`
- `payload: Fr[]`
- `static schema: unknown`

**Methods**
- `static empty() => FlatPublicLogs`
- `static fromBlobFields(length: number, fields: FieldReader | Fr[]) => FlatPublicLogs`
- `static fromBuffer(buffer: Buffer<ArrayBufferLike> | BufferReader) => FlatPublicLogs`
- `static fromFields(fields: FieldReader | Fr[]) => FlatPublicLogs`
- `static fromLogs(logs: PublicLog[]) => FlatPublicLogs`
- `static fromPlainObject(obj: any) => FlatPublicLogs` - Creates a FlatPublicLogs instance from a plain object without Zod validation. This method is optimized for performance and skips validation, making it suitable for deserializing trusted data (e.g., from C++ via MessagePack).
- `isEmpty() => boolean`
- `toBlobFields() => Fr[]`
- `toBuffer() => Buffer`
- `toFields() => Fr[]`
- `toLogs() => PublicLog[]`

### FunctionCall

A request to call a function on a contract.

**Constructor**
```typescript
new FunctionCall(name: string, to: AztecAddress, selector: FunctionSelector, type: FunctionType, hideMsgSender: boolean, isStatic: boolean, args: Fr[], returnTypes: AbiType[])
```

**Properties**
- `args: Fr[]` - The encoded args
- `hideMsgSender: boolean` - Only applicable for enqueued public function calls. `hideMsgSender = true` will set the msg_sender field (the caller's address) to "null", meaning the public function (and observers around the world) won't know which smart contract address made the call.
- `isStatic: boolean` - Whether this call can make modifications to state or not
- `name: string` - The name of the function to call
- `returnTypes: AbiType[]` - The return type for decoding
- `static schema: unknown`
- `selector: FunctionSelector` - The function being called
- `to: AztecAddress` - The recipient contract
- `type: FunctionType` - Type of the function

**Methods**
- `static empty() => FunctionCall` - Creates an empty function call.
- `static from(fields: FieldsOf<FunctionCall>) => FunctionCall`
- `static getFields(fields: FieldsOf<FunctionCall>) => readonly []`
- `isPublicStatic() => boolean`

### FunctionData

Function description for circuit.

**Constructor**
```typescript
new FunctionData(selector: FunctionSelector, isPrivate: boolean)
```

**Properties**
- `isPrivate: boolean` - Indicates whether the function is private or public.
- `static schema: unknown`
- `selector: FunctionSelector` - Function selector of the function being called.

**Methods**
- `static empty(args?: { isPrivate?: boolean; isStatic?: boolean }) => FunctionData` - Returns a new instance of FunctionData with zero function selector.
- `equals(other: FunctionData) => boolean` - Returns whether this instance is equal to another.
- `static fromAbi(abi: FunctionAbi | ContractFunctionDao) => Promise<FunctionData>`
- `static fromBuffer(buffer: Buffer<ArrayBufferLike> | BufferReader) => FunctionData` - Deserializes from a buffer or reader, corresponding to a write in cpp.
- `static fromFields(fields: FieldReader | Fr[]) => FunctionData`
- `isEmpty() => boolean` - Returns whether this instance is empty.
- `toBuffer() => Buffer` - Serialize this as a buffer.
- `toFields() => Fr[]`

### FunctionSelector

A function selector is the first 4 bytes of the hash of a function signature.

Extends: `Selector`

**Constructor**
```typescript
new FunctionSelector(value: number)
```

**Properties**
- `_branding: "FunctionSelector"` - Brand.
- `static schema: unknown`
- `static SIZE: number` - The size of the selector in bytes.
- `value: number`

**Methods**
- `[custom]() => string`
- `static empty() => FunctionSelector` - Creates an empty selector.
- `equals(other: Selector) => boolean` - Checks if this selector is equal to another.
- `static fromBuffer(buffer: Buffer<ArrayBufferLike> | BufferReader) => FunctionSelector` - Deserializes from a buffer or reader, corresponding to a write in cpp.
- `static fromField(fr: Fr) => FunctionSelector` - Converts a field to selector.
- `static fromFieldOrUndefined(fr: Fr) => FunctionSelector | undefined`
- `static fromFields(fields: FieldReader | Fr[]) => FunctionSelector`
- `static fromNameAndParameters(args: { name: string; parameters: { name: string; type: AbiType } & { visibility: "public" | "private" | "databus" }[] }) => Promise<FunctionSelector>` - Creates a function selector for a given function name and parameters.
- `static fromSignature(signature: string) => Promise<FunctionSelector>` - Creates a selector from a signature.
- `static fromString(selector: string) => FunctionSelector` - Create a Selector instance from a hex-encoded string.
- `isEmpty() => boolean` - Checks if the selector is empty (all bytes are 0).
- `static random() => FunctionSelector` - Creates a random instance.
- `toBuffer(bufferSize: number) => Buffer` - Serialize as a buffer.
- `toField() => Fr` - Returns a new field with the same contents as this EthAddress.
- `toJSON() => string`
- `toString() => string` - Serialize as a hex string.

### FunctionSignatureDecoder

Decodes the signature of a function from the name and parameters.

**Constructor**
```typescript
new FunctionSignatureDecoder(name: string, parameters: { name: string; type: AbiType } & { visibility: "public" | "private" | "databus" }[], includeNames: boolean)
```

**Methods**
- `decode() => string` - Decodes all the parameters and build the function signature

### Gas

Gas amounts in each dimension.

**Constructor**
```typescript
new Gas(daGas: number, l2Gas: number)
```

**Properties**
- `readonly daGas: number`
- `readonly l2Gas: number`
- `static schema: unknown`

**Methods**
- `[custom]() => string`
- `add(other: Gas) => Gas`
- `clone() => Gas`
- `computeFee(gasFees: GasFees) => Fr`
- `static empty() => Gas`
- `equals(other: Gas) => boolean`
- `static from(fields: Partial<FieldsOf<Gas>>) => Gas`
- `static fromBuffer(buffer: Buffer<ArrayBufferLike> | BufferReader) => Gas`
- `static fromFields(fields: FieldReader | Fr[]) => Gas`
- `static fromPlainObject(obj: any) => Gas` - Creates a Gas instance from a plain object without Zod validation. This method is optimized for performance and skips validation, making it suitable for deserializing trusted data (e.g., from C++ via MessagePack).
- `get(dimension: "da" | "l2") => number`
- `getSize() => number`
- `gtAny(other: Gas) => boolean` - Returns true if any of this instance's dimensions is greater than the corresponding on the other.
- `isEmpty() => boolean`
- `mul(scalar: number) => Gas`
- `static random() => Gas`
- `sub(other: Gas) => Gas`
- `toBuffer() => Buffer<ArrayBufferLike>`
- `toFields() => Fr[]`

### GasFees

Gas prices for each dimension.

**Constructor**
```typescript
new GasFees(feePerDaGas: number | bigint, feePerL2Gas: number | bigint)
```

**Properties**
- `readonly feePerDaGas: bigint`
- `readonly feePerL2Gas: bigint`
- `static schema: unknown`

**Methods**
- `[custom]() => string`
- `clone() => GasFees`
- `static empty() => GasFees`
- `equals(other: GasFees) => boolean`
- `static from(fields: FieldsOf<GasFees>) => GasFees`
- `static fromBuffer(buffer: Buffer<ArrayBufferLike> | BufferReader) => GasFees`
- `static fromFields(fields: FieldReader | Fr[]) => GasFees`
- `static fromPlainObject(obj: any) => GasFees` - Creates a GasFees instance from a plain object without Zod validation. This method is optimized for performance and skips validation, making it suitable for deserializing trusted data (e.g., from C++ via MessagePack).
- `get(dimension: "da" | "l2") => bigint`
- `isEmpty() => boolean`
- `mul(scalar: number | bigint) => GasFees`
- `static random() => GasFees`
- `toBuffer() => Buffer<ArrayBufferLike>`
- `toFields() => Fr[]`
- `toInspect() => { feePerDaGas: bigint; feePerL2Gas: bigint }`

### GasSettings

Gas usage and fees limits set by the transaction sender for different dimensions and phases.

**Constructor**
```typescript
new GasSettings(gasLimits: Gas, teardownGasLimits: Gas, maxFeesPerGas: GasFees, maxPriorityFeesPerGas: GasFees)
```

**Properties**
- `readonly gasLimits: Gas`
- `readonly maxFeesPerGas: GasFees`
- `readonly maxPriorityFeesPerGas: GasFees`
- `static schema: unknown`
- `readonly teardownGasLimits: Gas`

**Methods**
- `clone() => GasSettings`
- `static default(overrides: { gasLimits?: Gas; maxFeesPerGas: GasFees; ... }) => GasSettings` - Default gas settings to use when user has not provided them. Requires explicit max fees per gas.
- `static empty() => GasSettings` - Zero-value gas settings.
- `equals(other: GasSettings) => boolean`
- `static from(args: { gasLimits: FieldsOf<Gas>; maxFeesPerGas: FieldsOf<GasFees>; ... }) => GasSettings`
- `static fromBuffer(buffer: Buffer<ArrayBufferLike> | BufferReader) => GasSettings`
- `static fromFields(fields: FieldReader | Fr[]) => GasSettings`
- `static fromPlainObject(obj: any) => GasSettings` - Creates a GasSettings instance from a plain object without Zod validation. This method is optimized for performance and skips validation, making it suitable for deserializing trusted data (e.g., from C++ via MessagePack).
- `getFeeLimit() => Fr` - Returns the maximum fee to be paid according to gas limits and max fees set.
- `static getFields(fields: FieldsOf<GasSettings>) => readonly []`
- `getSize() => number`
- `isEmpty() => boolean`
- `toBuffer() => Buffer<ArrayBufferLike>`
- `toFields() => Fr[]`

### GlobalVariables

Global variables of the L2 block.

**Constructor**
```typescript
new GlobalVariables(chainId: Fr, version: Fr, blockNumber: BlockNumber, slotNumber: SlotNumber, timestamp: bigint, coinbase: EthAddress, feeRecipient: AztecAddress, gasFees: GasFees)
```

**Properties**
- `blockNumber: BlockNumber` - Block number of the L2 block.
- `chainId: Fr` - ChainId for the L2 block.
- `coinbase: EthAddress` - Recipient of block reward.
- `feeRecipient: AztecAddress` - Address to receive fees.
- `gasFees: GasFees` - Global gas prices for this block.
- `static schema: unknown`
- `slotNumber: SlotNumber` - Slot number of the L2 block
- `timestamp: bigint` - Timestamp of the L2 block.
- `version: Fr` - Version for the L2 block.

**Methods**
- `[custom]() => string`
- `clone() => GlobalVariables`
- `static empty(fields: Partial<FieldsOf<GlobalVariables>>) => GlobalVariables`
- `equals(other: this) => boolean`
- `static from(fields: FieldsOf<GlobalVariables>) => GlobalVariables`
- `static fromBuffer(buffer: Buffer<ArrayBufferLike> | BufferReader) => GlobalVariables`
- `static fromFields(fields: FieldReader | Fr[]) => GlobalVariables`
- `static fromPlainObject(obj: any) => GlobalVariables` - Creates a GlobalVariables instance from a plain object without Zod validation. This method is optimized for performance and skips validation, making it suitable for deserializing trusted data (e.g., from C++ via MessagePack).
- `static getFields(fields: FieldsOf<GlobalVariables>) => readonly []`
- `getSize() => number`
- `isEmpty() => boolean`
- `static random(overrides: Partial<FieldsOf<GlobalVariables>>) => GlobalVariables`
- `toBuffer() => Buffer<ArrayBufferLike>`
- `toFields() => Fr[]`
- `toFriendlyJSON() => { blockNumber: BlockNumber; coinbase: string; ... }` - A trimmed version of the JSON representation of the global variables, tailored for human consumption.
- `toInspect() => { blockNumber: BlockNumber; chainId: number; ... }`
- `toJSON() => { blockNumber: BlockNumber; chainId: Fr; ... }` - Converts GlobalVariables to a plain object suitable for MessagePack serialization. This method ensures that slotNumber is serialized as a Fr (Field element) to match the C++ struct definition which expects slot_number as FF.

### HashedValues

A container for storing a list of values and their hash.

**Constructor**
```typescript
new HashedValues(values: Fr[], hash: Fr)
```

**Properties**
- `readonly hash: Fr` - The hash of the raw values
- `static schema: unknown`
- `readonly values: Fr[]` - Raw values.

**Methods**
- `static from(fields: FieldsOf<HashedValues>) => HashedValues`
- `static fromArgs(args: Fr[]) => Promise<HashedValues>`
- `static fromBuffer(buffer: Buffer<ArrayBufferLike> | BufferReader) => HashedValues`
- `static fromCalldata(calldata: Fr[]) => Promise<HashedValues>`
- `static getFields(fields: FieldsOf<HashedValues>) => readonly []`
- `getSize() => number`
- `static random() => HashedValues`
- `toBuffer() => Buffer<ArrayBufferLike>`

### L2Block

An L2 block with a header and a body.

**Constructor**
```typescript
new L2Block(archive: AppendOnlyTreeSnapshot, header: BlockHeader, body: Body, checkpointNumber: CheckpointNumber, indexWithinCheckpoint: IndexWithinCheckpoint)
```

**Properties**
- `archive: AppendOnlyTreeSnapshot` - Snapshot of archive tree after the block is applied.
- `body: Body` - L2 block body.
- `checkpointNumber: CheckpointNumber` - Number of the checkpoint that the block belongs to.
- `header: BlockHeader` - Header of the block.
- `indexWithinCheckpoint: IndexWithinCheckpoint` - Index of the block within the checkpoint.
- `number: unknown`
- `static schema: unknown`
- `slot: unknown`
- `timestamp: unknown`

**Methods**
- `static empty(header?: BlockHeader) => L2Block`
- `equals(other: this) => boolean` - Checks if this block equals another block.
- `static fromBuffer(buf: Buffer<ArrayBufferLike> | BufferReader) => L2Block` - Deserializes a block from a buffer
- `getPrivateLogs() => PrivateLog[]`
- `getStats() => { blockNumber: BlockNumber; blockTimestamp: number; ... }` - Returns stats used for logging.
- `hash() => Promise<BlockHash>` - Returns the block's hash (hash of block header).
- `static random(blockNumber: BlockNumber, l2BlockNum: { checkpointNumber?: CheckpointNumber; indexWithinCheckpoint?: IndexWithinCheckpoint; ... } & Partial<Partial<FieldsOf<BlockHeader>> & Partial<FieldsOf<GlobalVariables>>>) => Promise<L2Block>` - Creates an L2 block containing random data.
- `toBlobFields() => Fr[]`
- `toBlockBlobData() => BlockBlobData`
- `toBlockInfo() => L2BlockInfo`
- `toBuffer() => Buffer<ArrayBufferLike>` - Serializes a block

### L2BlockStream

Creates a stream of events for new blocks, chain tips updates, and reorgs, out of polling an archiver or a node.

**Constructor**
```typescript
new L2BlockStream(l2BlockSource: Pick<L2BlockSource, "getBlocks" | "getBlockHeader" | "getL2Tips" | "getCheckpoints" | "getCheckpointedBlocks">, localData: L2BlockStreamLocalDataProvider, handler: L2BlockStreamEventHandler, log: Logger, opts: { batchSize?: number; checkpointPrefetchLimit?: number; ... })
```

**Methods**
- `isRunning() => boolean`
- `start() => void`
- `stop() => Promise<void>`
- `sync() => Promise<void>` - Runs the synchronization process once. If you want to run this process continuously use `start` and `stop` instead.
- `work() => Promise<void>`

### L2TipsMemoryStore

In-memory implementation of L2 tips store. Useful for testing and lightweight clients.

Extends: `L2TipsStoreBase`

**Constructor**
```typescript
new L2TipsMemoryStore()
```

**Methods**
- `computeBlockHash(block: L2Block) => Promise<string>`
- `deleteBlockHashesBefore(blockNumber: BlockNumber) => Promise<void>` - Deletes all block hashes for blocks before the given block number.
- `deleteBlockToCheckpointBefore(blockNumber: BlockNumber) => Promise<void>` - Deletes all block-to-checkpoint mappings for blocks before the given block number.
- `deleteCheckpointsBefore(checkpointNumber: CheckpointNumber) => Promise<void>` - Deletes all checkpoints before the given checkpoint number.
- `getCheckpoint(checkpointNumber: CheckpointNumber) => Promise<PublishedCheckpoint | undefined>` - Gets a checkpoint by its number.
- `getCheckpointNumberForBlock(blockNumber: BlockNumber) => Promise<CheckpointNumber | undefined>` - Gets the checkpoint number for a given block number.
- `getL2BlockHash(number: BlockNumber) => Promise<string | undefined>`
- `getL2Tips() => Promise<L2Tips>`
- `getStoredBlockHash(blockNumber: BlockNumber) => Promise<string | undefined>` - Gets the block hash for a given block number.
- `getTip(tag: L2BlockTag) => Promise<BlockNumber | undefined>` - Gets the block number for a given tag.
- `handleBlockStreamEvent(event: L2BlockStreamEvent) => Promise<void>`
- `runInTransaction<T>(fn: () => Promise<T>) => Promise<T>` - Runs the given function in a transaction. Memory stores can just execute immediately.
- `saveCheckpointData(checkpoint: PublishedCheckpoint) => Promise<void>` - Saves a checkpoint.
- `setBlockHash(blockNumber: BlockNumber, hash: string) => Promise<void>` - Sets the block hash for a given block number.
- `setCheckpointNumberForBlock(blockNumber: BlockNumber, checkpointNumber: CheckpointNumber) => Promise<void>` - Sets the checkpoint number for a given block number.
- `setTip(tag: L2BlockTag, blockNumber: BlockNumber) => Promise<void>` - Sets the block number for a given tag.

### L2TipsStoreBase

Abstract base class for L2 tips stores. Provides common event handling logic while delegating storage operations to subclasses.
Implements: `L2BlockStreamEventHandler`, `L2BlockStreamLocalDataProvider`

**Constructor**
```typescript
new L2TipsStoreBase()
```

**Methods**
- `computeBlockHash(block: L2Block) => Promise<string>`
- `deleteBlockHashesBefore(blockNumber: BlockNumber) => Promise<void>` - Deletes all block hashes for blocks before the given block number.
- `deleteBlockToCheckpointBefore(blockNumber: BlockNumber) => Promise<void>` - Deletes all block-to-checkpoint mappings for blocks before the given block number.
- `deleteCheckpointsBefore(checkpointNumber: CheckpointNumber) => Promise<void>` - Deletes all checkpoints before the given checkpoint number.
- `getCheckpoint(checkpointNumber: CheckpointNumber) => Promise<PublishedCheckpoint | undefined>` - Gets a checkpoint by its number.
- `getCheckpointNumberForBlock(blockNumber: BlockNumber) => Promise<CheckpointNumber | undefined>` - Gets the checkpoint number for a given block number.
- `getL2BlockHash(number: BlockNumber) => Promise<string | undefined>`
- `getL2Tips() => Promise<L2Tips>`
- `getStoredBlockHash(blockNumber: BlockNumber) => Promise<string | undefined>` - Gets the block hash for a given block number.
- `getTip(tag: L2BlockTag) => Promise<BlockNumber | undefined>` - Gets the block number for a given tag.
- `handleBlockStreamEvent(event: L2BlockStreamEvent) => Promise<void>`
- `runInTransaction<T>(fn: () => Promise<T>) => Promise<T>` - Runs the given function in a transaction. Memory stores can just execute immediately.
- `saveCheckpointData(checkpoint: PublishedCheckpoint) => Promise<void>` - Saves a checkpoint.
- `setBlockHash(blockNumber: BlockNumber, hash: string) => Promise<void>` - Sets the block hash for a given block number.
- `setCheckpointNumberForBlock(blockNumber: BlockNumber, checkpointNumber: CheckpointNumber) => Promise<void>` - Sets the checkpoint number for a given block number.
- `setTip(tag: L2BlockTag, blockNumber: BlockNumber) => Promise<void>` - Sets the block number for a given tag.

### LogId

A globally unique log id.

**Constructor**
```typescript
new LogId(blockNumber: BlockNumber, blockHash: BlockHash, txHash: TxHash, txIndex: number, logIndex: number)
```

**Properties**
- `readonly blockHash: BlockHash` - The hash of the block the log was emitted in.
- `readonly blockNumber: BlockNumber` - The block number the log was emitted in.
- `readonly logIndex: number` - The index of a log the tx was emitted in.
- `static schema: unknown`
- `readonly txHash: TxHash` - The hash of the transaction the log was emitted in.
- `readonly txIndex: number` - The index of a tx in a block the log was emitted in.

**Methods**
- `static fromBuffer(buffer: Buffer<ArrayBufferLike> | BufferReader) => LogId` - Creates a LogId from a buffer.
- `static fromString(data: string) => LogId` - Creates a LogId from a string.
- `static random() => LogId`
- `toBuffer() => Buffer` - Serializes log id to a buffer.
- `toHumanReadable() => string` - Serializes log id to a human readable string.
- `toString() => string` - Converts the LogId instance to a string.

### MaliciousCommitteeAttestationsAndSigners

Malicious extension of CommitteeAttestationsAndSigners that keeps separate attestations and signers. Used for tricking the L1 contract into accepting attestations by reconstructing the correct committee commitment (which relies on the signers, ignoring the signatures) with an invalid set of attestation signatures.

Extends: `CommitteeAttestationsAndSigners`

**Constructor**
```typescript
new MaliciousCommitteeAttestationsAndSigners(attestations: CommitteeAttestation[], signers: EthAddress[])
```

**Properties**
- `attestations: CommitteeAttestation[]`
- `static schema: unknown`

**Methods**
- `static empty() => CommitteeAttestationsAndSigners`
- `getPackedAttestations() => ViemCommitteeAttestations` - Packs an array of committee attestations into the format expected by the Solidity contract
- `getPayloadToSign(domainSeparator: SignatureDomainSeparator) => Buffer`
- `getSignedAttestations() => CommitteeAttestation[]`
- `getSigners() => EthAddress[]`
- `toString() => void` - Returns a string representation of an object.

### MessageContext

Additional information needed to process a message. All messages exist in the context of a transaction, and information about that transaction is typically required in order to perform validation, store results, etc. For example, messages containing notes require knowledge of note hashes and the first nullifier in order to find the note's nonce. A TS version of `message_context.nr`.

**Constructor**
```typescript
new MessageContext(txHash: TxHash, uniqueNoteHashesInTx: Fr[], firstNullifierInTx: Fr, recipient: AztecAddress)
```

**Properties**
- `firstNullifierInTx: Fr`
- `recipient: AztecAddress`
- `txHash: TxHash`
- `uniqueNoteHashesInTx: Fr[]`

**Methods**
- `static fromTxEffectAndRecipient(txEffect: TxEffect, recipient: AztecAddress) => MessageContext`
- `toFields() => Fr[]`
- `toNoirStruct() => { first_nullifier_in_tx: Fr; recipient: AztecAddress; ... }`

### NestedProcessReturnValues

Return values of simulating complete callstack.

**Constructor**
```typescript
new NestedProcessReturnValues(values: ProcessReturnValues, nested?: NestedProcessReturnValues[])
```

**Properties**
- `nested: NestedProcessReturnValues[]`
- `static schema: unknown`
- `values: ProcessReturnValues`

**Methods**
- `static empty() => NestedProcessReturnValues`
- `equals(other: NestedProcessReturnValues) => boolean`
- `static fromPlainObject(obj: any) => NestedProcessReturnValues`
- `static random(depth: number) => NestedProcessReturnValues`

### Note

The Note class represents a Note emitted from a Noir contract as a vector of Fr (finite field) elements. This data also represents a preimage to a note hash.

Extends: `Vector<Fr>`

**Constructor**
```typescript
new Note(items: Fr[])
```

**Properties**
- `items: Fr[]` - Items in the vector.
- `length: unknown`
- `static schema: unknown`

**Methods**
- `equals(other: Note) => boolean`
- `static fromBuffer(buffer: Buffer<ArrayBufferLike> | BufferReader) => Note` - Create a Note instance from a Buffer or BufferReader. The input 'buffer' can be either a Buffer containing the serialized Fr elements or a BufferReader instance. This function reads the Fr elements in the buffer and constructs a Note with them.
- `static fromString(str: string) => Note` - Creates a new Note instance from a hex string.
- `static random() => Note` - Generates a random Note instance with a variable number of items. The number of items is determined by a random value between 1 and 10 (inclusive). Each item in the Note is generated using the Fr.random() method.
- `toBuffer() => Buffer<ArrayBufferLike>`
- `toFriendlyJSON() => Fr[]`
- `toJSON() => Buffer<ArrayBufferLike>`
- `toString() => string` - Returns a hex representation of the note.

### NoteAndSlot

The contents of a new note.

**Constructor**
```typescript
new NoteAndSlot(note: Note, storageSlot: Fr, randomness: Fr, noteTypeId: NoteSelector)
```

**Properties**
- `note: Note` - The note.
- `noteTypeId: NoteSelector` - The note type identifier.
- `randomness: Fr` - The randomness injected to the note.
- `static schema: unknown`
- `storageSlot: Fr` - The storage slot of the note.

**Methods**
- `static from(fields: FieldsOf<NoteAndSlot>) => NoteAndSlot`
- `static random() => NoteAndSlot`

### NoteDao

A Note Data Access Object, representing a note that was committed to the note hash tree, holding all of the information required to use it during execution and manage its state.

**Constructor**
```typescript
new NoteDao(note: Note, contractAddress: AztecAddress, owner: AztecAddress, storageSlot: Fr, randomness: Fr, noteNonce: Fr, noteHash: Fr, siloedNullifier: Fr, txHash: TxHash, l2BlockNumber: BlockNumber, l2BlockHash: string, txIndexInBlock: number, noteIndexInTx: number)
```

**Properties**
- `contractAddress: AztecAddress` - The address of the contract that created the note (i.e. the address used by the kernel during siloing).
- `l2BlockHash: string` - The L2 block hash in which the tx with this note was included. Used for note management while processing reorgs.
- `l2BlockNumber: BlockNumber` - The L2 block number in which the tx with this note was included. Used for note management while processing reorgs.
- `note: Note` - The packed content of the note, as will be returned in the getNotes oracle.
- `noteHash: Fr` - The inner hash (non-unique, non-siloed) of the note. Each contract determines how the note is hashed. Can be used alongside contractAddress and nonce to compute the uniqueNoteHash and the siloedNoteHash.
- `noteIndexInTx: number` - The index of the note within the tx (based on note hash position), used for ordering notes.
- `noteNonce: Fr` - The nonce that was injected into the note hash preimage in order to guarantee uniqueness.
- `owner: AztecAddress` - The owner of the note - generally the account that can spend the note.
- `randomness: Fr` - The randomness injected to the note hash preimage.
- `siloedNullifier: Fr` - The nullifier of the note, siloed by contract address. Note: Might be set as 0 if the note was added to PXE as nullified.
- `storageSlot: Fr` - The storage location of the note. This value is not used for anything in PXE, but we do index by storage slot since contracts typically make queries based on it.
- `txHash: TxHash` - The hash of the tx in which this note was created. Knowing the tx hash allows for efficient node queries e.g. when searching for txEffects.
- `txIndexInBlock: number` - The index of the tx within the block, used for ordering notes.

**Methods**
- `equals(other: NoteDao) => boolean` - Returns true if this note is equal to the `other` one.
- `static fromBuffer(buffer: Buffer<ArrayBufferLike> | BufferReader) => NoteDao`
- `static fromString(str: string) => NoteDao`
- `getSize() => number` - Returns the size in bytes of the Note Dao.
- `static random(__namedParameters: Partial<NoteDao>) => Promise<NoteDao>`
- `toBuffer() => Buffer`
- `toString() => string`

### NoteSelector

A note selector is a 7 bit long value that identifies a note type within a contract. Encoding of note type id can be reduced to 7 bits.

Extends: `Selector`

**Constructor**
```typescript
new NoteSelector(value: number)
```

**Properties**
- `_branding: "NoteSelector"` - Brand.
- `static schema: unknown`
- `static SIZE: number` - The size of the selector in bytes.
- `value: number`

**Methods**
- `[custom]() => string`
- `static empty() => NoteSelector` - Creates an empty selector.
- `equals(other: Selector) => boolean` - Checks if this selector is equal to another.
- `static fromBuffer(buffer: Buffer<ArrayBufferLike> | BufferReader) => NoteSelector` - Deserializes from a buffer or reader, corresponding to a write in cpp.
- `static fromField(fr: Fr) => NoteSelector` - Converts a field to selector.
- `static fromString(buf: string) => NoteSelector`
- `isEmpty() => boolean` - Checks if the selector is empty (all bytes are 0).
- `static random() => NoteSelector` - Creates a random selector.
- `toBuffer(bufferSize: number) => Buffer` - Serialize as a buffer.
- `toField() => Fr` - Returns a new field with the same contents as this EthAddress.
- `toJSON() => string`
- `toString() => string` - Serialize as a hex string.

### PartialStateReference

Stores snapshots of trees which are commonly needed by base or merge rollup circuits.

**Constructor**
```typescript
new PartialStateReference(noteHashTree: AppendOnlyTreeSnapshot, nullifierTree: AppendOnlyTreeSnapshot, publicDataTree: AppendOnlyTreeSnapshot)
```

**Properties**
- `readonly noteHashTree: AppendOnlyTreeSnapshot` - Snapshot of the note hash tree.
- `readonly nullifierTree: AppendOnlyTreeSnapshot` - Snapshot of the nullifier tree.
- `readonly publicDataTree: AppendOnlyTreeSnapshot` - Snapshot of the public data tree.
- `static schema: unknown`

**Methods**
- `static empty() => PartialStateReference`
- `equals(other: this) => boolean`
- `static from(fields: FieldsOf<PartialStateReference>) => PartialStateReference`
- `static fromBuffer(buffer: Buffer<ArrayBufferLike> | BufferReader) => PartialStateReference`
- `static fromFields(fields: FieldReader | Fr[]) => PartialStateReference`
- `static getFields(fields: FieldsOf<PartialStateReference>) => readonly []`
- `getSize() => number`
- `isEmpty() => boolean`
- `static random() => PartialStateReference`
- `toAbi() => []`
- `toBuffer() => Buffer<ArrayBufferLike>`
- `toFields() => Fr[]`

### PendingTaggedLog

Represents a pending tagged log as it is stored in the pending tagged log array to which the fetchTaggedLogs oracle inserts found private logs. A TS version of `pending_tagged_log.nr`.

**Constructor**
```typescript
new PendingTaggedLog(log: Fr[], txHash: TxHash, uniqueNoteHashesInTx: Fr[], firstNullifierInTx: Fr, recipient: AztecAddress)
```

**Properties**
- `log: Fr[]`

**Methods**
- `toFields() => Fr[]`

### PrivateCallExecutionResult

The result of executing a call to a private function.

**Constructor**
```typescript
new PrivateCallExecutionResult(acir: Buffer, vk: Buffer, partialWitness: Map<number, string>, publicInputs: PrivateCircuitPublicInputs, newNotes: NoteAndSlot[], noteHashNullifierCounterMap: Map<number, number>, returnValues: Fr[], offchainEffects: { data: Fr[] }[], preTags: PreTag[], nestedExecutionResults: PrivateCallExecutionResult[], contractClassLogs: CountedContractClassLog[], profileResult?: PrivateExecutionProfileResult)
```

**Properties**
- `acir: Buffer` - The ACIR bytecode.
- `contractClassLogs: CountedContractClassLog[]` - Contract class logs emitted during execution of this function call. Note: We only need to collect the ContractClassLogFields as preimages for the tx. But keep them as ContractClassLog so that we can verify the log hashes before submitting the tx ().
- `nestedExecutionResults: PrivateCallExecutionResult[]` - The nested executions.
- `newNotes: NoteAndSlot[]` - The notes created in the executed function.
- `noteHashNullifierCounterMap: Map<number, number>` - Mapping of note hash counter to the counter of its nullifier.
- `offchainEffects: { data: Fr[] }[]` - The offchain effects emitted during execution of this function call via the `emit_offchain_effect` oracle.
- `partialWitness: Map<number, string>` - The partial witness.
- `preTags: PreTag[]` - The pre-tags used in this tx to compute tags for private logs
- `profileResult?: PrivateExecutionProfileResult`
- `publicInputs: PrivateCircuitPublicInputs` - The call stack item.
- `returnValues: Fr[]` - The raw return values of the executed function.
- `static schema: unknown`
- `vk: Buffer` - The verification key.

**Methods**
- `static from(fields: FieldsOf<PrivateCallExecutionResult>) => PrivateCallExecutionResult`
- `static random(nested: number) => Promise<PrivateCallExecutionResult>`

### PrivateExecutionProfileResult

**Constructor**
```typescript
new PrivateExecutionProfileResult(timings: { oracles?: Record<string, { times: number[] }>; witgen: number })
```

**Properties**
- `timings: { oracles?: Record<string, { times: number[] }>; witgen: number }`

### PrivateExecutionResult

**Constructor**
```typescript
new PrivateExecutionResult(entrypoint: PrivateCallExecutionResult, firstNullifier: Fr, publicFunctionCalldata: HashedValues[])
```

**Properties**
- `entrypoint: PrivateCallExecutionResult`
- `firstNullifier: Fr` - The first non-revertible nullifier emitted by any private call, or the protocol nullifier if there was none.
- `publicFunctionCalldata: HashedValues[]` - An array of calldata for the enqueued public function calls and the teardown function call.
- `static schema: unknown`

**Methods**
- `static from(fields: FieldsOf<PrivateExecutionResult>) => PrivateExecutionResult`
- `getSimulationAnchorBlockNumber() => BlockNumber` - The anchor block number that this execution was simulated with.
- `static random(nested: number) => Promise<PrivateExecutionResult>`

### PrivateLog

**Constructor**
```typescript
new PrivateLog(fields: [], emittedLength: number)
```

**Properties**
- `emittedLength: number`
- `fields: []`
- `static schema: unknown`
- `static SIZE_IN_BYTES: number`

**Methods**
- `[custom]() => string`
- `static empty() => PrivateLog`
- `equals(other: PrivateLog) => boolean`
- `static from(fields: FieldsOf<PrivateLog>) => PrivateLog`
- `static fromBlobFields(emittedLength: number, fields: FieldReader | Fr[]) => PrivateLog`
- `static fromBuffer(buffer: Buffer<ArrayBufferLike> | BufferReader) => PrivateLog`
- `static fromFields(fields: FieldReader | Fr[]) => PrivateLog`
- `static fromPlainObject(obj: any) => PrivateLog` - Creates a PrivateLog from a plain object without Zod validation. This method is optimized for performance and skips validation, making it suitable for deserializing trusted data (e.g., from C++ via MessagePack).
- `getEmittedFields() => Fr[]`
- `getEmittedFieldsWithoutTag() => Fr[]`
- `static getFields(fields: FieldsOf<PrivateLog>) => readonly []`
- `isEmpty() => boolean`
- `static random(tag: Fr) => PrivateLog`
- `toBlobFields() => Fr[]`
- `toBuffer() => Buffer`
- `toFields() => Fr[]`

### PrivateSimulationResult

**Constructor**
```typescript
new PrivateSimulationResult(privateExecutionResult: PrivateExecutionResult, publicInputs: PrivateKernelTailCircuitPublicInputs)
```

**Properties**
- `privateExecutionResult: PrivateExecutionResult`
- `publicInputs: PrivateKernelTailCircuitPublicInputs`

**Methods**
- `getPrivateReturnValues() => NestedProcessReturnValues`
- `toSimulatedTx() => Promise<Tx>`

### PrivateTxConstantData

Data that is constant/not modified by neither of the kernels.

**Constructor**
```typescript
new PrivateTxConstantData(anchorBlockHeader: BlockHeader, txContext: TxContext, vkTreeRoot: Fr, protocolContracts: ProtocolContracts)
```

**Properties**
- `anchorBlockHeader: BlockHeader` - Header of a block whose state is used during execution (not the block the transaction is included in).
- `protocolContracts: ProtocolContracts` - List of protocol contracts.
- `txContext: TxContext` - Context of the transaction. Note: `chainId` and `version` in txContext are not redundant to the values in self.anchor_block_header.global_variables because they can be different in case of a protocol upgrade. In such a situation we could be using header from a block before the upgrade took place but be using the updated protocol to execute and prove the transaction.
- `vkTreeRoot: Fr` - Root of the vk tree for the protocol circuits.

**Methods**
- `clone() => PrivateTxConstantData`
- `static empty() => PrivateTxConstantData`
- `static from(fields: FieldsOf<PrivateTxConstantData>) => PrivateTxConstantData`
- `static fromBuffer(buffer: Buffer<ArrayBufferLike> | BufferReader) => PrivateTxConstantData`
- `static fromFields(fields: FieldReader | Fr[]) => PrivateTxConstantData`
- `static getFields(fields: FieldsOf<PrivateTxConstantData>) => readonly []`
- `getSize() => number`
- `toBuffer() => Buffer<ArrayBufferLike>`
- `toFields() => Fr[]`

### Proof

The Proof class is a wrapper around the circuits proof. Underlying it is a buffer of proof data in a form a barretenberg prover understands. It provides methods to easily create, serialize, and deserialize the proof data for efficient communication and storage.

**Constructor**
```typescript
new Proof(buffer: Buffer, numPublicInputs: number)
```

**Properties**
- `readonly __proofBrand: any`
- `buffer: Buffer` - Holds the serialized proof data in a binary buffer format.
- `numPublicInputs: number`

**Methods**
- `static empty() => Proof` - Returns an empty proof.
- `extractPublicInputs() => Fr[]`
- `static fromBuffer(buffer: Buffer<ArrayBufferLike> | BufferReader) => Proof` - Create a Proof from a Buffer or BufferReader. Expects a length-encoding.
- `static fromString(str: string) => Proof` - Deserialize a Proof instance from a hex string.
- `isEmpty() => boolean` - Returns whether this proof is actually empty.
- `toBuffer() => Buffer<ArrayBufferLike>` - Convert the Proof instance to a custom Buffer format. This function serializes the Proof's buffer length and data sequentially into a new Buffer.
- `toString() => string` - Serialize the Proof instance to a hex string.
- `withoutPublicInputs() => Buffer` - Returns the proof without the public inputs, but includes the pairing point object as part of the proof.

### ProofData

Represents the data of a recursive proof.

**Constructor**
```typescript
new ProofData(publicInputs: T, proof: RecursiveProof<PROOF_LENGTH>, vkData: VkData)
```

**Properties**
- `proof: RecursiveProof<PROOF_LENGTH>`
- `publicInputs: T`
- `vkData: VkData`

**Methods**
- `static fromBuffer<T extends Bufferable, PROOF_LENGTH extends number>(buffer: Buffer<ArrayBufferLike> | BufferReader, publicInputs: { fromBuffer: (reader: BufferReader) => T }) => ProofData<T, PROOF_LENGTH>`
- `toBuffer() => Buffer`

### ProofDataForFixedVk

Represents the data of a recursive proof for a circuit with a fixed verification key.

**Constructor**
```typescript
new ProofDataForFixedVk(publicInputs: T, proof: RecursiveProof<PROOF_LENGTH>)
```

**Properties**
- `proof: RecursiveProof<PROOF_LENGTH>`
- `publicInputs: T`

**Methods**
- `static fromBuffer<T extends Bufferable, PROOF_LENGTH extends number>(buffer: Buffer<ArrayBufferLike> | BufferReader, publicInputs: { fromBuffer: (reader: BufferReader) => T }) => ProofDataForFixedVk<T, PROOF_LENGTH>`
- `toBuffer() => Buffer`

### ProtocolContracts

**Constructor**
```typescript
new ProtocolContracts(derivedAddresses: [])
```

**Properties**
- `derivedAddresses: []`
- `static schema: unknown`

**Methods**
- `static empty() => ProtocolContracts`
- `static from(fields: FieldsOf<ProtocolContracts>) => ProtocolContracts`
- `static fromBuffer(buffer: Buffer<ArrayBufferLike> | BufferReader) => ProtocolContracts`
- `static fromFields(fields: FieldReader | Fr[]) => ProtocolContracts`
- `static fromPlainObject(obj: any) => ProtocolContracts` - Creates a ProtocolContracts instance from a plain object without Zod validation. This method is optimized for performance and skips validation, making it suitable for deserializing trusted data (e.g., from C++ via MessagePack).
- `static getFields(fields: FieldsOf<ProtocolContracts>) => readonly []`
- `getSize() => number`
- `hash() => Promise<Fr>`
- `toBuffer() => Buffer<ArrayBufferLike>`
- `toFields() => Fr[]`

### PublicCallRequestWithCalldata

The call request of a public function, including the calldata.

**Constructor**
```typescript
new PublicCallRequestWithCalldata(request: PublicCallRequest, calldata: Fr[])
```

**Properties**
- `args: unknown`
- `calldata: Fr[]` - Function selector and arguments of the public call.
- `functionSelector: unknown`
- `request: PublicCallRequest` - Request of the public call.
- `static schema: unknown`

**Methods**
- `[custom]() => string`
- `static empty() => PublicCallRequestWithCalldata`
- `static from(fields: Pick<PublicCallRequestWithCalldata, "request" | "calldata">) => PublicCallRequestWithCalldata`
- `static fromBuffer(buffer: Buffer<ArrayBufferLike> | BufferReader) => PublicCallRequestWithCalldata`
- `static fromPlainObject(obj: any) => PublicCallRequestWithCalldata` - Creates a PublicCallRequestWithCalldata from a plain object without Zod validation. This method is optimized for performance and skips validation, making it suitable for deserializing trusted data (e.g., from C++ via MessagePack).
- `isEmpty() => boolean`
- `toBuffer() => Buffer<ArrayBufferLike>`

### PublicKeys

**Constructor**
```typescript
new PublicKeys(masterNullifierPublicKey: Point, masterIncomingViewingPublicKey: Point, masterOutgoingViewingPublicKey: Point, masterTaggingPublicKey: Point)
```

**Properties**
- `masterIncomingViewingPublicKey: Point` - Master incoming viewing public key
- `masterNullifierPublicKey: Point` - Master nullifier public key
- `masterOutgoingViewingPublicKey: Point` - Master outgoing viewing public key
- `masterTaggingPublicKey: Point` - Master tagging viewing public key
- `static schema: unknown`

**Methods**
- `static default() => PublicKeys`
- `encodeToNoir() => Fr[]`
- `equals(other: PublicKeys) => boolean` - Determines if this PublicKeys instance is equal to the given PublicKeys instance. Equality is based on the content of their respective buffers.
- `static from(fields: FieldsOf<PublicKeys>) => PublicKeys`
- `static fromBuffer(buffer: Buffer<ArrayBufferLike> | BufferReader) => PublicKeys` - Creates an PublicKeys instance from a given buffer or BufferReader. If the input is a Buffer, it wraps it in a BufferReader before processing. Throws an error if the input length is not equal to the expected size.
- `static fromFields(fields: FieldReader | Fr[]) => PublicKeys`
- `static fromPlainObject(obj: any) => PublicKeys` - Creates a PublicKeys from a plain object without Zod validation. This method is optimized for performance and skips validation, making it suitable for deserializing trusted data (e.g., from C++ via MessagePack).
- `static fromString(keys: string) => PublicKeys`
- `hash() => Fr | Promise<Fr>`
- `isEmpty() => boolean`
- `static random() => Promise<PublicKeys>`
- `toBuffer() => Buffer` - Converts the PublicKeys instance into a Buffer. This method should be used when encoding the address for storage, transmission or serialization purposes.
- `toFields() => Fr[]` - Serializes the payload to an array of fields
- `toNoirStruct() => { ivpk_m: { inner: { is_infinite: boolean; x: Fr; y: Fr } }; npk_m: { inner: { is_infinite: boolean; x: Fr; y: Fr } }; ... }`
- `toString() => string`

### PublicLog

**Constructor**
```typescript
new PublicLog(contractAddress: AztecAddress, fields: Fr[])
```

**Properties**
- `contractAddress: AztecAddress`
- `fields: Fr[]`
- `static schema: unknown`

**Methods**
- `[custom]() => string`
- `static empty() => PublicLog`
- `equals(other: this) => boolean`
- `static from(fields: FieldsOf<PublicLog>) => PublicLog`
- `static fromBuffer(buffer: Buffer<ArrayBufferLike> | BufferReader) => PublicLog`
- `static fromFields(fields: FieldReader | Fr[]) => PublicLog`
- `static fromPlainObject(obj: any) => PublicLog`
- `getEmittedFields() => Fr[]`
- `getEmittedFieldsWithoutTag() => Fr[]`
- `static getFields(fields: FieldsOf<PublicLog>) => readonly []`
- `isEmpty() => boolean`
- `static random() => Promise<PublicLog>`
- `sizeInFields() => number`
- `toBuffer() => Buffer`
- `toFields() => Fr[]`
- `toHumanReadable() => string`

### PublicSimulationOutput

Outputs of processing the public component of a transaction.

**Constructor**
```typescript
new PublicSimulationOutput(revertReason: SimulationError | undefined, globalVariables: GlobalVariables, txEffect: TxEffect, publicReturnValues: NestedProcessReturnValues[], gasUsed: GasUsed)
```

**Properties**
- `gasUsed: GasUsed`
- `globalVariables: GlobalVariables`
- `publicReturnValues: NestedProcessReturnValues[]`
- `revertReason: SimulationError | undefined`
- `static schema: unknown`
- `txEffect: TxEffect`

**Methods**
- `static random() => Promise<PublicSimulationOutput>`

### RecursiveProof

The Recursive proof class is a wrapper around the circuit's proof. We store the proof in 2 forms for convenience. The first is in the 'fields' format. This is a list of fields, for which there are distinct lengths based on the level of recursion. This 'fields' version does not contain the circuits public inputs We also store the raw binary proof which van be directly verified. The 'fieldsValid' member is set to false in the case where this object is constructed solely from the 'binary' proof This is usually when the proof has been received from clients and signals to provers that the 'fields' version needs to be generated

**Constructor**
```typescript
new RecursiveProof(proof: Fr[], binaryProof: Proof, fieldsValid: boolean, proofLength: N)
```

**Properties**
- `binaryProof: Proof` - Holds the serialized proof data in a binary buffer, this contains the public inputs
- `fieldsValid: boolean` - This flag determines if the 'proof' member is valid, or if we need to generate it from the 'binaryProof' first
- `proof: Fr[]` - Holds the serialized proof data in an array of fields, this is without the public inputs
- `proofLength: N`

**Methods**
- `static fromBuffer<N extends number>(buffer: Buffer<ArrayBufferLike> | BufferReader, expectedSize?: N) => RecursiveProof<N>` - Create a Proof from a Buffer or BufferReader. Expects a length-encoding.
- `static fromString<N extends number>(str: string, expectedSize?: N) => RecursiveProof<N>` - Deserialize a Proof instance from a hex string.
- `static schemaFor<N extends number>(expectedSize?: N) => ZodEffects<ZodFor<Buffer<ArrayBufferLike>>, RecursiveProof<N>, any>` - Creates an instance from a hex string with expected size.
- `toBuffer() => Buffer<ArrayBufferLike>` - Convert the Proof instance to a custom Buffer format. This function serializes the Proof's buffer length and data sequentially into a new Buffer.
- `toJSON() => Buffer<ArrayBufferLike>` - Returns a buffer representation for JSON serialization.
- `toString() => string` - Serialize the Proof instance to a hex string.

### SerializableContractInstance

**Constructor**
```typescript
new SerializableContractInstance(instance: ContractInstance)
```

**Properties**
- `readonly currentContractClassId: Fr`
- `readonly deployer: AztecAddress`
- `readonly initializationHash: Fr`
- `readonly originalContractClassId: Fr`
- `readonly publicKeys: PublicKeys`
- `readonly salt: Fr`
- `readonly version: 1`

**Methods**
- `static default() => SerializableContractInstance`
- `static fromBuffer(bufferOrReader: Buffer<ArrayBufferLike> | BufferReader) => SerializableContractInstance`
- `static random(opts: Partial<FieldsOf<ContractInstance>>) => Promise<SerializableContractInstance>`
- `toBuffer() => Buffer<ArrayBufferLike>`
- `withAddress(address: AztecAddress) => ContractInstanceWithAddress` - Returns a copy of this object with its address included.

### SerializableContractInstanceUpdate

**Constructor**
```typescript
new SerializableContractInstanceUpdate(instance: ContractInstanceUpdate)
```

**Properties**
- `newContractClassId: Fr`
- `prevContractClassId: Fr`
- `timestampOfChange: bigint`

**Methods**
- `static default() => SerializableContractInstanceUpdate`
- `static fromBuffer(bufferOrReader: Buffer<ArrayBufferLike> | BufferReader) => SerializableContractInstanceUpdate`
- `static random(opts: Partial<FieldsOf<ContractInstanceUpdate>>) => SerializableContractInstanceUpdate`
- `toBuffer() => Buffer<ArrayBufferLike>`

### Signature

Contains a signature split into it's primary components (r,s,v)

**Constructor**
```typescript
new Signature(r: Buffer32, s: Buffer32, v: number)
```

**Properties**
- `readonly empty: boolean`
- `readonly r: Buffer32` - The r value of the signature
- `readonly s: Buffer32` - The s value of the signature
- `static schema: unknown`
- `readonly v: number` - The v value of the signature

**Methods**
- `static empty() => Signature`
- `equals(other: Signature) => boolean`
- `static fromBuffer(buf: Buffer<ArrayBufferLike> | BufferReader) => Signature`
- `static fromString(sig: string) => Signature` - A seperate method exists for this as when signing locally with viem, as when parsing from viem, we can expect the v value to be a u8, rather than our default serialization of u32
- `static fromViemSignature(sig: ViemSignature) => Signature`
- `static fromViemTransactionSignature(sig: ViemTransactionSignature) => Signature`
- `getSize() => number`
- `isEmpty() => boolean`
- `static isValidString(sig: string) => boolean`
- `static random() => Signature`
- `toBuffer() => Buffer`
- `toJSON() => string`
- `toString() => string`
- `toViemSignature() => ViemSignature` - Return the signature with `0x${string}` encodings for r and s
- `toViemTransactionSignature() => ViemTransactionSignature` - Return the signature with `0x${string}` encodings for r and s. Verifies v is valid

### SiloedTag

Represents a tag used in private log as it "appears on the chain" - that is the tag is siloed with a contract address that emitted the log.

**Constructor**
```typescript
new SiloedTag(value: Fr)
```

**Properties**
- `_branding: "SiloedTag"` - Brand.
- `static schema: unknown`
- `readonly value: Fr`

**Methods**
- `static compute(tag: Tag, app: AztecAddress) => Promise<SiloedTag>`
- `equals(other: SiloedTag) => boolean`
- `toJSON() => string`
- `toString() => string`

### SimulationOverrides

**Constructor**
```typescript
new SimulationOverrides(contracts?: ContractOverrides)
```

**Properties**
- `contracts?: ContractOverrides`
- `static schema: unknown`

### StateReference

Stores snapshots of all the trees but archive.

**Constructor**
```typescript
new StateReference(l1ToL2MessageTree: AppendOnlyTreeSnapshot, partial: PartialStateReference)
```

**Properties**
- `l1ToL2MessageTree: AppendOnlyTreeSnapshot` - Snapshot of the l1 to l2 message tree.
- `partial: PartialStateReference` - Reference to the rest of the state.
- `static schema: unknown`

**Methods**
- `[custom]() => string`
- `static empty() => StateReference`
- `equals(other: this) => boolean`
- `static from(fields: FieldsOf<StateReference>) => StateReference`
- `static fromBuffer(buffer: Buffer<ArrayBufferLike> | BufferReader) => StateReference`
- `static fromFields(fields: FieldReader | Fr[]) => StateReference`
- `static getFields(fields: FieldsOf<StateReference>) => readonly []`
- `getSize() => number`
- `isEmpty() => boolean`
- `static random() => StateReference`
- `toAbi() => []`
- `toBuffer() => Buffer<ArrayBufferLike>`
- `toFields() => Fr[]`
- `toInspect() => { l1ToL2MessageTree: string; noteHashTree: string; ... }`
- `validate() => void` - Validates the trees in world state have the expected number of leaves (multiple of number of insertions per tx)

### Tag

Represents a tag of a private log. This is not the tag that "appears" on the chain as this tag is first siloed with a contract address by kernels before being included in the final log.

**Constructor**
```typescript
new Tag(value: Fr)
```

**Properties**
- `_branding: "Tag"` - Brand.
- `static schema: unknown`
- `readonly value: Fr`

**Methods**
- `static compute(preTag: PreTag) => Promise<Tag>`
- `equals(other: Tag) => boolean`
- `toJSON() => string`
- `toString() => string`

### TreeSnapshots

Stores snapshots of all the trees but archive.

**Constructor**
```typescript
new TreeSnapshots(l1ToL2MessageTree: AppendOnlyTreeSnapshot, noteHashTree: AppendOnlyTreeSnapshot, nullifierTree: AppendOnlyTreeSnapshot, publicDataTree: AppendOnlyTreeSnapshot)
```

**Properties**
- `l1ToL2MessageTree: AppendOnlyTreeSnapshot`
- `noteHashTree: AppendOnlyTreeSnapshot`
- `nullifierTree: AppendOnlyTreeSnapshot`
- `publicDataTree: AppendOnlyTreeSnapshot`
- `static schema: unknown`

**Methods**
- `[custom]() => string`
- `static empty() => TreeSnapshots`
- `static fromBuffer(buffer: Buffer<ArrayBufferLike> | BufferReader) => TreeSnapshots`
- `static fromFields(fields: FieldReader | Fr[]) => TreeSnapshots`
- `static fromPlainObject(obj: any) => TreeSnapshots` - Creates a TreeSnapshots instance from a plain object without Zod validation. This method is optimized for performance and skips validation, making it suitable for deserializing trusted data (e.g., from C++ via MessagePack).
- `getSize() => number`
- `isEmpty() => boolean`
- `toBuffer() => Buffer<ArrayBufferLike>`
- `toFields() => Fr[]`

### Tx

The interface of an L2 transaction.

Extends: `Gossipable`

**Constructor**
```typescript
new Tx(txHash: TxHash, data: PrivateKernelTailCircuitPublicInputs, chonkProof: ChonkProof, contractClassLogFields: ContractClassLogFields[], publicFunctionCalldata: HashedValues[])
```

**Properties**
- `readonly chonkProof: ChonkProof` - Proof from the private kernel circuit.
- `readonly contractClassLogFields: ContractClassLogFields[]` - Contract class log fields emitted from the tx. Their order should match the order of the log hashes returned from `this.data.getNonEmptyContractClassLogsHashes`. This claimed data is reconciled against a hash of this data (that is contained within the tx's public inputs (`this.data`)), in data_validator.ts.
- `readonly data: PrivateKernelTailCircuitPublicInputs` - Output of the private kernel circuit for this tx.
- `static p2pTopic: TopicType` - The p2p topic identifier, this determines how the message is handled
- `readonly publicFunctionCalldata: HashedValues[]` - An array of calldata for the enqueued public function calls and the teardown function call. This claimed data is reconciled against hashes of this data (that are contained within the tx's public inputs (`this.data`)), in data_validator.ts.
- `static schema: unknown`
- `readonly txHash: TxHash` - Identifier of the tx. It's a hash of the public inputs of the tx's proof. This claimed hash is reconciled against the tx's public inputs (`this.data`) in data_validator.ts.

**Methods**
- `static clone(tx: Tx, cloneProof: boolean) => Tx` - Clones a tx, making a deep copy of all fields.
- `static computeTxHash(fields: Pick<FieldsOf<Tx>, "data">) => Promise<TxHash>`
- `static create(fields: Omit<FieldsOf<Tx>, "txHash">) => Promise<Tx>`
- `static from(fields: FieldsOf<Tx>) => Tx`
- `static fromBuffer(buffer: Buffer<ArrayBufferLike> | BufferReader) => Tx` - Deserializes the Tx object from a Buffer.
- `generateP2PMessageIdentifier() => Promise<Buffer32>`
- `getCalldataMap() => Map<string, Fr[]>`
- `getContractClassLogs() => ContractClassLog[]`
- `getEstimatedPrivateTxEffectsSize() => number` - Estimates the tx size based on its private effects. Note that the actual size of the tx after processing will probably be larger, as public execution would generate more data.
- `getGasSettings() => GasSettings`
- `getNonRevertiblePublicCallRequestsWithCalldata() => PublicCallRequestWithCalldata[]`
- `getPublicCallRequestsWithCalldata() => PublicCallRequestWithCalldata[]`
- `getPublicLogs(logsSource: L2LogsSource) => Promise<GetPublicLogsResponse>` - Gets public logs emitted by this tx.
- `getRevertiblePublicCallRequestsWithCalldata() => PublicCallRequestWithCalldata[]`
- `getSize() => number` - Get the size of the gossipable object. This is used for metrics recording.
- `getSplitContractClassLogs(revertible: boolean) => ContractClassLog[]` - Gets either revertible or non revertible contract class logs emitted by this tx.
- `getStats() => TxStats` - Returns stats about this tx.
- `getTeardownPublicCallRequestWithCalldata() => PublicCallRequestWithCalldata | undefined`
- `getTotalPublicCalldataCount() => number`
- `getTxHash() => TxHash` - Return transaction hash.
- `hasPublicCalls() => boolean`
- `numberOfPublicCalls() => number`
- `p2pMessageLoggingIdentifier() => Promise<Buffer32>` - A digest of the message information **used for logging only**. The identifier used for deduplication is `getMsgIdFn` as defined in `encoding.ts` which is a hash over topic and data.
- `static random(args: { randomProof?: boolean; txHash?: string | TxHash }) => Tx` - Creates a random tx.
- `recomputeHash() => Promise<TxHash>` - Recomputes the tx hash. Used for testing purposes only when a property of the tx was mutated.
- `toBuffer() => Buffer<ArrayBufferLike>` - Serializes the Tx object into a Buffer.
- `toMessage() => Buffer`
- `validateTxHash() => Promise<boolean>` - Validates that the tx hash matches the computed hash from the tx data. This should be called when deserializing a tx from an untrusted source.

### TxArray

Helper class to handle Serialization and Deserialization of Txs array.

Extends: `Array<Tx>`

**Constructor**
```typescript
new TxArray(arrayLength: number)
```

**Methods**
- `static fromBuffer(buffer: Buffer<ArrayBufferLike> | BufferReader) => TxArray`
- `toBuffer() => Buffer`

### TxConstantData

Version of `PrivateTxConstantData` exposed by the tail circuits It compresses the protocol contracts list to a hash to minimize the number of public inputs. Refer to `PrivateTxConstantData` for more details.

**Constructor**
```typescript
new TxConstantData(anchorBlockHeader: BlockHeader, txContext: TxContext, vkTreeRoot: Fr, protocolContractsHash: Fr)
```

**Properties**
- `anchorBlockHeader: BlockHeader`
- `protocolContractsHash: Fr`
- `txContext: TxContext`
- `vkTreeRoot: Fr`

**Methods**
- `clone() => TxConstantData`
- `static empty() => TxConstantData`
- `static from(fields: FieldsOf<TxConstantData>) => TxConstantData`
- `static fromBuffer(buffer: Buffer<ArrayBufferLike> | BufferReader) => TxConstantData`
- `static fromFields(fields: FieldReader | Fr[]) => TxConstantData`
- `static getFields(fields: FieldsOf<TxConstantData>) => readonly []`
- `getSize() => number`
- `toBuffer() => Buffer<ArrayBufferLike>`
- `toFields() => Fr[]`

### TxContext

Transaction context.

**Constructor**
```typescript
new TxContext(chainId: number | bigint | Fr, version: number | bigint | Fr, gasSettings: GasSettings)
```

**Properties**
- `chainId: Fr`
- `gasSettings: GasSettings` - Gas limits for this transaction.
- `static schema: unknown`
- `version: Fr`

**Methods**
- `clone() => TxContext`
- `static empty(chainId: number | Fr, version: number | Fr) => TxContext`
- `static from(fields: FieldsOf<TxContext>) => TxContext` - Create a new instance from a fields dictionary.
- `static fromBuffer(buffer: Buffer<ArrayBufferLike> | BufferReader) => TxContext` - Deserializes TxContext from a buffer or reader.
- `static fromFields(fields: FieldReader | Fr[]) => TxContext`
- `static getFields(fields: FieldsOf<TxContext>) => readonly []` - Serialize into a field array. Low-level utility.
- `getSize() => number`
- `isEmpty() => boolean`
- `toBuffer() => Buffer<ArrayBufferLike>` - Serialize as a buffer.
- `toFields() => Fr[]`

### TxEffect

**Constructor**
```typescript
new TxEffect(revertCode: RevertCode, txHash: TxHash, transactionFee: Fr, noteHashes: Fr[], nullifiers: Fr[], l2ToL1Msgs: Fr[], publicDataWrites: PublicDataWrite[], privateLogs: PrivateLog[], publicLogs: PublicLog[], contractClassLogs: ContractClassLog[])
```

**Properties**
- `contractClassLogs: ContractClassLog[]` - The contract class logs.
- `l2ToL1Msgs: Fr[]` - The hash of L2 to L1 messages to be inserted into the messagebox on L1. rename to l2ToL1MsgHashes
- `noteHashes: Fr[]` - The note hashes to be inserted into the note hash tree.
- `nullifiers: Fr[]` - The nullifiers to be inserted into the nullifier tree.
- `privateLogs: PrivateLog[]` - The private logs.
- `publicDataWrites: PublicDataWrite[]` - The public data writes to be inserted into the public data tree.
- `publicLogs: PublicLog[]` - The public logs.
- `revertCode: RevertCode` - Whether the transaction reverted during public app logic.
- `static schema: unknown`
- `transactionFee: Fr` - The transaction fee, denominated in FPA.
- `txHash: TxHash` - The identifier of the transaction.

**Methods**
- `[custom]() => string`
- `static empty() => TxEffect`
- `equals(other: TxEffect) => boolean`
- `static from(fields: FieldsOf<TxEffect>) => TxEffect`
- `static fromBlobFields(fields: Fr[]) => TxEffect`
- `static fromBuffer(buffer: Buffer<ArrayBufferLike> | BufferReader) => TxEffect` - Deserializes the TxEffect object from a Buffer.
- `static fromString(str: string) => TxEffect` - Deserializes an TxEffect object from a string.
- `static fromTxBlobData(txBlobData: TxBlobData) => TxEffect` - Decodes a flat packed array of fields to TxEffect.
- `getNumBlobFields() => number`
- `getTxStartMarker() => TxStartMarker`
- `static random(__namedParameters: { maxEffects?: number; numContractClassLogs?: number; ... }) => Promise<TxEffect>`
- `toBlobFields() => Fr[]`
- `toBuffer() => Buffer`
- `toString() => string` - Returns a hex representation of the TxEffect object.
- `toTxBlobData() => TxBlobData`

### TxExecutionRequest

Request to execute a transaction. Similar to TxRequest, but has the full args.

**Constructor**
```typescript
new TxExecutionRequest(origin: AztecAddress, functionSelector: FunctionSelector, firstCallArgsHash: Fr, txContext: TxContext, argsOfCalls: HashedValues[], authWitnesses: AuthWitness[], capsules: Capsule[], salt: Fr)
```

**Properties**
- `argsOfCalls: HashedValues[]` - An unordered array of packed arguments for each call in the transaction.
- `authWitnesses: AuthWitness[]` - Transient authorization witnesses for authorizing the execution of one or more actions during this tx. These witnesses are not expected to be stored in the local witnesses database of the PXE.
- `capsules: Capsule[]` - Read-only data passed through the oracle calls during this tx execution.
- `firstCallArgsHash: Fr` - The hash of arguments of first call to be executed (usually account entrypoint).
- `functionSelector: FunctionSelector` - Selector of the function to call.
- `origin: AztecAddress` - Sender.
- `salt: Fr` - A salt to make the tx request hash difficult to predict. The hash is used as the first nullifier if there is no nullifier emitted throughout the tx.
- `static schema: unknown`
- `txContext: TxContext` - Transaction context.

**Methods**
- `[custom]() => string`
- `static from(fields: FieldsOf<TxExecutionRequest>) => TxExecutionRequest`
- `static fromBuffer(buffer: Buffer<ArrayBufferLike> | BufferReader) => TxExecutionRequest` - Deserializes from a buffer or reader, corresponding to a write in cpp.
- `static fromString(str: string) => TxExecutionRequest` - Deserializes from a string, corresponding to a write in cpp.
- `static getFields(fields: FieldsOf<TxExecutionRequest>) => readonly []`
- `static random() => Promise<TxExecutionRequest>`
- `toBuffer() => Buffer<ArrayBufferLike>` - Serialize as a buffer.
- `toString() => string` - Serialize as a string.
- `toTxRequest() => TxRequest`

### TxHash

A class representing hash of Aztec transaction.

**Constructor**
```typescript
new TxHash(hash: Fr)
```

**Properties**
- `readonly hash: Fr` - A field representing the tx hash (tx hash is an output of poseidon hash hence it's a field).
- `static schema: unknown`
- `static SIZE: unknown`

**Methods**
- `equals(other: TxHash) => boolean`
- `static fromBigInt(value: bigint) => TxHash`
- `static fromBuffer(buffer: Uint8Array<ArrayBufferLike> | BufferReader) => TxHash`
- `static fromField(value: Fr) => TxHash`
- `static fromString(str: string) => TxHash`
- `static random() => TxHash`
- `toBigInt() => bigint`
- `toBuffer() => Buffer<ArrayBufferLike>`
- `toJSON() => string`
- `toString() => string`
- `static zero() => TxHash`

### TxHashArray

Helper class to handle Serialization and Deserialization of TxHashes array.

Extends: `Array<TxHash>`

**Constructor**
```typescript
new TxHashArray(arrayLength: number)
```

**Methods**
- `static fromBuffer(buffer: Buffer<ArrayBufferLike> | BufferReader) => TxHashArray`
- `toBuffer() => Buffer`

### TxProfileResult

**Constructor**
```typescript
new TxProfileResult(executionSteps: PrivateExecutionStep[], stats: ProvingStats)
```

**Properties**
- `executionSteps: PrivateExecutionStep[]`
- `static schema: unknown`
- `stats: ProvingStats`

**Methods**
- `static random() => TxProfileResult`

### TxProvingResult

**Constructor**
```typescript
new TxProvingResult(privateExecutionResult: PrivateExecutionResult, publicInputs: PrivateKernelTailCircuitPublicInputs, chonkProof: ChonkProof, stats?: ProvingStats)
```

**Properties**
- `chonkProof: ChonkProof`
- `privateExecutionResult: PrivateExecutionResult`
- `publicInputs: PrivateKernelTailCircuitPublicInputs`
- `static schema: unknown`
- `stats?: ProvingStats`

**Methods**
- `static from(fields: FieldsOf<TxProvingResult>) => TxProvingResult`
- `getOffchainEffects() => OffchainEffect[]`
- `static random() => Promise<TxProvingResult>`
- `toTx() => Promise<Tx>`

### TxReceipt

Represents a transaction receipt in the Aztec network. Contains essential information about the transaction including its status, origin, and associated addresses. REFACTOR: TxReceipt should be returned only once the tx is mined, and all its fields should be required. We should not be using a TxReceipt to answer a query for a pending or dropped tx.

**Constructor**
```typescript
new TxReceipt(txHash: TxHash, status: TxStatus, executionResult: TxExecutionResult | undefined, error: string | undefined, transactionFee?: bigint, blockHash?: BlockHash, blockNumber?: BlockNumber)
```

**Properties**
- `blockHash?: BlockHash` - The hash of the block containing the transaction.
- `blockNumber?: BlockNumber` - The block number in which the transaction was included.
- `error: string | undefined` - Description of transaction error, if any.
- `executionResult: TxExecutionResult | undefined` - The execution result of the transaction, only set when tx is in a block.
- `static schema: unknown`
- `status: TxStatus` - The transaction's block finalization status.
- `transactionFee?: bigint` - The transaction fee paid for the transaction.
- `txHash: TxHash` - A unique identifier for a transaction.

**Methods**
- `static empty() => TxReceipt`
- `static executionResultFromRevertCode(revertCode: RevertCode) => TxExecutionResult`
- `static from(fields: { blockHash?: BlockHash; blockNumber?: BlockNumber; ... }) => TxReceipt`
- `hasExecutionReverted() => boolean` - Returns true if the transaction execution reverted.
- `hasExecutionSucceeded() => boolean` - Returns true if the transaction was executed successfully.
- `isDropped() => boolean` - Returns true if the transaction was dropped.
- `isMined() => boolean` - Returns true if the transaction has been included in a block (proposed, checkpointed, proven, or finalized).
- `isPending() => boolean` - Returns true if the transaction is pending.

### TxRequest

Transaction request.

**Constructor**
```typescript
new TxRequest(origin: AztecAddress, argsHash: Fr, txContext: TxContext, functionData: FunctionData, salt: Fr)
```

**Properties**
- `argsHash: Fr` - Pedersen hash of function arguments.
- `functionData: FunctionData` - Function data representing the function to call.
- `origin: AztecAddress` - Sender.
- `salt: Fr` - A salt to make the hash difficult to predict. The hash is used as the first nullifier if there is no nullifier emitted throughout the tx.
- `txContext: TxContext` - Transaction context.

**Methods**
- `static empty() => TxRequest`
- `static from(fields: FieldsOf<TxRequest>) => TxRequest`
- `static fromBuffer(buffer: Buffer<ArrayBufferLike> | BufferReader) => TxRequest` - Deserializes from a buffer or reader, corresponding to a write in cpp.
- `static getFields(fields: FieldsOf<TxRequest>) => readonly []`
- `hash() => Promise<Fr>`
- `isEmpty() => boolean`
- `toBuffer() => Buffer<ArrayBufferLike>` - Serialize as a buffer.
- `toFields() => Fr[]`

### TxScopedL2Log

**Constructor**
```typescript
new TxScopedL2Log(txHash: TxHash, blockNumber: BlockNumber, blockTimestamp: bigint, logData: Fr[], noteHashes: Fr[], firstNullifier: Fr)
```

**Properties**
- `blockNumber: BlockNumber`
- `blockTimestamp: bigint`
- `firstNullifier: Fr`
- `logData: Fr[]`
- `noteHashes: Fr[]`
- `static schema: unknown`
- `txHash: TxHash`

**Methods**
- `equals(other: TxScopedL2Log) => boolean`
- `static fromBuffer(buffer: Buffer) => TxScopedL2Log`
- `toBuffer() => Buffer<ArrayBuffer>`

### TxSimulationResult

**Constructor**
```typescript
new TxSimulationResult(privateExecutionResult: PrivateExecutionResult, publicInputs: PrivateKernelTailCircuitPublicInputs, publicOutput?: PublicSimulationOutput, stats?: SimulationStats)
```

**Properties**
- `gasUsed: unknown`
- `privateExecutionResult: PrivateExecutionResult`
- `publicInputs: PrivateKernelTailCircuitPublicInputs`
- `publicOutput?: PublicSimulationOutput`
- `static schema: unknown`
- `stats?: SimulationStats`

**Methods**
- `static from(fields: Omit<FieldsOf<TxSimulationResult>, "gasUsed">) => TxSimulationResult`
- `static fromPrivateSimulationResultAndPublicOutput(privateSimulationResult: PrivateSimulationResult, publicOutput?: PublicSimulationOutput, stats?: SimulationStats) => TxSimulationResult`
- `getPrivateReturnValues() => NestedProcessReturnValues`
- `getPublicReturnValues() => NestedProcessReturnValues[]`
- `static random() => Promise<TxSimulationResult>`
- `toSimulatedTx() => Promise<Tx>`

### UtilitySimulationResult

**Constructor**
```typescript
new UtilitySimulationResult(result: Fr[], stats?: SimulationStats)
```

**Properties**
- `result: Fr[]`
- `static schema: unknown`
- `stats?: SimulationStats`

**Methods**
- `static random() => UtilitySimulationResult`

## Interfaces

### ArrayType

An array type.

Extends: `BasicType<"array">`

**Properties**
- `kind: "array"` - The kind of the type.
- `length: number` - The length of the array.
- `type: AbiType` - The type of the array elements.

### BasicType

A basic type.

**Properties**
- `kind: T` - The kind of the type.

### BasicValue

A basic value.

**Properties**
- `kind: T` - The kind of the value.
- `value: V`

### ContractArtifact

Defines artifact of a contract.

**Properties**
- `fileMap: DebugFileMap` - The map of file ID to the source code and path of the file.
- `functions: FunctionArtifact[]` - The functions of the contract. Includes private and utility functions, plus the public dispatch function.
- `name: string` - The name of the contract.
- `nonDispatchPublicFunctions: FunctionAbi[]` - The public functions of the contract, excluding dispatch.
- `outputs: { globals: Record<string, AbiValue[]>; structs: Record<string, AbiType[]> }` - The outputs of the contract.
- `storageLayout: Record<string, FieldLayout>` - Storage layout

### ContractClass

A Contract Class in the protocol. Aztec differentiates contracts classes and instances, where a contract class represents the code of the contract, but holds no state. Classes are identified by an id that is a commitment to all its data.

**Properties**
- `artifactHash: Fr` - Hash of the contract artifact. The specification of this hash is not enforced by the protocol. Should include commitments to code of utility functions and compilation metadata. Intended to be used by clients to verify that an offchain fetched artifact matches a registered class.
- `packedBytecode: Buffer` - Bytecode for the public_dispatch function, or empty.
- `privateFunctions: PrivateFunction[]` - List of individual private functions, constructors included.
- `version: 1` - Version of the contract class.

### ContractDataSource

**Methods**
- `getBlockNumber() => Promise<BlockNumber>` - Gets the number of the latest L2 block processed by the implementation.
- `getBytecodeCommitment(id: Fr) => Promise<Fr | undefined>`
- `getContract(address: AztecAddress, timestamp?: bigint) => Promise<ContractInstanceWithAddress | undefined>` - Returns a publicly deployed contract instance given its address.
- `getContractClass(id: Fr) => Promise<ContractClassPublic | undefined>` - Returns the contract class for a given contract class id, or undefined if not found.
- `getContractClassIds() => Promise<Fr[]>` - Returns the list of all class ids known.
- `getDebugFunctionName(address: AztecAddress, selector: FunctionSelector) => Promise<string | undefined>` - Returns a function's name. It's only available if provided by calling `registerContractFunctionSignatures`.
- `registerContractFunctionSignatures(signatures: string[]) => Promise<void>` - Registers a function names. Useful for debugging.

### ContractFunctionDao

A contract function Data Access Object (DAO). Extends the FunctionArtifact interface, adding a 'selector' property. The 'selector' is a unique identifier for the function within the contract.

Extends: `FunctionArtifact`

**Properties**
- `bytecode: Buffer` - The ACIR bytecode of the function.
- `debug?: FunctionDebugMetadata` - Debug metadata for the function.
- `debugSymbols: string` - Maps opcodes to source code pointers
- `errorTypes: Partial<Record<string, AbiErrorType>>` - The types of the errors that the function can throw.
- `functionType: FunctionType` - Whether the function is secret.
- `isInitializer: boolean` - Whether the function is flagged as an initializer.
- `isOnlySelf: boolean` - Whether the function is marked as `#[only_self]` and hence callable only from within the contract.
- `isStatic: boolean` - Whether the function can alter state or not
- `name: string` - The name of the function.
- `parameters: { name: string; type: AbiType } & { visibility: "public" | "private" | "databus" }[]` - Function parameters.
- `returnTypes: AbiType[]` - The types of the return values.
- `selector: FunctionSelector` - Unique identifier for a contract function.
- `verificationKey?: string` - The verification key of the function, base64 encoded, if it's a private fn.

### ContractInstance

A contract instance is a concrete deployment of a contract class. It always references a contract class, which dictates what code it executes when called. It has state (both private and public), as well as an address that acts as its identifier. It can be called into. It may have encryption and nullifying public keys.

**Properties**
- `currentContractClassId: Fr` - Identifier of the contract class for this instance.
- `deployer: AztecAddress` - Optional deployer address or zero if this was a universal deploy.
- `initializationHash: Fr` - Hash of the selector and arguments to the constructor.
- `originalContractClassId: Fr` - Identifier of the original (at deployment) contract class for this instance
- `publicKeys: PublicKeys` - Public keys associated with this instance.
- `salt: Fr` - User-generated pseudorandom value for uniqueness.
- `version: 1` - Version identifier. Initially one, bumped for any changes to the contract instance struct.

### ContractInstanceUpdate

An update to a contract instance, changing its contract class.

**Properties**
- `newContractClassId: Fr` - Identifier of the new contract class for this instance.
- `prevContractClassId: Fr` - Identifier of the previous contract class for this instance
- `timestampOfChange: bigint` - The timestamp at which the contract class in use will be the new one

### DebugInfo

The debug information for a given function.

**Properties**
- `acir_locations: OpcodeToLocationsMap`
- `brillig_locations: Record<BrilligFunctionId, OpcodeToLocationsMap>` - For each Brillig function, we have a map of the opcode location to the source code location.
- `location_tree: LocationTree` - A map of the opcode location to the source code location.

### ExecutablePrivateFunction

Private function definition with executable bytecode.

Extends: `PrivateFunction`

**Properties**
- `bytecode: Buffer` - ACIR and Brillig bytecode
- `selector: FunctionSelector` - Selector of the function. Calculated as the hash of the method name and parameters. The specification of this is not enforced by the protocol.
- `vkHash: Fr` - Hash of the verification key associated to this private function.

### FunctionAbi

The abi entry of a function.

**Properties**
- `errorTypes: Partial<Record<string, AbiErrorType>>` - The types of the errors that the function can throw.
- `functionType: FunctionType` - Whether the function is secret.
- `isInitializer: boolean` - Whether the function is flagged as an initializer.
- `isOnlySelf: boolean` - Whether the function is marked as `#[only_self]` and hence callable only from within the contract.
- `isStatic: boolean` - Whether the function can alter state or not
- `name: string` - The name of the function.
- `parameters: { name: string; type: AbiType } & { visibility: "public" | "private" | "databus" }[]` - Function parameters.
- `returnTypes: AbiType[]` - The types of the return values.

### FunctionArtifact

The artifact entry of a function.

Extends: `FunctionAbi`

**Properties**
- `bytecode: Buffer` - The ACIR bytecode of the function.
- `debug?: FunctionDebugMetadata` - Debug metadata for the function.
- `debugSymbols: string` - Maps opcodes to source code pointers
- `errorTypes: Partial<Record<string, AbiErrorType>>` - The types of the errors that the function can throw.
- `functionType: FunctionType` - Whether the function is secret.
- `isInitializer: boolean` - Whether the function is flagged as an initializer.
- `isOnlySelf: boolean` - Whether the function is marked as `#[only_self]` and hence callable only from within the contract.
- `isStatic: boolean` - Whether the function can alter state or not
- `name: string` - The name of the function.
- `parameters: { name: string; type: AbiType } & { visibility: "public" | "private" | "databus" }[]` - Function parameters.
- `returnTypes: AbiType[]` - The types of the return values.
- `verificationKey?: string` - The verification key of the function, base64 encoded, if it's a private fn.

### FunctionArtifactWithContractName

The artifact entry of a function.

Extends: `FunctionArtifact`

**Properties**
- `bytecode: Buffer` - The ACIR bytecode of the function.
- `contractName: string` - The name of the contract.
- `debug?: FunctionDebugMetadata` - Debug metadata for the function.
- `debugSymbols: string` - Maps opcodes to source code pointers
- `errorTypes: Partial<Record<string, AbiErrorType>>` - The types of the errors that the function can throw.
- `functionType: FunctionType` - Whether the function is secret.
- `isInitializer: boolean` - Whether the function is flagged as an initializer.
- `isOnlySelf: boolean` - Whether the function is marked as `#[only_self]` and hence callable only from within the contract.
- `isStatic: boolean` - Whether the function can alter state or not
- `name: string` - The name of the function.
- `parameters: { name: string; type: AbiType } & { visibility: "public" | "private" | "databus" }[]` - Function parameters.
- `returnTypes: AbiType[]` - The types of the return values.
- `verificationKey?: string` - The verification key of the function, base64 encoded, if it's a private fn.

### FunctionDebugMetadata

Debug metadata for a function.

**Properties**
- `debugSymbols: DebugInfo` - Maps opcodes to source code pointers
- `files: DebugFileMap` - Maps the file IDs to the file contents to resolve pointers

### GasUsed

**Properties**
- `billedGas: Gas` - The gas billed for the transaction. This uses teardown gas limit instead of actual teardown gas.
- `publicGas: Gas` - Total gas used during public execution, including actual teardown gas
- `teardownGas: Gas` - The actual gas used in the teardown phase.
- `totalGas: Gas` - Total gas used across both private and public executions. Note that this does not determine the transaction fee. The fee is calculated with billedGas, which uses `teardownGasLimits` from `GasSettings`, rather than actual teardown gas.

### GlobalVariableBuilder

Interface for building global variables for Aztec blocks.

**Methods**
- `buildCheckpointGlobalVariables(coinbase: EthAddress, feeRecipient: AztecAddress, slotNumber: SlotNumber) => Promise<CheckpointGlobalVariables>` - Builds global variables that are constant throughout a checkpoint.
- `buildGlobalVariables(blockNumber: number, coinbase: EthAddress, feeRecipient: AztecAddress, slotNumber?: SlotNumber) => Promise<GlobalVariables>` - Builds global variables for a given block.
- `getCurrentMinFees() => Promise<GasFees>`

### IntegerType

An integer type.

Extends: `BasicType<"integer">`

**Properties**
- `kind: "integer"` - The kind of the type.
- `sign: "unsigned" | "signed"` - The sign of the integer.
- `width: number` - The width of the integer in bits.

### IntegerValue

A basic value.

Extends: `BasicValue<"integer", string>`

**Properties**
- `kind: "integer"` - The kind of the value.
- `sign: boolean`
- `value: string`

### L2BlockSink

Interface for classes that can receive and store L2 blocks.

**Methods**
- `addBlock(block: L2Block) => Promise<void>` - Adds a block to the store.

### L2BlockSource

Interface of classes allowing for the retrieval of L2 blocks.

**Methods**
- `getBlock(number: BlockNumber) => Promise<L2Block | undefined>` - Gets an l2 block. If a negative number is passed, the block returned is the most recent.
- `getBlockHeader(number: BlockNumber | "latest") => Promise<BlockHeader | undefined>` - Gets an l2 block header.
- `getBlockHeaderByArchive(archive: Fr) => Promise<BlockHeader | undefined>` - Gets a block header by its archive root.
- `getBlockHeaderByHash(blockHash: BlockHash) => Promise<BlockHeader | undefined>` - Gets a block header by its hash.
- `getBlockNumber() => Promise<BlockNumber>` - Gets the number of the latest L2 block processed by the block source implementation.
- `getBlocks(from: BlockNumber, limit: number) => Promise<L2Block[]>` - Gets up to `limit` amount of L2 blocks starting from `from`.
- `getBlocksForSlot(slotNumber: SlotNumber) => Promise<L2Block[]>` - Returns all blocks for a given slot.
- `getCheckpointedBlock(number: BlockNumber) => Promise<CheckpointedL2Block | undefined>` - Gets a checkpointed L2 block by block number. Returns undefined if the block doesn't exist or hasn't been checkpointed yet.
- `getCheckpointedBlockByArchive(archive: Fr) => Promise<CheckpointedL2Block | undefined>` - Gets a checkpointed block by its archive root.
- `getCheckpointedBlockByHash(blockHash: BlockHash) => Promise<CheckpointedL2Block | undefined>` - Gets a checkpointed block by its block hash.
- `getCheckpointedBlockHeadersForEpoch(epochNumber: EpochNumber) => Promise<BlockHeader[]>` - Returns all checkpointed block headers for a given epoch.
- `getCheckpointedBlocks(from: BlockNumber, limit: number) => Promise<CheckpointedL2Block[]>`
- `getCheckpointedBlocksForEpoch(epochNumber: EpochNumber) => Promise<CheckpointedL2Block[]>` - Returns all checkpointed blocks for a given epoch.
- `getCheckpointedL2BlockNumber() => Promise<BlockNumber>` - Gets the number of the latest L2 block checkpointed seen by the block source implementation.
- `getCheckpoints(checkpointNumber: CheckpointNumber, limit: number) => Promise<PublishedCheckpoint[]>` - Retrieves a collection of checkpoints.
- `getCheckpointsForEpoch(epochNumber: EpochNumber) => Promise<Checkpoint[]>` - Gets the checkpoints for a given epoch
- `getFinalizedL2BlockNumber() => Promise<BlockNumber>` - Computes the finalized block number based on the proven block number. A block is considered finalized when it's 2 epochs behind the proven block. Compute proper finalized block number based on L1 finalized block.
- `getGenesisValues() => Promise<{ genesisArchiveRoot: Fr }>` - Returns values for the genesis block
- `getL1Constants() => Promise<L1RollupConstants>` - Returns the rollup constants for the current chain.
- `getL1Timestamp() => Promise<bigint | undefined>` - Latest synced L1 timestamp.
- `getL2Block(number: BlockNumber) => Promise<L2Block | undefined>` - Gets an L2 block by block number.
- `getL2BlockByArchive(archive: Fr) => Promise<L2Block | undefined>` - Gets an L2 block by its archive root.
- `getL2BlockByHash(blockHash: BlockHash) => Promise<L2Block | undefined>` - Gets an L2 block by its hash.
- `getL2EpochNumber() => Promise<EpochNumber | undefined>` - Returns the current L2 epoch number based on the currently synced L1 timestamp.
- `getL2SlotNumber() => Promise<SlotNumber | undefined>` - Returns the current L2 slot number based on the currently synced L1 timestamp.
- `getL2Tips() => Promise<L2Tips>` - Returns the tips of the L2 chain.
- `getPendingChainValidationStatus() => Promise<ValidateCheckpointResult>` - Returns the status of the pending chain validation. If the chain is invalid, reports the earliest consecutive checkpoint that is invalid, along with the reason for being invalid, which can be used to trigger an invalidation.
- `getProvenBlockNumber() => Promise<BlockNumber>` - Gets the number of the latest L2 block proven seen by the block source implementation.
- `getRegistryAddress() => Promise<EthAddress>` - Method to fetch the registry contract address at the base-layer.
- `getRollupAddress() => Promise<EthAddress>` - Method to fetch the rollup contract address at the base-layer.
- `getSettledTxReceipt(txHash: TxHash) => Promise<TxReceipt | undefined>` - Gets a receipt of a settled tx.
- `getTxEffect(txHash: TxHash) => Promise<IndexedTxEffect | undefined>` - Gets a tx effect.
- `isEpochComplete(epochNumber: EpochNumber) => Promise<boolean>` - Returns whether the given epoch is completed on L1, based on the current L1 and L2 block numbers.
- `isPendingChainInvalid() => Promise<boolean>` - Returns whether the latest block in the pending chain on L1 is invalid (ie its attestations are incorrect). Note that invalid blocks do not get synced, so the latest block returned by the block source is always a valid one.
- `syncImmediate() => Promise<void>` - Force a sync.

### L2BlockSourceEventEmitter

Interface of classes allowing for the retrieval of L2 blocks.

Extends: `L2BlockSource`

**Properties**
- `events: ArchiverEmitter`

**Methods**
- `getBlock(number: BlockNumber) => Promise<L2Block | undefined>` - Gets an l2 block. If a negative number is passed, the block returned is the most recent.
- `getBlockHeader(number: BlockNumber | "latest") => Promise<BlockHeader | undefined>` - Gets an l2 block header.
- `getBlockHeaderByArchive(archive: Fr) => Promise<BlockHeader | undefined>` - Gets a block header by its archive root.
- `getBlockHeaderByHash(blockHash: BlockHash) => Promise<BlockHeader | undefined>` - Gets a block header by its hash.
- `getBlockNumber() => Promise<BlockNumber>` - Gets the number of the latest L2 block processed by the block source implementation.
- `getBlocks(from: BlockNumber, limit: number) => Promise<L2Block[]>` - Gets up to `limit` amount of L2 blocks starting from `from`.
- `getBlocksForSlot(slotNumber: SlotNumber) => Promise<L2Block[]>` - Returns all blocks for a given slot.
- `getCheckpointedBlock(number: BlockNumber) => Promise<CheckpointedL2Block | undefined>` - Gets a checkpointed L2 block by block number. Returns undefined if the block doesn't exist or hasn't been checkpointed yet.
- `getCheckpointedBlockByArchive(archive: Fr) => Promise<CheckpointedL2Block | undefined>` - Gets a checkpointed block by its archive root.
- `getCheckpointedBlockByHash(blockHash: BlockHash) => Promise<CheckpointedL2Block | undefined>` - Gets a checkpointed block by its block hash.
- `getCheckpointedBlockHeadersForEpoch(epochNumber: EpochNumber) => Promise<BlockHeader[]>` - Returns all checkpointed block headers for a given epoch.
- `getCheckpointedBlocks(from: BlockNumber, limit: number) => Promise<CheckpointedL2Block[]>`
- `getCheckpointedBlocksForEpoch(epochNumber: EpochNumber) => Promise<CheckpointedL2Block[]>` - Returns all checkpointed blocks for a given epoch.
- `getCheckpointedL2BlockNumber() => Promise<BlockNumber>` - Gets the number of the latest L2 block checkpointed seen by the block source implementation.
- `getCheckpoints(checkpointNumber: CheckpointNumber, limit: number) => Promise<PublishedCheckpoint[]>` - Retrieves a collection of checkpoints.
- `getCheckpointsForEpoch(epochNumber: EpochNumber) => Promise<Checkpoint[]>` - Gets the checkpoints for a given epoch
- `getFinalizedL2BlockNumber() => Promise<BlockNumber>` - Computes the finalized block number based on the proven block number. A block is considered finalized when it's 2 epochs behind the proven block. Compute proper finalized block number based on L1 finalized block.
- `getGenesisValues() => Promise<{ genesisArchiveRoot: Fr }>` - Returns values for the genesis block
- `getL1Constants() => Promise<L1RollupConstants>` - Returns the rollup constants for the current chain.
- `getL1Timestamp() => Promise<bigint | undefined>` - Latest synced L1 timestamp.
- `getL2Block(number: BlockNumber) => Promise<L2Block | undefined>` - Gets an L2 block by block number.
- `getL2BlockByArchive(archive: Fr) => Promise<L2Block | undefined>` - Gets an L2 block by its archive root.
- `getL2BlockByHash(blockHash: BlockHash) => Promise<L2Block | undefined>` - Gets an L2 block by its hash.
- `getL2EpochNumber() => Promise<EpochNumber | undefined>` - Returns the current L2 epoch number based on the currently synced L1 timestamp.
- `getL2SlotNumber() => Promise<SlotNumber | undefined>` - Returns the current L2 slot number based on the currently synced L1 timestamp.
- `getL2Tips() => Promise<L2Tips>` - Returns the tips of the L2 chain.
- `getPendingChainValidationStatus() => Promise<ValidateCheckpointResult>` - Returns the status of the pending chain validation. If the chain is invalid, reports the earliest consecutive checkpoint that is invalid, along with the reason for being invalid, which can be used to trigger an invalidation.
- `getProvenBlockNumber() => Promise<BlockNumber>` - Gets the number of the latest L2 block proven seen by the block source implementation.
- `getRegistryAddress() => Promise<EthAddress>` - Method to fetch the registry contract address at the base-layer.
- `getRollupAddress() => Promise<EthAddress>` - Method to fetch the rollup contract address at the base-layer.
- `getSettledTxReceipt(txHash: TxHash) => Promise<TxReceipt | undefined>` - Gets a receipt of a settled tx.
- `getTxEffect(txHash: TxHash) => Promise<IndexedTxEffect | undefined>` - Gets a tx effect.
- `isEpochComplete(epochNumber: EpochNumber) => Promise<boolean>` - Returns whether the given epoch is completed on L1, based on the current L1 and L2 block numbers.
- `isPendingChainInvalid() => Promise<boolean>` - Returns whether the latest block in the pending chain on L1 is invalid (ie its attestations are incorrect). Note that invalid blocks do not get synced, so the latest block returned by the block source is always a valid one.
- `syncImmediate() => Promise<void>` - Force a sync.

### L2BlockStreamEventHandler

Interface to a handler of events emitted.

**Methods**
- `handleBlockStreamEvent(event: L2BlockStreamEvent) => Promise<void>`

### L2BlockStreamLocalDataProvider

Interface to the local view of the chain. Implemented by world-state and l2-tips-store.

**Methods**
- `getL2BlockHash(number: number) => Promise<string | undefined>`
- `getL2Tips() => Promise<L2Tips>`

### NodeInfo

Provides basic information about the running node.

**Properties**
- `enr: string | undefined` - The node's ENR.
- `l1ChainId: number` - L1 chain id.
- `l1ContractAddresses: L1ContractAddresses` - The deployed l1 contract addresses
- `nodeVersion: string` - Version as tracked in the aztec-packages repository.
- `protocolContractAddresses: ProtocolContractAddresses` - Protocol contract addresses
- `rollupVersion: number` - Rollup version.

### PrivateFunction

Private function definition within a contract class.

**Properties**
- `selector: FunctionSelector` - Selector of the function. Calculated as the hash of the method name and parameters. The specification of this is not enforced by the protocol.
- `vkHash: Fr` - Hash of the verification key associated to this private function.

### ProgramDebugInfo

The debug information for a given program (a collection of functions)

**Properties**
- `debug_infos: DebugInfo[]` - A list of debug information that matches with each function in a program

### ProvingStats

**Properties**
- `nodeRPCCalls?: NodeStats`
- `timings: ProvingTimings`

### SimulationStats

**Properties**
- `nodeRPCCalls: NodeStats`
- `timings: SimulationTimings`

### SimulationTimings

**Properties**
- `perFunction: FunctionTiming[]`
- `publicSimulation?: number`
- `sync: number`
- `total: number`
- `unaccounted: number`
- `validation?: number`

### StringType

A string type.

Extends: `BasicType<"string">`

**Properties**
- `kind: "string"` - The kind of the type.
- `length: number` - The length of the string.

### StructType

A struct type.

Extends: `BasicType<"struct">`

**Properties**
- `fields: { name: string; type: AbiType }[]` - The fields of the struct.
- `kind: "struct"` - The kind of the type.
- `path: string` - Fully qualified name of the struct.

### StructValue

**Properties**
- `fields: TypedStructFieldValue<AbiValue>[]`
- `kind: "struct"`

### TupleType

A tuple type.

Extends: `BasicType<"tuple">`

**Properties**
- `fields: AbiType[]` - The types of the tuple elements.
- `kind: "tuple"` - The kind of the type.

### TupleValue

**Properties**
- `fields: AbiValue[]`
- `kind: "tuple"`

### TxValidator

**Methods**
- `validateTx(tx: T) => Promise<TxValidationResult>`

### UtilityFunction

Utility function definition.

**Properties**
- `bytecode: Buffer` - Brillig.
- `selector: FunctionSelector` - Selector of the function. Calculated as the hash of the method name and parameters. The specification of this is not enforced by the protocol.

## Functions

### accumulatePrivateReturnValues
```typescript
function accumulatePrivateReturnValues(executionResult: PrivateExecutionResult) => NestedProcessReturnValues
```
Recursively accummulate the return values of a call result and its nested executions, so they can be retrieved in order.

### bufferAsFields
```typescript
function bufferAsFields(input: Buffer, targetLength: number) => Fr[]
```
Formats a buffer as an array of fields. Splits the input into 31-byte chunks, and stores each of them into a field, omitting the field's first byte, then adds zero-fields at the end until the max length.

### bufferFromFields
```typescript
function bufferFromFields(fields: Fr[]) => Buffer
```
Recovers a buffer from an array of fields.

### collectNested
```typescript
function collectNested<T>(executionStack: PrivateCallExecutionResult[], extractExecutionItems: (execution: PrivateCallExecutionResult) => T[]) => T[]
```

### collectNoteHashNullifierCounterMap
```typescript
function collectNoteHashNullifierCounterMap(execResult: PrivateExecutionResult) => Map<number, number>
```

### collectOffchainEffects
```typescript
function collectOffchainEffects(execResult: PrivateExecutionResult) => OffchainEffect[]
```
Collect all offchain effects emitted across all nested executions.

### collectSortedContractClassLogs
```typescript
function collectSortedContractClassLogs(execResult: PrivateExecutionResult) => ContractClassLogFields[]
```
Collect all contract class logs across all nested executions and sorts by counter.

### computeAddress
```typescript
function computeAddress(publicKeys: PublicKeys, partialAddress: Fr) => Promise<AztecAddress>
```

### computeAddressSecret
```typescript
function computeAddressSecret(preaddress: Fr, ivsk: Fq) => Promise<Fq>
```

### computeAppNullifierHidingKey
```typescript
function computeAppNullifierHidingKey(masterNullifierHidingKey: Fq, app: AztecAddress) => Promise<Fr>
```

### computeAppSecretKey
```typescript
function computeAppSecretKey(skM: Fq, app: AztecAddress, keyPrefix: KeyPrefix) => Promise<Fr>
```

### computeArtifactFunctionTree
```typescript
function computeArtifactFunctionTree(artifact: ContractArtifact, fnType: FunctionType) => Promise<MerkleTree | undefined>
```

### computeArtifactFunctionTreeRoot
```typescript
function computeArtifactFunctionTreeRoot(artifact: ContractArtifact, fnType: FunctionType) => Promise<Fr>
```

### computeArtifactHash
```typescript
function computeArtifactHash(artifact: ContractArtifact | { metadataHash: Fr; privateFunctionRoot: Fr; utilityFunctionRoot: Fr }) => Promise<Fr>
```
Returns the artifact hash of a given compiled contract artifact. ``` private_functions_artifact_leaves = artifact.private_functions.map fn => sha256(fn.selector, fn.metadata_hash, sha256(fn.bytecode)) private_functions_artifact_tree_root = merkleize(private_functions_artifact_leaves) utility_functions_artifact_leaves = artifact.utility_functions.map fn => sha256(fn.selector, fn.metadata_hash, sha256(fn.bytecode)) utility_functions_artifact_tree_root = merkleize(utility_functions_artifact_leaves) version = 1 artifact_hash = sha256( version, private_functions_artifact_tree_root, utility_functions_artifact_tree_root, artifact_metadata, ) ```

### computeArtifactHashPreimage
```typescript
function computeArtifactHashPreimage(artifact: ContractArtifact) => Promise<{ metadataHash: Fr; privateFunctionRoot: Fr; utilityFunctionRoot: Fr }>
```

### computeArtifactMetadataHash
```typescript
function computeArtifactMetadataHash(artifact: ContractArtifact) => Fr
```

### computeCalldataHash
```typescript
function computeCalldataHash(calldata: Fr[]) => Promise<Fr>
```
Computes the hash of a public function's calldata.

### computeContractAddressFromInstance
```typescript
function computeContractAddressFromInstance(instance: ContractInstance | { originalContractClassId: Fr; saltedInitializationHash: Fr } & Pick<ContractInstance, "publicKeys">) => Promise<AztecAddress>
```
Returns the deployment address for a given contract instance. ``` salted_initialization_hash = pedersen([salt, initialization_hash, deployer], GENERATOR__SALTED_INITIALIZATION_HASH) partial_address = pedersen([contract_class_id, salted_initialization_hash], GENERATOR__CONTRACT_PARTIAL_ADDRESS_V1) address = ((poseidon2Hash([public_keys_hash, partial_address, GENERATOR__CONTRACT_ADDRESS_V1]) * G) + ivpk_m).x <- the x-coordinate of the address point ```

### computeContractClassId
```typescript
function computeContractClassId(contractClass: ContractClass | ContractClassIdPreimage) => Promise<Fr>
```
Returns the id of a contract class computed as its hash. ``` version = 1 private_function_leaves = private_functions.map(fn => pedersen([fn.function_selector as Field, fn.vk_hash], GENERATOR__PRIVATE_FUNCTION_LEAF)) private_functions_root = merkleize(private_function_leaves) bytecode_commitment = calculate_commitment(packed_bytecode) contract_class_id = pedersen([version, artifact_hash, private_functions_root, bytecode_commitment], GENERATOR__CLASS_IDENTIFIER) ```

### computeContractClassIdPreimage
```typescript
function computeContractClassIdPreimage(contractClass: ContractClass) => Promise<ContractClassIdPreimage>
```
Returns the preimage of a contract class id given a contract class.

### computeContractClassIdWithPreimage
```typescript
function computeContractClassIdWithPreimage(contractClass: ContractClass | ContractClassIdPreimage) => Promise<ContractClassIdPreimage & { id: Fr }>
```
Computes a contract class id and returns it along with its preimage.

### computeFunctionArtifactHash
```typescript
function computeFunctionArtifactHash(fn: FunctionArtifact | Pick<FunctionArtifact, "bytecode"> & { functionMetadataHash: Fr; selector: FunctionSelector }) => Promise<Fr>
```

### computeFunctionMetadataHash
```typescript
function computeFunctionMetadataHash(fn: FunctionArtifact) => Fr
```

### computeInitializationHash
```typescript
function computeInitializationHash(initFn: FunctionAbi | undefined, args: any[]) => Promise<Fr>
```
Computes the initialization hash for an instance given its constructor function and arguments.

### computeInitializationHashFromEncodedArgs
```typescript
function computeInitializationHashFromEncodedArgs(initFn: FunctionSelector, encodedArgs: Fr[]) => Promise<Fr>
```
Computes the initialization hash for an instance given its constructor function selector and encoded arguments.

### computeL1ToL2MessageNullifier
```typescript
function computeL1ToL2MessageNullifier(contract: AztecAddress, messageHash: Fr, secret: Fr) => Promise<Fr>
```

### computeL2ToL1MessageHash
```typescript
function computeL2ToL1MessageHash(__namedParameters: { chainId: Fr; content: Fr; ... }) => Fr
```
Calculates a siloed hash of a scoped l2 to l1 message.

### computeNoteHashNonce
```typescript
function computeNoteHashNonce(nullifierZero: Fr, noteHashIndex: number) => Promise<Fr>
```
Computes a note hash nonce, which will be used to create a unique note hash.

### computeOvskApp
```typescript
function computeOvskApp(ovsk: Fq, app: AztecAddress) => Promise<Fq>
```

### computePartialAddress
```typescript
function computePartialAddress(instance: Pick<ContractInstance, "salt" | "deployer" | "originalContractClassId" | "initializationHash"> | { originalContractClassId: Fr; saltedInitializationHash: Fr }) => Promise<Fr>
```
Computes the partial address defined as the hash of the contract class id and salted initialization hash.

### computePreaddress
```typescript
function computePreaddress(publicKeysHash: Fr, partialAddress: Fr) => Promise<Fr>
```

### computePrivateFunctionLeaf
```typescript
function computePrivateFunctionLeaf(fn: PrivateFunction) => Promise<Buffer<ArrayBufferLike>>
```
Returns the leaf for a given private function.

### computePrivateFunctionsRoot
```typescript
function computePrivateFunctionsRoot(fns: PrivateFunction[]) => Promise<Fr>
```
Returns the Merkle tree root for the set of private functions in a contract.

### computePrivateFunctionsTree
```typescript
function computePrivateFunctionsTree(fns: PrivateFunction[]) => Promise<MerkleTree>
```
Returns a Merkle tree for the set of private functions in a contract.

### computeProtocolNullifier
```typescript
function computeProtocolNullifier(txRequestHash: Fr) => Promise<Fr>
```
Computes the protocol nullifier, which is the hash of the initial tx request siloed with the null msg sender address.

### computePublicBytecodeCommitment
```typescript
function computePublicBytecodeCommitment(packedBytecode: Buffer) => Promise<Fr>
```

### computePublicDataTreeLeafSlot
```typescript
function computePublicDataTreeLeafSlot(contractAddress: AztecAddress, storageSlot: Fr) => Promise<Fr>
```
Computes a public data tree index from contract address and storage slot.

### computePublicDataTreeValue
```typescript
function computePublicDataTreeValue(value: Fr) => Fr
```
Computes a public data tree value ready for insertion.

### computeSaltedInitializationHash
```typescript
function computeSaltedInitializationHash(instance: Pick<ContractInstance, "initializationHash" | "salt" | "deployer">) => Promise<Fr>
```
Computes the salted initialization hash for an address, defined as the hash of the salt and initialization hash.

### computeSecretHash
```typescript
function computeSecretHash(secret: Fr) => Promise<Fr>
```
Computes a hash of a secret.

### computeUniqueNoteHash
```typescript
function computeUniqueNoteHash(noteNonce: Fr, siloedNoteHash: Fr) => Promise<Fr>
```
Computes a unique note hash.

### computeVarArgsHash
```typescript
function computeVarArgsHash(args: Fr[]) => Promise<Fr>
```
Computes the hash of a list of arguments. Used for input arguments or return values for private functions, or for authwit creation.

### computeVerificationKeyHash
```typescript
function computeVerificationKeyHash(f: FunctionArtifact) => Promise<Fr>
```
For a given private function, computes the hash of its vk.

### contractArtifactFromBuffer
```typescript
function contractArtifactFromBuffer(buffer: Buffer) => ContractArtifact
```
Deserializes a contract artifact from storage.

### contractArtifactToBuffer
```typescript
function contractArtifactToBuffer(artifact: ContractArtifact) => Buffer
```
Serializes a contract artifact to a buffer for storage.

### contractClassPublicFromPlainObject
```typescript
function contractClassPublicFromPlainObject(obj: any) => ContractClassPublic
```
Creates a ContractClassPublic from a plain object without Zod validation. Suitable for deserializing trusted data (e.g., from C++ via MessagePack). Note: privateFunctions and utilityFunctions are set to empty arrays since C++ does not provide them.

### contractInstanceFromPlainObject
```typescript
function contractInstanceFromPlainObject(obj: any) => ContractInstance
```
Creates a ContractInstance from a plain object without Zod validation. Suitable for deserializing trusted data (e.g., from C++ via MessagePack).

### contractInstanceWithAddressFromPlainObject
```typescript
function contractInstanceWithAddressFromPlainObject(address: AztecAddress, obj: any) => ContractInstanceWithAddress
```
Creates a ContractInstanceWithAddress from a plain object without Zod validation. Suitable for deserializing trusted data (e.g., from C++ via MessagePack).

### countArgumentsSize
```typescript
function countArgumentsSize(abi: FunctionAbi) => number
```
Returns the size of the arguments for a function ABI.

### createPrivateFunctionMembershipProof
```typescript
function createPrivateFunctionMembershipProof(selector: FunctionSelector, artifact: ContractArtifact) => Promise<PrivateFunctionMembershipProof>
```
Creates a membership proof for a private function in a contract class, to be verified via `isValidPrivateFunctionMembershipProof`.

### createUtilityFunctionMembershipProof
```typescript
function createUtilityFunctionMembershipProof(selector: FunctionSelector, artifact: ContractArtifact) => Promise<UtilityFunctionMembershipProof>
```
Creates a membership proof for a utility function in a contract class, to be verified via `isValidUtilityFunctionMembershipProof`.

### dataInBlockSchemaFor
```typescript
function dataInBlockSchemaFor<T extends ZodTypeAny>(schema: T) => ZodObject<{ l2BlockHash: ZodFor<BlockHash>; l2BlockNumber: ZodEffects<ZodPipeline<ZodUnion<[]>, ZodNumber>, BlockNumber, string | number | bigint> } & { data: T }, "strip", ZodTypeAny, { [key: string]: unknown }, { [key: string]: unknown }>
```

### decodeFromAbi
```typescript
function decodeFromAbi(typ: AbiType[], buffer: Fr[]) => AbiDecoded
```
Decodes values in a flattened Field array using a provided ABI.

### decodeFunctionSignature
```typescript
function decodeFunctionSignature(name: string, parameters: { name: string; type: AbiType } & { visibility: "public" | "private" | "databus" }[]) => string
```
Decodes a function signature from the name and parameters.

### decodeFunctionSignatureWithParameterNames
```typescript
function decodeFunctionSignatureWithParameterNames(name: string, parameters: { name: string; type: AbiType } & { visibility: "public" | "private" | "databus" }[]) => string
```
Decodes a function signature from the name and parameters including parameter names.

### deriveEcdhSharedSecret
```typescript
function deriveEcdhSharedSecret(secretKey: Fq, publicKey: Point) => Promise<Point>
```
Derive an Elliptic Curve Diffie-Hellman (ECDH) Shared Secret. The function takes in an ECDH public key, a private key, and a Grumpkin instance to compute the shared secret.

### deriveKeys
```typescript
function deriveKeys(secretKey: Fr) => Promise<{ masterIncomingViewingSecretKey: Fq; masterNullifierHidingKey: Fq; ... }>
```
Computes secret and public keys and public keys hash from a secret key.

### deriveMasterIncomingViewingSecretKey
```typescript
function deriveMasterIncomingViewingSecretKey(secretKey: Fr) => Fq
```

### deriveMasterNullifierHidingKey
```typescript
function deriveMasterNullifierHidingKey(secretKey: Fr) => Fq
```

### deriveMasterOutgoingViewingSecretKey
```typescript
function deriveMasterOutgoingViewingSecretKey(secretKey: Fr) => Fq
```

### derivePublicKeyFromSecretKey
```typescript
function derivePublicKeyFromSecretKey(secretKey: Fq) => Promise<Point>
```

### deriveSigningKey
```typescript
function deriveSigningKey(secretKey: Fr) => Fq
```

### deriveStorageSlotInMap
```typescript
function deriveStorageSlotInMap(mapSlot: bigint | Fr, key: { toField: () => Fr }) => Promise<Fr>
```
Computes the resulting storage slot for an entry in a map.

### deserializeBlockInfo
```typescript
function deserializeBlockInfo(buffer: Buffer<ArrayBufferLike> | BufferReader) => L2BlockInfo
```

### deserializeIndexedTxEffect
```typescript
function deserializeIndexedTxEffect(buffer: Buffer) => IndexedTxEffect
```

### deserializeValidateCheckpointResult
```typescript
function deserializeValidateCheckpointResult(bufferOrReader: Buffer<ArrayBufferLike> | BufferReader) => ValidateCheckpointResult
```

### emptyContractArtifact
```typescript
function emptyContractArtifact() => ContractArtifact
```

### emptyFunctionAbi
```typescript
function emptyFunctionAbi() => FunctionAbi
```

### emptyFunctionArtifact
```typescript
function emptyFunctionArtifact() => FunctionArtifact
```

### encodeArguments
```typescript
function encodeArguments(abi: FunctionAbi, args: any[]) => Fr[]
```
Encodes all the arguments for a function call.

### gasUsedFromPlainObject
```typescript
function gasUsedFromPlainObject(obj: any) => GasUsed
```
Creates a GasUsed from a plain object without Zod validation. This method is optimized for performance and skips validation, making it suitable for deserializing trusted data (e.g., from C++ via MessagePack).

### getAllFunctionAbis
```typescript
function getAllFunctionAbis(artifact: ContractArtifact) => FunctionAbi[]
```
Gets all function abis

### getArtifactMerkleTreeHasher
```typescript
function getArtifactMerkleTreeHasher() => (l: Buffer, r: Buffer) => Promise<Buffer<ArrayBuffer>>
```

### getAttestationInfoFromPayload
```typescript
function getAttestationInfoFromPayload(payload: ConsensusPayload, attestations: CommitteeAttestation[]) => AttestationInfo[]
```

### getAttestationInfoFromPublishedCheckpoint
```typescript
function getAttestationInfoFromPublishedCheckpoint(block: { attestations: CommitteeAttestation[]; checkpoint: Checkpoint }) => AttestationInfo[]
```
Extracts attestation information from a published checkpoint. Returns info for each attestation, preserving array indices.

### getContractClassFromArtifact
```typescript
function getContractClassFromArtifact(artifact: ContractArtifact | ContractArtifactWithHash) => Promise<ContractClass & Pick<ContractClassCommitments, "id"> & ContractClassIdPreimage>
```
Creates a ContractClass from a contract compilation artifact.

### getContractClassPrivateFunctionFromArtifact
```typescript
function getContractClassPrivateFunctionFromArtifact(f: FunctionArtifact) => Promise<PrivateFunction>
```

### getContractInstanceFromInstantiationParams
```typescript
function getContractInstanceFromInstantiationParams(artifact: ContractArtifact, opts: ContractInstantiationData) => Promise<ContractInstanceWithAddress>
```
Generates a Contract Instance from some instantiation params.

### getDefaultInitializer
```typescript
function getDefaultInitializer(contractArtifact: ContractArtifact) => FunctionAbi | undefined
```
Returns an initializer from the contract, assuming there is at least one. If there are multiple initializers, it returns the one named "constructor" or "initializer"; if there is none with that name, it returns the first initializer it finds, prioritizing initializers with no arguments and then private ones.

### getFinalMinRevertibleSideEffectCounter
```typescript
function getFinalMinRevertibleSideEffectCounter(execResult: PrivateExecutionResult) => number
```

### getFunctionArtifact
```typescript
function getFunctionArtifact(artifact: ContractArtifact, functionNameOrSelector: string | FunctionSelector) => Promise<FunctionArtifactWithContractName>
```
Gets a function artifact including debug metadata given its name or selector.

### getFunctionArtifactByName
```typescript
function getFunctionArtifactByName(artifact: ContractArtifact, functionName: string) => FunctionArtifact
```

### getFunctionDebugMetadata
```typescript
function getFunctionDebugMetadata(contractArtifact: ContractArtifact, functionArtifact: FunctionArtifact) => FunctionDebugMetadata | undefined
```
Gets the debug metadata of a given function from the contract artifact

### getInitializer
```typescript
function getInitializer(contract: ContractArtifact, initializerNameOrArtifact: string | FunctionArtifact | undefined) => FunctionAbi | undefined
```
Returns an initializer from the contract.

### getKeyGenerator
```typescript
function getKeyGenerator(prefix: KeyPrefix) => KeyGenerator
```

### getTxHash
```typescript
function getTxHash(tx: AnyTx) => TxHash
```

### hasPublicCalls
```typescript
function hasPublicCalls(tx: AnyTx) => boolean
```

### hashVK
```typescript
function hashVK(keyAsFields: Fr[]) => Promise<Fr>
```
Computes a hash of a given verification key.

### inBlockSchema
```typescript
function inBlockSchema() => ZodObject<{ l2BlockHash: ZodFor<BlockHash>; l2BlockNumber: ZodEffects<ZodPipeline<ZodUnion<[]>, ZodNumber>, BlockNumber, string | number | bigint> }, "strip", ZodTypeAny, { l2BlockHash: BlockHash; l2BlockNumber: number & { _branding: "BlockNumber" } }, { l2BlockHash?: any; l2BlockNumber: string | number | bigint }>
```

### inTxSchema
```typescript
function inTxSchema() => ZodIntersection<ZodObject<{ l2BlockHash: ZodFor<BlockHash>; l2BlockNumber: ZodEffects<ZodPipeline<ZodUnion<[]>, ZodNumber>, BlockNumber, string | number | bigint> }, "strip", ZodTypeAny, { l2BlockHash: BlockHash; l2BlockNumber: number & { _branding: "BlockNumber" } }, { l2BlockHash?: any; l2BlockNumber: string | number | bigint }>, ZodObject<{ txHash: ZodEffects<ZodEffects<ZodEffects<ZodEffects<ZodString, string, string>, string, string>, Buffer<ArrayBuffer>, string>, TxHash, string> }, "strip", ZodTypeAny, { txHash: TxHash }, { txHash: string }>>
```

### indexedTxSchema
```typescript
function indexedTxSchema() => ZodObject<{ l2BlockHash: ZodFor<BlockHash>; l2BlockNumber: ZodEffects<ZodPipeline<ZodUnion<[]>, ZodNumber>, BlockNumber, string | number | bigint> } & { data: ZodFor<TxEffect> } & { txIndexInBlock: ZodPipeline<ZodUnion<[]>, ZodNumber> }, "strip", ZodTypeAny, { data: TxEffect; l2BlockHash: BlockHash; ... }, { data?: any; l2BlockHash?: any; ... }>
```

### isAddressStruct
```typescript
function isAddressStruct(abiType: AbiType) => boolean
```
Returns whether the ABI type is an Aztec or Ethereum Address defined in Aztec.nr.

### isAztecAddressStruct
```typescript
function isAztecAddressStruct(abiType: AbiType) => boolean
```
Returns whether the ABI type is an Aztec Address defined in Aztec.nr.

### isBoundedVecStruct
```typescript
function isBoundedVecStruct(abiType: AbiType) => boolean
```
Returns whether the ABI type is a BoundedVec struct from Noir's std::collections::bounded_vec.

### isEthAddressStruct
```typescript
function isEthAddressStruct(abiType: AbiType) => boolean
```
Returns whether the ABI type is an Ethereum Address defined in Aztec.nr.

### isFunctionSelectorStruct
```typescript
function isFunctionSelectorStruct(abiType: AbiType) => boolean
```
Returns whether the ABI type is an Function Selector defined in Aztec.nr.

### isPublicKeysStruct
```typescript
function isPublicKeysStruct(abiType: AbiType) => boolean
```
Returns whether the ABI type is a PublicKeys struct from Aztec.nr.

### isValidPrivateFunctionMembershipProof
```typescript
function isValidPrivateFunctionMembershipProof(fn: ExecutablePrivateFunctionWithMembershipProof, contractClass: Pick<ContractClassPublic, "privateFunctionsRoot" | "artifactHash">) => Promise<boolean>
```
Verifies that a private function with a membership proof as emitted by the ClassRegistry contract is valid, as defined in the protocol specs at contract-deployment/classes: ``` // Load contract class from local db contract_class = db.get_contract_class(contract_class_id) // Compute function leaf and assert it belongs to the private functions tree function_leaf = pedersen([selector as Field, vk_hash], GENERATOR__PRIVATE_FUNCTION_LEAF) computed_private_function_tree_root = compute_root(function_leaf, private_function_tree_sibling_path) assert computed_private_function_tree_root == contract_class.private_functions_root // Compute artifact leaf and assert it belongs to the artifact artifact_function_leaf = sha256(selector, metadata_hash, sha256(bytecode)) computed_artifact_private_function_tree_root = compute_root(artifact_function_leaf, artifact_function_tree_sibling_path) computed_artifact_hash = sha256(computed_artifact_private_function_tree_root, utility_functions_artifact_tree_root, artifact_metadata_hash) assert computed_artifact_hash == contract_class.artifact_hash ```

### isValidUtilityFunctionMembershipProof
```typescript
function isValidUtilityFunctionMembershipProof(fn: UtilityFunctionWithMembershipProof, contractClass: Pick<ContractClassPublic, "artifactHash">) => Promise<boolean>
```
Verifies that a utility function with a membership proof as emitted by the ClassRegistry contract is valid, as defined in the protocol specs at contract-deployment/classes: ``` // Load contract class from local db contract_class = db.get_contract_class(contract_class_id) // Compute artifact leaf and assert it belongs to the artifact artifact_function_leaf = sha256(selector, metadata_hash, sha256(bytecode)) computed_artifact_utility_function_tree_root = compute_root(artifact_function_leaf, artifact_function_tree_sibling_path, artifact_function_tree_leaf_index) computed_artifact_hash = sha256(private_functions_artifact_tree_root, computed_artifact_utility_function_tree_root, artifact_metadata_hash) assert computed_artifact_hash == contract_class.artifact_hash ```

### isWrappedFieldStruct
```typescript
function isWrappedFieldStruct(abiType: AbiType) => boolean
```
Returns whether the ABI type is a struct with a single `inner` field.

### loadContractArtifact
```typescript
function loadContractArtifact(input: NoirCompiledContract) => ContractArtifact
```
Gets nargo build output and returns a valid contract artifact instance. Does not include public bytecode, apart from the public_dispatch function.

### loadContractArtifactForPublic
```typescript
function loadContractArtifactForPublic(input: NoirCompiledContract) => ContractArtifact
```
Gets nargo build output and returns a valid contract artifact instance. Differs from loadContractArtifact() by retaining all bytecode.

### makeEmptyProof
```typescript
function makeEmptyProof() => Proof
```
Makes an empty proof. Note: Used for local devnet milestone where we are not proving anything yet.

### makeEmptyRecursiveProof
```typescript
function makeEmptyRecursiveProof<N extends number>(size: N) => RecursiveProof<N>
```
Makes an empty proof. Note: Used for local devnet milestone where we are not proving anything yet.

### makeL2BlockId
```typescript
function makeL2BlockId(number: BlockNumber, hash?: string) => L2BlockId
```
Creates an L2 block id

### makeL2CheckpointId
```typescript
function makeL2CheckpointId(number: CheckpointNumber, hash: string) => CheckpointId
```
Creates an L2 checkpoint id

### makeProcessedTxFromPrivateOnlyTx
```typescript
function makeProcessedTxFromPrivateOnlyTx(tx: Tx, transactionFee: Fr, feePaymentPublicDataWrite: PublicDataWrite, globalVariables: GlobalVariables) => ProcessedTx
```

### makeProcessedTxFromTxWithPublicCalls
```typescript
function makeProcessedTxFromTxWithPublicCalls(tx: Tx, globalVariables: GlobalVariables, avmProvingRequest: { inputs: AvmCircuitInputs; type: PUBLIC_VM } | undefined, publicTxEffect: PublicTxEffect, gasUsed: GasUsed, revertCode: RevertCode, revertReason: SimulationError | undefined) => ProcessedTx
```

### makeRecursiveProof
```typescript
function makeRecursiveProof<PROOF_LENGTH extends number>(size: PROOF_LENGTH, seed: number) => RecursiveProof<PROOF_LENGTH>
```

### makeRecursiveProofFromBinary
```typescript
function makeRecursiveProofFromBinary<PROOF_LENGTH extends number>(proof: Proof, size: PROOF_LENGTH) => RecursiveProof<PROOF_LENGTH>
```
Makes an instance of the recursive proof from a binary only proof

### mergeExecutionPayloads
```typescript
function mergeExecutionPayloads(requests: ExecutionPayload[]) => ExecutionPayload
```
Merges an array ExecutionPayloads combining their calls, authWitnesses, capsules and extraArgHashes.

### parseDebugSymbols
```typescript
function parseDebugSymbols(debugSymbols: string) => DebugInfo[]
```

### parseSignedInt
```typescript
function parseSignedInt(b: Buffer, width?: number) => bigint
```
Returns a bigint by parsing a serialized 2's complement signed int.

### randomBlockInfo
```typescript
function randomBlockInfo(blockNumber?: number | BlockNumber) => L2BlockInfo
```

### randomDataInBlock
```typescript
function randomDataInBlock<T>(data: T) => DataInBlock<T>
```

### randomInBlock
```typescript
function randomInBlock() => InBlock
```

### randomInTx
```typescript
function randomInTx() => InTx
```

### randomIndexedTxEffect
```typescript
function randomIndexedTxEffect() => Promise<IndexedTxEffect>
```

### retainBytecode
```typescript
function retainBytecode(input: FunctionArtifact | NoirFunctionEntry) => boolean
```
Returns true if we should retain bytecode

### serializeBlockInfo
```typescript
function serializeBlockInfo(blockInfo: L2BlockInfo) => Buffer
```

### serializeIndexedTxEffect
```typescript
function serializeIndexedTxEffect(effect: IndexedTxEffect) => Buffer
```

### serializeValidateCheckpointResult
```typescript
function serializeValidateCheckpointResult(result: ValidateCheckpointResult) => Buffer
```

### siloNoteHash
```typescript
function siloNoteHash(contract: AztecAddress, noteHash: Fr) => Promise<Fr>
```
Computes a siloed note hash, given the contract address and the note hash itself. A siloed note hash effectively namespaces a note hash to a specific contract.

### siloNullifier
```typescript
function siloNullifier(contract: AztecAddress, innerNullifier: Fr) => Promise<Fr>
```
Computes a siloed nullifier, given the contract address and the inner nullifier. A siloed nullifier effectively namespaces a nullifier to a specific contract.

### wrapDataInBlock
```typescript
function wrapDataInBlock<T>(data: T, block: L2Block) => Promise<DataInBlock<T>>
```

## Types

### ABIParameter
```typescript
type ABIParameter = z.infer<typeof ABIParameterSchema>
```
A function parameter.

### ABIParameterVisibility
```typescript
type ABIParameterVisibility = readonly []
```
Indicates whether a parameter is public or secret/private.

### ABIVariable
```typescript
type ABIVariable = z.infer<typeof ABIVariableSchema>
```
A named type.

### AbiDecoded
```typescript
type AbiDecoded = bigint | boolean | string | AztecAddress | AbiDecoded[] | {}
```
The type of our decoded ABI.

### AbiErrorType
```typescript
type AbiErrorType = { error_kind: "string"; string: string } | { error_kind: "fmtstring"; item_types: AbiType[]; length: number } | { error_kind: "custom" } & AbiType
```
An error could be a custom error of any regular type or a string error.

### AbiType
```typescript
type AbiType = BasicType<"field"> | BasicType<"boolean"> | IntegerType | ArrayType | StringType | StructType | TupleType
```
A variable type.

### AbiValue
```typescript
type AbiValue = BasicValue<"boolean", boolean> | BasicValue<"string", string> | BasicValue<"array", AbiValue[]> | TupleValue | IntegerValue | StructValue
```
An exported value.

### AnyTx
```typescript
type AnyTx = Tx | ProcessedTx
```

### ArchiverEmitter
```typescript
type ArchiverEmitter = TypedEventEmitter<{ invalidCheckpointDetected: (args: InvalidCheckpointDetectedEvent) => void; l2BlockProven: (args: L2BlockProvenEvent) => void; ... }>
```
L2BlockSource that emits events upon pending / proven chain changes. see L2BlockSourceEvents for the events emitted.

### AttestationInfo
```typescript
type AttestationInfo = { address?: undefined; status: Extract<AttestationStatus, "invalid-signature" | "empty"> } | { address: EthAddress; status: Extract<AttestationStatus, "provided-as-address" | "recovered-from-signature"> }
```
Information about an attestation extracted from a published block

### AttestationStatus
```typescript
type AttestationStatus = "recovered-from-signature" | "provided-as-address" | "invalid-signature" | "empty"
```
Status indicating how the attestation address was determined

### BlockParameter
```typescript
type BlockParameter = z.infer<typeof BlockParameterSchema>
```
Block parameter - either a specific BlockNumber, block hash (BlockHash), or 'latest'

### BrilligFunctionId
```typescript
type BrilligFunctionId = number
```

### CHECKPOINT_PREFETCH_LIMIT
```typescript
type CHECKPOINT_PREFETCH_LIMIT = 50
```
Maximum number of checkpoints to prefetch at once during sync. Matches MAX_RPC_CHECKPOINTS_LEN.

### CheckpointGlobalVariables
```typescript
type CheckpointGlobalVariables = Omit<FieldsOf<GlobalVariables>, "blockNumber" | "timestamp">
```
Global variables that are constant across the entire slot. Should timestamp be included here as well?

### CheckpointId
```typescript
type CheckpointId = unknown
```

### ChonkProofData
```typescript
type ChonkProofData = ProofData<T, typeof CHONK_PROOF_LENGTH>
```

### ContractClassIdPreimage
```typescript
type ContractClassIdPreimage = unknown
```
Preimage of a contract class id.

### ContractClassPublic
```typescript
type ContractClassPublic = { privateFunctions: ExecutablePrivateFunctionWithMembershipProof[]; utilityFunctions: UtilityFunctionWithMembershipProof[] } & Pick<ContractClassCommitments, "id" | "privateFunctionsRoot"> & Omit<ContractClass, "privateFunctions">
```
A contract class with public bytecode information, and optional private and utility functions.

### ContractClassPublicWithBlockNumber
```typescript
type ContractClassPublicWithBlockNumber = { l2BlockNumber: number } & ContractClassPublic
```
The contract class with the block it was initially deployed at

### ContractClassPublicWithCommitment
```typescript
type ContractClassPublicWithCommitment = ContractClassPublic & Pick<ContractClassCommitments, "publicBytecodeCommitment">
```

### ContractClassWithId
```typescript
type ContractClassWithId = ContractClass & Pick<ContractClassCommitments, "id">
```
A contract class with its precomputed id.

### ContractInstanceUpdateWithAddress
```typescript
type ContractInstanceUpdateWithAddress = ContractInstanceUpdate & { address: AztecAddress }
```

### ContractInstanceWithAddress
```typescript
type ContractInstanceWithAddress = ContractInstance & { address: AztecAddress }
```

### ContractInstantiationData
```typescript
type ContractInstantiationData = unknown
```

### ContractOverrides
```typescript
type ContractOverrides = Record<string, { artifact: ContractArtifact; instance: ContractInstanceWithAddress }>
```

### DataInBlock
```typescript
type DataInBlock = { data: T } & InBlock
```

### DebugFileMap
```typescript
type DebugFileMap = Record<FileId, { path: string; source: string }>
```
Maps a file ID to its metadata for debugging purposes.

### DeploymentInfo
```typescript
type DeploymentInfo = unknown
```
Represents the data generated as part of contract deployment.

### EventMetadataDefinition
```typescript
type EventMetadataDefinition = unknown
```

### ExecutablePrivateFunctionWithMembershipProof
```typescript
type ExecutablePrivateFunctionWithMembershipProof = ExecutablePrivateFunction & PrivateFunctionMembershipProof
```
A private function with a membership proof.

### FailedTx
```typescript
type FailedTx = unknown
```
Represents a tx that failed to be processed by the sequencer public processor.

### FieldLayout
```typescript
type FieldLayout = unknown
```
Type representing a field layout in the storage of a contract.

### GENESIS_CHECKPOINT_HEADER_HASH
```typescript
type GENESIS_CHECKPOINT_HEADER_HASH = Fr
```

### GasDimensions
```typescript
type GasDimensions = readonly []
```

### GasUsed
```typescript
type GasUsed = { fromPlainObject: (obj: any) => GasUsed }
```

### InBlock
```typescript
type InBlock = unknown
```

### InTx
```typescript
type InTx = InBlock & { txHash: TxHash }
```

### IndexedTxEffect
```typescript
type IndexedTxEffect = DataInBlock<TxEffect> & { txIndexInBlock: number }
```

### InvalidCheckpointDetectedEvent
```typescript
type InvalidCheckpointDetectedEvent = unknown
```

### KEY_PREFIXES
```typescript
type KEY_PREFIXES = KeyPrefix[]
```

### KeyGenerator
```typescript
type KeyGenerator = GeneratorIndex.NHK_M | GeneratorIndex.IVSK_M | GeneratorIndex.OVSK_M | GeneratorIndex.TSK_M
```

### KeyPrefix
```typescript
type KeyPrefix = "n" | "iv" | "ov" | "t"
```

### L2BlockId
```typescript
type L2BlockId = unknown
```
Identifies a block by number and hash.

### L2BlockInfo
```typescript
type L2BlockInfo = unknown
```

### L2BlockProvenEvent
```typescript
type L2BlockProvenEvent = unknown
```

### L2BlockStreamEvent
```typescript
type L2BlockStreamEvent = { blocks: L2Block[]; type: "blocks-added" } | { block: L2BlockId; checkpoint: PublishedCheckpoint; type: "chain-checkpointed" } | { block: L2BlockId; checkpoint: CheckpointId; type: "chain-pruned" } | { block: L2BlockId; type: "chain-proven" } | { block: L2BlockId; type: "chain-finalized" }
```

### L2BlockTag
```typescript
type L2BlockTag = "proposed" | "checkpointed" | "proven" | "finalized"
```
Identifier for L2 block tags. - proposed: Latest block proposed on L2. - checkpointed: Checkpointed block on L1. - proven: Proven block on L1. - finalized: Proven block on a finalized L1 block (not implemented, set to proven for now).

### L2CheckpointEvent
```typescript
type L2CheckpointEvent = unknown
```

### L2PruneUncheckpointedEvent
```typescript
type L2PruneUncheckpointedEvent = unknown
```

### L2PruneUnprovenEvent
```typescript
type L2PruneUnprovenEvent = unknown
```

### L2TipId
```typescript
type L2TipId = unknown
```

### L2Tips
```typescript
type L2Tips = unknown
```
Tips of the L2 chain.

### L2TipsStore
```typescript
type L2TipsStore = L2BlockStreamEventHandler & L2BlockStreamLocalDataProvider
```

### LocationNodeDebugInfo
```typescript
type LocationNodeDebugInfo = unknown
```

### LocationTree
```typescript
type LocationTree = unknown
```

### LogFilter
```typescript
type LogFilter = unknown
```
Log filter used to fetch L2 logs.

### NodeStats
```typescript
type NodeStats = unknown
```

### NotesFilter
```typescript
type NotesFilter = unknown
```
A filter used to fetch notes.

### OFFCHAIN_MESSAGE_IDENTIFIER
```typescript
type OFFCHAIN_MESSAGE_IDENTIFIER = Fr
```

### OffchainEffect
```typescript
type OffchainEffect = unknown
```
Represents an offchain effect emitted via the `emit_offchain_effect` oracle (see the oracle documentation for more details).

### OpcodeLocation
```typescript
type OpcodeLocation = string
```
The location of an opcode in the bytecode. It's a string of the form `{acirIndex}` or `{acirIndex}:{brilligIndex}`.

### OpcodeToLocationsMap
```typescript
type OpcodeToLocationsMap = Record<OpcodeLocation, number>
```

### PartialAddress
```typescript
type PartialAddress = Fr
```
A type which along with public key forms a preimage of a contract address. See the link below for more details https://github.com/AztecProtocol/aztec-packages/blob/master/docs/docs/concepts/foundation/accounts/keys.md#addresses-partial-addresses-and-public-keys

### PreTag
```typescript
type PreTag = unknown
```
Represents a preimage of a private log tag (see `Tag` in `pxe/src/tagging`). Note: It's a bit unfortunate that this type resides in `stdlib` as the rest of the tagging functionality resides in `pxe/src/tagging`. But this type is used by other types in stdlib hence there doesn't seem to be a good way around this.

### PrivateFunctionMembershipProof
```typescript
type PrivateFunctionMembershipProof = unknown
```
Sibling paths and sibling commitments for proving membership of a private function within a contract class.

### ProcessReturnValues
```typescript
type ProcessReturnValues = Fr[] | undefined
```
Return values of simulating a circuit.

### ProcessedTx
```typescript
type ProcessedTx = unknown
```
Represents a tx that has been processed by the sequencer public processor, so its kernel circuit public inputs are filled in.

### ProtocolContractAddresses
```typescript
type ProtocolContractAddresses = unknown
```

### ProtocolContractsNames
```typescript
type ProtocolContractsNames = readonly []
```

### ProvingTimings
```typescript
type ProvingTimings = unknown
```

### PublicKey
```typescript
type PublicKey = Point
```
Represents a user public key.

### RollupHonkProofData
```typescript
type RollupHonkProofData = ProofData<T, typeof RECURSIVE_ROLLUP_HONK_PROOF_LENGTH>
```

### RoundTripStats
```typescript
type RoundTripStats = unknown
```

### SortedTxStatuses
```typescript
type SortedTxStatuses = TxStatus[]
```
Tx status sorted by finalization progress.

### TX_ERROR_BLOCK_HEADER
```typescript
type TX_ERROR_BLOCK_HEADER = "Block header not found"
```

### TX_ERROR_CALLDATA_COUNT_MISMATCH
```typescript
type TX_ERROR_CALLDATA_COUNT_MISMATCH = "Wrong number of calldata for public calls"
```

### TX_ERROR_CALLDATA_COUNT_TOO_LARGE
```typescript
type TX_ERROR_CALLDATA_COUNT_TOO_LARGE = "Total calldata too large for enqueued public calls"
```

### TX_ERROR_CONTRACT_CLASS_LOGS
```typescript
type TX_ERROR_CONTRACT_CLASS_LOGS = "Mismatched contract class logs"
```

### TX_ERROR_CONTRACT_CLASS_LOG_COUNT
```typescript
type TX_ERROR_CONTRACT_CLASS_LOG_COUNT = "Mismatched number of contract class logs"
```

### TX_ERROR_CONTRACT_CLASS_LOG_LENGTH
```typescript
type TX_ERROR_CONTRACT_CLASS_LOG_LENGTH = "Incorrect contract class logs length"
```

### TX_ERROR_CONTRACT_CLASS_LOG_SORTING
```typescript
type TX_ERROR_CONTRACT_CLASS_LOG_SORTING = "Incorrectly sorted contract class logs"
```

### TX_ERROR_DUPLICATE_NULLIFIER_IN_TX
```typescript
type TX_ERROR_DUPLICATE_NULLIFIER_IN_TX = "Duplicate nullifier in tx"
```

### TX_ERROR_DURING_VALIDATION
```typescript
type TX_ERROR_DURING_VALIDATION = "Unexpected error during validation"
```

### TX_ERROR_EXISTING_NULLIFIER
```typescript
type TX_ERROR_EXISTING_NULLIFIER = "Existing nullifier"
```

### TX_ERROR_GAS_LIMIT_TOO_HIGH
```typescript
type TX_ERROR_GAS_LIMIT_TOO_HIGH = "Gas limit is higher than the amount of gas that the AVM can process"
```

### TX_ERROR_INCORRECT_CALLDATA
```typescript
type TX_ERROR_INCORRECT_CALLDATA = "Incorrect calldata for public call"
```

### TX_ERROR_INCORRECT_HASH
```typescript
type TX_ERROR_INCORRECT_HASH = "Incorrect tx hash"
```

### TX_ERROR_INCORRECT_L1_CHAIN_ID
```typescript
type TX_ERROR_INCORRECT_L1_CHAIN_ID = "Incorrect L1 chain id"
```

### TX_ERROR_INCORRECT_PROTOCOL_CONTRACTS_HASH
```typescript
type TX_ERROR_INCORRECT_PROTOCOL_CONTRACTS_HASH = "Incorrect protocol contracts hash"
```

### TX_ERROR_INCORRECT_ROLLUP_VERSION
```typescript
type TX_ERROR_INCORRECT_ROLLUP_VERSION = "Incorrect rollup version"
```

### TX_ERROR_INCORRECT_VK_TREE_ROOT
```typescript
type TX_ERROR_INCORRECT_VK_TREE_ROOT = "Incorrect verification keys tree root"
```

### TX_ERROR_INSUFFICIENT_FEE_PAYER_BALANCE
```typescript
type TX_ERROR_INSUFFICIENT_FEE_PAYER_BALANCE = "Insufficient fee payer balance"
```

### TX_ERROR_INSUFFICIENT_FEE_PER_GAS
```typescript
type TX_ERROR_INSUFFICIENT_FEE_PER_GAS = "Insufficient fee per gas"
```

### TX_ERROR_INSUFFICIENT_GAS_LIMIT
```typescript
type TX_ERROR_INSUFFICIENT_GAS_LIMIT = "Gas limit is below the minimum fixed cost"
```

### TX_ERROR_INVALID_INCLUDE_BY_TIMESTAMP
```typescript
type TX_ERROR_INVALID_INCLUDE_BY_TIMESTAMP = "Invalid expiration timestamp"
```

### TX_ERROR_INVALID_PROOF
```typescript
type TX_ERROR_INVALID_PROOF = "Invalid proof"
```

### TX_ERROR_SETUP_FUNCTION_NOT_ALLOWED
```typescript
type TX_ERROR_SETUP_FUNCTION_NOT_ALLOWED = "Setup function not on allow list"
```

### TX_ERROR_SIZE_ABOVE_LIMIT
```typescript
type TX_ERROR_SIZE_ABOVE_LIMIT = "Transaction size above size limit"
```

### TxValidationResult
```typescript
type TxValidationResult = { result: "valid" } | { reason: string[]; result: "invalid" } | { reason: string[]; result: "skipped" }
```

### TypedStructFieldValue
```typescript
type TypedStructFieldValue = unknown
```

### UltraHonkProofData
```typescript
type UltraHonkProofData = ProofData<T, typeof RECURSIVE_PROOF_LENGTH>
```

### UtilityFunctionMembershipProof
```typescript
type UtilityFunctionMembershipProof = unknown
```
Sibling paths and commitments for proving membership of a utility function within a contract class.

### UtilityFunctionWithMembershipProof
```typescript
type UtilityFunctionWithMembershipProof = UtilityFunction & UtilityFunctionMembershipProof
```
A utility function with a membership proof.

### ValidateCheckpointNegativeResult
```typescript
type ValidateCheckpointNegativeResult = { attestations: CommitteeAttestation[]; attestors: EthAddress[]; ... } | { attestations: CommitteeAttestation[]; attestors: EthAddress[]; ... }
```
Subtype for invalid checkpoint validation results

### ValidateCheckpointResult
```typescript
type ValidateCheckpointResult = { valid: true } | ValidateCheckpointNegativeResult
```
Result type for validating checkpoint attestations

## Enums

### Comparator
The comparator to use to compare.

Values: `1`, `5`, `6`, `3`, `4`, `2`

### FunctionType
Aztec.nr function types.

Values: `private`, `public`, `utility`

### L2BlockSourceEvents

Values: `invalidCheckpointDetected`, `l2BlockProven`, `l2BlocksCheckpointed`, `l2PruneUncheckpointed`, `l2PruneUnproven`

### NoteStatus
The status of notes to retrieve.

Values: `1`, `2`

### ProvingRequestType

Values: `10`, `7`, `5`, `8`, `6`, `9`, `14`, `13`, `11`, `12`, `16`, `17`, `2`, `1`, `3`, `0`, `15`, `4`

### TxExecutionPhase

Values: `1`, `0`, `2`

### TxExecutionResult
Execution result - only set when tx is in a block.

Values: `app_logic_reverted`, `both_reverted`, `success`, `teardown_reverted`

### TxStatus
Block inclusion/finalization status.

Values: `checkpointed`, `dropped`, `finalized`, `pending`, `proposed`, `proven`

## Cross-Package References

This package references types from other Aztec packages:

**@aztec/blob-lib**
- `BlockBlobData`, `TxBlobData`, `TxStartMarker`

**@aztec/constants**
- `CHONK_PROOF_LENGTH`, `GeneratorIndex.IVSK_M`, `GeneratorIndex.NHK_M`, `GeneratorIndex.OVSK_M`, `GeneratorIndex.TSK_M`, `RECURSIVE_PROOF_LENGTH`, `RECURSIVE_ROLLUP_HONK_PROOF_LENGTH`

**@aztec/ethereum**
- `L1ContractAddresses`, `ViemCommitteeAttestation`, `ViemCommitteeAttestations`

**@aztec/foundation**
- `BaseField`, `BlockNumber`, `Buffer32`, `BufferReader`, `Bufferable`, `CheckpointNumber`, `EpochNumber`, `EthAddress`, `FieldReader`, `FieldsOf`, `Fq`, `Fr`, `IndexWithinCheckpoint`, `Logger`, `MerkleTree`, `Point`, `Signature`, `SlotNumber`, `TypedEventEmitter`, `ViemSignature`, `ViemTransactionSignature`, `ZodFor`
