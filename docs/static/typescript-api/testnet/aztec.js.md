# @aztec/aztec.js

Version: v5.0.0

## Quick Import Reference

```typescript
import {
  AccountManager,
  BaseAccount,
  BatchCall,
  Capsule,
  Contract,
  // ... and more
} from '@aztec/aztec.js';
```

## Classes

### AccountManager

Manages a user account. Provides methods for calculating the account's address and other related data, plus a helper to return a preconfigured deploy method.

**Properties**
- `address: unknown`

**Methods**
- `static create(wallet: Wallet, secretKey: Fr, accountContract: AccountContract, opts?: AccountManagerCreateOptions) => Promise<AccountManager>`
- `getAccount() => Promise<Account>` - Returns the account (the transaction signer) backed by this account contract. Use it to build and authorize transactions from this account.
- `getAccountContract() => AccountContract` - Returns the account contract that backs this account.
- `getCompleteAddress() => Promise<CompleteAddress>` - Gets the calculated complete address associated with this account. Does not require the account to have been published for public execution.
- `getDeployMethod() => Promise<DeployAccountMethod<Contract>>` - Returns a preconfigured deploy method that contains all the necessary function calls to deploy the account contract.
- `getInstance() => ContractInstanceWithAddress` - Returns the contract instance definition associated with this account. Does not require the account to have been published for public execution.
- `getPublicKeys() => PublicKeys`
- `getPublicKeysHash() => Promise<Fr>`
- `getSecretKey() => Fr` - Returns the secret key used to derive the rest of the privacy keys for this contract
- `hasInitializer() => Promise<boolean>` - Returns whether this account contract has an initializer function.

### BaseAccount

An account implementation that uses authwits as an authentication mechanism and can assemble transaction execution requests for an entrypoint.
Implements: `Account`

**Constructor**
```typescript
new BaseAccount(entrypoint: EntrypointInterface, authWitnessProvider: AuthWitnessProvider, completeAddress: CompleteAddress)
```

**Methods**
- `createAuthWit(messageHashOrIntent: CallIntent | IntentInnerHash, chainInfo: ChainInfo) => Promise<AuthWitness>` - Creates an authentication witness from an inner hash with consumer, or a call intent
- `createTxExecutionRequest(exec: ExecutionPayload, gasSettings: GasSettings, chainInfo: ChainInfo, options: DefaultAccountEntrypointOptions) => Promise<TxExecutionRequest>` - Generates an execution request out of set of function calls.
- `getAddress() => AztecAddress` - Returns the address for this account.
- `getCompleteAddress() => CompleteAddress` - Returns the complete address for this account.
- `wrapExecutionPayload(exec: ExecutionPayload, chainInfo: ChainInfo, options?: any) => Promise<ExecutionPayload>` - Wraps an execution payload such that it is executed *via* this entrypoint. This returns an ExecutionPayload with the entrypoint as the caller for the wrapped payload. Useful for account self-funding deployments and batching calls beyond the limit of a single entrypoint call.

### BatchCall

A batch of function calls to be sent as a single transaction through a wallet.

Extends: `BaseContractInteraction`

**Constructor**
```typescript
new BatchCall(wallet: Wallet, interactions: ExecutionPayload | BaseContractInteraction[], extraHashedArgs: HashedValues[])
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
- `send<TReturn>(options: SendInteractionOptionsWithoutWait) => Promise<TxSendResultMined<TReturn>>` - Sends a transaction to the contract function with the specified options. By default, waits for the transaction to be mined and returns the receipt (or custom type).
- `simulate(options: SimulateInteractionOptions) => Promise<SimulationResult>` - Simulates/executes the batch, supporting private, public and utility functions. Although this is a single interaction with the wallet, private and public functions will be grouped into a single ExecutionPayload that the wallet will simulate as a single transaction. Utility function calls will be executed one by one.

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
- `static deploy(wallet: Wallet, artifact: ContractArtifact, args: any[], constructorName?: string, instantiation?: DeployInstantiationOptions) => DeployMethod<Contract>` - Creates a tx to deploy (initialize and/or publish) a new instance of a contract.
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
new ContractDeployer(artifact: ContractArtifact, wallet: Wallet, constructorName?: string)
```

**Methods**
- `deploy(args?: any[], instantiation?: DeployInstantiationOptions) => DeployMethod<Contract>` - Deploy a contract using the provided instantiation parameters and constructor arguments. Creates a new DeployMethod instance that can be used to send the deployment transaction. The first argument is the DeployInstantiationOptions (salt, deployer) — pass `{}` to accept defaults (random salt, deployer = AztecAddress.ZERO). The remaining arguments are the constructor arguments for the contract.

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
- `getFunctionCall() => Promise<FunctionCall>` - Returns the encoded function call wrapped by this interaction Useful when generating authwits
- `profile(options: ProfileInteractionOptions) => Promise<TxProfileResult>` - Simulate a transaction and profile the gate count for each function in the transaction.
- `request(options: RequestInteractionOptions) => Promise<ExecutionPayload>` - Returns the execution payload that allows this operation to happen on chain.
- `send<TReturn>(options: SendInteractionOptionsWithoutWait) => Promise<TxSendResultMined<TReturn>>` - Sends a transaction to the contract function with the specified options. By default, waits for the transaction to be mined and returns the receipt (or custom type).
- `simulate(options: SimulateInteractionOptions) => Promise<SimulationResult>` - Simulate a transaction and get information from its execution. Differs from prove in a few important ways: 1. It returns the values of the function execution, plus additional metadata if requested 2. It supports `utility`, `private` and `public` functions
- `with(options: { authWitnesses?: AuthWitness[]; capsules?: Capsule[]; extraHashedArgs?: HashedValues[] }) => ContractFunctionInteraction` - Augments this ContractFunctionInteraction with additional metadata, such as authWitnesses, capsules, and extraHashedArgs. This is useful when creating a "batteries included" interaction, such as registering a contract class with its associated capsule instead of having the user provide them externally.

### DeployAccountMethod

Modified version of the DeployMethod used to deploy account contracts. Supports deploying contracts that can pay for their own fee, plus some preconfigured options to avoid errors.

Extends: `UniversalDeployMethod<TContract>`

**Constructor**
```typescript
new DeployAccountMethod(publicKeys: PublicKeys, wallet: Wallet, artifact: ContractArtifact, postDeployCtor: (instance: ContractInstanceWithAddress, wallet: Wallet) => TContract, salt: Fr, immutablesHash: Fr, account: Account, args: any[], constructorNameOrArtifact?: string | FunctionArtifact, authWitnesses: AuthWitness[], capsules: Capsule[], extraHashedArgs: HashedValues[])
```

**Properties**
- `readonly args: any[]` - Encoded constructor arguments for the contract.
- `readonly artifact: ContractArtifact` - Build artifact of the contract being deployed.
- `authWitnesses: AuthWitness[]`
- `capsules: Capsule[]`
- `constructorArtifact: FunctionAbi | undefined` - Constructor function to call.
- `readonly extraHashedArgs: HashedValues[]` - Extra hashed args propagated through `with(...)` and into the deploy payload.
- `readonly immutablesHash: Fr` - Immutables hash folded into the salted initialization hash.
- `log: Logger`
- `readonly postDeployCtor: (instance: ContractInstanceWithAddress, wallet: Wallet) => TContract` - Factory invoked after deployment to produce the typed contract handle.
- `readonly publicKeys: PublicKeys` - Public keys mixed into the address preimage.
- `readonly salt: Fr` - Salt used in the address preimage.
- `wallet: Wallet`

