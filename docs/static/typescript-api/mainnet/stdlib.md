# @aztec/stdlib

Version: 5.2.0

## Quick Import Reference

```typescript
import {
  AllContractDeploymentData,
  AppTaggingSecret,
  AuthorizationSelector,
  AztecAddress,
  BlockHash,
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

### AppTaggingSecret

Application tagging secret used for log tagging. It bundles a tagging secret with the app contract address. Unconstrained secrets are derived by the simulator from `(sender, recipient, app)` via ECDH. Constrained secrets are supplied to the simulator by the caller as an app-siloed shared secret retrieved from a handshake registry.

**Constructor**
```typescript
new AppTaggingSecret(secret: Fr, app: AztecAddress, kind: AppTaggingSecretKind)
```

**Properties**
- `readonly app: AztecAddress`
- `readonly kind: AppTaggingSecretKind`
- `readonly secret: Fr`

**Methods**
- `static computeAppSiloed(taggingSecretPoint: Point, app: AztecAddress, kind: AppTaggingSecretKind) => Promise<AppTaggingSecret>` - Derives the bare app-siloed tagging secret from a shared secret point via appSiloEcdhSharedSecretPoint, under the given delivery-mode kind.
- `static computeDirectional(taggingSecretPoint: Point, app: AztecAddress, recipient: AztecAddress) => Promise<AppTaggingSecret>` - Derives an app-siloed, recipient-directional tagging secret from a shared tagging secret point. App-silos the point via appSiloEcdhSharedSecretPoint, then directs the result to `recipient`: `h([s_app, recipient])`. The directional step stops a symmetric shared secret (ECDH against an address, or an arbitrary registered point) from colliding bidirectionally, so two parties never share a tag sequence. The point is obtained either via computeSharedTaggingSecret (an ECDH key exchange against a sender) or registered directly as a pre-shared secret.
- `static computeViaEcdh(localAddress: CompleteAddress, localIvsk: Fq, externalAddress: AztecAddress, app: AztecAddress, recipient: AztecAddress) => Promise<AppTaggingSecret | undefined>` - Derives the tagging secret for `(externalAddress, recipient, app)` by performing an ECDH key exchange against `externalAddress` to obtain the shared point, then siloing and directing it via computeDirectional. Returns undefined if `externalAddress` is not a valid address.
- `static fromString(str: string) => AppTaggingSecret`
- `toString() => string`

### AuthorizationSelector

An authorization selector is the first 4 bytes of the hash of an authorization struct signature.

Extends: `Selector`

**Constructor**
```typescript
new AuthorizationSelector(value: number)
```

**Properties**
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
- `static NULL_MSG_SENDER: AztecAddress` - Null msg sender address. Not part of the protocol contracts tree.
- `static schema: unknown`
- `size: unknown`
- `static SIZE_IN_BYTES: number`
- `static ZERO: AztecAddress`

**Methods**
- `[custom]() => string`
- `equals(other: AztecAddress) => boolean`
- `static fromBigIntUnsafe(value: bigint) => AztecAddress` - Builds an `AztecAddress` from a bigint **without checking it is a valid address** (the x-coordinate of a point on the Grumpkin curve, which is what lets it be encrypted to). Use AztecAddress.isValid to validate an untrusted one, or AztecAddress.random for valid test addresses.
- `static fromBuffer(buffer: Buffer<ArrayBufferLike> | BufferReader) => AztecAddress` - Deserializes an `AztecAddress` from a buffer. It does **not** check the value is a valid Grumpkin-curve address (see AztecAddress.isValid); it is meant for reading addresses from already-validated serialized data. Use AztecAddress.random for valid test addresses.
- `static fromFields(fields: Fr[] | FieldReader) => AztecAddress` - Deserializes an `AztecAddress` from a field reader. It does **not** check the value is a valid Grumpkin-curve address (see AztecAddress.isValid); it is meant for reading addresses from already-validated serialized data. Use AztecAddress.random for valid test addresses.
- `static fromFieldUnsafe(fr: Fr) => AztecAddress` - Builds an `AztecAddress` from a field **without checking it is a valid address** (the x-coordinate of a point on the Grumpkin curve, which is what lets it be encrypted to). Use AztecAddress.isValid to validate an untrusted one, or AztecAddress.random for valid test addresses.
- `static fromNumberUnsafe(value: number) => AztecAddress` - Builds an `AztecAddress` from a number **without checking it is a valid address** (the x-coordinate of a point on the Grumpkin curve, which is what lets it be encrypted to). Use AztecAddress.isValid to validate an untrusted one, or AztecAddress.random for valid test addresses.
- `static fromPlainObject(obj: any) => AztecAddress` - Creates an AztecAddress from a plain object without Zod validation. This method is optimized for performance and skips validation, making it suitable for deserializing trusted data (e.g., from C++ via MessagePack). Handles buffers, strings, or existing instances.
- `static fromStringUnsafe(buf: string) => AztecAddress` - Builds an `AztecAddress` from a hex string **without checking it is a valid address** (the x-coordinate of a point on the Grumpkin curve, which is what lets it be encrypted to). Use AztecAddress.isValid to validate an untrusted one, or AztecAddress.random for valid test addresses.
- `static isAddress(str: string) => boolean`
- `isValid() => Promise<boolean>`
- `isZero() => boolean`
- `static random() => Promise<AztecAddress>`
- `toAddressPoint() => Promise<Point>`
- `toBigInt() => bigint`
- `toBuffer() => Buffer`
- `toField() => Fr`
- `toJSON() => string`
- `toString() => string`
- `static zero() => AztecAddress`

### BlockHash

Hash of an L2 block.

Extends: `BaseFr`

**Constructor**
```typescript
new BlockHash(hash: Fr)
```

**Properties**
- `static MODULUS: bigint`
- `static schema: unknown`
- `size: unknown`
- `static SIZE_IN_BYTES: number`
- `value: unknown`
- `static ZERO: BlockHash`

**Methods**
- `[custom]() => string`
- `static cmp(lhs: BaseField, rhs: BaseField) => -1 | 0 | 1`
- `static cmpAsBigInt(lhs: bigint, rhs: bigint) => -1 | 0 | 1`
- `equals(rhs: BaseField) => boolean`
- `static fromBuffer(buffer: Buffer<ArrayBufferLike> | BufferReader) => BlockHash`
- `static fromString(str: string) => BlockHash`
- `static isBlockHash(value: unknown) => boolean` - Type guard that checks if a value is a BlockHash instance.
- `isEmpty() => boolean`
- `isZero() => boolean`
- `lt(rhs: BaseField) => boolean`
- `modulus() => bigint`
- `static random() => BlockHash`
- `toBigInt() => bigint`
- `toBool() => boolean`
- `toBuffer() => Buffer` - Converts the bigint to a Buffer. With a sink, streams the 32 big-endian bytes straight in (no allocation) and returns undefined; without one, returns a freshly allocated buffer.
- `toField() => this`
- `toFr() => Fr`
- `toFriendlyJSON() => string`
- `toJSON() => string`
- `toNumber() => number` - Converts this field to a number. Throws if the underlying value is greater than MAX_SAFE_INTEGER.
- `toNumberUnsafe() => number` - Converts this field to a number. May cause loss of precision if the underlying value is greater than MAX_SAFE_INTEGER.
- `toShortString() => string`
- `toString() => string`

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
- `static fromFields(fields: Fr[] | FieldReader) => BlockHeader`
- `static fromString(str: string) => BlockHeader`
- `getBlockNumber() => BlockNumber`
- `static getFields(fields: FieldsOf<BlockHeader>) => readonly []`
- `getSize() => number`
- `getSlot() => SlotNumber`
- `hash() => Promise<BlockHash>`
- `isEmpty() => boolean`
- `static random(overrides: Partial<FieldsOf<BlockHeader>> & Partial<FieldsOf<GlobalVariables>>) => BlockHeader`
- `recomputeHash() => Promise<BlockHash>` - Recomputes the cached hash. Used for testing when header fields are mutated via unfreeze.
- `setHash(hashed: BlockHash) => void` - Manually set the hash for this block header if already computed
- `toBuffer() => Buffer`
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
- `static fromFields(fields: Fr[] | FieldReader) => CallContext`
- `static getFields(fields: FieldsOf<CallContext>) => readonly []`
- `isEmpty() => boolean`
- `static random() => Promise<CallContext>`
- `toBuffer() => Buffer<ArrayBufferLike>` - Serialize this as a buffer.
- `toFields() => Fr[]`

### Capsule

Read-only data that is passed to the contract through an oracle during a transaction execution. Check whether this is always used to represent a transient capsule and if so, rename to TransientCapsule.

**Constructor**
```typescript
new Capsule(contractAddress: AztecAddress, storageSlot: Fr, data: Fr[], scope?: AztecAddress)
```

**Properties**
- `readonly contractAddress: AztecAddress` - The address of the contract the capsule is for
- `readonly data: Fr[]` - Data passed to the contract
- `static schema: unknown`
- `readonly scope?: AztecAddress` - Optional namespace for the capsule contents
- `readonly storageSlot: Fr` - The storage slot of the capsule

**Methods**
- `static fromBuffer(buffer: Buffer<ArrayBufferLike> | BufferReader) => Capsule`
- `static fromString(str: string) => Capsule`
- `toBuffer() => Buffer<ArrayBufferLike>`
- `toJSON() => string`
- `toString() => string`

### ChonkProof

Serialization format detection for ChonkProof is value-based on the leading uint32: - EMPTY: [0: uint32] → total = 4 bytes - UNCOMPRESSED (legacy): [field_count=1632: uint32] [fields...] → total ≈ 52KB (>= 40KB) - COMPRESSED: [byte_count: uint32] [compressed_bytes] → total ≈ 35KB (< 40KB) Detection from the first uint32: 0 means an empty proof (no fields); CHONK_PROOF_LENGTH (1632) means legacy format (field count); any other value is the compressed byte count. A real compressed proof always has a non-zero byte count, so 0 is an unambiguous sentinel for the empty case. The old uncompressed format is never smaller than 40KB; compressed proofs are always smaller than 40KB.

**Constructor**
```typescript
new ChonkProof(fields: Fr[], compressedProof?: Buffer<ArrayBufferLike>)
```

**Properties**
- `compressedProof?: Buffer<ArrayBufferLike>` - Optional compressed proof bytes from chonk compression (point compression + u256 encoding). When set, toBuffer() will serialize in compressed format (~1.7x smaller). When reading from compressed format, this is populated and fields are decompressed on demand.
- `fields: Fr[]`
- `static schema: unknown`

**Methods**
- `attachPublicInputs(publicInputs: Fr[]) => ChonkProofWithPublicInputs`
- `static empty() => ChonkProof`
- `static fromBuffer(buffer: Buffer<ArrayBufferLike> | BufferReader) => ChonkProof` - Deserialize a ChonkProof from a buffer. Supports both legacy (field elements) and compressed (chonk compression) formats. Value-based format detection on the leading uint32: - First uint32 == 0: empty proof (no fields), total = 4 bytes - First uint32 == CHONK_PROOF_LENGTH (1632): legacy format, read field elements Total proof data ≈ 52KB (always >= 40KB) - Otherwise: compressed format, first uint32 is byte count of compressed data Total proof data ≈ 35KB (always < 40KB)
- `static fromCompressedBytes(compressed: Buffer) => ChonkProof` - Create a ChonkProof from compressed bytes by decompressing via the BarretenbergSync API. The compressed format uses point compression and u256 encoding (from PR #20645).
- `isEmpty() => boolean`
- `static random() => ChonkProof`
- `toBuffer() => Buffer` - Serialize the proof to a buffer. If compressed bytes are available, uses the compressed format (~1.7x smaller). Otherwise falls back to legacy field element format.
- `toJSON() => Buffer<ArrayBufferLike>`

### ChonkProofWithPublicInputs

**Constructor**
```typescript
new ChonkProofWithPublicInputs(fieldsWithPublicInputs: Fr[])
```

**Properties**
- `compressedProof?: Buffer<ArrayBufferLike>` - Optional compressed proof bytes (covers the full proof WITH public inputs). Set by the prover when using chonk compression. Flows through to ChonkProof via removePublicInputs() so the Tx can serialize in compressed format.
- `fieldsWithPublicInputs: Fr[]`
- `static schema: unknown`

**Methods**
- `static empty() => ChonkProofWithPublicInputs`
- `static fromBuffer(buffer: Buffer<ArrayBufferLike> | BufferReader) => ChonkProofWithPublicInputs`
- `static fromBufferArray(fields: Uint8Array<ArrayBufferLike>[]) => ChonkProofWithPublicInputs`
- `getPublicInputs() => Fr[]`
- `isEmpty() => boolean`
- `removePublicInputs() => ChonkProof`
- `toBuffer() => Buffer`
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
new CommitteeAttestationsAndSigners(attestations: CommitteeAttestation[], signatureContext: CoordinationSignatureContext)
```

**Properties**
- `attestations: CommitteeAttestation[]`
- `readonly primaryType: CoordinationSignatureType`
- `static schema: unknown`
- `readonly signatureContext: CoordinationSignatureContext`

