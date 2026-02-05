# @aztec/aztec.js

Version: v4.0.0-nightly.20260205

## Quick Import Reference

```typescript
import {
  AccountManager,
  AccountWithSecretKey,
  BaseAccount,
  BatchCall,
  Capsule,
  // ... and more
} from '@aztec/aztec.js';
```

## Classes

### AccountManager

Manages a user account. Provides methods for calculating the account's address and other related data, plus a helper to return a preconfigured deploy method.

**Properties**
- `address: unknown`
- `readonly salt: Salt` - Contract instantiation salt for the account contract

**Methods**
- `static create(wallet: Wallet, secretKey: Fr, accountContract: AccountContract, salt?: Salt) => Promise<AccountManager>`
- `getAccount() => Promise<AccountWithSecretKey>` - Returns a Wallet instance associated with this account. Use it to create Contract instances to be interacted with from this account.
- `getAccountContract() => AccountContract` - Returns the account contract that backs this account.
- `getCompleteAddress() => Promise<CompleteAddress>` - Gets the calculated complete address associated with this account. Does not require the account to have been published for public execution.
- `getDeployMethod() => Promise<DeployAccountMethod<Contract>>` - Returns a preconfigured deploy method that contains all the necessary function calls to deploy the account contract.
- `getInstance() => ContractInstanceWithAddress` - Returns the contract instance definition associated with this account. Does not require the account to have been published for public execution.
- `getPublicKeys() => PublicKeys`
- `getPublicKeysHash() => Fr | Promise<Fr>`
- `getSecretKey() => Fr` - Returns the secret key used to derive the rest of the privacy keys for this contract
- `hasInitializer() => Promise<boolean>` - Returns whether this account contract has an initializer function.

### AccountWithSecretKey

Extends BaseAccount with the encryption private key. Not required for implementing the wallet interface but useful for testing purposes or exporting an account to another pxe.
Implements: `Account`

**Constructor**
```typescript
new AccountWithSecretKey(account: Account, secretKey: Fr, salt: Salt)
```

**Properties**
- `readonly salt: Salt` - Deployment salt for this account contract.

**Methods**
- `createAuthWit(intent: IntentInnerHash | CallIntent, chainInfo: ChainInfo) => Promise<AuthWitness>` - Creates an authentication witness from an inner hash with consumer, or a call intent
- `createTxExecutionRequest(exec: ExecutionPayload, gasSettings: GasSettings, chainInfo: ChainInfo, options?: any) => Promise<TxExecutionRequest>` - Generates an execution request out of set of function calls.
- `getAddress() => AztecAddress` - Returns the address for this account.
- `getCompleteAddress() => CompleteAddress` - Returns the complete address for this account.
- `getEncryptionSecret() => Promise<Fq>` - Returns the encryption secret, the secret of the encryption point—the point that others use to encrypt messages to this account note - this ensures that the address secret always corresponds to an address point with y being positive dev - this is also referred to as the address secret, which decrypts payloads encrypted to an address point
- `getSecretKey() => Fr` - Returns the encryption private key associated with this account.
- `wrapExecutionPayload(exec: ExecutionPayload, options?: any) => Promise<ExecutionPayload>` - Wraps an execution payload such that it is executed *via* this entrypoint. This returns an ExecutionPayload with the entrypoint as the caller for the wrapped payload. Useful for account self-funding deployments and batching calls beyond the limit of a single entrypoint call.

### BaseAccount

An account implementation that uses authwits as an authentication mechanism and can assemble transaction execution requests for an entrypoint.
Implements: `Account`

**Constructor**
```typescript
new BaseAccount(entrypoint: EntrypointInterface, authWitnessProvider: AuthWitnessProvider, completeAddress: CompleteAddress)
```

**Methods**
- `createAuthWit(messageHashOrIntent: IntentInnerHash | CallIntent, chainInfo: ChainInfo) => Promise<AuthWitness>` - Creates an authentication witness from an inner hash with consumer, or a call intent
- `createTxExecutionRequest(exec: ExecutionPayload, gasSettings: GasSettings, chainInfo: ChainInfo, options: DefaultAccountEntrypointOptions) => Promise<TxExecutionRequest>` - Generates an execution request out of set of function calls.
- `getAddress() => AztecAddress` - Returns the address for this account.
- `getCompleteAddress() => CompleteAddress` - Returns the complete address for this account.
- `wrapExecutionPayload(exec: ExecutionPayload, options?: any) => Promise<ExecutionPayload>` - Wraps an execution payload such that it is executed *via* this entrypoint. This returns an ExecutionPayload with the entrypoint as the caller for the wrapped payload. Useful for account self-funding deployments and batching calls beyond the limit of a single entrypoint call.

### BatchCall

A batch of function calls to be sent as a single transaction through a wallet.

Extends: `BaseContractInteraction`

**Constructor**
```typescript
new BatchCall(wallet: Wallet, interactions: ExecutionPayload | BaseContractInteraction[])
```

**Properties**
- `authWitnesses: AuthWitness[]`
- `capsules: Capsule[]`
- `interactions: ExecutionPayload | BaseContractInteraction[]`
- `log: Logger`
- `wallet: Wallet`

**Methods**
- `getExecutionPayloads() => Promise<ExecutionPayload[]>`
- `request(options: RequestInteractionOptions) => Promise<ExecutionPayload>` - Returns an execution request that represents this operation.
- `send<TReturn>(options: SendInteractionOptionsWithoutWait) => Promise<TReturn>` - Sends a transaction to the contract function with the specified options. By default, waits for the transaction to be mined and returns the receipt (or custom type).
- `simulate(options: SimulateInteractionOptions) => Promise<any>` - Simulates the batch, supporting private, public and utility functions. Although this is a single interaction with the wallet, private and public functions will be grouped into a single ExecutionPayload that the wallet will simulate as a single transaction. Utility function calls will simply be executed one by one.

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

### Contract

The Contract class represents a contract and provides utility methods for interacting with it. It enables the creation of ContractFunctionInteraction instances for each function in the contract's ABI, allowing users to call or send transactions to these functions. Additionally, the Contract class can be used to attach the contract instance to a deployed contract onchain through the PXE, which facilitates interaction with Aztec's privacy protocol.

Extends: `ContractBase`

**Constructor**
```typescript
new Contract(address: AztecAddress, artifact: ContractArtifact, wallet: Wallet)
```

**Properties**
- `readonly address: AztecAddress` - The contract's address.
- `readonly artifact: ContractArtifact` - The Application Binary Interface for the contract.
- `methods: {}` - An object containing contract methods mapped to their respective names.
- `wallet: Wallet` - The wallet used for interacting with this contract.

**Methods**
- `static at(address: AztecAddress, artifact: ContractArtifact, wallet: Wallet) => Contract` - Gets a contract instance.
- `static deploy(wallet: Wallet, artifact: ContractArtifact, args: any[], constructorName?: string) => DeployMethod<Contract>` - Creates a tx to deploy (initialize and/or publish) a new instance of a contract.
- `static deployWithPublicKeys(publicKeys: PublicKeys, wallet: Wallet, artifact: ContractArtifact, args: any[], constructorName?: string) => DeployMethod<Contract>` - Creates a tx to deploy (initialize and/or publish) a new instance of a contract using the specified public keys hash to derive the address.
- `withWallet(wallet: Wallet) => this` - Creates a new instance of the contract wrapper attached to a different wallet.

### ContractBase

Abstract implementation of a contract extended by the Contract class and generated contract types.

**Constructor**
```typescript
new ContractBase(address: AztecAddress, artifact: ContractArtifact, wallet: Wallet)
```

**Properties**
- `readonly address: AztecAddress` - The contract's address.
- `readonly artifact: ContractArtifact` - The Application Binary Interface for the contract.
- `methods: {}` - An object containing contract methods mapped to their respective names.
- `wallet: Wallet` - The wallet used for interacting with this contract.

**Methods**
- `withWallet(wallet: Wallet) => this` - Creates a new instance of the contract wrapper attached to a different wallet.

### ContractDeployer

A class for deploying contract.

**Constructor**
```typescript
new ContractDeployer(artifact: ContractArtifact, wallet: Wallet, publicKeys?: PublicKeys, constructorName?: string)
```

**Methods**
- `deploy(...args: any[]) => DeployMethod<Contract>` - Deploy a contract using the provided ABI and constructor arguments. This function creates a new DeployMethod instance that can be used to send deployment transactions and query deployment status. The method accepts any number of constructor arguments, which will be passed to the contract's constructor during deployment.

### ContractFunctionInteraction

This is the class that is returned when calling e.g. `contract.methods.myMethod(arg0, arg1)`. It contains available interactions one can call on a method, including view.

Extends: `BaseContractInteraction`