**Methods**
- `cloneInstantiation() => DeployInstantiationOptions` - Re-emits this method's `DeployInstantiationOptions` for `with(...)` to consume.
- `convertDeployOptionsToProfileOptions(options: RequestInteractionOptions & { skipClassPublication?: boolean; skipInitialization?: boolean; ... } & Pick<SendInteractionOptionsWithoutWait, "fee" | "from" | "additionalScopes"> & Omit<SendInteractionOptions<undefined>, "fee"> & { fee?: InteractionFeeOptions; includeMetadata?: boolean; ... } & { profileMode: "gates" | "execution-steps" | "full"; skipProofGeneration?: boolean }) => ProfileOptions` - Converts deploy profile options into wallet-level profile options.
- `convertDeployOptionsToSendOptions<W extends InteractionWaitOptions>(options: DeployOptions<W>) => SendOptions<W>` - Converts DeployOptions to SendOptions.
- `convertDeployOptionsToSimulateOptions(options: SimulateDeployOptions) => SimulateOptions` - Converts deploy simulation options into wallet-level simulate options.
- `static create<TContract extends ContractBase>(wallet: Wallet, contract: DeployMethodContract<TContract>, instantiation: DeployInstantiationOptions, payload: DeployMethodPayload) => DeployMethod<TContract>` - Constructs the right concrete `DeployMethod` flavor for the supplied instantiation options: - `{ deployer: <addr> }` → BoundDeployMethod - `{ universalDeploy: true }` → UniversalDeployMethod - neither set → PendingDeployMethod Mixing `deployer` and `universalDeploy` throws. Returns the umbrella `DeployMethod<T>` type so callers can use the result generically without narrowing.
- `getAddress() => Promise<AztecAddress>` - Returns the deployed contract address.
- `getCachedInstanceOrThrow() => ContractInstanceWithAddress` - Returns the cached resolved instance synchronously, or throws if no instance has been computed yet. Intended for subclasses that run inside a code path where `getInstance()` is guaranteed to have already been awaited (e.g. `request()` invoked it). Not part of the public API.
- `getDeployerAddress() => AztecAddress` - Universal deploys are anchored at `AztecAddress.ZERO`; the sender does not enter the preimage.
- `getInitializationExecutionPayload(options?: RequestDeployOptions) => Promise<ExecutionPayload>` - Returns the calls necessary to initialize the contract.
- `getInstance() => Promise<ContractInstanceWithAddress>` - Builds the contract instance and returns it. The instance is computed once and cached for the lifetime of this DeployMethod; subsequent calls return the same instance. On a PendingDeployMethod this throws unless a prior `send` / `simulate` / `profile` call has already locked the deployer — otherwise the resolved address could silently differ from the eventually-deployed one.
- `getPartialAddress() => Promise<Fr>` - Returns the partial address for this deployment.
- `getPublicationExecutionPayload(options?: RequestDeployOptions) => Promise<ExecutionPayload>` - Returns an execution payload for: - publication of the contract class and - publication of the contract instance to enable public execution depending on the provided options.
- `lockDeployer(_from: AztecAddress | "NO_FROM" | undefined) => void` - Universal deploys accept any sender, including `NO_FROM` / `undefined`.
- `profile(options: RequestInteractionOptions & { skipClassPublication?: boolean; skipInitialization?: boolean; ... } & Pick<SendInteractionOptionsWithoutWait, "fee" | "from" | "additionalScopes"> & Omit<SendInteractionOptions<undefined>, "fee"> & { fee?: InteractionFeeOptions; includeMetadata?: boolean; ... } & { profileMode: "gates" | "execution-steps" | "full"; skipProofGeneration?: boolean }) => Promise<TxProfileResult>` - Simulate a deployment and profile the gate count for each function in the transaction.
- `register() => Promise<TContract>` - Adds this contract to the wallet and returns the Contract object.
- `request(opts?: RequestDeployAccountOptions) => Promise<ExecutionPayload>` - Returns the execution payload that allows this operation to happen on chain. For self-deployments (from === NO_FROM), the payload is wrapped through the multicall entrypoint on the app side so the wallet can execute it directly.
- `send(options: DeployOptionsWithoutWait) => Promise<DeployResultMined<TContract>>` - Send a contract deployment transaction (initialize and/or publish) using the provided options. By default, waits for the transaction to be mined and returns the deployed contract instance.
- `simulate(options: SimulateDeployOptions) => Promise<SimulationResult>` - Simulate the deployment
- `with(options: { authWitnesses?: AuthWitness[]; capsules?: Capsule[]; extraHashedArgs?: HashedValues[] }) => DeployAccountMethod<TContract>` - Augments this DeployAccountMethod with additional metadata, such as authWitnesses and capsules.

### DeployMethod

Umbrella type for a contract deployment interaction. `DeployMethod` is abstract: callers always interact with one of three concrete flavors — BoundDeployMethod, UniversalDeployMethod, or PendingDeployMethod — picked by DeployMethod.create based on the supplied DeployInstantiationOptions. The flavors only differ in their initial deployer-lock state; the full API (`request` / `send` / `simulate` / `profile` / `getInstance` / `getAddress` / `getPartialAddress` / `register` / `with`) lives on this base, so consumers can type variables as `DeployMethod<T>` and treat all three uniformly. The deployer (and therefore the deployed address) is locked once and never changes. Locking happens either at construction (via `deployer` or `universalDeploy: true` in the instantiation options) or lazily on the first `send` / `simulate` / `profile` call, which lock from `options.from`. Once locked: - The address is stable for the lifetime of this object. - Subsequent `send` / `simulate` / `profile` calls with a `from` that would imply a different deployer throw, to prevent silently deploying at a different address than `getAddress()` reported. - A locked universal deployer (`AztecAddress.ZERO`) is compatible with any `from`, since the address does not depend on the sender. Note that for some contracts, a tx is not required as part of its "creation": If there are no public functions, and if there are no initialization functions, then technically the contract has already been "created", and all of the contract's functions (private and utility) can be interacted-with immediately, without any "deployment tx".

Extends: `BaseContractInteraction`

**Constructor**
```typescript
new DeployMethod(wallet: Wallet, contract: DeployMethodContract<TContract>, salt: Fr | undefined, publicKeys: PublicKeys | undefined, immutablesHash: Fr | undefined, payload: DeployMethodPayload)
```

**Properties**
- `readonly args: any[]` - Encoded constructor arguments for the contract.
- `readonly artifact: ContractArtifact` - Build artifact of the contract being deployed.
- `authWitnesses: AuthWitness[]`
- `capsules: Capsule[]`
- `constructorArtifact: FunctionAbi | undefined` - Constructor function to call.
- `readonly extraHashedArgs: HashedValues[]` - Extra hashed args propagated through `with(...)` and into the deploy payload.
- `readonly immutablesHash: Fr` - Immutables hash folded into the salted initialization hash.
- `log: Logger`
- `readonly postDeployCtor: (instance: ContractInstanceWithAddress, wallet: Wallet) => TContract` - Factory invoked after deployment to produce the typed contract handle.
- `readonly publicKeys: PublicKeys` - Public keys mixed into the address preimage.
- `readonly salt: Fr` - Salt used in the address preimage.
- `wallet: Wallet`