**Methods**
- `static empty(signatureContext: CoordinationSignatureContext) => CommitteeAttestationsAndSigners`
- `getPackedAttestations() => ViemCommitteeAttestations`
- `getPayloadToSign() => Buffer`
- `getSignedAttestations() => CommitteeAttestation[]`
- `getSigners() => EthAddress[]`
- `static packAttestations(attestations: CommitteeAttestation[]) => ViemCommitteeAttestations` - Packs an array of committee attestations into the format expected by the Solidity contract
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
- `static fromPublicKeysAndPartialAddress(publicKeys: PublicKeys, partialAddress: Fr) => Promise<CompleteAddress>`
- `static fromSecretKeyAndInstance(secretKey: Fr, instance: Pick<ContractInstance, "originalContractClassId" | "initializationHash" | "salt" | "deployer" | "immutablesHash"> | { originalContractClassId: Fr; saltedInitializationHash: Fr }) => Promise<CompleteAddress>`
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
- `static fromBlobFields(emittedLength: number, fields: Fr[] | FieldReader) => ContractClassLog`
- `static fromBuffer(buffer: Buffer<ArrayBufferLike> | BufferReader) => ContractClassLog`
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
- `static fromFields(fields: Fr[] | FieldReader) => ContractClassLogFields`
- `static fromPlainObject(obj: any) => ContractClassLogFields` - Creates a ContractClassLogFields from a plain object without Zod validation. This method is optimized for performance and skips validation, making it suitable for deserializing trusted data (e.g., from C++ via MessagePack).
- `getEmittedFields(emittedLength: number) => Fr[]`
- `hash() => Promise<Fr>`
- `isEmpty() => boolean`
- `static random(emittedLength: number) => ContractClassLogFields`
- `toBuffer() => Buffer`
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
new DebugLog(contractAddress: AztecAddress, level: "error" | "debug" | "silent" | "fatal" | "warn" | "info" | "verbose" | "trace", message: string, fields: Fr[])
```

**Properties**
- `contractAddress: AztecAddress`
- `fields: Fr[]`
- `level: "error" | "debug" | "silent" | "fatal" | "warn" | "info" | "verbose" | "trace"`
- `message: string`
- `static schema: unknown`

**Methods**
- `static fromPlainObject(obj: any) => DebugLog` - Creates a DebugLog from a plain object without Zod validation. This method is optimized for performance and skips validation, making it suitable for deserializing trusted data (e.g., from C++ via MessagePack).

### DroppedTxReceipt

Receipt for a transaction that was dropped from the mempool without being mined.

Extends: `UnminedTxReceipt`
Implements: `TxReceiptInterface`

**Constructor**
```typescript
new DroppedTxReceipt(txHash: TxHash, error?: string)
```

**Properties**
- `readonly blockHash: undefined` - The hash of the block containing the transaction.
- `readonly blockNumber: undefined` - The block number in which the transaction was included.
- `readonly epochNumber: undefined` - The epoch number in which the transaction was included.
- `readonly error?: string` - Description of the transaction error, if any.
- `readonly executionResult: undefined` - The execution result of the transaction, only set when the tx is in a block.
- `static schema: unknown`
- `readonly slotNumber: undefined` - The slot number in which the transaction's block was built.
- `readonly status: DROPPED` - The transaction's block finalization status.
- `readonly transactionFee: undefined` - The transaction fee paid for the transaction.
- `tx: undefined` - The pending transaction, attached when requested via `includePendingTx`.
- `readonly txEffect: undefined` - The full transaction effect, attached when requested via `includeTxEffect`.
- `readonly txHash: TxHash` - A unique identifier for a transaction.
- `readonly txIndexInBlock: undefined` - The index of the transaction within its block.

**Methods**
- `static empty() => DroppedTxReceipt`
- `static from(fields: { error?: string; status: DROPPED; txHash: TxHash }) => DroppedTxReceipt`
- `hasExecutionReverted() => boolean` - Returns true if the transaction execution reverted.
- `hasExecutionSucceeded() => boolean` - Returns true if the transaction was executed successfully.
- `isDropped() => boolean` - Returns true (and narrows) if the transaction was dropped.
- `isMined() => boolean` - Returns true (and narrows) if the transaction has been included in a block.
- `isPending() => boolean` - Returns true (and narrows) if the transaction is pending.

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
- `static fromFields(fields: Fr[] | FieldReader) => EthAddress`
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

### EventDrivenL2BlockStream

Event-driven wrapper around L2BlockStream. Subscribes to the source's aggregate `l2BlockSourceUpdated` event (when the source exposes one) and uses it purely as a doorbell: each event triggers an immediate reconciliation pass instead of waiting for the next tick, while the periodic poll remains the correctness fallback. Every pass reads tips and blocks authoritatively from the source, so a missed, stale, or duplicated event only affects latency. Subsystems keep consuming the same L2BlockStreamEvents; the archiver aggregate event is handled entirely here.

**Constructor**
```typescript
new EventDrivenL2BlockStream(source: L2BlockSource | L2BlockSourceEventEmitter, localData: L2BlockStreamLocalDataProvider, handler: L2BlockStreamEventHandler, log: Logger, opts: L2BlockStreamOptions)
```

**Methods**
- `isRunning() => boolean`
- `start() => void`
- `stop() => Promise<void>`
- `sync() => Promise<void>` - Runs a synchronization pass now, bypassing the poll interval. Resolves once a pass that started after this call completes, so the caller observes state at least as fresh as the moment it asked. Concurrent callers coalesce onto a single such pass. Rejects if the stream is stopped before that pass runs.

### EventSelector

An event selector is the first 4 bytes of the hash of an event signature.

Extends: `Selector`

**Constructor**
```typescript
new EventSelector(value: number)
```

**Properties**
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
- `static fromBlobFields(length: number, fields: Fr[] | FieldReader) => FlatPublicLogs`
- `static fromBuffer(buffer: Buffer<ArrayBufferLike> | BufferReader) => FlatPublicLogs`
- `static fromFields(fields: Fr[] | FieldReader) => FlatPublicLogs`
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
- `static fromFields(fields: Fr[] | FieldReader) => FunctionData`
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
- `static fromFields(fields: Fr[] | FieldReader) => FunctionSelector`
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
- `static fromFields(fields: Fr[] | FieldReader) => Gas`
- `static fromPlainObject(obj: any) => Gas` - Creates a Gas instance from a plain object without Zod validation. This method is optimized for performance and skips validation, making it suitable for deserializing trusted data (e.g., from C++ via MessagePack).
- `get(dimension: "da" | "l2") => number`
- `getSize() => number`
- `gtAny(other: Gas) => boolean` - Returns true if any of this instance's dimensions is greater than the corresponding on the other.
- `isEmpty() => boolean`
- `mul(scalar: number) => Gas`
- `static random() => Gas`
- `sub(other: Gas) => Gas`
- `toBuffer() => Buffer`
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
- `static fromFields(fields: Fr[] | FieldReader) => GasFees`
- `static fromPlainObject(obj: any) => GasFees` - Creates a GasFees instance from a plain object without Zod validation. This method is optimized for performance and skips validation, making it suitable for deserializing trusted data (e.g., from C++ via MessagePack).
- `get(dimension: "da" | "l2") => bigint`
- `isEmpty() => boolean`
- `mul(scalar: number | bigint) => GasFees`
- `static random() => GasFees`
- `toBuffer() => Buffer`
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
- `static empty() => GasSettings` - Zero-value gas settings.
- `equals(other: GasSettings) => boolean`
- `static fallback(overrides: { gasLimits: Gas; maxFeesPerGas: GasFees; ... }) => GasSettings` - Fills in gas limits high enough for transactions to be included in most cases. Callers must supply `gasLimits` — typically the most a single tx may declare on the network (`min(per-tx max, per-block allocation)`), i.e. a node's advertised `txsLimits.gas`. Since teardown gas is reserved from gasLimits during private execution (see gas_meter.nr), the effective gas available for app logic is gasLimits - teardownGasLimits - privateOverhead; the teardown default is derived from the effective total so it always stays below it. These values won't work if: - Teardown consumes more than the arbitrarily assigned fallback limits - The rest of the transaction consumes more than the remaining gas after teardown - The DA gas limit is too low for the transaction, while still within the checkpoint limit
- `static forEstimation(overrides: { gasLimits?: Gas; maxFeesPerGas: GasFees; ... }) => GasSettings` - Gas settings for simulation/estimation only. Since teardown gas is reserved upfront from gasLimits during private execution (see gas_meter.nr), the effective gas available for app logic is gasLimits - teardownGasLimits - privateOverhead. To ensure estimation never hits gas caps, we set both limits above what the protocol allows: teardown gets MAX_PROCESSABLE and gasLimits gets teardown + MAX_PROCESSABLE, so the full processable amount remains available for each phase independently. To be used in conjunction with skipTxValidation: true during public simulation, or the node would reject the transaction outright due to gas limits being above protocol max.
- `static from(args: { gasLimits: FieldsOf<Gas>; maxFeesPerGas: FieldsOf<GasFees>; ... }) => GasSettings`
- `static fromBuffer(buffer: Buffer<ArrayBufferLike> | BufferReader) => GasSettings`
- `static fromFields(fields: Fr[] | FieldReader) => GasSettings`
- `static fromPlainObject(obj: any) => GasSettings` - Creates a GasSettings instance from a plain object without Zod validation. This method is optimized for performance and skips validation, making it suitable for deserializing trusted data (e.g., from C++ via MessagePack).
- `getFeeLimit() => Fr` - Returns the maximum fee to be paid according to gas limits and max fees set.
- `static getFields(fields: FieldsOf<GasSettings>) => readonly []`
- `getSize() => number`
- `isEmpty() => boolean`
- `toBuffer() => Buffer`
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
- `static fromFields(fields: Fr[] | FieldReader) => GlobalVariables`
- `static fromPlainObject(obj: any) => GlobalVariables` - Creates a GlobalVariables instance from a plain object without Zod validation. This method is optimized for performance and skips validation, making it suitable for deserializing trusted data (e.g., from C++ via MessagePack).
- `static getFields(fields: FieldsOf<GlobalVariables>) => readonly []`
- `getSize() => number`
- `isEmpty() => boolean`
- `static random(overrides: Partial<FieldsOf<GlobalVariables>>) => GlobalVariables`
- `toBuffer() => Buffer`
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
- `static schemaFor(maxValues?: number) => ZodFor<HashedValues>` - Returns a schema that additionally rejects more than `maxValues` values. The bound belongs to the caller rather than to this class: the same container carries public calldata, private call arguments and authwit arguments, and those have different limits.
- `toBuffer() => Buffer`

### InMemoryDebugLogStore

In-memory implementation for test mode that stores and serves debug logs.
Implements: `DebugLogStore`

**Constructor**
```typescript
new InMemoryDebugLogStore()
```

**Properties**
- `isEnabled: unknown` - Whether debug log collection is enabled.

**Methods**
- `decorateReceiptWithLogs(txHash: string, receipt: TxReceipt) => void` - Decorate a TxReceipt with any stored debug logs for the given tx.
- `storeLogs(txHash: string, logs: DebugLog[]) => void` - Store debug logs for a processed transaction.

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
- `computeDAGasUsed() => number` - Compute how much DA gas this block uses.
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
new L2BlockStream(l2BlockSource: L2BlockStreamSource, localData: L2BlockStreamLocalDataProvider, handler: L2BlockStreamEventHandler, log: Logger, opts: L2BlockStreamOptions)
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
new L2TipsMemoryStore(initialBlockHash: BlockHash)
```

**Properties**
- `readonly initialBlockHash: BlockHash`

**Methods**
- `computeBlockHash(block: L2Block) => Promise<string>`
- `deleteBlockHashesBefore(blockNumber: BlockNumber) => Promise<void>` - Deletes all block hashes for blocks before the given block number.
- `getL2BlockHash(number: BlockNumber) => Promise<string | undefined>`
- `getL2Tips() => Promise<L2Tips>`
- `getStoredBlockHash(blockNumber: BlockNumber) => Promise<string | undefined>` - Gets the block hash for a given block number.
- `getTip(tag: L2BlockTag) => Promise<BlockNumber | undefined>` - Gets the block number for a given tag.
- `getTipCheckpoint(tag: L2BlockTag) => Promise<CheckpointId | undefined>` - Gets the checkpoint id recorded for a given tag, if any.
- `handleBlockStreamEvent(event: L2BlockStreamEvent) => Promise<void>`
- `recordBlockHashes(blocks: L2BlockId[]) => Promise<void>` - Records `(number → hash)` witnesses into the block-hash index without moving any tip cursor. In tips-only mode the hash history is sparse (one anchor per tip-moving poll), so a consumer that materializes per-height state should witness those heights or its prunes are over-deep by the gap to the nearest anchor. Witnesses are compared against the source, not trusted, so they cannot cause under-deep prunes; this is always safe to call.
- `runInTransaction<T>(fn: () => Promise<T>) => Promise<T>` - Runs the given function in a transaction. Memory stores can just execute immediately.
- `setBlockHash(blockNumber: BlockNumber, hash: string) => Promise<void>` - Sets the block hash for a given block number.
- `setTip(tag: L2BlockTag, blockNumber: BlockNumber) => Promise<void>` - Sets the block number for a given tag.
- `setTipCheckpoint(tag: L2BlockTag, checkpoint: CheckpointId) => Promise<void>` - Records the checkpoint id for a given tag.

### L2TipsStoreBase

Abstract base class for L2 tips stores. Provides common event handling logic while delegating storage operations to subclasses.
Implements: `L2BlockStreamEventHandler`, `L2BlockStreamLocalDataProvider`

**Constructor**
```typescript
new L2TipsStoreBase(initialBlockHash: BlockHash)
```

**Properties**
- `readonly initialBlockHash: BlockHash`

**Methods**
- `computeBlockHash(block: L2Block) => Promise<string>`
- `deleteBlockHashesBefore(blockNumber: BlockNumber) => Promise<void>` - Deletes all block hashes for blocks before the given block number.
- `getL2BlockHash(number: BlockNumber) => Promise<string | undefined>`
- `getL2Tips() => Promise<L2Tips>`
- `getStoredBlockHash(blockNumber: BlockNumber) => Promise<string | undefined>` - Gets the block hash for a given block number.
- `getTip(tag: L2BlockTag) => Promise<BlockNumber | undefined>` - Gets the block number for a given tag.
- `getTipCheckpoint(tag: L2BlockTag) => Promise<CheckpointId | undefined>` - Gets the checkpoint id recorded for a given tag, if any.
- `handleBlockStreamEvent(event: L2BlockStreamEvent) => Promise<void>`
- `recordBlockHashes(blocks: L2BlockId[]) => Promise<void>` - Records `(number → hash)` witnesses into the block-hash index without moving any tip cursor. In tips-only mode the hash history is sparse (one anchor per tip-moving poll), so a consumer that materializes per-height state should witness those heights or its prunes are over-deep by the gap to the nearest anchor. Witnesses are compared against the source, not trusted, so they cannot cause under-deep prunes; this is always safe to call.
- `runInTransaction<T>(fn: () => Promise<T>) => Promise<T>` - Runs the given function in a transaction. Memory stores can just execute immediately.
- `setBlockHash(blockNumber: BlockNumber, hash: string) => Promise<void>` - Sets the block hash for a given block number.
- `setTip(tag: L2BlockTag, blockNumber: BlockNumber) => Promise<void>` - Sets the block number for a given tag.
- `setTipCheckpoint(tag: L2BlockTag, checkpoint: CheckpointId) => Promise<void>` - Records the checkpoint id for a given tag.

### LogCursor

Cursor identifying a position in a tag's ordered log stream. Used as `afterLog` on `TagQuery` to resume pagination strictly after a previously-seen log. `(blockNumber, txIndexWithinBlock, logIndexWithinTx)` is sufficient to uniquely identify a position and matches the composite-key ordering of the archiver's log index, so the cursor maps directly to a key without a tx-hash lookup. All three fields are always present on LogResult, so a cursor is constructible from any returned log.

**Constructor**
```typescript
new LogCursor(blockNumber: BlockNumber, txIndexWithinBlock: number, logIndexWithinTx: number)
```

**Properties**
- `readonly blockNumber: BlockNumber` - The block the cursor points to.
- `readonly logIndexWithinTx: number` - The log index within the tx the cursor points to.
- `static schema: unknown`
- `readonly txIndexWithinBlock: number` - The tx index within the block the cursor points to.

**Methods**
- `equals(other: LogCursor) => boolean`
- `static fromBuffer(buffer: Buffer<ArrayBufferLike> | BufferReader) => LogCursor`
- `static fromLog(log: Pick<LogResultBase, "blockNumber" | "txIndexWithinBlock" | "logIndexWithinTx">) => LogCursor` - Builds a cursor that points at the given log. Pagination resumes strictly after this position.
- `static parseOptional(value: string) => LogCursor | undefined` - Parses a `<blockNumber>-<txIndexWithinBlock>-<logIndexWithinTx>` triple into a LogCursor. Throws on malformed input. Returns `undefined` for an empty / missing value so callers can use this directly as an optional CLI option parser.
- `static random() => LogCursor`
- `toBuffer() => Buffer`
- `toString() => string`