**Constructor**
```typescript
new ContractFunctionInteraction(wallet: Wallet, contractAddress: AztecAddress, functionDao: FunctionAbi, args: any[], authWitnesses: AuthWitness[], capsules: Capsule[], extraHashedArgs: HashedValues[])
```

**Properties**
- `args: any[]`
- `authWitnesses: AuthWitness[]`
- `capsules: Capsule[]`
- `contractAddress: AztecAddress`
- `functionDao: FunctionAbi`
- `log: Logger`
- `wallet: Wallet`

**Methods**
- `getFunctionCall() => Promise<{ args: Fr[]; hideMsgSender: boolean; ... }>` - Returns the encoded function call wrapped by this interaction Useful when generating authwits
- `profile(options: ProfileInteractionOptions) => Promise<TxProfileResult>` - Simulate a transaction and profile the gate count for each function in the transaction.
- `request(options: RequestInteractionOptions) => Promise<ExecutionPayload>` - Returns the execution payload that allows this operation to happen on chain.
- `send<TReturn>(options: SendInteractionOptionsWithoutWait) => Promise<TReturn>` - Sends a transaction to the contract function with the specified options. By default, waits for the transaction to be mined and returns the receipt (or custom type).
- `simulate<T extends SimulateInteractionOptions>(options: T) => Promise<SimulationReturn<Exclude<T["fee"], undefined>["estimateGas"]>>` - Simulate a transaction and get information from its execution. Differs from prove in a few important ways: 1. It returns the values of the function execution, plus additional metadata if requested 2. It supports `utility`, `private` and `public` functions
- `with(options: { authWitnesses?: AuthWitness[]; capsules?: Capsule[]; extraHashedArgs?: HashedValues[] }) => ContractFunctionInteraction` - Augments this ContractFunctionInteraction with additional metadata, such as authWitnesses, capsules, and extraHashedArgs. This is useful when creating a "batteries included" interaction, such as registering a contract class with its associated capsule instead of having the user provide them externally.

### DeployAccountMethod

Modified version of the DeployMethod used to deploy account contracts. Supports deploying contracts that can pay for their own fee, plus some preconfigured options to avoid errors.

Extends: `DeployMethod<TContract>`

**Constructor**
```typescript
new DeployAccountMethod(publicKeys: PublicKeys, wallet: Wallet, artifact: ContractArtifact, postDeployCtor: (instance: ContractInstanceWithAddress, wallet: Wallet) => TContract, salt: Fr, account: Account, args: any[], constructorNameOrArtifact?: string | FunctionArtifact)
```

**Properties**
- `address: unknown`
- `artifact: ContractArtifact`
- `authWitnesses: AuthWitness[]`
- `capsules: Capsule[]`
- `log: Logger`
- `partialAddress: unknown`
- `postDeployCtor: (instance: ContractInstanceWithAddress, wallet: Wallet) => TContract`
- `wallet: Wallet`

**Methods**
- `convertDeployOptionsToRequestOptions(options: DeployAccountOptionsWithoutWait) => RequestDeployOptions`
- `getInitializationExecutionPayload(options?: RequestDeployOptions) => Promise<ExecutionPayload>` - Returns the calls necessary to initialize the contract.
- `getInstance(options?: RequestDeployOptions) => Promise<ContractInstanceWithAddress>` - Builds the contract instance and returns it.
- `getPublicationExecutionPayload(options?: RequestDeployOptions) => Promise<ExecutionPayload>` - Returns an execution payload for: - publication of the contract class and - publication of the contract instance to enable public execution depending on the provided options.
- `profile(options: Omit<RequestDeployOptions, "deployer"> & { universalDeploy?: boolean } & Pick<SendInteractionOptionsWithoutWait, "fee" | "from"> & Omit<SendInteractionOptions<undefined>, "fee"> & { fee?: SimulationInteractionFeeOptions; includeMetadata?: boolean; ... } & { profileMode: "gates" | "execution-steps" | "full"; skipProofGeneration?: boolean }) => Promise<TxProfileResult>` - Simulate a deployment and profile the gate count for each function in the transaction.
- `register(options?: RequestDeployOptions) => Promise<TContract>` - Adds this contract to the wallet and returns the Contract object.
- `request(opts?: RequestDeployAccountOptions) => Promise<ExecutionPayload>` - Returns the execution payload that allows this operation to happen on chain.
- `send(options: DeployOptionsWithoutWait) => Promise<TContract>` - Send a contract deployment transaction (initialize and/or publish) using the provided options. By default, waits for the transaction to be mined and returns the deployed contract instance.
- `simulate(options: SimulateDeployOptions) => Promise<{ estimatedGas: Pick<GasSettings, "gasLimits" | "teardownGasLimits">; offchainEffects: OffchainEffect[]; ... }>` - Simulate the deployment
- `with(options: { authWitnesses?: AuthWitness[]; capsules?: Capsule[] }) => DeployMethod` - Augments this DeployMethod with additional metadata, such as authWitnesses and capsules.

### DeployMethod

Contract interaction for deployment. Handles class publication, instance publication, and initialization of the contract. Note that for some contracts, a tx is not required as part of its "creation": If there are no public functions, and if there are no initialization functions, then technically the contract has already been "created", and all of the contract's functions (private and utility) can be interacted-with immediately, without any "deployment tx".

Extends: `BaseContractInteraction`

**Constructor**
```typescript
new DeployMethod(publicKeys: PublicKeys, wallet: Wallet, artifact: ContractArtifact, postDeployCtor: (instance: ContractInstanceWithAddress, wallet: Wallet) => TContract, args: any[], constructorNameOrArtifact?: string | FunctionArtifact, authWitnesses: AuthWitness[], capsules: Capsule[])
```

**Properties**
- `address: unknown`
- `artifact: ContractArtifact`
- `authWitnesses: AuthWitness[]`
- `capsules: Capsule[]`
- `log: Logger`
- `partialAddress: unknown`
- `postDeployCtor: (instance: ContractInstanceWithAddress, wallet: Wallet) => TContract`
- `wallet: Wallet`

**Methods**
- `convertDeployOptionsToRequestOptions(options: DeployOptionsWithoutWait) => RequestDeployOptions`
- `getInitializationExecutionPayload(options?: RequestDeployOptions) => Promise<ExecutionPayload>` - Returns the calls necessary to initialize the contract.
- `getInstance(options?: RequestDeployOptions) => Promise<ContractInstanceWithAddress>` - Builds the contract instance and returns it.
- `getPublicationExecutionPayload(options?: RequestDeployOptions) => Promise<ExecutionPayload>` - Returns an execution payload for: - publication of the contract class and - publication of the contract instance to enable public execution depending on the provided options.
- `profile(options: Omit<RequestDeployOptions, "deployer"> & { universalDeploy?: boolean } & Pick<SendInteractionOptionsWithoutWait, "fee" | "from"> & Omit<SendInteractionOptions<undefined>, "fee"> & { fee?: SimulationInteractionFeeOptions; includeMetadata?: boolean; ... } & { profileMode: "gates" | "execution-steps" | "full"; skipProofGeneration?: boolean }) => Promise<TxProfileResult>` - Simulate a deployment and profile the gate count for each function in the transaction.
- `register(options?: RequestDeployOptions) => Promise<TContract>` - Adds this contract to the wallet and returns the Contract object.
- `request(options?: RequestDeployOptions) => Promise<ExecutionPayload>` - Returns the execution payload that allows this operation to happen on chain.
- `send(options: DeployOptionsWithoutWait) => Promise<TContract>` - Send a contract deployment transaction (initialize and/or publish) using the provided options. By default, waits for the transaction to be mined and returns the deployed contract instance.
- `simulate(options: SimulateDeployOptions) => Promise<{ estimatedGas: Pick<GasSettings, "gasLimits" | "teardownGasLimits">; offchainEffects: OffchainEffect[]; ... }>` - Simulate the deployment
- `with(options: { authWitnesses?: AuthWitness[]; capsules?: Capsule[] }) => DeployMethod` - Augments this DeployMethod with additional metadata, such as authWitnesses and capsules.

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
- `toBuffer(bufferSize?: number) => Buffer` - Serialize as a buffer.
- `toField() => Fr` - Returns a new field with the same contents as this EthAddress.
- `toJSON() => string`
- `toString() => string` - Serialize as a hex string.

### ExecutionPayload

Represents data necessary to perform an action in the network successfully. This class can be considered Aztec's "minimal execution unit".

**Constructor**
```typescript
new ExecutionPayload(calls: FunctionCall[], authWitnesses: AuthWitness[], capsules: Capsule[], extraHashedArgs?: HashedValues[], feePayer?: AztecAddress)
```