**Methods**
- `cloneInstantiation() => DeployInstantiationOptions` - Returns the DeployInstantiationOptions that match this flavor. Used by `with(...)` to spawn a sibling instance carrying the same lock state.
- `convertDeployOptionsToProfileOptions(options: RequestInteractionOptions & { skipClassPublication?: boolean; skipInitialization?: boolean; ... } & Pick<SendInteractionOptionsWithoutWait, "fee" | "from" | "additionalScopes"> & Omit<SendInteractionOptions<undefined>, "fee"> & { fee?: InteractionFeeOptions; includeMetadata?: boolean; ... } & { profileMode: "gates" | "execution-steps" | "full"; skipProofGeneration?: boolean }) => ProfileOptions` - Converts deploy profile options into wallet-level profile options.
- `convertDeployOptionsToSendOptions<W extends InteractionWaitOptions>(options: DeployOptions<W>) => SendOptions<W>` - Converts DeployOptions to SendOptions.
- `convertDeployOptionsToSimulateOptions(options: SimulateDeployOptions) => SimulateOptions` - Converts deploy simulation options into wallet-level simulate options.
- `static create<TContract extends ContractBase>(wallet: Wallet, contract: DeployMethodContract<TContract>, instantiation: DeployInstantiationOptions, payload: DeployMethodPayload) => DeployMethod<TContract>` - Constructs the right concrete `DeployMethod` flavor for the supplied instantiation options: - `{ deployer: <addr> }` → BoundDeployMethod - `{ universalDeploy: true }` → UniversalDeployMethod - neither set → PendingDeployMethod Mixing `deployer` and `universalDeploy` throws. Returns the umbrella `DeployMethod<T>` type so callers can use the result generically without narrowing.
- `getAddress() => Promise<AztecAddress>` - Returns the deployed contract address.
- `getCachedInstanceOrThrow() => ContractInstanceWithAddress` - Returns the cached resolved instance synchronously, or throws if no instance has been computed yet. Intended for subclasses that run inside a code path where `getInstance()` is guaranteed to have already been awaited (e.g. `request()` invoked it). Not part of the public API.
- `getDeployerAddress() => AztecAddress` - The address that will be mixed into the contract's address preimage. Owned returns the concrete deployer; Universal returns `AztecAddress.ZERO`; Pending throws unless a prior `send` / `simulate` / `profile` call has already locked it.
- `getInitializationExecutionPayload(options?: RequestDeployOptions) => Promise<ExecutionPayload>` - Returns the calls necessary to initialize the contract.
- `getInstance() => Promise<ContractInstanceWithAddress>` - Builds the contract instance and returns it. The instance is computed once and cached for the lifetime of this DeployMethod; subsequent calls return the same instance. On a PendingDeployMethod this throws unless a prior `send` / `simulate` / `profile` call has already locked the deployer — otherwise the resolved address could silently differ from the eventually-deployed one.
- `getPartialAddress() => Promise<Fr>` - Returns the partial address for this deployment.
- `getPublicationExecutionPayload(options?: RequestDeployOptions) => Promise<ExecutionPayload>` - Returns an execution payload for: - publication of the contract class and - publication of the contract instance to enable public execution depending on the provided options.
- `lockDeployer(from: AztecAddress | "NO_FROM" | undefined) => void` - Reconciles a send-time `from` with the deploy's deployer. Owned asserts an exact match; Universal accepts anything; Pending uses the first call to lock its deployer (transitioning into an Owned/Universal sibling), then defers to that sibling's assertion on subsequent calls. The "locks-or-asserts" name is intentional: only Pending mutates state, and only on its first invocation. Owned and Universal are pure assertions.
- `profile(options: RequestInteractionOptions & { skipClassPublication?: boolean; skipInitialization?: boolean; ... } & Pick<SendInteractionOptionsWithoutWait, "fee" | "from" | "additionalScopes"> & Omit<SendInteractionOptions<undefined>, "fee"> & { fee?: InteractionFeeOptions; includeMetadata?: boolean; ... } & { profileMode: "gates" | "execution-steps" | "full"; skipProofGeneration?: boolean }) => Promise<TxProfileResult>` - Simulate a deployment and profile the gate count for each function in the transaction.
- `register() => Promise<TContract>` - Adds this contract to the wallet and returns the Contract object.
- `request(options: RequestDeployOptions) => Promise<ExecutionPayload>` - Returns the execution payload that allows this operation to happen on chain. Requires the deployer to be known — call `getDeployerAddress()` first; on a `PendingDeployMethod` this throws unless a prior `send` / `simulate` / `profile` has already locked the deployer.
- `send(options: DeployOptionsWithoutWait) => Promise<DeployResultMined<TContract>>` - Send a contract deployment transaction (initialize and/or publish) using the provided options. By default, waits for the transaction to be mined and returns the deployed contract instance.
- `simulate(options: SimulateDeployOptions) => Promise<SimulationResult>` - Simulate the deployment
- `with(options: { authWitnesses?: AuthWitness[]; capsules?: Capsule[]; extraHashedArgs?: HashedValues[] }) => DeployMethod<TContract>` - Augments this DeployMethod with additional metadata, such as authWitnesses and capsules. The deployer lock is preserved: a Pending that has not yet been locked stays Pending; a Pending that has already locked, along with Owned and Universal, returns the matching locked flavor so the cloned method deploys at the same address as `this`.

### DroppedTxReceipt

Receipt for a transaction that was dropped from the mempool without being mined.

Extends: `UnminedTxReceipt`
Implements: `TxReceiptInterface`

**Constructor**
```typescript
new DroppedTxReceipt(txHash: TxHash, error?: string)
```

**Properties**
- `readonly blockHash: undefined`
- `readonly blockNumber: undefined`
- `readonly epochNumber: undefined`
- `readonly error?: string` - Description of the transaction error, if any.
- `readonly executionResult: undefined`
- `static schema: unknown`
- `readonly slotNumber: undefined`
- `readonly status: DROPPED` - The transaction's block finalization status.
- `readonly transactionFee: undefined`
- `tx: undefined` - The pending transaction, attached when requested via `includePendingTx`.
- `readonly txEffect: undefined`
- `readonly txHash: TxHash` - A unique identifier for a transaction.
- `readonly txIndexInBlock: undefined`