### MaliciousCommitteeAttestationsAndSigners

Malicious extension of CommitteeAttestationsAndSigners that keeps separate attestations and signers. Used for tricking the L1 contract into accepting attestations by reconstructing the correct committee commitment (which relies on the signers, ignoring the signatures) with an invalid set of attestation signatures.

Extends: `CommitteeAttestationsAndSigners`

**Constructor**
```typescript
new MaliciousCommitteeAttestationsAndSigners(attestations: CommitteeAttestation[], signers: EthAddress[], signatureContext: CoordinationSignatureContext)
```

**Properties**
- `attestations: CommitteeAttestation[]`
- `readonly primaryType: CoordinationSignatureType`
- `static schema: unknown`
- `readonly signatureContext: CoordinationSignatureContext`

**Methods**
- `static empty(signatureContext: CoordinationSignatureContext) => CommitteeAttestationsAndSigners`
- `getPackedAttestations() => ViemCommitteeAttestations`
- `getPayloadToSign() => Buffer`
- `getSignedAttestations() => CommitteeAttestation[]`
- `getSigners() => EthAddress[]`
- `static packAttestations(attestations: CommitteeAttestation[]) => ViemCommitteeAttestations` - Packs an array of committee attestations into the format expected by the Solidity contract
- `toString() => void` - Returns a string representation of an object.

### MaliciousYParityCommitteeAttestationsAndSigners

Malicious extension of CommitteeAttestationsAndSigners that rewrites every non-proposer signature slot's recovery byte to yParity form (v ∈ {0, 1}) in the packed output, after the honest `packAttestations` has already canonicalized it to v ∈ {27, 28}. Models a malicious selected proposer that hand-crafts `propose()` calldata L1 accepts but no honest node can byte-replay: each rewritten signature still recovers to the same member (r, s and the recovery parity are preserved), the bitmap bits stay set, and `getSigners()` stays consistent, so `propose()` does not revert `SignersSizeMismatch` -- yet the checkpoint can never be proven (`ECDSA.recover` rejects v ∉ {27, 28}). The proposer's own slot is left canonical so L1 `verifyProposer` (which recovers that slot) still accepts the checkpoint. For testing only.

Extends: `CommitteeAttestationsAndSigners`

**Constructor**
```typescript
new MaliciousYParityCommitteeAttestationsAndSigners(attestations: CommitteeAttestation[], proposerIndex: number, signatureContext: CoordinationSignatureContext)
```

**Properties**
- `attestations: CommitteeAttestation[]`
- `readonly primaryType: CoordinationSignatureType`
- `static schema: unknown`
- `readonly signatureContext: CoordinationSignatureContext`

**Methods**
- `static empty(signatureContext: CoordinationSignatureContext) => CommitteeAttestationsAndSigners`
- `getPackedAttestations() => ViemCommitteeAttestations`
- `getPayloadToSign() => Buffer`
- `getSignedAttestations() => CommitteeAttestation[]`
- `getSigners() => EthAddress[]`
- `static packAttestations(attestations: CommitteeAttestation[]) => ViemCommitteeAttestations` - Packs an array of committee attestations into the format expected by the Solidity contract
- `toString() => void` - Returns a string representation of an object.

### MinedTxReceipt

Receipt for a transaction that has been included in a block (proposed, checkpointed, proven, or finalized). All block-related fields are required for this variant.

Extends: `TxReceiptBase`
Implements: `TxReceiptInterface`

**Constructor**
```typescript
new MinedTxReceipt(txHash: TxHash, status: PROPOSED | CHECKPOINTED | PROVEN | FINALIZED, executionResult: TxExecutionResult, transactionFee: bigint, blockHash: BlockHash, blockNumber: BlockNumber, slotNumber: SlotNumber, txIndexInBlock: number, epochNumber: EpochNumber, txEffect: DefineIfFlag<Opts, "includeTxEffect", TxEffect>, debugLogs?: DebugLog[])
```

**Properties**
- `readonly blockHash: BlockHash` - The hash of the block containing the transaction.
- `readonly blockNumber: BlockNumber` - The block number in which the transaction was included.
- `debugLogs?: DebugLog[]` - Debug logs collected during public function execution. Served only when the node is in test mode and placed on the receipt only because it's a convenient place for it (the logs are printed out by the wallet when a mined tx receipt is obtained).
- `readonly epochNumber: EpochNumber` - The epoch number in which the transaction was included.
- `readonly error?: string` - Description of the transaction error, if any.
- `readonly executionResult: TxExecutionResult` - The execution result of the transaction, only set when the tx is in a block.
- `static schema: unknown`
- `readonly slotNumber: SlotNumber` - The slot number in which the transaction's block was built.
- `readonly status: PROPOSED | CHECKPOINTED | PROVEN | FINALIZED` - The transaction's block finalization status.
- `readonly transactionFee: bigint` - The transaction fee paid for the transaction.
- `readonly tx: undefined` - The pending transaction, attached when requested via `includePendingTx`.
- `readonly txEffect: DefineIfFlag<Opts, "includeTxEffect", TxEffect>` - The full transaction effect, attached when requested via `includeTxEffect`.
- `readonly txHash: TxHash` - A unique identifier for a transaction.
- `readonly txIndexInBlock: number` - The index of the transaction within its block.

**Methods**
- `static executionResultFromRevertCode(revertCode: RevertCode) => TxExecutionResult`
- `static from(fields: { blockHash: BlockHash; blockNumber: BlockNumber; ... }) => MinedTxReceipt`
- `hasExecutionReverted() => boolean` - Returns true if the transaction execution reverted.
- `hasExecutionSucceeded() => boolean` - Returns true if the transaction was executed successfully.
- `isDropped() => boolean` - Returns true (and narrows) if the transaction was dropped.
- `isMined() => boolean` - Returns true (and narrows) if the transaction has been included in a block.
- `isPending() => boolean` - Returns true (and narrows) if the transaction is pending.

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
- `toBuffer() => Buffer`
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

### NullDebugLogStore

No-op implementation for production mode.
Implements: `DebugLogStore`

**Constructor**
```typescript
new NullDebugLogStore()
```

**Properties**
- `isEnabled: unknown` - Whether debug log collection is enabled.

**Methods**
- `decorateReceiptWithLogs(_txHash: string, _receipt: TxReceipt) => void` - Decorate a TxReceipt with any stored debug logs for the given tx.
- `storeLogs(_txHash: string, _logs: DebugLog[]) => void` - Store debug logs for a processed transaction.

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
- `static fromFields(fields: Fr[] | FieldReader) => PartialStateReference`
- `static getFields(fields: FieldsOf<PartialStateReference>) => readonly []`
- `getSize() => number`
- `isEmpty() => boolean`
- `static random() => PartialStateReference`
- `toAbi() => []`
- `toBuffer() => Buffer`
- `toFields() => Fr[]`

### PendingTxReceipt

Receipt for a transaction that is in the mempool but not yet included in a block.

Extends: `UnminedTxReceipt`
Implements: `TxReceiptInterface`

**Constructor**
```typescript
new PendingTxReceipt(txHash: TxHash, tx: DefineIfFlag<Opts, "includePendingTx", Tx>)
```

**Properties**
- `readonly blockHash: undefined` - The hash of the block containing the transaction.
- `readonly blockNumber: undefined` - The block number in which the transaction was included.
- `readonly epochNumber: undefined` - The epoch number in which the transaction was included.
- `readonly error?: string` - Description of the transaction error, if any.
- `readonly executionResult: undefined` - The execution result of the transaction, only set when the tx is in a block.
- `static schema: unknown`
- `readonly slotNumber: undefined` - The slot number in which the transaction's block was built.
- `readonly status: PENDING` - The transaction's block finalization status.
- `readonly transactionFee: undefined` - The transaction fee paid for the transaction.
- `readonly tx: DefineIfFlag<Opts, "includePendingTx", Tx>` - The pending transaction, attached when requested via `includePendingTx`.
- `readonly txEffect: undefined` - The full transaction effect, attached when requested via `includeTxEffect`.
- `readonly txHash: TxHash` - A unique identifier for a transaction.
- `readonly txIndexInBlock: undefined` - The index of the transaction within its block.

**Methods**
- `static empty() => PendingTxReceipt`
- `static from(fields: { error?: string; status: PENDING; ... }) => PendingTxReceipt`
- `hasExecutionReverted() => boolean` - Returns true if the transaction execution reverted.
- `hasExecutionSucceeded() => boolean` - Returns true if the transaction was executed successfully.
- `isDropped() => boolean` - Returns true (and narrows) if the transaction was dropped.
- `isMined() => boolean` - Returns true (and narrows) if the transaction has been included in a block.
- `isPending() => boolean` - Returns true (and narrows) if the transaction is pending.

### PrivateCallExecutionResult

The result of executing a call to a private function.

**Constructor**
```typescript
new PrivateCallExecutionResult(acir: Buffer, vk: Buffer, partialWitness: Map<number, string>, publicInputs: PrivateCircuitPublicInputs, newNotes: NoteAndSlot[], noteHashNullifierCounterMap: Map<number, number>, returnValues: Fr[], offchainEffects: { data: Fr[] }[], taggingIndexRanges: TaggingIndexRange[], nestedExecutionResults: PrivateCallExecutionResult[], contractClassLogs: CountedContractClassLog[], profileResult?: PrivateExecutionProfileResult)
```

**Properties**
- `acir: Buffer` - The ACIR bytecode.
- `contractClassLogs: CountedContractClassLog[]` - Contract class logs emitted during execution of this function call. Note: We only need to collect the ContractClassLogFields as preimages for the tx. But keep them as ContractClassLog so that we can verify the log hashes before submitting the tx ().
- `nestedExecutionResults: PrivateCallExecutionResult[]` - The nested executions.
- `newNotes: NoteAndSlot[]` - The notes created in the executed function.
- `noteHashNullifierCounterMap: Map<number, number>` - Mapping of note hash counter to the counter of its nullifier.
- `offchainEffects: { data: Fr[] }[]` - The offchain effects emitted during execution of this function call via the `emit_offchain_effect` oracle.
- `partialWitness: Map<number, string>` - The partial witness.
- `profileResult?: PrivateExecutionProfileResult`
- `publicInputs: PrivateCircuitPublicInputs` - The call stack item.
- `returnValues: Fr[]` - The raw return values of the executed function.
- `static schema: unknown`
- `taggingIndexRanges: TaggingIndexRange[]` - The tagging index ranges used in this tx to compute tags for private logs
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
- `static fromBlobFields(emittedLength: number, fields: Fr[] | FieldReader) => PrivateLog`
- `static fromBuffer(buffer: Buffer<ArrayBufferLike> | BufferReader) => PrivateLog`
- `static fromFields(fields: Fr[] | FieldReader) => PrivateLog`
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
new PrivateTxConstantData(anchorBlockHeader: BlockHeader, txContext: TxContext, txRequestSalt: Fr, vkTreeRoot: Fr, protocolContracts: ProtocolContracts)
```

**Properties**
- `anchorBlockHeader: BlockHeader` - Header of a block whose state is used during execution (not the block the transaction is included in).
- `protocolContracts: ProtocolContracts` - List of protocol contracts.
- `txContext: TxContext` - Context of the transaction. Note: `chainId` and `version` in txContext are not redundant to the values in self.anchor_block_header.global_variables because they can be different in case of a protocol upgrade. In such a situation we could be using header from a block before the upgrade took place but be using the updated protocol to execute and prove the transaction.
- `txRequestSalt: Fr` - Salt of the transaction request (`TxRequest.salt`). Bound to the user's `tx_request` by the Init circuit and kept constant by every subsequent kernel so that each app circuit's `txRequestSalt` public input can be checked against it. It is intentionally not carried into `TxConstantData`: it is dropped by the Tail circuits rather than being exposed by the final (hiding) kernel.
- `vkTreeRoot: Fr` - Root of the vk tree for the protocol circuits.

**Methods**
- `clone() => PrivateTxConstantData`
- `static empty() => PrivateTxConstantData`
- `static from(fields: FieldsOf<PrivateTxConstantData>) => PrivateTxConstantData`
- `static fromBuffer(buffer: Buffer<ArrayBufferLike> | BufferReader) => PrivateTxConstantData`
- `static fromFields(fields: Fr[] | FieldReader) => PrivateTxConstantData`
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
- `static fromFields(fields: Fr[] | FieldReader) => ProtocolContracts`
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
- `toBuffer() => Buffer`

### PublicKeys

A non-owner's view of an account's master public keys. Only `ivpkM` is exposed as a point (since address derivation needs the curve point in-circuit); the other five keys are exposed as their `hashPublicKey` digests.

**Constructor**
```typescript
new PublicKeys(npkMHash: Fr, ivpkM: Point, ovpkMHash: Fr, tpkMHash: Fr, mspkMHash: Fr, fbpkMHash: Fr)
```

**Properties**
- `fbpkMHash: Fr` - Hash of the master fallback public key
- `ivpkM: Point` - Master incoming viewing public key
- `mspkMHash: Fr` - Hash of the master message-signing public key
- `npkMHash: Fr` - Hash of the master nullifier public key
- `ovpkMHash: Fr` - Hash of the master outgoing viewing public key
- `static schema: unknown`
- `tpkMHash: Fr` - Hash of the master tagging public key

**Methods**
- `static default() => PublicKeys`
- `encodeToNoir() => Fr[]`
- `equals(other: PublicKeys) => boolean`
- `static from(fields: FieldsOf<PublicKeys>) => PublicKeys`
- `static fromBuffer(buffer: Buffer<ArrayBufferLike> | BufferReader) => PublicKeys`
- `static fromFields(fields: Fr[] | FieldReader) => PublicKeys`
- `static fromPlainObject(obj: any) => PublicKeys` - Creates a PublicKeys from a plain object without Zod validation. Suitable for deserializing trusted data (e.g., from C++ via MessagePack).
- `static fromString(keys: string) => PublicKeys`
- `hash() => Promise<Fr>`
- `isEmpty() => boolean`
- `static random() => Promise<PublicKeys>`
- `toBuffer() => Buffer` - Converts the PublicKeys instance into a Buffer. This method should be used when encoding the address for storage, transmission or serialization purposes.
- `toFields() => Fr[]` - Wire-format fields matching Noir's struct flattening of `PublicKeys`: `[npk_m_hash, ivpk_m.x, ivpk_m.y, ovpk_m_hash, tpk_m_hash, mspk_m_hash, fbpk_m_hash]` (7 fields).
- `toNoirStruct() => { fbpk_m_hash: Fr; ivpk_m: { inner: { x: Fr; y: Fr } }; ... }`
- `toString() => string`

### PublicLog

**Constructor**
```typescript
new PublicLog(contractAddress: AztecAddress, fields: Fr[])
```

**Properties**
- `readonly contractAddress: AztecAddress`
- `readonly fields: Fr[]`
- `static schema: unknown`

**Methods**
- `[custom]() => string`
- `static empty() => PublicLog`
- `equals(other: this) => boolean`
- `static from(fields: FieldsOf<PublicLog>) => PublicLog`
- `static fromBuffer(buffer: Buffer<ArrayBufferLike> | BufferReader) => PublicLog`
- `static fromFields(fields: Fr[] | FieldReader) => PublicLog`
- `static fromPlainObject(obj: any) => PublicLog`
- `getEmittedFields() => Fr[]` - Returns the serialized log (field as in noir field and not a struct field).
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
new PublicSimulationOutput(revertReason: SimulationError | undefined, globalVariables: GlobalVariables, txEffect: TxEffect, publicReturnValues: NestedProcessReturnValues[], gasUsed: GasUsed, debugLogs: DebugLog[])
```