**Properties**
- `authWitnesses: AuthWitness[]` - Any transient auth witnesses needed for this execution
- `calls: FunctionCall[]` - The function calls to be executed.
- `capsules: Capsule[]` - Data passed through an oracle for this execution.
- `extraHashedArgs: HashedValues[]` - Extra hashed values to be injected in the execution cache
- `feePayer?: AztecAddress` - The address that is paying for the fee in this execution payload (if any). If undefined, the wallet software executing the payload will have to add a fee payment method

**Methods**
- `static empty() => ExecutionPayload`

### FeeJuicePaymentMethodWithClaim

Pay fee directly with Fee Juice claimed in the same tx. Claiming consumes an L1 to L2 message that "contains" the fee juice bridged from L1.
Implements: `FeePaymentMethod`

**Constructor**
```typescript
new FeeJuicePaymentMethodWithClaim(sender: AztecAddress, claim: Pick<L2AmountClaim, "claimAmount" | "claimSecret" | "messageLeafIndex">)
```

**Methods**
- `getAsset() => Promise<AztecAddress>` - The asset used to pay the fee.
- `getExecutionPayload() => Promise<ExecutionPayload>` - Creates an execution payload to pay the fee in Fee Juice.
- `getFeePayer() => Promise<AztecAddress>` - The expected fee payer for this tx.
- `getGasSettings() => GasSettings | undefined` - The gas settings (if any) used to compute the execution payload of the payment method

### Fq

Fq field class.

Extends: `BaseField`

**Constructor**
```typescript
new Fq(value: number | bigint | boolean | Fq | Buffer<ArrayBufferLike>)
```

**Properties**
- `_branding: "Fq"` - Brand.
- `hi: unknown`
- `lo: unknown`
- `static MODULUS: bigint`
- `static schema: unknown`
- `size: unknown`
- `static SIZE_IN_BYTES: number`
- `value: unknown`
- `static ZERO: Fq`

**Methods**
- `[custom]() => string`
- `add(rhs: Fq) => Fq`
- `static cmp(lhs: BaseField, rhs: BaseField) => -1 | 0 | 1`
- `equals(rhs: BaseField) => boolean`
- `static fromBuffer(buffer: Buffer<ArrayBufferLike> | BufferReader) => Fq`
- `static fromBufferReduce(buffer: Buffer) => Fq`
- `static fromHexString(buf: string) => Fq` - Creates a Fq instance from a hex string.
- `static fromHighLow(high: Fr, low: Fr) => Fq`
- `static fromString(buf: string) => Fq` - Creates a Fq instance from a string.
- `isEmpty() => boolean`
- `isZero() => boolean`
- `lt(rhs: BaseField) => boolean`
- `modulus() => bigint`
- `static random() => Fq`
- `sqrt() => Promise<Fq | null>` - Computes a square root of the field element.
- `toBigInt() => bigint`
- `toBool() => boolean`
- `toBuffer() => Buffer` - Converts the bigint to a Buffer.
- `toField() => this`
- `toFields() => Fr[]`
- `toFriendlyJSON() => string`
- `toJSON() => string`
- `toNumber() => number` - Converts this field to a number. Throws if the underlying value is greater than MAX_SAFE_INTEGER.
- `toNumberUnsafe() => number` - Converts this field to a number. May cause loss of precision if the underlying value is greater than MAX_SAFE_INTEGER.
- `toShortString() => string`
- `toString() => string`
- `static zero() => Fq`

### Fr

Fr field class.

Extends: `BaseField`

**Constructor**
```typescript
new Fr(value: number | bigint | boolean | Fr | Buffer<ArrayBufferLike>)
```

**Properties**
- `_branding: "Fr"` - Brand.
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
- `static fromString(buf: string) => Fr` - Creates a Fr instance from a string.
- `isEmpty() => boolean`
- `static isZero(value: Fr) => boolean`
- `lt(rhs: BaseField) => boolean`
- `modulus() => bigint`
- `mul(rhs: Fr) => Fr`
- `negate() => Fr`
- `static random() => Fr`
- `sqrt() => Promise<Fr | null>` - Computes a square root of the field element.
- `square() => Fr`
- `sub(rhs: Fr) => Fr`
- `toBigInt() => bigint`
- `toBool() => boolean`
- `toBuffer() => Buffer` - Converts the bigint to a Buffer.
- `toField() => this`
- `toFriendlyJSON() => string`
- `toJSON() => string`
- `toNumber() => number` - Converts this field to a number. Throws if the underlying value is greater than MAX_SAFE_INTEGER.
- `toNumberUnsafe() => number` - Converts this field to a number. May cause loss of precision if the underlying value is greater than MAX_SAFE_INTEGER.
- `toShortString() => string`
- `toString() => string`
- `static zero() => Fr`

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
- `selector: FunctionSelector` - The function being called
- `to: AztecAddress` - The recipient contract
- `type: FunctionType` - Type of the function

**Methods**
- `static empty() => { args: never[]; hideMsgSender: boolean; ... }` - Creates an empty function call.
- `static from(fields: FieldsOf<FunctionCall>) => FunctionCall`
- `static getFields(fields: FieldsOf<FunctionCall>) => readonly []`

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
- `static fromFields(fields: Fr[] | FieldReader) => FunctionSelector`
- `static fromNameAndParameters(args: { name: string; parameters: { name: string; type: AbiType } & { visibility: "private" | "databus" | "public" }[] }) => Promise<FunctionSelector>` - Creates a function selector for a given function name and parameters.
- `static fromSignature(signature: string) => Promise<FunctionSelector>` - Creates a selector from a signature.
- `static fromString(selector: string) => FunctionSelector` - Create a Selector instance from a hex-encoded string.
- `isEmpty() => boolean` - Checks if the selector is empty (all bytes are 0).
- `static random() => FunctionSelector` - Creates a random instance.
- `toBuffer(bufferSize?: number) => Buffer` - Serialize as a buffer.
- `toField() => Fr` - Returns a new field with the same contents as this EthAddress.
- `toJSON() => string`
- `toString() => string` - Serialize as a hex string.

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
- `static empty(fields?: Partial<FieldsOf<GlobalVariables>>) => GlobalVariables`
- `equals(other: this) => boolean`
- `static from(fields: FieldsOf<GlobalVariables>) => GlobalVariables`
- `static fromBuffer(buffer: Buffer<ArrayBufferLike> | BufferReader) => GlobalVariables`
- `static fromFields(fields: Fr[] | FieldReader) => GlobalVariables`
- `static fromPlainObject(obj: any) => GlobalVariables` - Creates a GlobalVariables instance from a plain object without Zod validation. This method is optimized for performance and skips validation, making it suitable for deserializing trusted data (e.g., from C++ via MessagePack).
- `static getFields(fields: FieldsOf<GlobalVariables>) => readonly []`
- `getSize() => number`
- `isEmpty() => boolean`
- `static random(overrides?: Partial<FieldsOf<GlobalVariables>>) => GlobalVariables`
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

### L1FeeJuicePortalManager

Helper for interacting with the FeeJuicePortal on L1.

**Constructor**
```typescript
new L1FeeJuicePortalManager(portalAddress: EthAddress, tokenAddress: EthAddress, handlerAddress: EthAddress | undefined, extendedClient: ExtendedViemWalletClient, logger: Logger)
```

**Methods**
- `bridgeTokensPublic(to: AztecAddress, amount: bigint | undefined, mint: boolean) => Promise<L2AmountClaim>` - Bridges fee juice from L1 to L2 publicly. Handles L1 ERC20 approvals. Returns once the tx has been mined.
- `getTokenManager() => L1TokenManager` - Returns the associated token manager for the L1 ERC20.
- `static new(node: AztecNode, extendedClient: ExtendedViemWalletClient, logger: Logger) => Promise<L1FeeJuicePortalManager>` - Creates a new instance

### L1ToL2TokenPortalManager

Helper for interacting with a test TokenPortal on L1 for sending tokens to L2.

**Constructor**
```typescript
new L1ToL2TokenPortalManager(portalAddress: EthAddress, tokenAddress: EthAddress, handlerAddress: EthAddress | undefined, extendedClient: ExtendedViemWalletClient, logger: Logger)
```

**Properties**
- `extendedClient: ExtendedViemWalletClient`
- `logger: Logger`
- `readonly portal: {}`
- `readonly tokenManager: L1TokenManager`

**Methods**
- `bridgeTokensPrivate(to: AztecAddress, amount: bigint, mint: boolean) => Promise<L2AmountClaimWithRecipient>` - Bridges tokens from L1 to L2 privately. Handles token approvals. Returns once the tx has been mined.
- `bridgeTokensPublic(to: AztecAddress, amount: bigint, mint: boolean) => Promise<L2AmountClaim>` - Bridges tokens from L1 to L2. Handles token approvals. Returns once the tx has been mined.
- `getTokenManager() => L1TokenManager` - Returns the token manager for the underlying L1 token.

### L1TokenManager