**Methods**
- `static empty() => DroppedTxReceipt`
- `static from(fields: { error?: string; status: DROPPED; txHash: TxHash }) => DroppedTxReceipt`
- `hasExecutionReverted() => boolean` - Returns true if the transaction execution reverted.
- `hasExecutionSucceeded() => boolean` - Returns true if the transaction was executed successfully.
- `isDropped() => boolean` - Returns true (and narrows) if the transaction was dropped.
- `isMined() => boolean` - Returns true (and narrows) if the transaction has been included in a block.
- `isPending() => boolean` - Returns true (and narrows) if the transaction is pending.

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
new Fq(value: number | bigint | boolean | Buffer<ArrayBufferLike> | Fq)
```

**Properties**
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
- `static cmpAsBigInt(lhs: bigint, rhs: bigint) => -1 | 0 | 1`
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
- `toBuffer() => Buffer` - Converts the bigint to a Buffer. With a sink, streams the 32 big-endian bytes straight in (no allocation) and returns undefined; without one, returns a freshly allocated buffer.
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

Extends: `BaseFr`

**Constructor**
```typescript
new Fr(value: number | bigint | boolean | Buffer<ArrayBufferLike> | Fr)
```

**Properties**
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
- `static cmpAsBigInt(lhs: bigint, rhs: bigint) => -1 | 0 | 1`
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
- `toBuffer() => Buffer` - Converts the bigint to a Buffer. With a sink, streams the 32 big-endian bytes straight in (no allocation) and returns undefined; without one, returns a freshly allocated buffer.
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
- `static schema: unknown`
- `selector: FunctionSelector` - The function being called
- `to: AztecAddress` - The recipient contract
- `type: FunctionType` - Type of the function

**Methods**
- `static empty() => FunctionCall` - Creates an empty function call.
- `static from(fields: FieldsOf<FunctionCall>) => FunctionCall`
- `static getFields(fields: FieldsOf<FunctionCall>) => readonly []`
- `isPublicStatic() => boolean`

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
- `static fromNameAndParameters(args: { name: string; parameters: { name: string; type: AbiType } & { visibility: "databus" | "private" | "public" }[] }) => Promise<FunctionSelector>` - Creates a function selector for a given function name and parameters.
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
- `toBuffer() => Buffer`

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
- `readonly l1TxUtils: L1TxUtils`
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
- `readonly l1TxUtils: L1TxUtils`
- `logger: Logger`
- `readonly portal: {}`
- `readonly tokenManager: L1TokenManager`

**Methods**
- `bridgeTokensPrivate(to: AztecAddress, amount: bigint, mint: boolean) => Promise<L2AmountClaimWithRecipient>` - Bridges tokens from L1 to L2 privately. Handles token approvals. Returns once the tx has been mined.
- `bridgeTokensPublic(to: AztecAddress, amount: bigint, mint: boolean) => Promise<L2AmountClaim>` - Bridges tokens from L1 to L2. Handles token approvals. Returns once the tx has been mined.
- `getL2ToL1MessageLeaf(amount: bigint, recipient: EthAddress, l2Bridge: AztecAddress, callerOnL1: EthAddress) => Promise<Fr>` - Computes the L2 to L1 message leaf for the given parameters.
- `getTokenManager() => L1TokenManager` - Returns the token manager for the underlying L1 token.
- `withdrawFunds(amount: bigint, recipient: EthAddress, epochNumber: EpochNumber, numCheckpointsInEpoch: number, messageIndex: bigint, siblingPath: SiblingPath<number>) => Promise<void>` - Withdraws funds from the portal by consuming an L2 to L1 message. Returns once the tx is mined on L1.

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
- `toBuffer(bufferSize?: number) => Buffer` - Serialize as a buffer.
- `toField() => Fr` - Returns a new field with the same contents as this EthAddress.
- `toJSON() => string`
- `toString() => string` - Serialize as a hex string.

### PendingTxReceipt

Receipt for a transaction that is in the mempool but not yet included in a block.

Extends: `UnminedTxReceipt`
Implements: `TxReceiptInterface`

**Constructor**
```typescript
new PendingTxReceipt(txHash: TxHash, tx: DefineIfFlag<Opts, "includePendingTx", Tx>)
```

**Properties**
- `readonly blockHash: undefined`
- `readonly blockNumber: undefined`
- `readonly epochNumber: undefined`
- `readonly error?: string` - Description of the transaction error, if any.
- `readonly executionResult: undefined`
- `static schema: unknown`
- `readonly slotNumber: undefined`
- `readonly status: PENDING` - The transaction's block finalization status.
- `readonly transactionFee: undefined`
- `readonly tx: DefineIfFlag<Opts, "includePendingTx", Tx>` - The pending transaction, attached when requested via `includePendingTx`.
- `readonly txEffect: undefined`
- `readonly txHash: TxHash` - A unique identifier for a transaction.
- `readonly txIndexInBlock: undefined`

**Methods**
- `static empty() => PendingTxReceipt`
- `static from(fields: { error?: string; status: PENDING; ... }) => PendingTxReceipt`
- `hasExecutionReverted() => boolean` - Returns true if the transaction execution reverted.
- `hasExecutionSucceeded() => boolean` - Returns true if the transaction was executed successfully.
- `isDropped() => boolean` - Returns true (and narrows) if the transaction was dropped.
- `isMined() => boolean` - Returns true (and narrows) if the transaction has been included in a block.
- `isPending() => boolean` - Returns true (and narrows) if the transaction is pending.

### Point

Represents a Point on an elliptic curve with x and y coordinates. The Point class provides methods for creating instances from different input types, converting instances to various output formats, and checking the equality of points. Clean up this class.

**Constructor**
```typescript
new Point(x: Fr, y: Fr)
```

**Properties**
- `static COMPRESSED_SIZE_IN_BYTES: number`
- `static INFINITY: Point`
- `readonly isInfinite: boolean` - Whether the point is at infinity
- `readonly kind: "point"` - Used to differentiate this class from AztecAddress
- `static schema: unknown`
- `static SIZE_IN_BYTES: number`
- `readonly x: Fr` - The point's x coordinate
- `readonly y: Fr` - The point's y coordinate

**Methods**
- `equals(rhs: Point) => boolean` - Check if two Point instances are equal by comparing their buffer values. Returns true if the buffer values are the same, and false otherwise.
- `static fromBuffer(buffer: Buffer<ArrayBufferLike> | BufferReader) => Point` - Create a Point instance from a given buffer or BufferReader. The input 'buffer' should have exactly 64 bytes representing the x and y coordinates.
- `static fromCompressedBuffer(buffer: Buffer<ArrayBufferLike> | BufferReader) => Promise<Point>` - Create a Point instance from a compressed buffer. The input 'buffer' should have exactly 33 bytes representing the x coordinate and the sign of the y coordinate.
- `static fromFields(fields: Fr[] | FieldReader) => Point`
- `static fromPlainObject(obj: any) => Point` - Creates a Point from a plain object without Zod validation. This method is optimized for performance and skips validation, making it suitable for deserializing trusted data (e.g., from C++ via MessagePack). Handles buffers, existing instances, or objects with x, y, and isInfinite fields.
- `static fromString(str: string) => Point` - Create a Point instance from a hex-encoded string. The input should be prefixed with '0x' or not, and have exactly 128 hex characters representing the x and y coordinates. Throws an error if the input length is invalid or coordinate values are out of range.
- `static fromXAndSign(x: Fr, sign: boolean) => Promise<Point>` - Uses the x coordinate and isPositive flag (+/-) to reconstruct the point.
- `isOnCurve() => boolean`
- `isZero() => boolean`
- `static random() => Promise<Point>` - Generate a random Point instance that is on the curve.
- `toBigInts() => { x: bigint; y: bigint }` - Returns the contents of the point as BigInts.
- `toBuffer() => Buffer<ArrayBufferLike>` - Converts the Point instance to a Buffer representation of the coordinates.
- `toCompressedBuffer() => Buffer<ArrayBufferLike>` - Converts the Point instance to a compressed Buffer representation of the coordinates.
- `toFields() => Fr[]` - Returns the contents of the point as an array of 2 fields.
- `toJSON() => string`
- `toNoirStruct() => { x: Fr; y: Fr }`
- `toShortString() => string` - Generate a short string representation of the Point instance. The returned string includes the first 10 and last 4 characters of the full string representation, with '...' in between to indicate truncation. This is useful for displaying or logging purposes when the full string representation may be too long.
- `toString() => string` - Convert the Point instance to a hexadecimal string representation. The output string is prefixed with '0x' and consists of exactly 128 hex characters, representing the concatenated x and y coordinates of the point.
- `toWrappedNoirStruct() => { inner: { x: Fr; y: Fr } }`
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

### SimulationOverrides

**Constructor**
```typescript
new SimulationOverrides(args?: { contracts?: ContractOverrides; publicStorage?: PublicStorageOverride[] })
```

**Properties**
- `contracts?: ContractOverrides`
- `publicStorage?: PublicStorageOverride[]`
- `static schema: unknown`

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
- `static random(args?: { randomProof?: boolean; txHash?: string | TxHash }) => Tx` - Creates a random tx.
- `recomputeHash() => Promise<TxHash>` - Recomputes the tx hash. Used for testing purposes only when a property of the tx was mutated.
- `toBuffer() => Buffer` - Serializes the Tx object into a Buffer.
- `toMessage() => Buffer`
- `validateTxHash() => Promise<boolean>` - Validates that the tx hash matches the computed hash from the tx data. This should be called when deserializing a tx from an untrusted source.
- `withoutProof() => Tx` - Returns a copy of this tx with its proof stripped (replaced by an empty ChonkProof). Used when archiving txs or shipping a pending tx over RPC where the proof is not needed. Note that Tx.clone with `cloneProof = false` does not strip the proof; it shares the original.

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
- `toBuffer() => Buffer`
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

### TxSimulationResultWithAppOffset

Extends TxSimulationResult with the app call offset, which tracks where the app's calls begin in the flattened array of calls. Tracking of app call offset is a wallet-level concern: the wallet may wrap the app payload in an entrypoint or may prepend calls (this is typically done for fee payments).

Extends: `TxSimulationResult`

**Constructor**
```typescript
new TxSimulationResultWithAppOffset(privateExecutionResult: PrivateExecutionResult, publicInputs: PrivateKernelTailCircuitPublicInputs, publicOutput?: PublicSimulationOutput, stats?: SimulationStats, appCallOffset: number | undefined)
```

**Properties**
- `readonly appCallOffset: number | undefined` - Index of the app's first call in a flattened array of calls. 0 = app call is the root execution itself (DefaultEntrypoint / NO_FROM). 1..N = wallet prepended calls before the app call. undefined = wallet did not send the field; use heuristic fallback.
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
- `static fromResultAndOffset(result: TxSimulationResult, appCallOffset: number) => TxSimulationResultWithAppOffset` - Creates a TxSimulationResultWithAppOffset from an existing TxSimulationResult, attaching the app call offset computed by the wallet (i.e. how many calls precede the first app call in the flattened execution tree).
- `getPrivateReturnValues() => NestedProcessReturnValues`
- `getPrivateReturnValuesOfAppCall(appCallIndex: number) => NestedProcessReturnValues | undefined` - Returns the private return values that correspond to the provided app call.
- `getPublicReturnValues() => NestedProcessReturnValues[]`
- `static random() => Promise<TxSimulationResultWithAppOffset>`
- `toSimulatedTx() => Promise<Tx>`

### UniversalDeployMethod

Deploy method whose deployer is fixed at construction to AztecAddress.ZERO (universal deploy). The address does not depend on the sender, so any account may sign the deploy tx.

Extends: `DeployMethod<TContract>`

**Constructor**
```typescript
new UniversalDeployMethod(wallet: Wallet, contract: DeployMethodContract<TContract>, instantiation: UniversalInstantiationOptions, payload: DeployMethodPayload)
```

**Properties**
- `readonly args: any[]` - Encoded constructor arguments for the contract.
- `readonly artifact: ContractArtifact` - Build artifact of the contract being deployed.
- `authWitnesses: AuthWitness[]`
- `capsules: Capsule[]`
- `constructorArtifact: FunctionAbi | undefined` - Constructor function to call.
- `readonly extraHashedArgs: HashedValues[]` - Extra hashed args propagated through `with(...)` and into the deploy payload.
- `readonly immutablesHash: Fr` - Immutables hash folded into the salted initialization hash.
- `log: Logger`
- `readonly postDeployCtor: (instance: ContractInstanceWithAddress, wallet: Wallet) => TContract` - Factory invoked after deployment to produce the typed contract handle.
- `readonly publicKeys: PublicKeys` - Public keys mixed into the address preimage.
- `readonly salt: Fr` - Salt used in the address preimage.
- `wallet: Wallet`

**Methods**
- `cloneInstantiation() => DeployInstantiationOptions` - Re-emits this method's `DeployInstantiationOptions` for `with(...)` to consume.
- `convertDeployOptionsToProfileOptions(options: RequestInteractionOptions & { skipClassPublication?: boolean; skipInitialization?: boolean; ... } & Pick<SendInteractionOptionsWithoutWait, "fee" | "from" | "additionalScopes"> & Omit<SendInteractionOptions<undefined>, "fee"> & { fee?: InteractionFeeOptions; includeMetadata?: boolean; ... } & { profileMode: "gates" | "execution-steps" | "full"; skipProofGeneration?: boolean }) => ProfileOptions` - Converts deploy profile options into wallet-level profile options.
- `convertDeployOptionsToSendOptions<W extends InteractionWaitOptions>(options: DeployOptions<W>) => SendOptions<W>` - Converts DeployOptions to SendOptions.
- `convertDeployOptionsToSimulateOptions(options: SimulateDeployOptions) => SimulateOptions` - Converts deploy simulation options into wallet-level simulate options.
- `static create<TContract extends ContractBase>(wallet: Wallet, contract: DeployMethodContract<TContract>, instantiation: DeployInstantiationOptions, payload: DeployMethodPayload) => DeployMethod<TContract>` - Constructs the right concrete `DeployMethod` flavor for the supplied instantiation options: - `{ deployer: <addr> }` → BoundDeployMethod - `{ universalDeploy: true }` → UniversalDeployMethod - neither set → PendingDeployMethod Mixing `deployer` and `universalDeploy` throws. Returns the umbrella `DeployMethod<T>` type so callers can use the result generically without narrowing.
- `getAddress() => Promise<AztecAddress>` - Returns the deployed contract address.
- `getCachedInstanceOrThrow() => ContractInstanceWithAddress` - Returns the cached resolved instance synchronously, or throws if no instance has been computed yet. Intended for subclasses that run inside a code path where `getInstance()` is guaranteed to have already been awaited (e.g. `request()` invoked it). Not part of the public API.
- `getDeployerAddress() => AztecAddress` - Universal deploys are anchored at `AztecAddress.ZERO`; the sender does not enter the preimage.
- `getInitializationExecutionPayload(options?: RequestDeployOptions) => Promise<ExecutionPayload>` - Returns the calls necessary to initialize the contract.
- `getInstance() => Promise<ContractInstanceWithAddress>` - Builds the contract instance and returns it. The instance is computed once and cached for the lifetime of this DeployMethod; subsequent calls return the same instance. On a PendingDeployMethod this throws unless a prior `send` / `simulate` / `profile` call has already locked the deployer — otherwise the resolved address could silently differ from the eventually-deployed one.
- `getPartialAddress() => Promise<Fr>` - Returns the partial address for this deployment.
- `getPublicationExecutionPayload(options?: RequestDeployOptions) => Promise<ExecutionPayload>` - Returns an execution payload for: - publication of the contract class and - publication of the contract instance to enable public execution depending on the provided options.
- `lockDeployer(_from: AztecAddress | "NO_FROM" | undefined) => void` - Universal deploys accept any sender, including `NO_FROM` / `undefined`.
- `profile(options: RequestInteractionOptions & { skipClassPublication?: boolean; skipInitialization?: boolean; ... } & Pick<SendInteractionOptionsWithoutWait, "fee" | "from" | "additionalScopes"> & Omit<SendInteractionOptions<undefined>, "fee"> & { fee?: InteractionFeeOptions; includeMetadata?: boolean; ... } & { profileMode: "gates" | "execution-steps" | "full"; skipProofGeneration?: boolean }) => Promise<TxProfileResult>` - Simulate a deployment and profile the gate count for each function in the transaction.
- `register() => Promise<TContract>` - Adds this contract to the wallet and returns the Contract object.
- `request(options: RequestDeployOptions) => Promise<ExecutionPayload>` - Returns the execution payload that allows this operation to happen on chain. Requires the deployer to be known — call `getDeployerAddress()` first; on a `PendingDeployMethod` this throws unless a prior `send` / `simulate` / `profile` has already locked the deployer.
- `send(options: DeployOptionsWithoutWait) => Promise<DeployResultMined<TContract>>` - Send a contract deployment transaction (initialize and/or publish) using the provided options. By default, waits for the transaction to be mined and returns the deployed contract instance.
- `simulate(options: SimulateDeployOptions) => Promise<SimulationResult>` - Simulate the deployment
- `with(options: { authWitnesses?: AuthWitness[]; capsules?: Capsule[]; extraHashedArgs?: HashedValues[] }) => DeployMethod<TContract>` - Augments this DeployMethod with additional metadata, such as authWitnesses and capsules. The deployer lock is preserved: a Pending that has not yet been locked stays Pending; a Pending that has already locked, along with Owned and Universal, returns the matching locked flavor so the cloned method deploys at the same address as `this`.

## Interfaces

### AccountContract

An account contract instance. Knows its artifact, deployment arguments, how to create transaction execution requests out of function calls, and how to authorize actions.

**Methods**
- `getAccount(address: CompleteAddress) => Account` - Returns the account implementation for this account contract given an instance at the provided address. The account is responsible for assembling tx requests given requested function calls, and for creating signed auth witnesses given action identifiers (message hashes).
- `getAuthWitnessProvider(address: CompleteAddress) => AuthWitnessProvider` - Returns the auth witness provider for the given address.
- `getContractArtifact() => Promise<ContractArtifact>` - Returns the artifact of this account contract.
- `getImmutablesHash() => Promise<Fr | undefined>` - The hash of this account's immutable instantiation params, committed into its address. Returns undefined for accounts that have no immutables (these are instead deployed via an on-chain initializer, which contributes to the address through its initialization hash).
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
- `createAuthWit(messageHash: Buffer<ArrayBufferLike> | Fr) => Promise<AuthWitness>` - Computes an authentication witness from either a message hash

### AuthorizationProvider

Provides authorization for actions via the AuthWitness mechanism.

**Methods**
- `createAuthWit(intent: CallIntent | IntentInnerHash, chainInfo: ChainInfo) => Promise<AuthWitness>` - Creates an authentication witness from an inner hash with consumer, or a call intent

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

### ContractClassesCapability

Contract class capability - for querying contract class meatadata and registering contract classes. Maps to wallet methods: - getContractClassMetadata (when canGetMetadata: true) - registerContractClass (when canRegister: true) Contract classes are identified by their class ID (Fr), not by contract address. Multiple contract instances can share the same class. This capability grants permission to query metadata for, and register, specific contract classes. Apps typically acquire this permission automatically when registering a contract with an artifact (the wallet auto-grants permission for that contract's class ID).

**Properties**
- `canGetMetadata: boolean` - Can query contract class metadata. Maps to: getContractClassMetadata
- `canRegister?: boolean` - Can register a contract class artifact in the local PXE. Maps to: registerContractClass
- `classes: Fr[] | "*"` - Which contract classes this applies to: - '*': Any contract class ID - Fr[]: Specific contract class IDs
- `type: "contractClasses"` - Discriminator for capability type

### ContractFunctionPattern

Pattern for matching contract functions with wildcards. Used in simulation and transaction capabilities to specify which contract functions are allowed.

**Properties**
- `additionalScopes?: AztecAddress[] | "*"` - Additional addresses whose private state and keys are accessible when calling this function, beyond the sender's. - undefined: No additional scopes allowed - AztecAddress[]: Only these specific addresses allowed as additional scopes - '*': All known address allowed as an additional scope
- `contract: AztecAddress | "*"` - Contract address or '*' for any contract
- `function: string` - Function name or '*' for any function

### ContractsCapability

Contract interaction capability - for registering and querying contracts. Maps to wallet methods: - registerContract (when canRegister: true) - getContractMetadata (when canGetMetadata: true) Matching is done by contract address, not class ID. This allows updating existing contracts with new artifacts (e.g., when contract is upgraded to a new contractClassId on-chain). Note: For querying contract class metadata, use ContractClassesCapability instead.

**Properties**
- `canGetMetadata?: boolean` - Can query contract metadata. Maps to: getContractMetadata
- `canRegister?: boolean` - Can register contracts and update existing registrations. Maps to: registerContract When true, allows: - Registering new contract instances at specified addresses - Re-registering existing contracts with updated artifacts (e.g., after upgrade)
- `contracts: AztecAddress[] | "*"` - Which contracts this applies to: - '*': Any contract address - AztecAddress[]: Specific contract addresses
- `type: "contracts"` - Discriminator for capability type

### DataCapability

Data access capability - for querying private data. Maps to wallet methods: - getAddressBook (when addressBook: true) - getPrivateEvents (when privateEvents specified)

**Properties**
- `addressBook?: boolean` - Access to address book. Maps to: getAddressBook
- `privateEvents?: { contracts: AztecAddress[] | "*" }` - Access to private events. Maps to: getPrivateEvents
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
- `parameters: { name: string; type: AbiType } & { visibility: "databus" | "private" | "public" }[]` - Function parameters.
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
- `parameters: { name: string; type: AbiType } & { visibility: "databus" | "private" | "public" }[]` - Function parameters.
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
- `canRegister?: boolean` - Can register a contract class artifact in the local PXE. Maps to: registerContractClass
- `classes: Fr[] | "*"` - Which contract classes this applies to: - '*': Any contract class ID - Fr[]: Specific contract class IDs
- `type: "contractClasses"` - Discriminator for capability type

### GrantedContractsCapability

Granted contract interaction capability. The wallet may reduce the scope (e.g., from '*' to specific addresses).

Extends: `ContractsCapability`

**Properties**
- `canGetMetadata?: boolean` - Can query contract metadata. Maps to: getContractMetadata
- `canRegister?: boolean` - Can register contracts and update existing registrations. Maps to: registerContract When true, allows: - Registering new contract instances at specified addresses - Re-registering existing contracts with updated artifacts (e.g., after upgrade)
- `contracts: AztecAddress[] | "*"` - Which contracts this applies to: - '*': Any contract address - AztecAddress[]: Specific contract addresses
- `type: "contracts"` - Discriminator for capability type

### GrantedDataCapability

Granted data access capability. The wallet may reduce the scope (e.g., from '*' to specific contracts).

Extends: `DataCapability`

**Properties**
- `addressBook?: boolean` - Access to address book. Maps to: getAddressBook
- `privateEvents?: { contracts: AztecAddress[] | "*" }` - Access to private events. Maps to: getPrivateEvents
- `type: "data"` - Discriminator for capability type

### GrantedSimulationCapability

Granted transaction simulation capability. The wallet may reduce the scope (e.g., from '*' to specific patterns).

Extends: `SimulationCapability`

**Properties**
- `transactions?: { scope: "*" | ContractFunctionPattern[] }` - Transaction simulation scope. Maps to: simulateTx, profileTx
- `type: "simulation"` - Discriminator for capability type
- `utilities?: { scope: "*" | ContractFunctionPattern[] }` - Utility execution scope (unconstrained calls). Maps to: executeUtility

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
- `realProofs: boolean` - Whether the node requires real proofs for transaction submission.
- `rollupVersion: number` - Rollup version.
- `txsLimits: TxsLimits` - Limits a single tx may declare on this network. Clients rely on this to set fallback gas limits.

### NoirCompiledContract

The compilation result of an Aztec.nr contract.

**Properties**
- `aztec_version: string` - The version of the Aztec stack that compiled this contract.
- `file_map: DebugFileMap` - The map of file ID to the source code and path of the file.
- `functions: NoirFunctionEntry[]` - The functions of the contract.
- `name: string` - The name of the contract.
- `outputs: { globals: Record<string, AbiValue[]>; structs: Record<string, AbiType[]> }` - The events of the contract
- `transpiled?: boolean` - Is the contract's public bytecode transpiled?

### SimulationCapability

Transaction simulation capability - for simulating transactions and executing utilities. Maps to wallet methods: - simulateTx (when transactions scope specified) - executeUtility (when utilities scope specified) - profileTx (when transactions scope specified)

**Properties**
- `transactions?: { scope: "*" | ContractFunctionPattern[] }` - Transaction simulation scope. Maps to: simulateTx, profileTx
- `type: "simulation"` - Discriminator for capability type
- `utilities?: { scope: "*" | ContractFunctionPattern[] }` - Utility execution scope (unconstrained calls). Maps to: executeUtility

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

### BlockNumber
```typescript
function BlockNumber(value: number) => BlockNumber
```
Creates a BlockNumber from a number.

### computeAppNullifierHidingKey
```typescript
function computeAppNullifierHidingKey(masterNullifierHidingSecretKey: Fq, app: AztecAddress) => Promise<Fr>
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
function deriveKeys(secretKey: Fr) => Promise<{ masterFallbackPublicKey: Point; masterFallbackSecretKey: Fq; ... }>
```
Computes secret and public keys and public keys hash from a secret key.

### deriveMasterIncomingViewingSecretKey
```typescript
function deriveMasterIncomingViewingSecretKey(secretKey: Fr) => Fq
```

### deriveMasterNullifierHidingSecretKey
```typescript
function deriveMasterNullifierHidingSecretKey(secretKey: Fr) => Fq
```

### encodeArguments
```typescript
function encodeArguments(abi: FunctionAbi, args: any[]) => Fr[]
```
Encodes all the arguments for a function call.

### extractOffchainOutput
```typescript
function extractOffchainOutput(effects: OffchainEffect[], anchorBlockTimestamp: bigint) => OffchainOutput
```
Splits an array of offchain effects into decoded offchain messages and remaining effects. Effects whose data starts with `OFFCHAIN_MESSAGE_IDENTIFIER` are parsed as messages and removed from the effects array.

### fastForwardContractUpdate
```typescript
function fastForwardContractUpdate(args: { instanceAddress: AztecAddress; newClassId: Fr; node: AztecNode }) => Promise<SimulationOverrides>
```
Builds `SimulationOverrides` that simulate a deployed instance as if it had already been upgraded to a new contract class. Mirrors a real on-chain upgrade (scheduling the new class and waiting out the delay): - `publicStorage` rewrites the `ContractInstanceRegistry`'s delayed-public-mutable storage so the AVM's `UpdateCheck` resolves to the new class id. - `contracts` swaps the deployed instance for one whose `currentContractClassId` is bumped to the new class. The new class must already be registered on chain.

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
function getAccountContractAddress(accountContract: AccountContract, secret: Fr, salt: Fr, immutablesHash?: Fr) => Promise<AztecAddress>
```
Compute the address of an account contract from secret, salt and optional immutables hash

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