**Properties**
- `debugLogs: DebugLog[]`
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
- `static schemaFor<N extends number>(expectedSize?: N) => ZodPipe<ZodFor<Buffer<ArrayBufferLike>>, ZodTransform<RecursiveProof<N>, Buffer<ArrayBufferLike>>>` - Creates an instance from a hex string with expected size.
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
- `readonly immutablesHash: Fr`
- `readonly initializationHash: Fr`
- `readonly originalContractClassId: Fr`
- `readonly publicKeys: PublicKeys`
- `readonly salt: Fr`
- `readonly version: 2`

**Methods**
- `static default() => SerializableContractInstance`
- `static fromBuffer(bufferOrReader: Buffer<ArrayBufferLike> | BufferReader) => SerializableContractInstance`
- `static random(opts: Partial<FieldsOf<ContractInstance>>) => Promise<SerializableContractInstance>`
- `toBuffer() => Buffer<ArrayBufferLike>`
- `withAddress(address: AztecAddress) => ContractInstanceWithAddress` - Returns a copy of this object with its address included.

### SerializableContractInstancePreimage

**Constructor**
```typescript
new SerializableContractInstancePreimage(instance: ContractInstancePreimage)
```

**Properties**
- `readonly deployer: AztecAddress`
- `readonly immutablesHash: Fr`
- `readonly initializationHash: Fr`
- `readonly originalContractClassId: Fr`
- `readonly publicKeys: PublicKeys`
- `readonly salt: Fr`
- `readonly version: 2`

**Methods**
- `static fromBuffer(bufferOrReader: Buffer<ArrayBufferLike> | BufferReader) => SerializableContractInstancePreimage`
- `toBuffer() => Buffer<ArrayBufferLike>`
- `withAddress(address: AztecAddress) => ContractInstancePreimageWithAddress` - Returns a copy of this object with its address included.

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
- `static random() => Signature` - Generates a random valid ECDSA signature with a low s-value by signing a random message with a random key.
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
- `static schema: unknown`
- `readonly value: Fr`

**Methods**
- `static compute(preTag: PreTag) => Promise<SiloedTag>`
- `static computeFromTagAndApp(tag: Tag, app: AztecAddress) => Promise<SiloedTag>` - Unlike `compute`, this expects a tag whose value is already domain-separated.
- `equals(other: SiloedTag) => boolean`
- `static random() => SiloedTag`
- `toJSON() => string`
- `toString() => string`

### SimulationOverrides

**Constructor**
```typescript
new SimulationOverrides(args: { contracts?: ContractOverrides; publicStorage?: PublicStorageOverride[] })
```

**Properties**
- `contracts?: ContractOverrides`
- `publicStorage?: PublicStorageOverride[]`
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
- `static fromFields(fields: Fr[] | FieldReader) => StateReference`
- `static getFields(fields: FieldsOf<StateReference>) => readonly []`
- `getSize() => number`
- `isEmpty() => boolean`
- `static random() => StateReference`
- `toAbi() => []`
- `toBuffer() => Buffer`
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
- `static schema: unknown`
- `readonly value: Fr`

**Methods**
- `static compute(preTag: PreTag) => Promise<Tag>`
- `equals(other: Tag) => boolean`
- `static random() => Tag`
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
- `static fromFields(fields: Fr[] | FieldReader) => TreeSnapshots`
- `static fromPlainObject(obj: any) => TreeSnapshots` - Creates a TreeSnapshots instance from a plain object without Zod validation. This method is optimized for performance and skips validation, making it suitable for deserializing trusted data (e.g., from C++ via MessagePack).
- `getSize() => number`
- `isEmpty() => boolean`
- `toBuffer() => Buffer`
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
- `static fromBuffers(txBuffer: Buffer<ArrayBufferLike> | BufferReader, proofBuffer: Buffer<ArrayBufferLike> | BufferReader) => Tx` - Deserializes a Tx from separately-stored tx and proof buffers. The tx buffer is expected to carry an empty proof placeholder (as produced by `withoutProof().toBuffer()`), which is skipped in favor of the given proof.
- `generateP2PMessageIdentifier() => Promise<BaseBuffer32>`
- `getCalldataMap() => Map<string, Fr[]>`
- `getContractClassLogs() => ContractClassLog[]`
- `getGasSettings() => GasSettings`
- `getNonRevertiblePublicCallRequestsWithCalldata() => PublicCallRequestWithCalldata[]`
- `getPrivateTxEffectsSizeInFields() => number` - Returns the number of fields this tx's effects will occupy in the blob, based on its private side effects only. Accurate for txs without public calls. For txs with public calls, the actual size will be larger due to public execution outputs.
- `getPublicCallRequestsWithCalldata() => PublicCallRequestWithCalldata[]`
- `getRevertiblePublicCallRequestsWithCalldata() => PublicCallRequestWithCalldata[]`
- `getSize() => number` - Get the size of the gossipable object. This is used for metrics recording.
- `getSplitContractClassLogs(revertible: boolean) => ContractClassLog[]` - Gets either revertible or non revertible contract class logs emitted by this tx.
- `getStats() => TxStats` - Returns stats about this tx.
- `getTeardownPublicCallRequestWithCalldata() => PublicCallRequestWithCalldata | undefined`
- `getTotalPublicCalldataCount() => number`
- `getTxHash() => TxHash` - Return transaction hash.
- `hasPublicCalls() => boolean`
- `numberOfPublicCalls() => number`
- `p2pMessageLoggingIdentifier() => Promise<BaseBuffer32>` - A digest of the message information **used for logging only**. The identifier used for deduplication is `getMsgIdFn` as defined in `encoding.ts` which is a hash over topic and data.
- `static random(args: { randomProof?: boolean; txHash?: string | TxHash }) => Tx` - Creates a random tx.
- `recomputeHash() => Promise<TxHash>` - Recomputes the tx hash. Used for testing purposes only when a property of the tx was mutated.
- `toBuffer() => Buffer` - Serializes the Tx object into a Buffer.
- `toMessage() => Buffer`
- `validateTxHash() => Promise<boolean>` - Validates that the tx hash matches the computed hash from the tx data. This should be called when deserializing a tx from an untrusted source.
- `withoutProof() => Tx` - Returns a copy of this tx with its proof stripped (replaced by an empty ChonkProof). Used when archiving txs or shipping a pending tx over RPC where the proof is not needed. Note that Tx.clone with `cloneProof = false` does not strip the proof; it shares the original.

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
- `static fromFields(fields: Fr[] | FieldReader) => TxConstantData`
- `static getFields(fields: FieldsOf<TxConstantData>) => readonly []`
- `getSize() => number`
- `toBuffer() => Buffer`
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
- `static fromFields(fields: Fr[] | FieldReader) => TxContext`
- `static getFields(fields: FieldsOf<TxContext>) => readonly []` - Serialize into a field array. Low-level utility.
- `getSize() => number`
- `isEmpty() => boolean`
- `toBuffer() => Buffer` - Serialize as a buffer.
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
- `toBuffer() => Buffer`
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
- `getTxHash() => Promise<TxHash>`
- `static random() => Promise<TxProvingResult>`
- `toTx() => Promise<Tx>`

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

### TxSimulationResult

**Constructor**
```typescript
new TxSimulationResult(privateExecutionResult: PrivateExecutionResult, publicInputs: PrivateKernelTailCircuitPublicInputs, publicOutput?: PublicSimulationOutput, stats?: SimulationStats)
```

**Properties**
- `gasUsed: unknown`
- `offchainEffects: unknown`
- `privateExecutionResult: PrivateExecutionResult`
- `publicInputs: PrivateKernelTailCircuitPublicInputs`
- `publicOutput?: PublicSimulationOutput`
- `static schema: unknown`
- `stats?: SimulationStats`

**Methods**
- `static from(fields: Omit<FieldsOf<TxSimulationResult>, "gasUsed" | "offchainEffects">) => TxSimulationResult`
- `static fromPrivateSimulationResultAndPublicOutput(privateSimulationResult: PrivateSimulationResult, publicOutput?: PublicSimulationOutput, stats?: SimulationStats) => TxSimulationResult`
- `getPrivateReturnValues() => NestedProcessReturnValues`
- `getPublicReturnValues() => NestedProcessReturnValues[]`
- `static random() => Promise<TxSimulationResult>`
- `toSimulatedTx() => Promise<Tx>`

### UtilityExecutionResult

**Constructor**
```typescript
new UtilityExecutionResult(result: Fr[], offchainEffects: { contractAddress: AztecAddress; data: Fr[] }[], anchorBlockTimestamp: bigint, stats?: SimulationStats)
```

**Properties**
- `anchorBlockTimestamp: bigint` - Timestamp of the anchor block used during utility execution.
- `offchainEffects: { contractAddress: AztecAddress; data: Fr[] }[]`
- `result: Fr[]`
- `static schema: unknown`
- `stats?: SimulationStats`

**Methods**
- `static random() => UtilityExecutionResult`

## Interfaces

### AbiNamedValue

An exported value together with the name of the global that produced it.

**Properties**
- `name: string` - The name of the exported global.
- `value: AbiValue` - The exported value.

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

### BlockMinFeesProvider

Provides projected minimum gas fees for the next block.

**Methods**
- `getCurrentMinFees() => Promise<GasFees>`

### ContractArtifact

Defines artifact of a contract.

**Properties**
- `aztecVersion: string` - The version of the Aztec stack that compiled this artifact.
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
- `getContract(address: AztecAddress, timestamp: bigint) => Promise<ContractInstanceWithAddress | undefined>` - Returns a publicly deployed contract instance given its address.
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

The address preimage plus the current contract class id, which is chain-tracked state derived from the ContractInstanceRegistry (it equals the original class id unless the contract has been upgraded).

Extends: `ContractInstancePreimage`

**Properties**
- `currentContractClassId: Fr` - Identifier of the contract class this instance currently runs (as of some block).
- `deployer: AztecAddress` - Optional deployer address or zero if this was a universal deploy.
- `immutablesHash: Fr` - Hash of Immutables Values the contract is deployed with.
- `initializationHash: Fr` - Hash of the selector and arguments to the constructor.
- `originalContractClassId: Fr` - Identifier of the original (at deployment) contract class for this instance
- `publicKeys: PublicKeys` - Public keys associated with this instance.
- `salt: Fr` - User-generated pseudorandom value for uniqueness.
- `version: 2` - Version identifier. Initially one, bumped for any changes to the contract instance struct.

### ContractInstancePreimage

The address preimage of a contract instance: the immutable data that hashes to its address, i.e. everything a contract deployment commits to. Note that `originaContractClassId` is not necessarily the instance's _current_ class id, in case of upgrades: that one is not part of the preimage and is instead derived from chain state.

**Properties**
- `deployer: AztecAddress` - Optional deployer address or zero if this was a universal deploy.
- `immutablesHash: Fr` - Hash of Immutables Values the contract is deployed with.
- `initializationHash: Fr` - Hash of the selector and arguments to the constructor.
- `originalContractClassId: Fr` - Identifier of the original (at deployment) contract class for this instance
- `publicKeys: PublicKeys` - Public keys associated with this instance.
- `salt: Fr` - User-generated pseudorandom value for uniqueness.
- `version: 2` - Version identifier. Initially one, bumped for any changes to the contract instance struct.

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

### DebugLogStore

Store for debug logs emitted by public functions during transaction execution. Uses the Null Object pattern: production code uses NullDebugLogStore (no-op), while test mode uses InMemoryDebugLogStore (stores and serves logs).

**Properties**
- `readonly isEnabled: boolean` - Whether debug log collection is enabled.

**Methods**
- `decorateReceiptWithLogs(txHash: string, receipt: TxReceipt) => void` - Decorate a TxReceipt with any stored debug logs for the given tx.
- `storeLogs(txHash: string, logs: DebugLog[]) => void` - Store debug logs for a processed transaction.

### FeeProvider

Provides current and predicted fee information for transaction pricing.