Helper for managing an ERC20 on L1.

**Constructor**
```typescript
new L1TokenManager(tokenAddress: EthAddress, handlerAddress: EthAddress | undefined, extendedClient: ExtendedViemWalletClient, logger: Logger)
```

**Properties**
- `readonly handlerAddress: EthAddress | undefined` - Address of the handler/faucet contract.
- `readonly tokenAddress: EthAddress` - Address of the ERC20 contract.

**Methods**
- `approve(amount: bigint, address: string, addressName: string) => Promise<void>` - Approves tokens for the given address. Returns once the tx has been mined.
- `getL1TokenBalance(address: string) => Promise<bigint>` - Returns the balance of the given address.
- `getMintAmount() => Promise<bigint>` - Returns the amount of tokens available to mint via the handler.
- `mint(address: string, addressName?: string) => Promise<void>` - Mints a fixed amount of tokens for the given address. Returns once the tx has been mined.

### L1TokenPortalManager

Helper for interacting with a test TokenPortal on L1 for both withdrawing from and bridging to L2.

Extends: `L1ToL2TokenPortalManager`

**Constructor**
```typescript
new L1TokenPortalManager(portalAddress: EthAddress, tokenAddress: EthAddress, handlerAddress: EthAddress | undefined, outboxAddress: EthAddress, extendedClient: ExtendedViemWalletClient, logger: Logger)
```

**Properties**
- `extendedClient: ExtendedViemWalletClient`
- `logger: Logger`
- `readonly portal: {}`
- `readonly tokenManager: L1TokenManager`

**Methods**
- `bridgeTokensPrivate(to: AztecAddress, amount: bigint, mint: boolean) => Promise<L2AmountClaimWithRecipient>` - Bridges tokens from L1 to L2 privately. Handles token approvals. Returns once the tx has been mined.
- `bridgeTokensPublic(to: AztecAddress, amount: bigint, mint: boolean) => Promise<L2AmountClaim>` - Bridges tokens from L1 to L2. Handles token approvals. Returns once the tx has been mined.
- `getL2ToL1MessageLeaf(amount: bigint, recipient: EthAddress, l2Bridge: AztecAddress, callerOnL1: EthAddress) => Promise<Fr>` - Computes the L2 to L1 message leaf for the given parameters.
- `getTokenManager() => L1TokenManager` - Returns the token manager for the underlying L1 token.
- `withdrawFunds(amount: bigint, recipient: EthAddress, epochNumber: EpochNumber, messageIndex: bigint, siblingPath: SiblingPath<number>) => Promise<void>` - Withdraws funds from the portal by consuming an L2 to L1 message. Returns once the tx is mined on L1.

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
- `toBuffer(bufferSize?: number) => Buffer` - Serialize as a buffer.
- `toField() => Fr` - Returns a new field with the same contents as this EthAddress.
- `toJSON() => string`
- `toString() => string` - Serialize as a hex string.

### Point

Represents a Point on an elliptic curve with x and y coordinates. The Point class provides methods for creating instances from different input types, converting instances to various output formats, and checking the equality of points. Clean up this class.

**Constructor**
```typescript
new Point(x: Fr, y: Fr, isInfinite: boolean)
```

**Properties**
- `static COMPRESSED_SIZE_IN_BYTES: number`
- `inf: unknown`
- `readonly isInfinite: boolean` - Whether the point is at infinity
- `readonly kind: "point"` - Used to differentiate this class from AztecAddress
- `static schema: unknown`
- `static SIZE_IN_BYTES: number`
- `readonly x: Fr` - The point's x coordinate
- `readonly y: Fr` - The point's y coordinate
- `static ZERO: Point`

**Methods**
- `equals(rhs: Point) => boolean` - Check if two Point instances are equal by comparing their buffer values. Returns true if the buffer values are the same, and false otherwise.
- `static fromBuffer(buffer: Buffer<ArrayBufferLike> | BufferReader) => Point` - Create a Point instance from a given buffer or BufferReader. The input 'buffer' should have exactly 64 bytes representing the x and y coordinates.
- `static fromCompressedBuffer(buffer: Buffer<ArrayBufferLike> | BufferReader) => Promise<Point>` - Create a Point instance from a compressed buffer. The input 'buffer' should have exactly 33 bytes representing the x coordinate and the sign of the y coordinate.
- `static fromFields(fields: Fr[] | FieldReader) => Point`
- `static fromPlainObject(obj: any) => Point` - Creates a Point from a plain object without Zod validation. This method is optimized for performance and skips validation, making it suitable for deserializing trusted data (e.g., from C++ via MessagePack). Handles buffers, existing instances, or objects with x, y, and isInfinite fields.
- `static fromString(str: string) => Point` - Create a Point instance from a hex-encoded string. The input should be prefixed with '0x' or not, and have exactly 128 hex characters representing the x and y coordinates. Throws an error if the input length is invalid or coordinate values are out of range.
- `static fromXAndSign(x: Fr, sign: boolean) => Promise<Point>` - Uses the x coordinate and isPositive flag (+/-) to reconstruct the point.
- `hash() => Promise<Fr>`
- `isOnGrumpkin() => boolean`
- `isZero() => boolean`
- `static random() => Promise<Point>` - Generate a random Point instance.
- `toBigInts() => { isInfinite: bigint; x: bigint; y: bigint }` - Returns the contents of the point as BigInts.
- `toBuffer() => Buffer<ArrayBufferLike>` - Converts the Point instance to a Buffer representation of the coordinates.
- `toCompressedBuffer() => Buffer<ArrayBufferLike>` - Converts the Point instance to a compressed Buffer representation of the coordinates.
- `toFields() => Fr[]` - Returns the contents of the point as an array of 2 fields.
- `toJSON() => string`
- `toNoirStruct() => { is_infinite: boolean; x: Fr; y: Fr }`
- `toShortString() => string` - Generate a short string representation of the Point instance. The returned string includes the first 10 and last 4 characters of the full string representation, with '...' in between to indicate truncation. This is useful for displaying or logging purposes when the full string representation may be too long.
- `toString() => string` - Convert the Point instance to a hexadecimal string representation. The output string is prefixed with '0x' and consists of exactly 128 hex characters, representing the concatenated x and y coordinates of the point.
- `toWrappedNoirStruct() => { inner: { is_infinite: boolean; x: Fr; y: Fr } }`
- `toXAndSign() => []` - Returns the x coordinate and the sign of the y coordinate.
- `static YFromX(x: Fr) => Promise<Fr | null>`

### PrivateFeePaymentMethod

Holds information about how the fee for a transaction is to be paid.
Implements: `FeePaymentMethod`

**Constructor**
```typescript
new PrivateFeePaymentMethod(paymentContract: AztecAddress, sender: AztecAddress, wallet: Wallet, gasSettings: GasSettings, setMaxFeeToOne: boolean)
```

**Properties**
- `gasSettings: GasSettings` - Gas settings used to compute the maximum fee the user is willing to pay

**Methods**
- `getAsset() => Promise<AztecAddress>` - The asset used to pay the fee.
- `getExecutionPayload() => Promise<ExecutionPayload>` - Creates an execution payload to pay the fee using a private function through an FPC in the desired asset
- `getFeePayer() => Promise<AztecAddress>` - The expected fee payer for this tx.
- `getGasSettings() => GasSettings | undefined` - The gas settings (if any) used to compute the execution payload of the payment method

### PublicFeePaymentMethod

Holds information about how the fee for a transaction is to be paid.
Implements: `FeePaymentMethod`

**Constructor**
```typescript
new PublicFeePaymentMethod(paymentContract: AztecAddress, sender: AztecAddress, wallet: Wallet, gasSettings: GasSettings)
```

**Properties**
- `gasSettings: GasSettings` - Gas settings used to compute the maximum fee the user is willing to pay
- `paymentContract: AztecAddress` - Address which will hold the fee payment.
- `sender: AztecAddress` - An auth witness provider to authorize fee payments
- `wallet: Wallet` - A wallet to perform the simulation to get the accepted asset

**Methods**
- `getAsset() => Promise<AztecAddress>` - The asset used to pay the fee.
- `getExecutionPayload() => Promise<ExecutionPayload>` - Creates an execution payload to pay the fee using a public function through an FPC in the desired asset
- `getFeePayer() => Promise<AztecAddress>` - The expected fee payer for this tx.
- `getGasSettings() => GasSettings | undefined` - The gas settings (if any) used to compute the execution payload of the payment method

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
- `static fromFields(fields: Fr[] | FieldReader) => PublicKeys`
- `static fromPlainObject(obj: any) => PublicKeys` - Creates a PublicKeys from a plain object without Zod validation. This method is optimized for performance and skips validation, making it suitable for deserializing trusted data (e.g., from C++ via MessagePack).
- `static fromString(keys: string) => PublicKeys`
- `hash() => Fr | Promise<Fr>`
- `isEmpty() => boolean`
- `static random() => Promise<PublicKeys>`
- `toBuffer() => Buffer` - Converts the PublicKeys instance into a Buffer. This method should be used when encoding the address for storage, transmission or serialization purposes.
- `toFields() => Fr[]` - Serializes the payload to an array of fields
- `toNoirStruct() => { ivpk_m: { inner: { is_infinite: boolean; x: Fr; y: Fr } }; npk_m: { inner: { is_infinite: boolean; x: Fr; y: Fr } }; ... }`
- `toString() => string`