### loadContractArtifactWithValidation
```typescript
function loadContractArtifactWithValidation(input: NoirCompiledContract) => ContractArtifact
```
Like loadContractArtifact, but fully validates an already-processed artifact against the contract artifact schema before returning it. Use when loading an artifact from untrusted or external JSON (e.g. a file path passed to the CLI), so a malformed artifact is rejected up-front with a clear schema error instead of surfacing as an opaque failure later during deployment. `loadContractArtifact` only runs the shallow `isContractArtifact` shape check on already-processed artifacts; raw nargo output is validated via `generateContractArtifact` regardless. The returned object is identical to `loadContractArtifact`'s; the schema parse is used purely for validation.

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

### BlockNumber
```typescript
type BlockNumber = Branded<number, "BlockNumber">
```
Creates a BlockNumber from a number.

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
type DeployAccountOptions = DeployOptionsWithoutWait & { wait?: W }
```
The configuration options for the send/prove methods.

### DeployInstantiationOptions
```typescript
type DeployInstantiationOptions = unknown
```
Inputs that determine the contract's deployment address. `salt` and `publicKeys` are optional and default to a random Fr and `PublicKeys.default()` respectively. `deployer` and `universalDeploy` are mutually exclusive and both optional: - If neither is supplied, the deployer is locked lazily on the first `send` / `simulate` / `profile` call from `options.from` (NO_FROM/undefined → universal). This preserves the ergonomics of `MyContract.deploy(wallet, ...args).send({ from: alice })`. - If `deployer` or `universalDeploy: true` is supplied, the deployer is locked at construction. Once locked, the deployer cannot change. Subsequent calls with a `from` that would imply a different deployer throw — except when locked to `AztecAddress.ZERO` (universal), which is compatible with any sender.

### DeployOptions
```typescript
type DeployOptions = DeployOptionsWithoutWait & { wait?: W }
```
Extends the deployment options with the required parameters to send the transaction.

### DeployResultMined
```typescript
type DeployResultMined = { contract: TContract; instance: ContractInstanceWithAddress; receipt: TxReceipt } & OffchainOutput
```
Result of deploying a contract when waiting for mining (default case).

### DeployReturn
```typescript
type DeployReturn = unknown
```
Conditional return type for deploy based on wait options.

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

### ExecuteUtilityOptions
```typescript
type ExecuteUtilityOptions = unknown
```
Options for executing a utility function call.

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

### GetTxReceiptOptions
```typescript
type GetTxReceiptOptions = unknown
```
Options controlling which optional data is attached to a TxReceipt.

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

### MasterSecretKeys
```typescript
type MasterSecretKeys = unknown
```
The six master secret keys that fully define an account's privacy keys.

### NO_FROM
```typescript
type NO_FROM = "NO_FROM"
```
Constant for explicitly opting out of account contract mediation. When used as the `from` parameter, the wallet executes the payload directly via the DefaultEntrypoint without wrapping it in an account contract entrypoint. The app is responsible for assembling the complete execution payload, including any entrypoint wrapping (e.g. multicall) if needed. This will result in the first call of the chain receiving msg_sender as Option::none

### NO_WAIT
```typescript
type NO_WAIT = "NO_WAIT"
```
Constant for explicitly not waiting for transaction confirmation. We use this instead of false to avoid confusion with falsy checks.

### NoFrom
```typescript
type NoFrom = typeof NO_FROM
```
Type for the NO_FROM constant.

### NoWait
```typescript
type NoWait = typeof NO_WAIT
```
Type for the NO_WAIT constant.

### OffchainMessage
```typescript
type OffchainMessage = unknown
```
A message emitted during execution or proving, to be delivered offchain.

### OffchainOutput
```typescript
type OffchainOutput = unknown
```
Groups all unproven outputs from private execution that are returned to the client.

### OptionLike
```typescript
type OptionLike = T | null | undefined | { _is_some: boolean; _value: T }
```
Noir `Option<T>` lowered ABI shape, plus ergonomic direct `T | null | undefined` inputs.

### PartialAddress
```typescript
type PartialAddress = Fr
```
The contract-side preimage of an Aztec address, i.e. the commitment to a specific contract instance. A partial address commits to a contract's code and initialization (`hash(contract_class_id, salted_initialization_hash)`) but not to its keys. Combined with an account's `PublicKeys`, it fully determines the address: `address = (hash(public_keys_hash, partial_address) * G + Ivpk_m).x`. Two accounts therefore share an address only if they share both their public keys and their partial address. See `computePartialAddress` for the derivation.

### PrivateEvent
```typescript
type PrivateEvent = Event<T>
```
An ABI decoded private event with associated metadata.

### PrivateEventFilter
```typescript
type PrivateEventFilter = EventFilterBase & { contractAddress: AztecAddress; scopes: AztecAddress[] }
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