**Methods**
- `getCurrentMinFees() => Promise<GasFees>` - Returns the current minimum fees for inclusion in the next block.
- `getPredictedMinFees(manaUsage?: ManaUsageEstimate) => Promise<GasFees[]>` - Returns current min fees first, followed by predicted min fees for each slot in the prediction window.

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
- `buildCheckpointGlobalVariables(coinbase: EthAddress, feeRecipient: AztecAddress, slotNumber: SlotNumber, simulationOverridesPlan?: SimulationOverridesPlan) => Promise<CheckpointGlobalVariables>` - Builds global variables that are constant throughout a checkpoint.

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
- `getBlock(query: NormalizedBlockParameter) => Promise<L2Block | undefined>` - Gets an L2 block matching the given query.
- `getBlockData(query: NormalizedBlockParameter) => Promise<BlockData | undefined>` - Gets block metadata (without tx data) matching the given query.
- `getBlockNumber() => Promise<BlockNumber>` - Gets the number of the latest L2 block processed by the block source implementation.
- `getBlocks(query: BlocksQuery) => Promise<L2Block[]>` - Gets a collection of L2 blocks matching the given query.
- `getBlocksData(query: BlocksQuery) => Promise<BlockData[]>` - Gets a collection of block metadata entries matching the given query.
- `getBlocksForSlot(slotNumber: SlotNumber) => Promise<L2Block[]>` - Returns all blocks for a given slot.
- `getCheckpoint(query: CheckpointQuery) => Promise<PublishedCheckpoint | undefined>` - Gets a single confirmed checkpoint matching the given query. Heavy shape: includes nested full `L2Block`s with transaction bodies.
- `getCheckpointData(query: CheckpointQuery) => Promise<CheckpointData | undefined>` - Gets lightweight checkpoint metadata for a single checkpoint. Cheap passthrough for metadata-only queries (no block body reads).
- `getCheckpointNumber() => Promise<CheckpointNumber>` - Gets the number of the latest L2 checkpoint processed by the block source implementation.
- `getCheckpoints(query: CheckpointsQuery) => Promise<PublishedCheckpoint[]>` - Gets a collection of confirmed checkpoints matching the given query. Heavy shape: includes nested full `L2Block`s with transaction bodies.
- `getCheckpointsData(query: CheckpointsQuery) => Promise<CheckpointData[]>` - Gets a collection of lightweight checkpoint metadata entries matching the given query. Cheap passthrough for metadata-only queries (no block body reads).
- `getGenesisBlockHash() => BlockHash` - Returns the precomputed hash of the genesis block header. Synchronous because the hash is derived from the initial block header at construction time and cached by implementers.
- `getGenesisValues() => Promise<{ genesisArchiveRoot: Fr }>` - Returns values for the genesis block
- `getL1Constants() => Promise<L1RollupConstants>` - Returns the rollup constants for the current chain.
- `getL1Timestamp() => Promise<bigint | undefined>` - Latest synced L1 timestamp.
- `getL2Tips() => Promise<L2Tips>` - Returns the tips of the L2 chain.
- `getL2ToL1MembershipWitness(txHash: TxHash, message: Fr, messageIndexInTx?: number) => Promise<L2ToL1MembershipWitness | undefined>` - Returns the L2-to-L1 membership witness for `message` emitted by tx `txHash`, built against the smallest partial-proof root on the Outbox that covers the tx's checkpoint. The Outbox roots are read lazily, pinned to the node's synced L1 block, so the witness reflects the node's synced view. Returns `undefined` if the tx isn't yet in a block/epoch or no covering root has landed on L1 as of the synced block. Caveat: cached roots that are sealed and L1-finalized are not re-validated. A reorg deeper than L1 finality could leave the node serving a witness against a no-longer-canonical root.
- `getPendingChainValidationStatus() => Promise<ValidateCheckpointResult>` - Returns the status of the pending chain validation. If the chain is invalid, reports the earliest consecutive checkpoint that is invalid, along with the reason for being invalid, which can be used to trigger an invalidation.
- `getProposedCheckpointData(query?: ProposedCheckpointQuery) => Promise<ProposedCheckpointData | undefined>` - Looks up a proposed (archiver-internal, not-yet-L1-confirmed) checkpoint. Returns the latest proposed entry when called with no args or `{ tag: 'proposed' }`; since a proposed entry can only be stored with a checkpoint number beyond the confirmed frontier (and is deleted on confirmation), the latest entry is always the leading one. Callers derive the proposed tip from the payload (checkpoint number, and last block `startBlock + blockCount - 1`). With `{ number }` or `{ slot }`, returns the matching entry or undefined. Never falls back to confirmed checkpoints.
- `getRegistryAddress() => Promise<EthAddress>` - Method to fetch the registry contract address at the base-layer.
- `getRollupAddress() => Promise<EthAddress>` - Method to fetch the rollup contract address at the base-layer.
- `getSyncedL2EpochNumber() => Promise<EpochNumber | undefined>` - Returns the last L2 epoch number that has been fully synchronized from L1. An epoch is fully synced when all its L2 slots have been fully synced.
- `getSyncedL2SlotNumber() => Promise<SlotNumber | undefined>` - Returns the last L2 slot number for which we have all L1 data needed to build the next checkpoint. Determined by the max of two signals: L1 block sync progress and latest synced checkpoint slot. The checkpoint signal handles missed L1 blocks, since a published checkpoint seals the message tree for the next checkpoint via the inbox LAG mechanism.
- `getTxEffect(txHash: TxHash) => Promise<IndexedTxEffect | undefined>` - Gets a tx effect.
- `isEpochComplete(epochNumber: EpochNumber) => Promise<boolean>` - Returns whether the given epoch is completed on L1, based on the current L1 and L2 block numbers.
- `isPendingChainInvalid() => Promise<boolean>` - Returns whether the latest block in the pending chain on L1 is invalid (ie its attestations are incorrect). Note that invalid blocks do not get synced, so the latest block returned by the block source is always a valid one.
- `isPruneDueAtSlot(slot: SlotNumber) => Promise<boolean>` - Returns true iff `canPruneAtTime` would be true at the latest L1 timestamp inside the L2 slot's window. Computed entirely from local archiver state (no L1 RPC).
- `syncImmediate() => Promise<void>` - Force a sync.

### L2BlockSourceEventEmitter

Interface of classes allowing for the retrieval of L2 blocks.

Extends: `L2BlockSource`

**Properties**
- `events: ArchiverEmitter`

**Methods**
- `getBlock(query: NormalizedBlockParameter) => Promise<L2Block | undefined>` - Gets an L2 block matching the given query.
- `getBlockData(query: NormalizedBlockParameter) => Promise<BlockData | undefined>` - Gets block metadata (without tx data) matching the given query.
- `getBlockNumber() => Promise<BlockNumber>` - Gets the number of the latest L2 block processed by the block source implementation.
- `getBlocks(query: BlocksQuery) => Promise<L2Block[]>` - Gets a collection of L2 blocks matching the given query.
- `getBlocksData(query: BlocksQuery) => Promise<BlockData[]>` - Gets a collection of block metadata entries matching the given query.
- `getBlocksForSlot(slotNumber: SlotNumber) => Promise<L2Block[]>` - Returns all blocks for a given slot.
- `getCheckpoint(query: CheckpointQuery) => Promise<PublishedCheckpoint | undefined>` - Gets a single confirmed checkpoint matching the given query. Heavy shape: includes nested full `L2Block`s with transaction bodies.
- `getCheckpointData(query: CheckpointQuery) => Promise<CheckpointData | undefined>` - Gets lightweight checkpoint metadata for a single checkpoint. Cheap passthrough for metadata-only queries (no block body reads).
- `getCheckpointNumber() => Promise<CheckpointNumber>` - Gets the number of the latest L2 checkpoint processed by the block source implementation.
- `getCheckpoints(query: CheckpointsQuery) => Promise<PublishedCheckpoint[]>` - Gets a collection of confirmed checkpoints matching the given query. Heavy shape: includes nested full `L2Block`s with transaction bodies.
- `getCheckpointsData(query: CheckpointsQuery) => Promise<CheckpointData[]>` - Gets a collection of lightweight checkpoint metadata entries matching the given query. Cheap passthrough for metadata-only queries (no block body reads).
- `getGenesisBlockHash() => BlockHash` - Returns the precomputed hash of the genesis block header. Synchronous because the hash is derived from the initial block header at construction time and cached by implementers.
- `getGenesisValues() => Promise<{ genesisArchiveRoot: Fr }>` - Returns values for the genesis block
- `getL1Constants() => Promise<L1RollupConstants>` - Returns the rollup constants for the current chain.
- `getL1Timestamp() => Promise<bigint | undefined>` - Latest synced L1 timestamp.
- `getL2Tips() => Promise<L2Tips>` - Returns the tips of the L2 chain.
- `getL2ToL1MembershipWitness(txHash: TxHash, message: Fr, messageIndexInTx?: number) => Promise<L2ToL1MembershipWitness | undefined>` - Returns the L2-to-L1 membership witness for `message` emitted by tx `txHash`, built against the smallest partial-proof root on the Outbox that covers the tx's checkpoint. The Outbox roots are read lazily, pinned to the node's synced L1 block, so the witness reflects the node's synced view. Returns `undefined` if the tx isn't yet in a block/epoch or no covering root has landed on L1 as of the synced block. Caveat: cached roots that are sealed and L1-finalized are not re-validated. A reorg deeper than L1 finality could leave the node serving a witness against a no-longer-canonical root.
- `getPendingChainValidationStatus() => Promise<ValidateCheckpointResult>` - Returns the status of the pending chain validation. If the chain is invalid, reports the earliest consecutive checkpoint that is invalid, along with the reason for being invalid, which can be used to trigger an invalidation.
- `getProposedCheckpointData(query?: ProposedCheckpointQuery) => Promise<ProposedCheckpointData | undefined>` - Looks up a proposed (archiver-internal, not-yet-L1-confirmed) checkpoint. Returns the latest proposed entry when called with no args or `{ tag: 'proposed' }`; since a proposed entry can only be stored with a checkpoint number beyond the confirmed frontier (and is deleted on confirmation), the latest entry is always the leading one. Callers derive the proposed tip from the payload (checkpoint number, and last block `startBlock + blockCount - 1`). With `{ number }` or `{ slot }`, returns the matching entry or undefined. Never falls back to confirmed checkpoints.
- `getRegistryAddress() => Promise<EthAddress>` - Method to fetch the registry contract address at the base-layer.
- `getRollupAddress() => Promise<EthAddress>` - Method to fetch the rollup contract address at the base-layer.
- `getSyncedL2EpochNumber() => Promise<EpochNumber | undefined>` - Returns the last L2 epoch number that has been fully synchronized from L1. An epoch is fully synced when all its L2 slots have been fully synced.
- `getSyncedL2SlotNumber() => Promise<SlotNumber | undefined>` - Returns the last L2 slot number for which we have all L1 data needed to build the next checkpoint. Determined by the max of two signals: L1 block sync progress and latest synced checkpoint slot. The checkpoint signal handles missed L1 blocks, since a published checkpoint seals the message tree for the next checkpoint via the inbox LAG mechanism.
- `getTxEffect(txHash: TxHash) => Promise<IndexedTxEffect | undefined>` - Gets a tx effect.
- `isEpochComplete(epochNumber: EpochNumber) => Promise<boolean>` - Returns whether the given epoch is completed on L1, based on the current L1 and L2 block numbers.
- `isPendingChainInvalid() => Promise<boolean>` - Returns whether the latest block in the pending chain on L1 is invalid (ie its attestations are incorrect). Note that invalid blocks do not get synced, so the latest block returned by the block source is always a valid one.
- `isPruneDueAtSlot(slot: SlotNumber) => Promise<boolean>` - Returns true iff `canPruneAtTime` would be true at the latest L1 timestamp inside the L2 slot's window. Computed entirely from local archiver state (no L1 RPC).
- `syncImmediate() => Promise<void>` - Force a sync.

### L2BlockStreamEventHandler

Interface to a handler of events emitted.

**Methods**
- `handleBlockStreamEvent(event: L2BlockStreamEvent) => Promise<void>`

### L2BlockStreamLocalDataProvider

Interface to the local view of the chain. Implemented by world-state and l2-tips-store. Anything implementing L2TipsProvider also satisfies this contract structurally, since LocalL2Tips is assignable to LocalChainTips.

**Methods**
- `getL2BlockHash(number: number) => Promise<string | undefined>`
- `getL2Tips() => Promise<LocalChainTips>`

### L2TipsProvider

Provides the current chain tips. Implemented by world-state, l2-tips-store, and AztecNode.

**Methods**
- `getL2Tips() => Promise<L2Tips>`

### NodeInfo

Provides basic information about the running node.

**Properties**
- `enr: string | undefined` - The node's ENR.
- `l1ChainId: number` - L1 chain id.
- `l1ContractAddresses: L1ContractAddresses` - The deployed l1 contract addresses
- `nodeVersion: string` - Version as tracked in the aztec-packages repository.
- `protocolContractAddresses: ProtocolContractAddresses` - Protocol contract addresses
- `realProofs: boolean` - Whether the node requires real proofs for transaction submission.
- `rollupVersion: number` - Rollup version.
- `txsLimits: TxsLimits` - Limits a single tx may declare on this network. Clients rely on this to set fallback gas limits.

### PrivateFunction

Private function definition within a contract class.

**Properties**
- `selector: FunctionSelector` - Selector of the function. Calculated as the hash of the method name and parameters. The specification of this is not enforced by the protocol.
- `vkHash: Fr` - Hash of the verification key associated to this private function.

### ProgramDebugInfo

The debug information for a given program (a collection of functions)

**Properties**
- `debug_infos: DebugInfo[]` - A list of debug information that matches with each function in a program

### ProposedCheckpointSink

Interface for classes that can receive and store proposed (not-yet-L1-confirmed) checkpoints.

**Methods**
- `addProposedCheckpoint(checkpoint: ProposedCheckpointInput) => Promise<void>` - Adds a proposed checkpoint to the store. The archive and checkpointOutHash are computed internally from the already-stored blocks, so every block in the checkpoint must be added (via L2BlockSink.addBlock) before calling this.

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

### TxReceiptInterface

Returned from a `getTxReceipt` call to the node RPC API.

**Properties**
- `blockHash?: BlockHash` - The hash of the block containing the transaction.
- `blockNumber?: BlockNumber` - The block number in which the transaction was included.
- `debugLogs?: DebugLog[]` - Debug logs collected during public function execution. Served only when the node is in test mode and placed on the receipt only because it's a convenient place for it (the logs are printed out by the wallet when a mined tx receipt is obtained).
- `epochNumber?: EpochNumber` - The epoch number in which the transaction was included.
- `error?: string` - Description of the transaction error, if any.
- `executionResult?: TxExecutionResult` - The execution result of the transaction, only set when the tx is in a block.
- `slotNumber?: SlotNumber` - The slot number in which the transaction's block was built.
- `status: TxStatus` - The transaction's block finalization status.
- `transactionFee?: bigint` - The transaction fee paid for the transaction.
- `tx?: Tx` - The pending transaction, attached when requested via `includePendingTx`.
- `txEffect?: TxEffect` - The full transaction effect, attached when requested via `includeTxEffect`.
- `txIndexInBlock?: number` - The index of the transaction within its block.

**Methods**
- `hasExecutionReverted() => boolean` - Returns true if the transaction execution reverted.
- `hasExecutionSucceeded() => boolean` - Returns true if the transaction was executed successfully.
- `isDropped() => boolean` - Returns true (and narrows) if the transaction was dropped.
- `isMined() => boolean` - Returns true (and narrows) if the transaction has been included in a block.
- `isPending() => boolean` - Returns true (and narrows) if the transaction is pending.

### TxValidator

**Methods**
- `validateTx(tx: T) => Promise<TxValidationResult>`

### TxsLimits

Limits a single transaction may declare on a network.

**Properties**
- `gas: { daGas: number; l2Gas: number }` - Maximum gas limits a single tx may declare: the smaller of the per-tx maximum and the per-block allocation.

## Functions

### accumulatePrivateReturnValues
```typescript
function accumulatePrivateReturnValues(executionResult: PrivateExecutionResult) => NestedProcessReturnValues
```
Recursively accumulate the return values of a call result and its nested executions, so they can be retrieved in order.

### appSiloEcdhSharedSecret
```typescript
function appSiloEcdhSharedSecret(secretKey: Fq, publicKey: Point, contractAddress: AztecAddress) => Promise<Fr>
```
Derives an app-siloed ECDH shared secret from keys: ECDHs `S = secretKey * publicKey` via deriveEcdhSharedSecretPoint, then app-silos it via appSiloEcdhSharedSecretPoint.

### appSiloEcdhSharedSecretPoint
```typescript
function appSiloEcdhSharedSecretPoint(point: Point, app: AztecAddress) => Promise<Fr>
```
App-silos a shared secret point: `s_app = h(DOM_SEP__APP_SILOED_ECDH_SHARED_SECRET, S.x, S.y, app)`. Mirrors `compute_app_siloed_shared_secret` in aztec-nr.