### SignerlessAccount

Account implementation which creates a transaction using the multicall protocol contract as entrypoint.
Implements: `Account`

**Constructor**
```typescript
new SignerlessAccount()
```

**Methods**
- `createAuthWit(_intent: Fr | IntentInnerHash | CallIntent | Buffer<ArrayBufferLike>) => Promise<AuthWitness>` - Creates an authentication witness from an inner hash with consumer, or a call intent
- `createTxExecutionRequest(exec: ExecutionPayload, gasSettings: GasSettings, chainInfo: ChainInfo) => Promise<TxExecutionRequest>` - Generates an execution request out of set of function calls.
- `getAddress() => AztecAddress` - Returns the address for this account.
- `getCompleteAddress() => CompleteAddress` - Returns the complete address for this account.
- `wrapExecutionPayload(exec: ExecutionPayload, options?: any) => Promise<ExecutionPayload>` - Wraps an execution payload such that it is executed *via* this entrypoint. This returns an ExecutionPayload with the entrypoint as the caller for the wrapped payload. Useful for account self-funding deployments and batching calls beyond the limit of a single entrypoint call.

### SponsoredFeePaymentMethod

A fee payment method that uses a contract that blindly sponsors transactions. This contract is expected to be prefunded in testing environments.
Implements: `FeePaymentMethod`

**Constructor**
```typescript
new SponsoredFeePaymentMethod(paymentContract: AztecAddress)
```

**Methods**
- `getAsset() => Promise<AztecAddress>` - The asset used to pay the fee.
- `getExecutionPayload() => Promise<ExecutionPayload>` - Returns the data to be added to the final execution request to pay the fee in the given asset
- `getFeePayer() => Promise<AztecAddress>` - The expected fee payer for this tx.
- `getGasSettings() => GasSettings | undefined` - The gas settings (if any) used to compute the execution payload of the payment method

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
- `static clone(tx: Tx, cloneProof?: boolean) => Tx` - Clones a tx, making a deep copy of all fields.
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
- `static random(args?: { randomProof?: boolean; txHash?: string | TxHash }) => Tx` - Creates a random tx.
- `recomputeHash() => Promise<TxHash>` - Recomputes the tx hash. Used for testing purposes only when a property of the tx was mutated.
- `toBuffer() => Buffer<ArrayBufferLike>` - Serializes the Tx object into a Buffer.
- `toMessage() => Buffer`
- `validateTxHash() => Promise<boolean>` - Validates that the tx hash matches the computed hash from the tx data. This should be called when deserializing a tx from an untrusted source.

### TxExecutionRequest

Request to execute a transaction. Similar to TxRequest, but has the full args.

**Constructor**
```typescript
new TxExecutionRequest(origin: AztecAddress, functionSelector: FunctionSelector, firstCallArgsHash: Fr, txContext: TxContext, argsOfCalls: HashedValues[], authWitnesses: AuthWitness[], capsules: Capsule[], salt?: Fr)
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

## Interfaces

### AccountContract

An account contract instance. Knows its artifact, deployment arguments, how to create transaction execution requests out of function calls, and how to authorize actions.

**Methods**
- `getAccount(address: CompleteAddress) => Account` - Returns the account implementation for this account contract given an instance at the provided address. The account is responsible for assembling tx requests given requested function calls, and for creating signed auth witnesses given action identifiers (message hashes).
- `getAuthWitnessProvider(address: CompleteAddress) => AuthWitnessProvider` - Returns the auth witness provider for the given address.
- `getContractArtifact() => Promise<ContractArtifact>` - Returns the artifact of this account contract.
- `getInitializationFunctionAndArgs() => Promise<{ constructorArgs: any[]; constructorName: string } | undefined>` - Returns the initializer function name and arguments for this instance, or undefined if this contract does not require initialization.

### AccountsCapability

Account access capability - grants access to user accounts. Maps to wallet methods: - getAccounts (when canGet: true) - createAuthWit (when canCreateAuthWit: true) The wallet decides which accounts to reveal to the app. Apps don't specify which accounts they want - they just request the capability and the wallet shows them the available accounts.

**Properties**
- `canCreateAuthWit?: boolean` - Can create auth witnesses for accounts. Maps to: createAuthWit
- `canGet?: boolean` - Can get accounts from wallet. Maps to: getAccounts
- `type: "accounts"` - Discriminator for capability type

### AppCapabilities

Application capability manifest. Sent by dApp to declare all operations it needs. This reduces authorization friction from multiple dialogs to a single comprehensive permission request.

**Properties**
- `capabilities: Capability[]` - Requested capabilities grouped by scope.
- `metadata: { description?: string; icon?: string; ... }` - Application metadata for display in authorization dialogs.
- `version: "1.0"` - Manifest version for forward compatibility. Currently only '1.0' is supported.

### AuthWitnessProvider

Creates authorization witnesses.

**Methods**
- `createAuthWit(messageHash: Fr | Buffer<ArrayBufferLike>) => Promise<AuthWitness>` - Computes an authentication witness from either a message hash

### AuthorizationProvider

Provides authorization for actions via the AuthWitness mechanism.

**Methods**
- `createAuthWit(intent: IntentInnerHash | CallIntent, chainInfo: ChainInfo) => Promise<AuthWitness>` - Creates an authentication witness from an inner hash with consumer, or a call intent

### ContractArtifact

Defines artifact of a contract.

**Properties**
- `fileMap: DebugFileMap` - The map of file ID to the source code and path of the file.
- `functions: FunctionArtifact[]` - The functions of the contract. Includes private and utility functions, plus the public dispatch function.
- `name: string` - The name of the contract.
- `nonDispatchPublicFunctions: FunctionAbi[]` - The public functions of the contract, excluding dispatch.
- `outputs: { globals: Record<string, AbiValue[]>; structs: Record<string, AbiType[]> }` - The outputs of the contract.
- `storageLayout: Record<string, FieldLayout>` - Storage layout

### ContractClassesCapability

Contract class capability - for querying contract class metadata. Maps to wallet methods: - getContractClassMetadata Contract classes are identified by their class ID (Fr), not by contract address. Multiple contract instances can share the same class. This capability grants permission to query metadata for specific contract classes. Apps typically acquire this permission automatically when registering a contract with an artifact (the wallet auto-grants permission for that contract's class ID).

**Properties**
- `canGetMetadata: boolean` - Can query contract class metadata. Maps to: getContractClassMetadata
- `classes: Fr[] | "*"` - Which contract classes this applies to: - '*': Any contract class ID - Fr[]: Specific contract class IDs
- `type: "contractClasses"` - Discriminator for capability type

### ContractFunctionPattern

Pattern for matching contract functions with wildcards. Used in simulation and transaction capabilities to specify which contract functions are allowed.

**Properties**
- `contract: AztecAddress | "*"` - Contract address or '*' for any contract
- `function: string` - Function name or '*' for any function

### ContractsCapability

Contract interaction capability - for registering and querying contracts. Maps to wallet methods: - registerContract (when canRegister: true) - getContractMetadata (when canGetMetadata: true) Matching is done by contract address, not class ID. This allows updating existing contracts with new artifacts (e.g., when contract is upgraded to a new contractClassId on-chain). Note: For querying contract class metadata, use ContractClassesCapability instead.

**Properties**
- `canGetMetadata?: boolean` - Can query contract metadata. Maps to: getContractMetadata
- `canRegister?: boolean` - Can register contracts and update existing registrations. Maps to: registerContract When true, allows: - Registering new contract instances at specified addresses - Re-registering existing contracts with updated artifacts (e.g., after upgrade)
- `contracts: "*" | AztecAddress[]` - Which contracts this applies to: - '*': Any contract address - AztecAddress[]: Specific contract addresses
- `type: "contracts"` - Discriminator for capability type

### DataCapability

Data access capability - for querying private data. Maps to wallet methods: - getAddressBook (when addressBook: true) - getPrivateEvents (when privateEvents specified)

**Properties**
- `addressBook?: boolean` - Access to address book. Maps to: getAddressBook
- `privateEvents?: { contracts: "*" | AztecAddress[] }` - Access to private events. Maps to: getPrivateEvents
- `type: "data"` - Discriminator for capability type

### FeePaymentMethod

Holds information about how the fee for a transaction is to be paid.

**Methods**
- `getAsset() => Promise<AztecAddress>` - The asset used to pay the fee.
- `getExecutionPayload() => Promise<ExecutionPayload>` - Returns the data to be added to the final execution request to pay the fee in the given asset
- `getFeePayer() => Promise<AztecAddress>` - The expected fee payer for this tx.
- `getGasSettings() => GasSettings | undefined` - The gas settings (if any) used to compute the execution payload of the payment method

### FunctionAbi

The abi entry of a function.

**Properties**
- `errorTypes: Partial<Record<string, AbiErrorType>>` - The types of the errors that the function can throw.
- `functionType: FunctionType` - Whether the function is secret.
- `isInitializer: boolean` - Whether the function is flagged as an initializer.
- `isOnlySelf: boolean` - Whether the function is marked as `#[only_self]` and hence callable only from within the contract.
- `isStatic: boolean` - Whether the function can alter state or not
- `name: string` - The name of the function.
- `parameters: { name: string; type: AbiType } & { visibility: "private" | "databus" | "public" }[]` - Function parameters.
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
- `parameters: { name: string; type: AbiType } & { visibility: "private" | "databus" | "public" }[]` - Function parameters.
- `returnTypes: AbiType[]` - The types of the return values.
- `verificationKey?: string` - The verification key of the function, base64 encoded, if it's a private fn.