### PublicEvent
```typescript
type PublicEvent = Event<T, { contractAddress: AztecAddress }>
```
An ABI decoded public event with associated metadata (includes contract address).

### PublicEventFilter
```typescript
type PublicEventFilter = EventFilterBase & { afterEvent?: EventCursor; contractAddress: AztecAddress }
```
Filter options when querying public events. The contract address is required because the public log index is keyed on `(contract, tag)`; tag-only queries are not supported.

### PublicKey
```typescript
type PublicKey = Point
```
Represents a user public key. Structurally identical to a Grumpkin `Point`; exposed as a distinct name so call sites read as "public key" where that's the domain meaning.

### PublicStorageOverride
```typescript
type PublicStorageOverride = unknown
```
A single public-storage override to inject before simulation. Identifies a slot in (contract, raw slot) space, not by leafSlot — the simulator computes the leafSlot internally via `computePublicDataTreeLeafSlot`.

### RequestDeployOptions
```typescript
type RequestDeployOptions = RequestInteractionOptions & { skipClassPublication?: boolean; skipInitialization?: boolean; ... }
```
Options for deploying a contract on the Aztec network. Controls publication and registration policy for this deployment.

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
Represents the result type of sending a transaction. If `wait` is NO_WAIT, returns TxSendResultImmediate. Otherwise returns TxSendResultMined.