### appTaggingSecretFromString
```typescript
function appTaggingSecretFromString(str: string) => AppTaggingSecret
```
Parses a stored `AppTaggingSecret` string key.

### appTaggingSecretKindFromDeliveryMode
```typescript
function appTaggingSecretKindFromDeliveryMode(deliveryMode: number) => AppTaggingSecretKind
```

### bufferAsFields
```typescript
function bufferAsFields(input: Buffer, targetLength: number) => Fr[]
```
Formats a buffer as an array of fields. Splits the input into 31-byte chunks, and stores each of them into a field, omitting the field's first byte, then adds zero-fields at the end until the max length.

### bufferFromFields
```typescript
function bufferFromFields(fields: Fr[], maxByteLength?: number) => Buffer
```
Recovers a buffer from an array of fields previously encoded with bufferAsFields. The first field encodes the byte length of the original buffer. The remaining fields each carry 31 bytes of payload (the leading byte of each 32-byte field element is skipped). If the declared byte length exceeds the bytes available from the payload fields, the result is zero-padded to the full declared length. This is important for correctness when the field array has been truncated (e.g. contract class logs reconstructed from blobs using a short emittedLength): without padding, the resulting buffer would be shorter than declared, causing bytecode commitment computations to diverge from what the circuit produced.

### canBeMappedFromNullOrUndefined
```typescript
function canBeMappedFromNullOrUndefined(abiType: AbiType) => boolean
```
Returns whether `null` or `undefined` can be mapped to a valid ABI value for this type.

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
function computeAppNullifierHidingKey(masterNullifierHidingSecretKey: Fq, app: AztecAddress) => Promise<Fr>
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

### computeCongestionMultiplier
```typescript
function computeCongestionMultiplier(excessMana: bigint, manaTarget: bigint) => bigint
```
Computes the congestion multiplier from excess mana (1e9 = no congestion).

### computeContractAddressFromInstance
```typescript
function computeContractAddressFromInstance(instance: ContractInstancePreimage | { originalContractClassId: Fr; saltedInitializationHash: Fr } & Pick<ContractInstance, "publicKeys">) => Promise<AztecAddress>
```
Returns the deployment address for a given contract instance. ``` salted_initialization_hash = poseidon2(DOM_SEP__SALTED_INITIALIZATION_HASH, [salt, initialization_hash, deployer, immutables_hash]) partial_address = poseidon2(DOM_SEP__PARTIAL_ADDRESS, [contract_class_id, salted_initialization_hash]) address = ((poseidon2(DOM_SEP__CONTRACT_ADDRESS_V2, [public_keys_hash, partial_address]) * G) + ivpk_m).x <- the x-coordinate of the address point ```

### computeContractClassId
```typescript
function computeContractClassId(contractClass: ContractClass | ContractClassIdPreimage) => Promise<Fr>
```
Returns the id of a contract class computed as its hash. ``` version = 1 private_function_leaves = private_functions.map(fn => poseidon2(DOM_SEP__PRIVATE_FUNCTION_LEAF, [fn.function_selector as Field, fn.vk_hash])) private_functions_root = merkleize(private_function_leaves) bytecode_commitment = calculate_commitment(packed_bytecode) contract_class_id = poseidon2(DOM_SEP__CONTRACT_CLASS_ID, [version, artifact_hash, private_functions_root, bytecode_commitment]) ```

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

### computeExcessMana
```typescript
function computeExcessMana(prevExcessMana: bigint, prevManaUsed: bigint, manaTarget: bigint) => bigint
```
Computes excess mana for the next checkpoint, clamped to zero.

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

### computeL2ToL1MessageHash
```typescript
function computeL2ToL1MessageHash(__namedParameters: { chainId: Fr; content: Fr; ... }) => Fr
```
Calculates a siloed hash of a scoped l2 to l1 message.

### computeLogTag
```typescript
function computeLogTag(rawTag: number | bigint | boolean | Fr | Buffer<ArrayBufferLike>, domSep: DomainSeparator) => Promise<Fr>
```
Domain-separates a raw log tag with the given domain separator.

### computeManaMinFee
```typescript
function computeManaMinFee(params: ManaMinFeeParams) => bigint
```
Computes the full mana min fee (sequencer + prover + congestion) in fee asset terms. Mirrors FeeLib.getManaMinFeeComponentsAt + summedMinFee.

### computeMerkleHash
```typescript
function computeMerkleHash(left: Fr, right: Fr) => Promise<Fr>
```
Computes a Poseidon2 merkle tree internal node hash for append-only trees (note-hash, L1->L2, archive).

### computeNetworkTxGasLimits
```typescript
function computeNetworkTxGasLimits(opts: { manaCheckpointBudget: number; maxBlocksPerCheckpoint: number }) => Gas
```
Computes the maximum gas a single tx may declare on a network: the smaller of the per-tx protocol maximum and the per-block allocation a proposer grants to the first block of a checkpoint. The per-block allocation mirrors `CheckpointBuilder.capLimitsByCheckpointBudgets` (`ceil(checkpointBudget / maxBlocksPerCheckpoint * multiplier)`) using the network-minimum multipliers, so a tx declaring this much is admissible into a block under that geometry. This is a *network* limit: a function of network-wide constants only (timetable-derived blocks-per-checkpoint, checkpoint budgets, the network-minimum multipliers). It must NOT depend on a node's local restrictiveness — its multipliers configured above the network minimum, or its `maxDABlockGas` / `validateMaxDABlockGas` caps — because those make a node stricter at block-building time but cannot define what the network considers a valid tx for relay. The same value is advertised by `getNodeInfo` and enforced by the RPC/gossip/pool gas validators. The DA budget is getDaCheckpointBudgetForTxs evaluated at the clamped blocks-per-checkpoint — the raw blob capacity net of encoding overhead for every block — so the admission limit is consistent with the builder's blob-field cap.

### computeNoteHashNonce
```typescript
function computeNoteHashNonce(nullifierZero: Fr, noteHashIndex: number) => Promise<Fr>
```
Computes a note hash nonce, which will be used to create a unique note hash.

### computeNullifierMerkleHash
```typescript
function computeNullifierMerkleHash(left: Fr, right: Fr) => Promise<Fr>
```
Merkle-node hasher for the nullifier tree's sibling paths.

### computeOvskApp
```typescript
function computeOvskApp(ovsk: Fq, app: AztecAddress) => Promise<Fq>
```

### computePartialAddress
```typescript
function computePartialAddress(instance: Pick<ContractInstance, "originalContractClassId" | "initializationHash" | "salt" | "deployer" | "immutablesHash"> | { originalContractClassId: Fr; saltedInitializationHash: Fr }) => Promise<Fr>
```
Computes the partial address defined as the hash of the contract class id and salted initialization hash.

### computePreaddress
```typescript
function computePreaddress(publicKeysHash: Fr, partialAddress: Fr) => Promise<Fr>
```

### computePrivateEventCommitment
```typescript
function computePrivateEventCommitment(randomness: Fr, eventSelector: Fr, content: Fr[]) => Promise<Fr>
```
Computes the commitment of a private event from its preimage.

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

### computePublicDataMerkleHash
```typescript
function computePublicDataMerkleHash(left: Fr, right: Fr) => Promise<Fr>
```
Merkle-node hasher for the public-data tree's sibling paths.

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
function computeSaltedInitializationHash(instance: Pick<ContractInstance, "initializationHash" | "salt" | "deployer" | "immutablesHash">) => Promise<Fr>
```
Computes the salted initialization hash for an address, defined as the hash of the salt and initialization hash.

### computeSecretHash
```typescript
function computeSecretHash(secret: Fr) => Promise<Fr>
```
Computes a hash of a secret.

### computeSharedTaggingSecret
```typescript
function computeSharedTaggingSecret(localAddress: CompleteAddress, localIvsk: Fq, externalAddress: AztecAddress) => Promise<Point | undefined>
```
Computes the shared tagging secret point between a local address (i.e. one for which the privacy keys are known) and an external one via a Diffie-Hellman key exchange. Returns undefined if `externalAddress` is an invalid address.

### computeSiloedPrivateInitializationNullifier
```typescript
function computeSiloedPrivateInitializationNullifier(contract: AztecAddress, initializationHash: Fr) => Promise<Fr>
```
Computes the siloed private initialization nullifier for a contract, given its address and initialization hash.

### computeSiloedPrivateLogFirstField
```typescript
function computeSiloedPrivateLogFirstField(contract: AztecAddress, field: Fr) => Promise<Fr>
```

### computeSiloedPublicInitializationNullifier
```typescript
function computeSiloedPublicInitializationNullifier(contract: AztecAddress) => Promise<Fr>
```
Computes the siloed public initialization nullifier for a contract. Not all contracts emit this nullifier: it is only emitted when the contract has public functions that perform initialization checks (i.e. external public functions that are not `#[noinitcheck]` or `#[only_self]`).

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

### dataInBlockSchemaFor
```typescript
function dataInBlockSchemaFor<T extends ZodType<unknown, unknown, $ZodTypeInternals<unknown, unknown>>>(schema: T) => ZodObject<{ data: T; l2BlockHash: ZodFor<BlockHash>; l2BlockNumber: ZodPipe<ZodUnion<readonly []>, ZodTransform<BlockNumber, number>> }, $strip>
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

### deriveEcdhSharedSecretPoint
```typescript
function deriveEcdhSharedSecretPoint(secretKey: Fq, publicKey: Point) => Promise<Point>
```
Derives the raw ECDH shared secret point `S = secretKey * publicKey`.

### deriveKeys
```typescript
function deriveKeys(secretKey: Fr) => Promise<{ masterFallbackPublicKey: Point; masterFallbackSecretKey: Fq; ... }>
```
Computes secret and public keys and public keys hash from a secret key.

### deriveKeysFromMasterSecretKeys
```typescript
function deriveKeysFromMasterSecretKeys(secretKeys: MasterSecretKeys) => Promise<{ masterFallbackPublicKey: Point; masterFallbackSecretKey: Fq; ... }>
```
Derives the master public keys and the PublicKeys struct from a set of master secret keys.

### deriveMasterFallbackSecretKey
```typescript
function deriveMasterFallbackSecretKey(secretKey: Fr) => Fq
```

### deriveMasterIncomingViewingSecretKey
```typescript
function deriveMasterIncomingViewingSecretKey(secretKey: Fr) => Fq
```

### deriveMasterMessageSigningSecretKey
```typescript
function deriveMasterMessageSigningSecretKey(secretKey: Fr) => Fq
```

### deriveMasterNullifierHidingSecretKey
```typescript
function deriveMasterNullifierHidingSecretKey(secretKey: Fr) => Fq
```

### deriveMasterOutgoingViewingSecretKey
```typescript
function deriveMasterOutgoingViewingSecretKey(secretKey: Fr) => Fq
```

### derivePublicKeyFromSecretKey
```typescript
function derivePublicKeyFromSecretKey(secretKey: Fq) => Promise<Point>
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

### fakeExponential
```typescript
function fakeExponential(factor: bigint, numerator: bigint, denominator: bigint) => bigint
```
Taylor series approximation of `factor * e^(numerator/denominator)`. Direct port of FeeLib.sol fakeExponential (EIP-4844 style).

### findFunctionAbiBySelector
```typescript
function findFunctionAbiBySelector(artifact: ContractArtifact, selector: FunctionSelector) => Promise<FunctionAbi | undefined>
```
Finds the function abi (across both `functions` and `nonDispatchPublicFunctions`) whose selector matches `selector`. Returns `undefined` if no match is found.

### findFunctionArtifactBySelector
```typescript
function findFunctionArtifactBySelector(artifact: ContractArtifact, selector: FunctionSelector) => Promise<FunctionArtifact | undefined>
```
Finds the function artifact within `artifact.functions` whose selector matches `selector`. Returns `undefined` if no match is found.

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
function getAttestationInfoFromPublishedCheckpoint(block: { attestations: CommitteeAttestation[]; checkpoint: Checkpoint }, signatureContext: CoordinationSignatureContext) => AttestationInfo[]
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

### getDaCheckpointBudgetForTxs
```typescript
function getDaCheckpointBudgetForTxs(maxBlocksPerCheckpoint: number) => number
```
The DA gas budget available to tx data within a checkpoint of `maxBlocksPerCheckpoint` blocks. This is the raw blob capacity (`BLOBS_PER_CHECKPOINT * FIELDS_PER_BLOB * DA_GAS_PER_FIELD`) minus the fields the blob encoding reserves for overhead that no tx pays DA gas for: - one checkpoint-end marker field (`NUM_CHECKPOINT_END_MARKER_FIELDS`), - the first block's block-end fields (`NUM_FIRST_BLOCK_END_BLOB_FIELDS`, 7), and - `NUM_BLOCK_END_BLOB_FIELDS` (6) for each of the `blocks - 1` subsequent blocks. Subtracting the overhead for every block (not just the first) keeps the network DA admission limit at or below the builder's first-block blob-field cap at every geometry. The builder is the MOST generous for the first block — it only reserves that block's own block-end overhead — so being conservative here (assuming the checkpoint is full of blocks, each spending its share) is what guarantees admitted ⇒ buildable: a tx admitted under this budget always fits the first block's blob-field cap, regardless of how many blocks the builder ends up packing.

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

### getNetworkTxGasLimits
```typescript
function getNetworkTxGasLimits(config: ProposerTimetableConfig, l1Constants: SlotTimingConstants & { rollupManaLimit: number }) => Gas
```
Network tx gas limits derived from a sequencer/p2p config and the L1 slot-timing + mana constants. The single source of truth shared by `getNodeInfo` (advertising) and the RPC/gossip/pool gas validators (enforcing), so a node never rejects a tx it advertised as admissible. Always uses the network-minimum multipliers, never the node's (possibly higher) configured multipliers.

### getTxHash
```typescript
function getTxHash(tx: AnyTx) => TxHash
```

### hasPublicCalls
```typescript
function hasPublicCalls(tx: AnyTx) => boolean
```

### hashPublicKey
```typescript
function hashPublicKey(pk: Point) => Promise<Fr>
```
Hashes a public key. Mirrors Noir's `hash_public_key` in `noir-protocol-circuits/crates/types/src/public_keys.nr`: `Poseidon2(DOM_SEP__SINGLE_PUBLIC_KEY_HASH, [pk.x, pk.y])`. This is distinct from Noir's generic `Hash` impl for `EmbeddedCurvePoint` (`noir_stdlib/src/embedded_curve_ops.nr`), which simply absorbs `x` then `y` into a `Hasher` state with no domain separator. That generic impl is unsuitable for hashing keys at the protocol boundary, where the domain separator is required to prevent collisions with hashes of other Grumpkin points (e.g. note commitments, nullifiers).

### hashVK
```typescript
function hashVK(keyAsFields: Fr[]) => Promise<Fr>
```
Computes a hash of a given verification key.