### GrantedAccountsCapability

Granted account access capability. Extends the request with specific accounts that were granted by the wallet.

Extends: `AccountsCapability`

**Properties**
- `accounts: Aliased<AztecAddress>[]` - Specific accounts granted by the wallet with their aliases. The wallet adds this when granting the capability.
- `canCreateAuthWit?: boolean` - Can create auth witnesses for accounts. Maps to: createAuthWit
- `canGet?: boolean` - Can get accounts from wallet. Maps to: getAccounts
- `type: "accounts"` - Discriminator for capability type

### GrantedContractClassesCapability

Granted contract class capability. The wallet may reduce the scope (e.g., from '*' to specific class IDs).

Extends: `ContractClassesCapability`

**Properties**
- `canGetMetadata: boolean` - Can query contract class metadata. Maps to: getContractClassMetadata
- `classes: Fr[] | "*"` - Which contract classes this applies to: - '*': Any contract class ID - Fr[]: Specific contract class IDs
- `type: "contractClasses"` - Discriminator for capability type

### GrantedContractsCapability

Granted contract interaction capability. The wallet may reduce the scope (e.g., from '*' to specific addresses).

Extends: `ContractsCapability`

**Properties**
- `canGetMetadata?: boolean` - Can query contract metadata. Maps to: getContractMetadata
- `canRegister?: boolean` - Can register contracts and update existing registrations. Maps to: registerContract When true, allows: - Registering new contract instances at specified addresses - Re-registering existing contracts with updated artifacts (e.g., after upgrade)
- `contracts: "*" | AztecAddress[]` - Which contracts this applies to: - '*': Any contract address - AztecAddress[]: Specific contract addresses
- `type: "contracts"` - Discriminator for capability type

### GrantedDataCapability

Granted data access capability. The wallet may reduce the scope (e.g., from '*' to specific contracts).

Extends: `DataCapability`

**Properties**
- `addressBook?: boolean` - Access to address book. Maps to: getAddressBook
- `privateEvents?: { contracts: "*" | AztecAddress[] }` - Access to private events. Maps to: getPrivateEvents
- `type: "data"` - Discriminator for capability type

### GrantedSimulationCapability

Granted transaction simulation capability. The wallet may reduce the scope (e.g., from '*' to specific patterns).

Extends: `SimulationCapability`

**Properties**
- `transactions?: { scope: "*" | ContractFunctionPattern[] }` - Transaction simulation scope. Maps to: simulateTx, profileTx
- `type: "simulation"` - Discriminator for capability type
- `utilities?: { scope: "*" | ContractFunctionPattern[] }` - Utility simulation scope (unconstrained calls). Maps to: simulateUtility

### GrantedTransactionCapability

Granted transaction execution capability. The wallet may reduce the scope (e.g., from '*' to specific patterns).

Extends: `TransactionCapability`

**Properties**
- `scope: "*" | ContractFunctionPattern[]` - Which contracts/functions to allow: - '*': Any transaction - ContractFunctionPattern[]: Specific patterns
- `type: "transaction"` - Discriminator for capability type

### NodeInfo

Provides basic information about the running node.

**Properties**
- `enr: string | undefined` - The node's ENR.
- `l1ChainId: number` - L1 chain id.
- `l1ContractAddresses: L1ContractAddresses` - The deployed l1 contract addresses
- `nodeVersion: string` - Version as tracked in the aztec-packages repository.
- `protocolContractAddresses: ProtocolContractAddresses` - Protocol contract addresses
- `rollupVersion: number` - Rollup version.

### NoirCompiledContract

The compilation result of an Aztec.nr contract.

**Properties**
- `file_map: DebugFileMap` - The map of file ID to the source code and path of the file.
- `functions: NoirFunctionEntry[]` - The functions of the contract.
- `name: string` - The name of the contract.
- `outputs: { globals: Record<string, AbiValue[]>; structs: Record<string, AbiType[]> }` - The events of the contract
- `transpiled?: boolean` - Is the contract's public bytecode transpiled?

### SimulationCapability

Transaction simulation capability - for simulating transactions and utilities. Maps to wallet methods: - simulateTx (when transactions scope specified) - simulateUtility (when utilities scope specified) - profileTx (when transactions scope specified)

**Properties**
- `transactions?: { scope: "*" | ContractFunctionPattern[] }` - Transaction simulation scope. Maps to: simulateTx, profileTx
- `type: "simulation"` - Discriminator for capability type
- `utilities?: { scope: "*" | ContractFunctionPattern[] }` - Utility simulation scope (unconstrained calls). Maps to: simulateUtility

### TransactionCapability

Transaction execution capability - for sending transactions. Maps to wallet methods: - sendTx Policy enforcement (rate limits, spending limits) should be handled at the contract level in Aztec, not at the wallet level.

**Properties**
- `scope: "*" | ContractFunctionPattern[]` - Which contracts/functions to allow: - '*': Any transaction - ContractFunctionPattern[]: Specific patterns
- `type: "transaction"` - Discriminator for capability type

### WalletCapabilities

Wallet capability response. Returned by wallet after user reviews and approves/denies the capability request. The wallet can modify requested capabilities: - Reduce scope (e.g., restrict to specific contracts instead of '*') - Add information (e.g., specify which accounts are granted) - Deny capabilities (by omitting them from the `granted` array)

**Properties**
- `granted: GrantedCapability[]` - Capabilities granted by the wallet. Capabilities not in this array were implicitly denied. Empty array means the user denied all capabilities.
- `version: "1.0"` - Response version for forward compatibility.
- `wallet: { name: string; version: string }` - Wallet implementation details.

## Functions

### broadcastPrivateFunction
```typescript
function broadcastPrivateFunction(wallet: Wallet, artifact: ContractArtifact, selector: FunctionSelector) => Promise<ContractFunctionInteraction>
```
Sets up a call to broadcast a private function's bytecode via the ClassRegistry contract. Note that this is not required for users to call the function, but is rather a convenience to make this code publicly available so dapps or wallets do not need to redistribute it.

### broadcastUtilityFunction
```typescript
function broadcastUtilityFunction(wallet: Wallet, artifact: ContractArtifact, selector: FunctionSelector) => Promise<ContractFunctionInteraction>
```
Sets up a call to broadcast a utility function's bytecode via the ClassRegistry contract. Note that this is not required for users to call the function, but is rather a convenience to make this code publicly available so dapps or wallets do not need to redistribute it.

### computeAppNullifierHidingKey
```typescript
function computeAppNullifierHidingKey(masterNullifierHidingKey: Fq, app: AztecAddress) => Promise<Fr>
```

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

### decodeFromAbi
```typescript
function decodeFromAbi(typ: AbiType[], buffer: Fr[]) => AbiDecoded
```
Decodes values in a flattened Field array using a provided ABI.

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

### encodeArguments
```typescript
function encodeArguments(abi: FunctionAbi, args: any[]) => Fr[]
```
Encodes all the arguments for a function call.

### generateClaimSecret
```typescript
function generateClaimSecret(logger?: Logger) => Promise<[]>
```
Generates a pair secret and secret hash

### generatePublicKey
```typescript
function generatePublicKey(privateKey: Fq) => Promise<Point>
```
Method for generating a public grumpkin key from a private key.

### getAccountContractAddress
```typescript
function getAccountContractAddress(accountContract: AccountContract, secret: Fr, salt: Fr) => Promise<AztecAddress>
```
Compute the address of an account contract from secret and salt.