### SimulateDeployOptions
```typescript
type SimulateDeployOptions = Omit<DeployOptionsWithoutWait, "fee"> & { fee?: InteractionFeeOptions; includeMetadata?: boolean; ... }
```
Options for simulating the deployment of a contract Allows skipping certain validations and computing gas estimations

### SimulateInteractionOptions
```typescript
type SimulateInteractionOptions = Omit<SendInteractionOptions, "fee"> & { fee?: InteractionFeeOptions; includeMetadata?: boolean; ... }
```
Represents the options for simulating a contract function interaction. Allows specifying the address from which the method should be called. Disregarded for simulation of public functions

### SimulateOptions
```typescript
type SimulateOptions = Omit<SimulateInteractionOptions, "fee"> & { fee?: GasSettingsOption }
```
Options for simulating interactions with the wallet. Overrides the fee settings of an interaction with a simplified version that only hints at the wallet whether the interaction contains a fee payment method or not

### SimulationResult
```typescript
type SimulationResult = { gasUsed?: GasUsed; result: any; stats?: SimulationStats } & OffchainOutput
```
Represents the result of a simulation. Always includes the return value and offchain output. When `includeMetadata` is set, also includes stats and the simulated gas usage.

### SortedTxStatuses
```typescript
type SortedTxStatuses = TxStatus[]
```
Tx status sorted by finalization progress.