### inBlockSchema
```typescript
function inBlockSchema() => ZodObject<{ l2BlockHash: ZodFor<BlockHash>; l2BlockNumber: ZodPipe<ZodUnion<readonly []>, ZodTransform<BlockNumber, number>> }, $strip>
```

### inTxSchema
```typescript
function inTxSchema() => ZodIntersection<ZodObject<{ l2BlockHash: ZodFor<BlockHash>; l2BlockNumber: ZodPipe<ZodUnion<readonly []>, ZodTransform<BlockNumber, number>> }, $strip>, ZodObject<{ txHash: ZodPipe<ZodPipe<ZodPipe<ZodString, ZodTransform<string, string>>, ZodTransform<Buffer<ArrayBuffer>, string>>, ZodTransform<TxHash, Buffer<ArrayBuffer>>> }, $strip>>
```

### indexedTxSchema
```typescript
function indexedTxSchema() => ZodObject<{ data: ZodFor<TxEffect>; l2BlockHash: ZodFor<BlockHash>; ... }, $strip>
```

### inspectBlockParameter
```typescript
function inspectBlockParameter(param: BlockParameter) => string
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

### isOptionStruct
```typescript
function isOptionStruct(abiType: AbiType) => boolean
```
Returns whether the ABI type is Noir's std::option::Option lowered to a struct.

### isPublicKeysStruct
```typescript
function isPublicKeysStruct(abiType: AbiType) => boolean
```
Returns whether the ABI type is a PublicKeys struct from Aztec.nr.

### isWrappedFieldStruct
```typescript
function isWrappedFieldStruct(abiType: AbiType) => boolean
```
Returns whether the ABI type is a struct with a single `inner` field.

### l2TipsEqual
```typescript
function l2TipsEqual(a: L2Tips, b: L2Tips) => boolean
```
Returns whether two L2Tips snapshots agree on every tier (proposed, checkpointed, proven, finalized).

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

### loadContractArtifactWithValidation
```typescript
function loadContractArtifactWithValidation(input: NoirCompiledContract) => ContractArtifact
```
Like loadContractArtifact, but fully validates an already-processed artifact against the contract artifact schema before returning it. Use when loading an artifact from untrusted or external JSON (e.g. a file path passed to the CLI), so a malformed artifact is rejected up-front with a clear schema error instead of surfacing as an opaque failure later during deployment. `loadContractArtifact` only runs the shallow `isContractArtifact` shape check on already-processed artifacts; raw nargo output is validated via `generateContractArtifact` regardless. The returned object is identical to `loadContractArtifact`'s; the schema parse is used purely for validation.

### localBlockIdDiffers
```typescript
function localBlockIdDiffers(localBlock: LocalL2BlockId | undefined, sourceBlock: L2BlockId) => boolean
```
Returns whether a local block id differs from a source block id. Compares block number and, when the local hash is known, block hash. The hash comparison is skipped when the local hash is undefined: world-state legitimately reports `undefined` hashes for tips ahead of its synced range, and comparing against an undefined hash would treat such a tip as different on every poll. An `undefined` local block (no local tip yet) always counts as differing.

### localTipsMatch
```typescript
function localTipsMatch(local: LocalChainTips, source: L2Tips) => boolean
```
Returns whether the local chain tips agree with the given source tips on every tier the local provider exposes. Each tier is compared at the block level via localBlockIdDiffers (so an unresolved local hash matches on number alone); checkpoint ids are not compared, mirroring the stream's own tier reconciliation. The optional `checkpointed` tier is only compared when present (it is absent when the stream ignores checkpoints).

### logResultToHumanReadable
```typescript
function logResultToHumanReadable(log: { blockHash: BlockHash; blockNumber: BlockNumber; ... }) => string
```
Human-readable single-line representation, primarily for the CLI `get-logs` command.

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

### protectFromForgery
```typescript
function protectFromForgery(secret: Point, ephPk: Point, recipientPoint: Point) => Promise<Point>
```
Protects a handshake's shared secret from being forged by the recipient: `S' = hash(ephPk, recipientPoint) * S`. Mirrors aztec-nr's `protect_from_forgery` and must stay byte-compatible with it.

### queryAllPrivateLogsByTags
```typescript
function queryAllPrivateLogsByTags(node: PrivateLogsByTagsFetcher, query: PrivateLogsQuery) => Promise<{ blockHash: BlockHash; blockNumber: BlockNumber; ... }[][]>
```
Drives the per-tag `afterLog` cursor loop for PrivateLogsByTagsFetcher.getPrivateLogsByTags. Each round re-queries only the tags whose previous page was full (`length === effective limit`), passing the cursor of the last seen log. Tags drop out as soon as they return a short page. Results are stitched back into one inner array per input tag, preserving the original input order. Honors PrivateLogsQuery.limitPerTag when set (caller is responsible for keeping it `<=` MAX_LOGS_PER_TAG; the query schema enforces this on the RPC boundary).

### queryAllPublicLogsByTags
```typescript
function queryAllPublicLogsByTags(node: PublicLogsByTagsFetcher, query: PublicLogsQuery) => Promise<{ blockHash: BlockHash; blockNumber: BlockNumber; ... }[][]>
```
Drives the per-tag `afterLog` cursor loop for PrivateLogsByTagsFetcher.getPrivateLogsByTags. Each round re-queries only the tags whose previous page was full (`length === effective limit`), passing the cursor of the last seen log. Tags drop out as soon as they return a short page. Results are stitched back into one inner array per input tag, preserving the original input order. Honors PrivateLogsQuery.limitPerTag when set (caller is responsible for keeping it `<=` MAX_LOGS_PER_TAG; the query schema enforces this on the RPC boundary).

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

### randomLogResult
```typescript
function randomLogResult(includeEffects: boolean) => { blockHash: BlockHash; blockNumber: BlockNumber; ... }
```
Builds a random LogResult for tests. `includeEffects` populates `noteHashes` + `nullifiers`.

### refineTxHashAndRange
```typescript
function refineTxHashAndRange<T extends TxHashAndRangeFields>(schema: ZodType<T>) => ZodType<T, unknown, $ZodTypeInternals<T, unknown>>
```
Refinement: a `txHash` already pins a block, so combining it with a block range is contradictory. (`txHash` + `afterLog` is still allowed and is enforced per-tag inside `TagQuery`.) Exported so `aztec.js`'s wallet event-filter schemas can reuse the same rule.

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

### ARTIFACT_VERSION_BEFORE_INJECTION
```typescript
type ARTIFACT_VERSION_BEFORE_INJECTION = "FROM_RELEASE_BEFORE_VERSION_INJECTION"
```
Placeholder version injected into artifacts compiled before aztecVersion was added. Remove.

### AbiDecoded
```typescript
type AbiDecoded = bigint | boolean | string | AztecAddress | EthAddress | FunctionSelector | Fr | AbiDecoded[] | {} | undefined
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

### AppTaggingSecretKind
```typescript
type AppTaggingSecretKind = { CONSTRAINED: "constrained"; UNCONSTRAINED: "unconstrained" }
```

### ArchiverEmitter
```typescript
type ArchiverEmitter = TypedEventEmitter<{ checkpointEquivocationDetected: (args: CheckpointEquivocationDetectedEvent) => void; descendentOfInvalidAttestationsCheckpointDetected: (args: DescendentOfInvalidAttestationsCheckpointEvent) => void; ... }>
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

### BLOBS_PER_CHECKPOINT
```typescript
type BLOBS_PER_CHECKPOINT = [object Object]
```

### BLOB_GAS_PER_BLOB
```typescript
type BLOB_GAS_PER_BLOB = bigint
```

### BlockData
```typescript
type BlockData = unknown
```
L2Block metadata. Equivalent to L2Block but without block body containing tx data.

### BlockParameter
```typescript
type BlockParameter = NormalizedBlockParameter | BlockNumber | BlockHash | BlockTag
```
Selector for a block in RPC calls. Accepts a block number, a BlockHash, a chain-tip name (e.g. `'proven'`, `'checkpointed'`), `'latest'` (alias for `'proposed'`), or any of the NormalizedBlockParameter object variants (`{ number }`, `{ hash }`, `{ archive }`, `{ tag }`).

### BlockQuery
```typescript
type BlockQuery = NormalizedBlockParameter
```
Lookup a single block by block number, hash, archive root, or chain-tip tag.

### BlockTag
```typescript
type BlockTag = readonly []
```

### BlocksQuery
```typescript
type BlocksQuery = { from: BlockNumber; limit: number; onlyCheckpointed?: boolean } | { epoch: EpochNumber; onlyCheckpointed: true }
```
Query a range of blocks by start/limit or by epoch. The `epoch` variant requires `onlyCheckpointed: true` because epoch boundaries are only meaningful for the checkpointed chain — the proposed chain may include uncheckpointed blocks past the epoch boundary that callers should not receive.

### BrilligFunctionId
```typescript
type BrilligFunctionId = number
```

### CheckpointEquivocationDetectedEvent
```typescript
type CheckpointEquivocationDetectedEvent = unknown
```
Emitted when a local proposed checkpoint is found to disagree with the L1-confirmed checkpoint at the same slot. The slot proposer signed both — equivocation.

### CheckpointGlobalVariables
```typescript
type CheckpointGlobalVariables = Omit<FieldsOf<GlobalVariables>, "blockNumber">
```
Global variables that are constant across the entire checkpoint (slot). Excludes blockNumber since that varies per block within a checkpoint.

### CheckpointId
```typescript
type CheckpointId = unknown
```

### CheckpointQuery
```typescript
type CheckpointQuery = { number: CheckpointNumber } | { slot: SlotNumber } | { tag: "checkpointed" | "proven" | "finalized" }
```
Lookup a single confirmed checkpoint by checkpoint number, slot, or chain-tip tag.

### CheckpointsQuery
```typescript
type CheckpointsQuery = { from: CheckpointNumber; limit: number } | { fromSlot: SlotNumber; limit: number; reverse?: boolean } | { epoch: EpochNumber }
```
Query a range of confirmed checkpoints by start/limit, by slot anchor, or by epoch. The `fromSlot` variant walks the slot index: it returns up to `limit` checkpoints anchored at `fromSlot`, ordered nearest-first. With `reverse` it takes the checkpoints at or before the slot (descending); otherwise the checkpoints at or after it (ascending). Use `limit: 1, reverse: true` to find the latest checkpoint at or before a slot in a single range scan.

### ChonkProofData
```typescript
type ChonkProofData = ProofData<T, typeof CHONK_PROOF_LENGTH>
```

### ContractArtifactWithHash
```typescript
type ContractArtifactWithHash = ContractArtifact & { artifactHash: Fr }
```
Contract artifact including its artifact hash

### ContractClassIdPreimage
```typescript
type ContractClassIdPreimage = unknown
```
Preimage of a contract class id.

### ContractClassPublic
```typescript
type ContractClassPublic = Pick<ContractClassCommitments, "id" | "privateFunctionsRoot"> & Omit<ContractClass, "privateFunctions">
```
A contract class with public bytecode information.

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

### ContractInstancePreimageWithAddress
```typescript
type ContractInstancePreimageWithAddress = ContractInstancePreimage & { address: AztecAddress }
```

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
type ContractOverrides = Record<string, { instance: ContractInstanceWithAddress }>
```

### DataInBlock
```typescript
type DataInBlock = { data: T } & InBlock
```

### DebugFileMap
```typescript
type DebugFileMap = Record<FileId, { function_locations: FunctionLocation[]; path: string; source: string }>
```
Maps a file ID to its metadata for debugging purposes.

### DeploymentInfo
```typescript
type DeploymentInfo = unknown
```
Represents the data generated as part of contract deployment.

### DescendentOfInvalidAttestationsCheckpointEvent
```typescript
type DescendentOfInvalidAttestationsCheckpointEvent = unknown
```
Emitted when the archiver observes a checkpoint that builds on a previously-rejected ancestor (typically one with insufficient/invalid attestations). The descendant itself may have valid attestations, but it cannot be ingested because the chain it extends was skipped. The slasher uses this to slash the proposer of the descendant.

### ETH_PER_FEE_ASSET_PRECISION
```typescript
type ETH_PER_FEE_ASSET_PRECISION = [object Object]
```

### EventMetadataDefinition
```typescript
type EventMetadataDefinition = unknown
```
Metadata for a contract event, used to decode emitted event logs back into structured data.

### FEE_ORACLE_LAG
```typescript
type FEE_ORACLE_LAG = 2
```
Number of L2 slots of lag before new oracle values activate. Defines the prediction window.

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

### FunctionLocation
```typescript
type FunctionLocation = unknown
```
The range a function occupies in a file.

### GAS_ESTIMATION_DA_GAS_LIMIT
```typescript
type GAS_ESTIMATION_DA_GAS_LIMIT = number
```

### GAS_ESTIMATION_L2_GAS_LIMIT
```typescript
type GAS_ESTIMATION_L2_GAS_LIMIT = number
```

### GAS_ESTIMATION_TEARDOWN_DA_GAS_LIMIT
```typescript
type GAS_ESTIMATION_TEARDOWN_DA_GAS_LIMIT = 786432
```

### GAS_ESTIMATION_TEARDOWN_L2_GAS_LIMIT
```typescript
type GAS_ESTIMATION_TEARDOWN_L2_GAS_LIMIT = 6540000
```

### GENESIS_BLOCK_HEADER_HASH
```typescript
type GENESIS_BLOCK_HEADER_HASH = BlockHash
```
The block header hash for the genesis block (block 0).

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

### GetTxReceiptOptions
```typescript
type GetTxReceiptOptions = unknown
```
Options controlling which optional data is attached to a TxReceipt.

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
type IndexedTxEffect = DataInBlock<TxEffect> & { slotNumber: SlotNumber; txIndexInBlock: number }
```
A tx effect together with its position in the block (`txIndexInBlock`) and the slot the block was built in.

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
type KeyGenerator = DomainSeparator.NHK_M | DomainSeparator.IVSK_M | DomainSeparator.OVSK_M | DomainSeparator.TSK_M
```

### KeyPrefix
```typescript
type KeyPrefix = "n" | "iv" | "ov" | "t"
```

### L1_GAS_PER_CHECKPOINT_PROPOSED
```typescript
type L1_GAS_PER_CHECKPOINT_PROPOSED = [object Object]
```

### L1_GAS_PER_EPOCH_VERIFIED
```typescript
type L1_GAS_PER_EPOCH_VERIFIED = [object Object]
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

### L2BlockSourceUpdatedEvent
```typescript
type L2BlockSourceUpdatedEvent = unknown
```
Aggregate event emitted once per committed archiver sync pass that mutated local state. Carries the chain tips before and after the pass; consumers compare `fromTips` and `toTips` to learn what moved, and read any data they need from the source itself. This is an optimization signal that lets a block stream reconcile immediately on an archiver update rather than waiting for its next poll. Polling remains the correctness fallback, so a missed event only affects latency.