### getAllFunctionAbis
```typescript
function getAllFunctionAbis(artifact: ContractArtifact) => FunctionAbi[]
```
Gets all function abis

### getContractClassFromArtifact
```typescript
function getContractClassFromArtifact(artifact: ContractArtifact | ContractArtifactWithHash) => Promise<ContractClass & Pick<ContractClassCommitments, "id"> & ContractClassIdPreimage>
```
Creates a ContractClass from a contract compilation artifact.

### getContractInstanceFromInstantiationParams
```typescript
function getContractInstanceFromInstantiationParams(artifact: ContractArtifact, opts: ContractInstantiationData) => Promise<ContractInstanceWithAddress>
```
Generates a Contract Instance from some instantiation params.

### getGasLimits
```typescript
function getGasLimits(simulationResult: TxSimulationResult, pad: number) => { gasLimits: Gas; teardownGasLimits: Gas }
```
Returns suggested total and teardown gas limits for a simulated tx.

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

### mergeExecutionPayloads
```typescript
function mergeExecutionPayloads(requests: ExecutionPayload[]) => ExecutionPayload
```
Merges an array ExecutionPayloads combining their calls, authWitnesses, capsules and extraArgHashes.

### publishContractClass
```typescript
function publishContractClass(wallet: Wallet, artifact: ContractArtifact) => Promise<ContractFunctionInteraction>
```
Sets up a call to publish a contract class given its artifact.

### publishInstance
```typescript
function publishInstance(wallet: Wallet, instance: ContractInstanceWithAddress) => ContractFunctionInteraction
```
Sets up a call to the canonical contract instance registry to publish a contract instance.

### toProfileOptions
```typescript
function toProfileOptions(options: ProfileInteractionOptions) => ProfileOptions
```
Transforms and cleans up the higher level ProfileInteractionOptions defined by the interaction into ProfileOptions, which are the ones that can be serialized and forwarded to the wallet

### toSendOptions
```typescript
function toSendOptions<W extends InteractionWaitOptions>(options: SendInteractionOptions<W>) => SendOptions<W>
```
Transforms and cleans up the higher level SendInteractionOptions defined by the interaction into SendOptions, which are the ones that can be serialized and forwarded to the wallet

### toSimulateOptions
```typescript
function toSimulateOptions(options: SimulateInteractionOptions) => SimulateOptions
```
Transforms and cleans up the higher level SimulateInteractionOptions defined by the interaction into SimulateOptions, which are the ones that can be serialized and forwarded to the wallet

### waitForProven
```typescript
function waitForProven(node: AztecNode, receipt: TxReceipt, opts?: WaitForProvenOpts) => Promise<NonNullable<BlockNumber>>
```
Wait for a transaction to be proven by polling the node

## Types

### ABIParameter
```typescript
type ABIParameter = z.infer<typeof ABIParameterSchema>
```
A function parameter.

### AbiType
```typescript
type AbiType = BasicType<"field"> | BasicType<"boolean"> | IntegerType | ArrayType | StringType | StructType | TupleType
```
A variable type.

### Account
```typescript
type Account = EntrypointInterface & AuthorizationProvider & {}
```
Minimal interface for transaction execution and authorization.

### Aliased
```typescript
type Aliased = unknown
```
A wrapper type that allows any item to be associated with an alias.

### AztecAddressLike
```typescript
type AztecAddressLike = { address: FieldLike } | AztecAddress
```
Any type that can be converted into an AztecAddress Aztec.nr struct.

### BatchResults
```typescript
type BatchResults = { [key: string]: unknown }
```
Maps a tuple of BatchedMethod to a tuple of their wrapped return types

### BatchableMethods
```typescript
type BatchableMethods = Omit<Wallet, "batch">
```
Helper type that represents all methods that can be batched (all methods except batch itself).

### BatchedMethod
```typescript
type BatchedMethod = { [key: string]: unknown }[keyof BatchableMethods]
```
Union of all possible batched method calls. This ensures type safety: the `args` must match the specific `name`.

### BatchedMethodResult
```typescript
type BatchedMethodResult = unknown
```
Helper type to extract the return type of a batched method

### BatchedMethodResultWrapper
```typescript
type BatchedMethodResultWrapper = unknown
```
Wrapper type for batch results that includes the method name for discriminated union deserialization. Each result is wrapped as { name: 'methodName', result: ActualResult } to allow proper deserialization when AztecAddress and TxHash would otherwise be ambiguous (both are hex strings).

### CAPABILITY_VERSION
```typescript
type CAPABILITY_VERSION = "1.0"
```
Current capability manifest version.

### Capability
```typescript
type Capability = AccountsCapability | ContractsCapability | ContractClassesCapability | SimulationCapability | TransactionCapability | DataCapability
```
Union type of all capability scopes (app request). Capabilities group wallet operations by their security sensitivity and functional cohesion, making permission requests understandable to users.

### ChainInfo
```typescript
type ChainInfo = unknown
```
Information on the connected chain. Used by wallets when constructing transactions to protect against replay attacks.

### ContractClassMetadata
```typescript
type ContractClassMetadata = unknown
```
Contract class metadata.

### ContractClassWithId
```typescript
type ContractClassWithId = ContractClass & Pick<ContractClassCommitments, "id">
```
A contract class with its precomputed id.

### ContractInstanceWithAddress
```typescript
type ContractInstanceWithAddress = ContractInstance & { address: AztecAddress }
```

### ContractMetadata
```typescript
type ContractMetadata = unknown
```
Contract metadata including deployment and registration status.

### ContractMethod
```typescript
type ContractMethod = (...args: any[]) => ContractFunctionInteraction & { selector: () => Promise<FunctionSelector> }
```
Type representing a contract method that returns a ContractFunctionInteraction instance and has a readonly 'selector' property of type Buffer. Takes any number of arguments.

### ContractStorageLayout
```typescript
type ContractStorageLayout = { [key: string]: unknown }
```
Type representing the storage layout of a contract.

### DefaultWaitForProvenOpts
```typescript
type DefaultWaitForProvenOpts = WaitForProvenOpts
```

### DefaultWaitOpts
```typescript
type DefaultWaitOpts = WaitOpts
```

### DeployAccountOptions
```typescript
type DeployAccountOptions = DeployAccountOptionsWithoutWait & { wait?: W }
```
The configuration options for the send/prove methods. Omits: - The contractAddressSalt, since for account contracts that is fixed in the constructor. - UniversalDeployment flag, since account contracts are always deployed with it set to true

### DeployInteractionWaitOptions
```typescript
type DeployInteractionWaitOptions = NoWait | DeployWaitOptions | undefined
```
Type for wait options in deployment interactions. - NO_WAIT symbol: Don't wait, return TxHash immediately - DeployWaitOptions: Wait with custom options - undefined: Wait with default options

### DeployOptions
```typescript
type DeployOptions = DeployOptionsWithoutWait & { wait?: W }
```
Extends the deployment options with the required parameters to send the transaction.

### DeployReturn
```typescript
type DeployReturn = unknown
```
Represents the result type of deploying a contract. - If wait is NO_WAIT, returns TxHash immediately. - If wait has returnReceipt: true, returns DeployTxReceipt after waiting. - Otherwise (undefined or DeployWaitOptions without returnReceipt), returns TContract after waiting.

### DeployTxReceipt
```typescript
type DeployTxReceipt = TxReceipt & { contract: TContract; instance: ContractInstanceWithAddress }
```
Receipt for a deployment transaction with the deployed contract instance.

### DeployWaitOptions
```typescript
type DeployWaitOptions = WaitOpts & { returnReceipt?: boolean }
```
Wait options specific to deployment transactions. Extends WaitOpts with a flag to return the full receipt instead of just the contract.

### EthAddressLike
```typescript
type EthAddressLike = { address: FieldLike } | EthAddress
```
Any type that can be converted into an EthAddress Aztec.nr struct.

### EventSelectorLike
```typescript
type EventSelectorLike = FieldLike | EventSelector
```
Any type that can be converted into an EventSelector Aztec.nr struct.

### FieldLike
```typescript
type FieldLike = Fr | Buffer | bigint | number | { toField: () => Fr }
```
Any type that can be converted into a field for a contract call.

### FunctionSelectorLike
```typescript
type FunctionSelectorLike = FieldLike | FunctionSelector
```
Any type that can be converted into a FunctionSelector Aztec.nr struct.

### GasSettingsOption
```typescript
type GasSettingsOption = unknown
```
User-defined partial gas settings for the interaction. This type is completely optional since the wallet will fill in the missing options

### GrantedCapability
```typescript
type GrantedCapability = GrantedAccountsCapability | GrantedContractsCapability | GrantedContractClassesCapability | GrantedSimulationCapability | GrantedTransactionCapability | GrantedDataCapability
```
Union type of all granted capabilities (wallet response). The wallet may augment capabilities with additional information: - AccountsCapability: adds specific accounts granted - Other capabilities: may reduce scope (e.g., '*' to specific addresses)