### TxReceipt
```typescript
type TxReceipt = PendingTxReceipt<Opts> | DroppedTxReceipt | MinedTxReceipt<Opts>
```
A transaction receipt summarizing the lifecycle of a transaction in the Aztec network. Discriminated over the transaction's status: PendingTxReceipt while in the mempool, DroppedTxReceipt once dropped, and MinedTxReceipt once included in a block.

### TxSendResultImmediate
```typescript
type TxSendResultImmediate = { txHash: TxHash } & OffchainOutput
```
Result of sendTx when not waiting for mining.

### TxSendResultMined
```typescript
type TxSendResultMined = { receipt: TReturn } & OffchainOutput
```
Result of sendTx when waiting for mining.

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

### ZERO
```typescript
type ZERO = BlockNumber
```

### add
```typescript
type add = (bn: BlockNumber, increment: number) => BlockNumber
```

### fromBigInt
```typescript
type fromBigInt = (value: bigint) => BlockNumber
```

### fromCheckpointNumber
```typescript
type fromCheckpointNumber = (value: CheckpointNumber) => BlockNumber
```

### fromString
```typescript
type fromString = (value: string) => BlockNumber
```

### isValid
```typescript
type isValid = (value: unknown) => boolean
```

## Enums

### ContractInitializationStatus
Whether the contract has been initialized.

Values: `INITIALIZED`, `UNINITIALIZED`, `UNKNOWN`

### FunctionType
Aztec.nr function types.

Values: `private`, `public`, `utility`

### TxExecutionResult
Execution result - only set when tx is in a block.

Values: `reverted`, `success`

### TxStatus
Block inclusion/finalization status.

Values: `checkpointed`, `dropped`, `finalized`, `pending`, `proposed`, `proven`

## Cross-Package References

This package references types from other Aztec packages:

**@aztec/entrypoints**
- `AuthWitnessProvider`, `ChainInfo`, `DefaultAccountEntrypointOptions`, `EntrypointInterface`

**@aztec/ethereum**
- `ExtendedViemWalletClient`, `L1ContractAddresses`, `L1TxUtils`

**@aztec/foundation**
- `BaseBuffer32`, `BaseField`, `BaseFr`, `BlockNumber`, `Branded`, `BufferReader`, `CheckpointNumber`, `DefineIfFlag`, `EpochNumber`, `EthAddress`, `FieldReader`, `FieldsOf`, `Fq`, `Fr`, `Logger`, `Point`, `SiblingPath`, `SlotNumber`

**@aztec/stdlib**
- `ABIParameterSchema`, `AbiDecoded`, `AbiErrorType`, `AbiType`, `AbiValue`, `ArrayType`, `AuthWitness`, `AztecAddress`, `AztecNode`, `BasicType`, `BlockHash`, `CHECKPOINTED`, `Capsule`, `ChonkProof`, `CompleteAddress`, `ContractArtifact`, `ContractArtifactWithHash`, `ContractClass`, `ContractClassCommitments`, `ContractClassIdPreimage`, `ContractClassLog`, `ContractClassLogFields`, `ContractInstance`, `ContractInstanceWithAddress`, `ContractInstantiationData`, `ContractOverrides`, `DROPPED`, `DebugFileMap`, `DebugLog`, `DroppedTxReceipt`, `EventSelector`, `ExecutionPayload`, `FINALIZED`, `FieldLayout`, `FunctionAbi`, `FunctionArtifact`, `FunctionCall`, `FunctionDebugMetadata`, `FunctionSelector`, `FunctionType`, `GasFees`, `GasSettings`, `GasUsed`, `GlobalVariables`, `Gossipable`, `HashedValues`, `IntegerType`, `MinedTxReceipt`, `NestedProcessReturnValues`, `NoirCompiledContract`, `NoirFunctionEntry`, `NoteSelector`, `OffchainEffect`, `Opts`, `PENDING`, `PROPOSED`, `PROVEN`, `PendingTxReceipt`, `PrivateExecutionResult`, `PrivateExecutionStep`, `PrivateKernelTailCircuitPublicInputs`, `PrivateSimulationResult`, `ProtocolContractAddresses`, `ProvingStats`, `PublicCallRequestWithCalldata`, `PublicKeys`, `PublicSimulationOutput`, `PublicStorageOverride`, `RevertCode`, `Selector`, `SimulationOverrides`, `SimulationStats`, `StringType`, `StructType`, `TopicType`, `TupleType`, `Tx`, `TxContext`, `TxEffect`, `TxExecutionRequest`, `TxExecutionResult`, `TxHash`, `TxProfileResult`, `TxReceipt`, `TxReceiptBase`, `TxReceiptInterface`, `TxRequest`, `TxSimulationResult`, `TxStats`, `TxStatus`, `TxsLimits`, `UnminedTxReceipt`