### L2BlockStreamEvent
```typescript
type L2BlockStreamEvent = { blocks: L2Block[]; type: "blocks-added" } | { block: L2BlockId; header: BlockHeader; type: "chain-proposed" } | { block: L2BlockId; checkpoint: CheckpointId; type: "chain-checkpointed" } | { block: L2BlockId; checkpointed: L2TipId; ... } | { block: L2BlockId; checkpoint: CheckpointId; type: "chain-proven" } | { block: L2BlockId; checkpoint: CheckpointId; type: "chain-finalized" }
```

### L2BlockStreamOptions
```typescript
type L2BlockStreamOptions = unknown
```
Options accepted by L2BlockStream and EventDrivenL2BlockStream.

### L2BlockStreamSource
```typescript
type L2BlockStreamSource = Pick<L2BlockSource, "getBlocks" | "getBlockData" | "getL2Tips">
```
Subset of the block source the stream depends on. Checkpoint payloads are no longer fetched here.

### L2BlockTag
```typescript
type L2BlockTag = "proposed" | "checkpointed" | "proven" | "finalized"
```
Identifier for L2 block tags. Internal counterpart to BlockTag that omits `latest` (which is an alias for `proposed` accepted only at the public RPC surface). - proposed: Latest block proposed on L2. - checkpointed: Latest block whose enclosing checkpoint has been published on L1. - proven: Latest block whose enclosing checkpoint has been proven on L1. - finalized: Latest block whose proving L1 transaction has reached L1 finality.

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
type L2TipsStore = L2BlockStreamEventHandler & L2TipsProvider & Pick<L2BlockStreamLocalDataProvider, "getL2BlockHash"> & {}
```

### LocalChainTips
```typescript
type LocalChainTips = unknown
```
Minimal local view of the chain the block stream needs to drive sync. `checkpointed` is only required when the stream emits checkpoint events (i.e. `ignoreCheckpoints` is off).

### LocalL2BlockId
```typescript
type LocalL2BlockId = unknown
```
A block id reported by a local data provider, whose hash may be unknown when the provider cannot resolve it (e.g. world-state cannot resolve the hash of a proven tip ahead of its synced range).

### LocalL2Tips
```typescript
type LocalL2Tips = L2Tips
```
Tips of the L2 chain as tracked by a local provider (world-state, l2-tips-store). Identical to L2Tips; the alias is retained for call sites that document a local-only provenance.

### LocationNodeDebugInfo
```typescript
type LocationNodeDebugInfo = unknown
```

### LocationTree
```typescript
type LocationTree = unknown
```

### LogIncludeOptions
```typescript
type LogIncludeOptions = unknown
```
Options for narrowing the shape of a LogResult.

### LogResult
```typescript
type LogResult = Prettify<LogResultBase & PickIfFlag<LogIncludeOptions, Opts, "includeEffects", { noteHashes: Fr[]; nullifiers: Fr[] }>>
```
A single log returned from L2LogsSource.getPrivateLogsByTags or L2LogsSource.getPublicLogsByTags. Generic over the include-options so that flagged fields become required when the caller passes a literal `true`. The default type argument (LogIncludeOptions) yields the widest shape (all include-fields optional) — this is what the JSON-RPC wire layer validates against. `logData` is the raw field-element payload, with the tag in field 0 (consumers slice it off).

### LogResultBase
```typescript
type LogResultBase = unknown
```
Required metadata always present on a LogResult.

### LogsQueryBase
```typescript
type LogsQueryBase = unknown
```
Shared fields for PrivateLogsQuery and PublicLogsQuery.

### MAGIC_CONGESTION_VALUE_DIVISOR
```typescript
type MAGIC_CONGESTION_VALUE_DIVISOR = [object Object]
```

### MAGIC_CONGESTION_VALUE_MULTIPLIER
```typescript
type MAGIC_CONGESTION_VALUE_MULTIPLIER = [object Object]
```

### MAX_PUBLIC_FUNCTION_CALLDATA_PER_TX
```typescript
type MAX_PUBLIC_FUNCTION_CALLDATA_PER_TX = number
```
Upper bound on the calldata entries a tx can carry: one per enqueued call, plus one for the teardown call. The revertible and non-revertible call request arrays are each sized `MAX_ENQUEUED_CALLS_PER_TX`, but the private tail circuit fills them by partitioning a single array of that size, so their lengths sum to it. The teardown request is propagated separately and can only be set once.

### MINIMUM_CONGESTION_MULTIPLIER
```typescript
type MINIMUM_CONGESTION_MULTIPLIER = [object Object]
```
TypeScript port of fee computation logic from FeeLib.sol. Used to predict worst-case min fees over a future window of L2 slots.

### MIN_ETH_PER_FEE_ASSET
```typescript
type MIN_ETH_PER_FEE_ASSET = [object Object]
```

### MIN_PER_BLOCK_ALLOCATION_MULTIPLIER
```typescript
type MIN_PER_BLOCK_ALLOCATION_MULTIPLIER = 1.2
```
Network-minimum per-block budget multiplier for L2 gas and tx-count allocation. A block packer must grant at least this share of the even per-block split to a single tx; operators may configure a higher multiplier (more generous), but not a lower one — enforced at sequencer startup. Also used as the default for `SequencerConfig.perBlockAllocationMultiplier`.

### MIN_PER_BLOCK_DA_ALLOCATION_MULTIPLIER
```typescript
type MIN_PER_BLOCK_DA_ALLOCATION_MULTIPLIER = 1.5
```
Network-minimum per-block budget multiplier for DA gas, applied in place of the general MIN_PER_BLOCK_ALLOCATION_MULTIPLIER. Higher than the general multiplier so the largest tx we want to support — a maximal contract class registration (~97k DA gas) — fits a single block under v5 mainnet geometry (72s slots, 6s blocks → 10 blocks per checkpoint). A builder may configure a higher multiplier but never a lower one. Also used as the default for `SequencerConfig.perBlockDAAllocationMultiplier`.

### ManaMinFeeParams
```typescript
type ManaMinFeeParams = unknown
```
Parameters for computing the mana min fee at a given point in time.

### MasterSecretKeys
```typescript
type MasterSecretKeys = unknown
```
The six master secret keys that fully define an account's privacy keys.

### MinedTxStatus
```typescript
type MinedTxStatus = typeof MinedTxStatuses[number]
```
Block finalization status of a mined transaction.

### MinedTxStatuses
```typescript
type MinedTxStatuses = readonly []
```
The four statuses a mined transaction can hold, ordered by finalization progress.

### NodeStats
```typescript
type NodeStats = unknown
```

### NormalizedBlockParameter
```typescript
type NormalizedBlockParameter = { number: BlockNumber } | { hash: BlockHash } | { archive: Fr } | { tag: Exclude<BlockTag, "latest"> }
```
Object-only form of BlockParameter. Used as the building block for BlockQuery.

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
The contract-side preimage of an Aztec address, i.e. the commitment to a specific contract instance. A partial address commits to a contract's code and initialization (`hash(contract_class_id, salted_initialization_hash)`) but not to its keys. Combined with an account's `PublicKeys`, it fully determines the address: `address = (hash(public_keys_hash, partial_address) * G + Ivpk_m).x`. Two accounts therefore share an address only if they share both their public keys and their partial address. See `computePartialAddress` for the derivation.

### PreTag
```typescript
type PreTag = unknown
```
Represents a preimage of a private log tag (see `Tag` in `pxe/src/tagging`). Note: It's a bit unfortunate that this type resides in `stdlib` as the rest of the tagging functionality resides in `pxe/src/tagging`. But this type is used by other types in stdlib hence there doesn't seem to be a good way around this.

### PrivateLogsByTagsFetcher
```typescript
type PrivateLogsByTagsFetcher = unknown
```
Minimal node surface needed by queryAllPrivateLogsByTags.

### PrivateLogsQuery
```typescript
type PrivateLogsQuery = LogsQueryBase & { tags: TagQuery<SiloedTag>[] }
```
Query for L2LogsSource.getPrivateLogsByTags. Returns one inner array per element of `tags`, in input order.

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

### ProposedCheckpointQuery
```typescript
type ProposedCheckpointQuery = { number: CheckpointNumber } | { slot: SlotNumber } | { tag: "proposed" }
```
Lookup a proposed (archiver-internal, not-yet-L1-confirmed) checkpoint. Distinct from CheckpointQuery because proposed checkpoints have a different shape (no l1, no attestations, but carries totalManaUsed) and live in their own LMDB map.

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
type PublicKey = typeof Point
```

### PublicLogsByTagsFetcher
```typescript
type PublicLogsByTagsFetcher = unknown
```
Minimal node surface needed by queryAllPublicLogsByTags.

### PublicLogsQuery
```typescript
type PublicLogsQuery = LogsQueryBase & { contractAddress: AztecAddress; tags: TagQuery<Tag>[] }
```
Query for L2LogsSource.getPublicLogsByTags. Returns one inner array per element of `tags`, in input order.

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
type TX_ERROR_GAS_LIMIT_TOO_HIGH = "Gas limit is higher than the maximum amount of gas this network allows per tx"
```

### TX_ERROR_INCORRECT_CALLDATA
```typescript
type TX_ERROR_INCORRECT_CALLDATA = "Incorrect calldata for public call"
```

### TX_ERROR_INCORRECT_CONTRACT_ADDRESS
```typescript
type TX_ERROR_INCORRECT_CONTRACT_ADDRESS = "Incorrect contract instance deployment address"
```

### TX_ERROR_INCORRECT_CONTRACT_CLASS_ID
```typescript
type TX_ERROR_INCORRECT_CONTRACT_CLASS_ID = "Incorrect contract class id"
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

### TX_ERROR_INVALID_EXPIRATION_TIMESTAMP
```typescript
type TX_ERROR_INVALID_EXPIRATION_TIMESTAMP = "Invalid expiration timestamp"
```

### TX_ERROR_INVALID_PROOF
```typescript
type TX_ERROR_INVALID_PROOF = "Invalid proof"
```

### TX_ERROR_MALFORMED_CONTRACT_CLASS_LOG
```typescript
type TX_ERROR_MALFORMED_CONTRACT_CLASS_LOG = "Failed to parse contract class registration log"
```

### TX_ERROR_MALFORMED_CONTRACT_INSTANCE_LOG
```typescript
type TX_ERROR_MALFORMED_CONTRACT_INSTANCE_LOG = "Failed to parse contract instance deployment log"
```

### TX_ERROR_SETUP_FUNCTION_NOT_ALLOWED
```typescript
type TX_ERROR_SETUP_FUNCTION_NOT_ALLOWED = "Setup function not on allow list"
```

### TX_ERROR_SETUP_FUNCTION_UNKNOWN_CONTRACT
```typescript
type TX_ERROR_SETUP_FUNCTION_UNKNOWN_CONTRACT = "Setup function targets unknown contract"
```

### TX_ERROR_SETUP_NULL_MSG_SENDER
```typescript
type TX_ERROR_SETUP_NULL_MSG_SENDER = "Setup function called with null msg sender"
```

### TX_ERROR_SETUP_ONLY_SELF_WRONG_SENDER
```typescript
type TX_ERROR_SETUP_ONLY_SELF_WRONG_SENDER = "Setup only_self function called with incorrect msg_sender"
```

### TX_ERROR_SETUP_WRONG_CALLDATA_LENGTH
```typescript
type TX_ERROR_SETUP_WRONG_CALLDATA_LENGTH = "Setup function called with wrong calldata length"
```

### TX_ERROR_SIZE_ABOVE_LIMIT
```typescript
type TX_ERROR_SIZE_ABOVE_LIMIT = "Transaction size above size limit"
```

### TagQuery
```typescript
type TagQuery = T | { afterLog?: LogCursor; tag: T }
```
A tag to query in PrivateLogsQuery / PublicLogsQuery, optionally resuming strictly after a previously-seen log via `afterLog`. The bare `T` form means "from the beginning".

### TaggingIndexRange
```typescript
type TaggingIndexRange = unknown
```
Represents a range of tagging indexes for a given app tagging secret.

### TxReceipt
```typescript
type TxReceipt = PendingTxReceipt<Opts> | DroppedTxReceipt | MinedTxReceipt<Opts>
```
A transaction receipt summarizing the lifecycle of a transaction in the Aztec network. Discriminated over the transaction's status: PendingTxReceipt while in the mempool, DroppedTxReceipt once dropped, and MinedTxReceipt once included in a block.

### TxValidationResult
```typescript
type TxValidationResult = { result: "valid" } | { reason: string[]; result: "invalid" }
```

### TypedStructFieldValue
```typescript
type TypedStructFieldValue = unknown
```

### UltraHonkProofData
```typescript
type UltraHonkProofData = ProofData<T, typeof RECURSIVE_PROOF_LENGTH>
```

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

Values: `checkpointEquivocationDetected`, `descendentOfInvalidAttestationsCheckpointDetected`, `invalidCheckpointDetected`, `l2BlockProven`, `l2BlocksCheckpointed`, `l2BlockSourceUpdated`, `l2PruneUncheckpointed`, `l2PruneUnproven`

### ManaUsageEstimate
Expected mana usage per checkpoint for fee prediction.

Values: `limit`, `none`, `target`

### NoteStatus
The status of notes to retrieve.

Values: `1`, `2`

### ProvingRequestType

Values: `10`, `7`, `5`, `8`, `6`, `9`, `14`, `13`, `11`, `12`, `16`, `17`, `2`, `1`, `3`, `0`, `15`, `4`

### TxExecutionPhase

Values: `1`, `0`, `2`

### TxExecutionResult
Execution result - only set when tx is in a block.

Values: `reverted`, `success`

### TxStatus
Block inclusion/finalization status.

Values: `checkpointed`, `dropped`, `finalized`, `pending`, `proposed`, `proven`

## Cross-Package References

This package references types from other Aztec packages:

**@aztec/blob-lib**
- `BlockBlobData`, `TxBlobData`, `TxStartMarker`

**@aztec/constants**
- `CHONK_PROOF_LENGTH`, `DomainSeparator`, `DomainSeparator.IVSK_M`, `DomainSeparator.NHK_M`, `DomainSeparator.OVSK_M`, `DomainSeparator.TSK_M`, `RECURSIVE_PROOF_LENGTH`, `RECURSIVE_ROLLUP_HONK_PROOF_LENGTH`

**@aztec/ethereum**
- `L1ContractAddresses`, `SimulationOverridesPlan`, `ViemCommitteeAttestation`, `ViemCommitteeAttestations`

**@aztec/foundation**
- `BaseBuffer32`, `BaseField`, `BaseFr`, `BlockNumber`, `Buffer32`, `BufferReader`, `Bufferable`, `CheckpointNumber`, `DefineIfFlag`, `EpochNumber`, `EthAddress`, `FieldReader`, `FieldsOf`, `Fq`, `Fr`, `IndexWithinCheckpoint`, `Logger`, `MerkleTree`, `PickIfFlag`, `Point`, `Prettify`, `Signature`, `SlotNumber`, `TypedEventEmitter`, `ViemSignature`, `ViemTransactionSignature`, `ZodFor`