### GrumpkinScalar
```typescript
type GrumpkinScalar = typeof Fq
```

### InteractionFeeOptions
```typescript
type InteractionFeeOptions = GasSettingsOption & FeePaymentMethodOption
```
Fee options as set by a user.

### InteractionWaitOptions
```typescript
type InteractionWaitOptions = NoWait | WaitOpts | undefined
```
Type for wait options in interactions. - NO_WAIT symbol: Don't wait for confirmation, return TxHash immediately - WaitOpts object: Wait with custom options and return receipt/result - undefined: Wait with default options and return receipt/result

### L2AmountClaim
```typescript
type L2AmountClaim = L2Claim & { claimAmount: bigint }
```
L1 to L2 message info that corresponds to an amount to claim.

### L2AmountClaimWithRecipient
```typescript
type L2AmountClaimWithRecipient = L2AmountClaim & { recipient: AztecAddress }
```
L1 to L2 message info that corresponds to an amount to claim with associated recipient.

### L2Claim
```typescript
type L2Claim = unknown
```
L1 to L2 message info to claim it on L2.

### NO_WAIT
```typescript
type NO_WAIT = "NO_WAIT"
```
Constant for explicitly not waiting for transaction confirmation. We use this instead of false to avoid confusion with falsy checks.

### NoWait
```typescript
type NoWait = typeof NO_WAIT
```
Type for the NO_WAIT constant.

### PartialAddress
```typescript
type PartialAddress = Fr
```
A type which along with public key forms a preimage of a contract address. See the link below for more details https://github.com/AztecProtocol/aztec-packages/blob/master/docs/docs/concepts/foundation/accounts/keys.md#addresses-partial-addresses-and-public-keys

### PrivateEvent
```typescript
type PrivateEvent = unknown
```
An ABI decoded private event with associated metadata.

### PrivateEventFilter
```typescript
type PrivateEventFilter = unknown
```
Filter options when querying private events.

### ProfileInteractionOptions
```typescript
type ProfileInteractionOptions = SimulateInteractionOptions & { profileMode: "gates" | "execution-steps" | "full"; skipProofGeneration?: boolean }
```
Represents the options for profiling an interaction.

### ProfileOptions
```typescript
type ProfileOptions = Omit<ProfileInteractionOptions, "fee"> & { fee?: GasSettingsOption }
```
Options for profiling interactions with the wallet. Overrides the fee settings of an interaction with a simplified version that only hints at the wallet whether the interaction contains a fee payment method or not

### PublicKey
```typescript
type PublicKey = Point
```
Represents a user public key.

### RequestDeployOptions
```typescript
type RequestDeployOptions = RequestInteractionOptions & { contractAddressSalt?: Fr; deployer?: AztecAddress; ... }
```
Options for deploying a contract on the Aztec network. Allows specifying a contract address salt and different options to tweak contract publication and initialization

### RequestInteractionOptions
```typescript
type RequestInteractionOptions = unknown
```
Represents the options to configure a request from a contract interaction. Allows specifying additional auth witnesses and capsules to use during execution

### Salt
```typescript
type Salt = Fr | number | bigint
```
A contract deployment salt.

### SendInteractionOptions
```typescript
type SendInteractionOptions = SendInteractionOptionsWithoutWait & { wait?: W }
```
Represents options for calling a (constrained) function in a contract.

### SendOptions
```typescript
type SendOptions = Omit<SendInteractionOptionsWithoutWait, "fee"> & { fee?: GasSettingsOption; wait?: W }
```
Options for sending/proving interactions with the wallet. Overrides the fee settings of an interaction with a simplified version that only hints at the wallet whether the interaction contains a fee payment method or not

### SendReturn
```typescript
type SendReturn = unknown
```
Represents the result type of sending a transaction. If `wait` is NO_WAIT, returns TxHash immediately without waiting. If `wait` is undefined or WaitOpts, returns TReturn (defaults to TxReceipt) after waiting.

### SimulateDeployOptions
```typescript
type SimulateDeployOptions = Omit<DeployOptionsWithoutWait, "fee"> & { fee?: SimulationInteractionFeeOptions; includeMetadata?: boolean; ... }
```
Options for simulating the deployment of a contract Allows skipping certain validations and computing gas estimations

### SimulateInteractionOptions
```typescript
type SimulateInteractionOptions = Omit<SendInteractionOptions, "fee"> & { fee?: SimulationInteractionFeeOptions; includeMetadata?: boolean; ... }
```
Represents the options for simulating a contract function interaction. Allows specifying the address from which the method should be called. Disregarded for simulation of public functions

### SimulateOptions
```typescript
type SimulateOptions = Omit<SimulateInteractionOptions, "fee"> & { fee?: GasSettingsOption & FeeEstimationOptions }
```
Options for simulating interactions with the wallet. Overrides the fee settings of an interaction with a simplified version that only hints at the wallet whether the interaction contains a fee payment method or not

### SimulationReturn
```typescript
type SimulationReturn = unknown
```
Represents the result type of a simulation. By default, it will just be the return value of the simulated function If `includeMetadata` is set to true in `SimulateInteractionOptions` on the input of `simulate(...)`, it will provide extra information.

### SortedTxStatuses
```typescript
type SortedTxStatuses = TxStatus[]
```
Tx status sorted by finalization progress.

### U128Like
```typescript
type U128Like = bigint | number
```
Any type that can be converted into a U128.

### WaitForProvenOpts
```typescript
type WaitForProvenOpts = unknown
```
Options for waiting for a transaction to be proven.

### WaitOpts
```typescript
type WaitOpts = unknown
```
Options related to waiting for a tx.

### Wallet
```typescript
type Wallet = unknown
```
The wallet interface.

### WrappedFieldLike
```typescript
type WrappedFieldLike = { inner: FieldLike } | FieldLike
```
Any type that can be converted into a struct with a single `inner` field.

## Enums

### FunctionType
Aztec.nr function types.

Values: `private`, `public`, `utility`

### TxExecutionResult
Execution result - only set when tx is in a block.

Values: `app_logic_reverted`, `both_reverted`, `success`, `teardown_reverted`

### TxStatus
Block inclusion/finalization status.

Values: `checkpointed`, `dropped`, `finalized`, `pending`, `proposed`, `proven`

## Cross-Package References

This package references types from other Aztec packages:

**@aztec/entrypoints**
- `AuthWitnessProvider`, `ChainInfo`, `DefaultAccountEntrypointOptions`, `EntrypointInterface`

**@aztec/ethereum**
- `ExtendedViemWalletClient`, `L1ContractAddresses`

**@aztec/foundation**
- `BaseField`, `BlockNumber`, `Buffer32`, `BufferReader`, `EpochNumber`, `EthAddress`, `FieldReader`, `FieldsOf`, `Fq`, `Fr`, `Logger`, `Point`, `SiblingPath`, `SlotNumber`

**@aztec/stdlib**
- `ABIParameterSchema`, `AbiDecoded`, `AbiErrorType`, `AbiType`, `AbiValue`, `ArrayType`, `AuthWitness`, `AztecAddress`, `AztecNode`, `BasicType`, `BlockHash`, `Capsule`, `ChonkProof`, `CompleteAddress`, `ContractArtifact`, `ContractArtifactWithHash`, `ContractClass`, `ContractClassCommitments`, `ContractClassIdPreimage`, `ContractClassLog`, `ContractClassLogFields`, `ContractInstance`, `ContractInstanceWithAddress`, `ContractInstantiationData`, `DebugFileMap`, `EventSelector`, `ExecutionPayload`, `FieldLayout`, `FunctionAbi`, `FunctionArtifact`, `FunctionCall`, `FunctionDebugMetadata`, `FunctionSelector`, `FunctionType`, `Gas`, `GasFees`, `GasSettings`, `GetPublicLogsResponse`, `GlobalVariables`, `Gossipable`, `HashedValues`, `IntegerType`, `L2LogsSource`, `NoirCompiledContract`, `NoirFunctionEntry`, `NoteSelector`, `OffchainEffect`, `PrivateExecutionStep`, `PrivateKernelTailCircuitPublicInputs`, `ProtocolContractAddresses`, `ProvingStats`, `PublicCallRequestWithCalldata`, `PublicKeys`, `RevertCode`, `Selector`, `SimulationStats`, `StringType`, `StructType`, `TopicType`, `TupleType`, `Tx`, `TxContext`, `TxExecutionRequest`, `TxExecutionResult`, `TxHash`, `TxProfileResult`, `TxReceipt`, `TxRequest`, `TxSimulationResult`, `TxStats`, `TxStatus`
