# @aztec/aztec.js

Version: v3.0.0-devnet.6-patch.1

## Quick Import Reference

```typescript
import {
  AccountEntrypointMetaPaymentMethod,
  AccountManager,
  AccountWithSecretKey,
  AuthWitness,
  AztecAddress,
  // ... and more
} from '@aztec/aztec.js';
```

## Classes

### AccountEntrypointMetaPaymentMethod

Fee payment method that allows an account contract to pay for its own deployment It works by rerouting the provided fee payment method through the account's entrypoint, which sets itself as fee payer. If no payment method is provided, it is assumed the account will pay with its own fee juice balance. Usually, in order to pay fees it is necessary to obtain an ExecutionPayload that encodes the necessary information that is sent to the user's account entrypoint, that has plumbing to handle it. If there's no account contract yet (it's being deployed) a MultiCallContract is used, which doesn't have a concept of fees or how to handle this payload. HOWEVER, the account contract's entrypoint does, so this method reshapes that fee payload into a call to the account contract entrypoint being deployed with the original fee payload. This class can be seen in action in DeployAccountMethod.ts#getSelfPaymentMethod
Implements: `FeePaymentMethod`

**Constructor**
```typescript
new AccountEntrypointMetaPaymentMethod(wallet: Wallet, artifact: ContractArtifact, feePaymentNameOrArtifact: string | FunctionArtifact, accountAddress: AztecAddress, paymentMethod?: FeePaymentMethod)
```

**Methods**
- `getAsset() => Promise<AztecAddress>` - The asset used to pay the fee.
- `getExecutionPayload() => Promise<ExecutionPayload>` - Returns the data to be added to the final execution request to pay the fee in the given asset
- `getFeePayer() => Promise<AztecAddress>` - The expected fee payer for this tx.
- `getGasSettings() => GasSettings` - The gas settings (if any) used to compute the execution payload of the payment method

### AccountManager

Manages a user account. Provides methods for calculating the account's address and other related data, plus a helper to return a preconfigured deploy method.

**Properties**
- `address: unknown`
- `readonly salt: Salt`

**Methods**
- `static create(wallet: Wallet, secretKey: Fr, accountContract: AccountContract, salt?: Salt) => Promise<AccountManager>`
- `getAccount() => Promise<AccountWithSecretKey>` - Returns a Wallet instance associated with this account. Use it to create Contract instances to be interacted with from this account.
- `getAccountContract() => AccountContract` - Returns the account contract that backs this account.
- `getAccountInterface() => Promise<AccountInterface>` - Returns the entrypoint for this account as defined by its account contract.
- `getCompleteAddress() => Promise<CompleteAddress>` - Gets the calculated complete address associated with this account. Does not require the account to have been published for public execution.
- `getDeployMethod() => Promise<DeployAccountMethod<Contract>>` - Returns a preconfigured deploy method that contains all the necessary function calls to deploy the account contract.
- `getInstance() => ContractInstanceWithAddress` - Returns the contract instance definition associated with this account. Does not require the account to have been published for public execution.
- `getPublicKeys() => PublicKeys`
- `getPublicKeysHash() => Fr | Promise<Fr>`
- `getSecretKey() => Fr` - Returns the secret key used to derive the rest of the privacy keys for this contract
- `hasInitializer() => Promise<boolean>` - Returns whether this account contract has an initializer function.

### AccountWithSecretKey

Extends Account with the encryption private key. Not required for implementing the wallet interface but useful for testing purposes or exporting an account to another pxe.

Extends: `BaseAccount`

**Constructor**
```typescript
new AccountWithSecretKey(account: AccountInterface, secretKey: Fr, salt: Salt)
```

**Properties**
- `account: AccountInterface`
- `readonly salt: Salt`

**Methods**
- `createAuthWit(messageHashOrIntent: Fr | Buffer | CallIntent | IntentInnerHash) => Promise<AuthWitness>` - Computes an authentication witness from either a message hash or an intent. If a message hash is provided, it will create a witness for the hash directly. Otherwise, it will compute the message hash using the intent, along with the chain id and the version values provided by the wallet.
- `createTxExecutionRequest(exec: ExecutionPayload, gasSettings: GasSettings, options: DefaultAccountEntrypointOptions) => Promise<TxExecutionRequest>` - Generates an execution request out of set of function calls.
- `getAddress() => AztecAddress` - Returns the address of the account that implements this wallet.
- `getChainId() => Fr` - Returns the chain id for this account
- `getCompleteAddress() => CompleteAddress` - Returns the complete address of the account that implements this wallet.
- `getEncryptionSecret() => Promise<Fq>` - Returns the encryption secret, the secret of the encryption point—the point that others use to encrypt messages to this account note - this ensures that the address secret always corresponds to an address point with y being positive dev - this is also referred to as the address secret, which decrypts payloads encrypted to an address point
- `getSecretKey() => Fr` - Returns the encryption private key associated with this account.
- `getVersion() => Fr` - Returns the rollup version for this account

### AuthWitness

An authentication witness. Used to authorize an action by a user.

**Constructor**
```typescript
new AuthWitness(requestHash: Fr, witness: number | Fr[])
```

**Properties**
- `readonly requestHash: Fr`
- `static schema: unknown`
- `readonly witness: Fr[]` - Authentication witness for the hash

**Methods**
- `static fromBuffer(buffer: Buffer | BufferReader) => AuthWitness`
- `static fromString(str: string) => AuthWitness`
- `static random() => AuthWitness`
- `toBuffer() => any`
- `toJSON() => string`
- `toString() => string`

### AztecAddress

AztecAddress represents a 32-byte address in the Aztec Protocol. It provides methods to create, manipulate, and compare addresses, as well as conversion to and from strings, buffers, and other formats. Addresses are the x coordinate of a point in the Grumpkin curve, and therefore their maximum is determined by the field modulus. An address with a value that is not the x coordinate of a point in the curve is a called an 'invalid address'. These addresses have a greatly reduced feature set, as they cannot own secrets nor have messages encrypted to them, making them quite useless. We need to be able to represent them however as they can be encountered in the wild.

**Constructor**
```typescript
new AztecAddress(buffer: Fr | Buffer)
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
- `static fromBuffer(buffer: Buffer | BufferReader) => AztecAddress`
- `static fromField(fr: Fr) => AztecAddress`
- `static fromFields(fields: Fr[] | FieldReader) => AztecAddress`
- `static fromNumber(value: number) => AztecAddress`
- `static fromPlainObject(obj: any) => AztecAddress` - Creates an AztecAddress from a plain object without Zod validation. This method is optimized for performance and skips validation, making it suitable for deserializing trusted data (e.g., from C++ via MessagePack). Handles buffers, strings, or existing instances.
- `static fromString(buf: string) => AztecAddress`
- `static isAddress(str: string) => boolean`
- `isValid() => Promise<boolean>`
- `isZero() => boolean`
- `static random() => Promise<AztecAddress>`
- `toAddressPoint() => Promise<Point>`
- `toBigInt() => bigint`
- `toBuffer() => any`
- `toField() => Fr`
- `toJSON() => string`
- `toString() => string`
- `static zero() => AztecAddress`

### BaseAccount

An account implementation that uses authwits as an authentication mechanism and can assemble transaction execution requests for an entrypoint.
Implements: `Account`

**Constructor**
```typescript
new BaseAccount(account: AccountInterface)
```

**Properties**
- `account: AccountInterface`

**Methods**
- `createAuthWit(messageHashOrIntent: Fr | Buffer | CallIntent | IntentInnerHash) => Promise<AuthWitness>` - Computes an authentication witness from either a message hash or an intent. If a message hash is provided, it will create a witness for the hash directly. Otherwise, it will compute the message hash using the intent, along with the chain id and the version values provided by the wallet.
- `createTxExecutionRequest(exec: ExecutionPayload, gasSettings: GasSettings, options: DefaultAccountEntrypointOptions) => Promise<TxExecutionRequest>` - Generates an execution request out of set of function calls.
- `getAddress() => AztecAddress` - Returns the address of the account that implements this wallet.
- `getChainId() => Fr` - Returns the chain id for this account
- `getCompleteAddress() => CompleteAddress` - Returns the complete address of the account that implements this wallet.
- `getVersion() => Fr` - Returns the rollup version for this account

### BaseContractInteraction

Base class for an interaction with a contract, be it a deployment, a function call, or a batch. Implements the sequence create/simulate/send.

**Constructor**
```typescript
new BaseContractInteraction(wallet: Wallet, authWitnesses?: AuthWitness[], capsules?: Capsule[])
```

**Properties**
- `authWitnesses: AuthWitness[]`
- `capsules: Capsule[]`
- `log: Logger`
- `wallet: Wallet`

**Methods**
- `request(options?: RequestInteractionOptions) => Promise<ExecutionPayload>` - Returns an execution request that represents this operation. Can be used as a building block for constructing batch requests.
- `send(options: SendInteractionOptions) => SentTx` - Sends a transaction to the contract function with the specified options. This function throws an error if called on a utility function. It creates and signs the transaction if necessary, and returns a SentTx instance, which can be used to track the transaction status, receipt, and events.

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
- `request(options?: RequestInteractionOptions) => Promise<ExecutionPayload>` - Returns an execution request that represents this operation.
- `send(options: SendInteractionOptions) => SentTx` - Sends a transaction to the contract function with the specified options. This function throws an error if called on a utility function. It creates and signs the transaction if necessary, and returns a SentTx instance, which can be used to track the transaction status, receipt, and events.
- `simulate(options: SimulateInteractionOptions) => Promise<any>` - Simulates the batch, supporting private, public and utility functions. Although this is a single interaction with the wallet, private and public functions will be grouped into a single ExecutionPayload that the wallet will simulate as a single transaction. Utility function calls will simply be executed one by one.

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
- `static fromBuffer(buf: Buffer | BufferReader) => Body` - Deserializes a block from a buffer
- `static fromTxBlobData(txBlobData: TxBlobData[]) => Body` - Decodes a block from blob fields.
- `static random(__namedParameters?: { makeTxOptions?: (txIndex: number) => Partial<{ maxEffects?: number; numContractClassLogs?: number; ... }>; txsPerBlock?: number } & Partial<{ maxEffects?: number; numContractClassLogs?: number; ... }>) => Promise<Body>`
- `toBuffer() => any` - Serializes a block body
- `toTxBlobData() => TxBlobData[]` - Returns a flat packed array of fields of all tx effects - used for blobs.

### CallAuthorizationRequest

An authwit request for a function call. Includes the preimage of the data to be signed, as opposed of just the inner hash.

**Constructor**
```typescript
new CallAuthorizationRequest(selector: AuthorizationSelector, innerHash: Fr, msgSender: AztecAddress, functionSelector: FunctionSelector, argsHash: Fr, args: Fr[])
```

**Properties**
- `args: Fr[]`
- `argsHash: Fr`
- `functionSelector: FunctionSelector`
- `innerHash: Fr`
- `msgSender: AztecAddress`
- `selector: AuthorizationSelector`

**Methods**
- `static fromFields(fields: Fr[]) => Promise<CallAuthorizationRequest>`
- `static getSelector() => Promise<AuthorizationSelector>`

### Capsule

Read-only data that is passed to the contract through an oracle during a transaction execution. Check whether this is always used to represent a transient capsule and if so, rename to TransientCapsule.

**Constructor**
```typescript
new Capsule(contractAddress: AztecAddress, storageSlot: Fr, data: Fr[])
```

**Properties**
- `readonly contractAddress: AztecAddress`
- `readonly data: Fr[]`
- `static schema: unknown`
- `readonly storageSlot: Fr`

**Methods**
- `static fromBuffer(buffer: Buffer | BufferReader) => Capsule`
- `static fromString(str: string) => Capsule`
- `toBuffer() => any`
- `toJSON() => string`
- `toString() => string`

### CompleteAddress

A complete address is a combination of an Aztec address, a public key and a partial address.

**Properties**
- `address: AztecAddress`
- `partialAddress: Fr`
- `publicKeys: PublicKeys`
- `static schema: unknown`
- `static readonly SIZE_IN_BYTES: number` - Size in bytes of an instance

**Methods**
- `static create(address: AztecAddress, publicKeys: PublicKeys, partialAddress: Fr) => Promise<CompleteAddress>`
- `equals(other: CompleteAddress) => boolean` - Determines if this CompleteAddress instance is equal to the given CompleteAddress instance. Equality is based on the content of their respective buffers.
- `static fromBuffer(buffer: Buffer | BufferReader) => Promise<CompleteAddress>` - Creates an CompleteAddress instance from a given buffer or BufferReader. If the input is a Buffer, it wraps it in a BufferReader before processing. Throws an error if the input length is not equal to the expected size.
- `static fromSecretKeyAndInstance(secretKey: Fr, instance: Pick<ContractInstance, "deployer" | "originalContractClassId" | "initializationHash" | "salt"> | { originalContractClassId: Fr; saltedInitializationHash: Fr }) => Promise<CompleteAddress>`
- `static fromSecretKeyAndPartialAddress(secretKey: Fr, partialAddress: Fr) => Promise<CompleteAddress>`
- `static fromString(address: string) => Promise<CompleteAddress>` - Create a CompleteAddress instance from a hex-encoded string. The input 'address' should be prefixed with '0x' or not, and have exactly 128 hex characters representing the x and y coordinates. Throws an error if the input length is invalid or coordinate values are out of range.
- `getPreaddress() => Promise<Fr>`
- `static random() => Promise<CompleteAddress>`
- `toBuffer() => Buffer` - Converts the CompleteAddress instance into a Buffer. This method should be used when encoding the address for storage, transmission or serialization purposes.
- `toJSON() => string`
- `toReadableString() => string` - Gets a readable string representation of the complete address.
- `toString() => string` - Convert the CompleteAddress to a hexadecimal string representation, with a "0x" prefix. The resulting string will have a length of 66 characters (including the prefix).
- `validate() => Promise<void>` - Throws if the address is not correctly derived from the public key and partial address.

### Contract

The Contract class represents a contract and provides utility methods for interacting with it. It enables the creation of ContractFunctionInteraction instances for each function in the contract's ABI, allowing users to call or send transactions to these functions. Additionally, the Contract class can be used to attach the contract instance to a deployed contract onchain through the PXE, which facilitates interaction with Aztec's privacy protocol.

Extends: `ContractBase`

**Constructor**
```typescript
new Contract(address: AztecAddress, artifact: ContractArtifact, wallet: Wallet)
```

**Properties**
- `readonly address: AztecAddress`
- `readonly artifact: ContractArtifact`
- `methods: {}` - An object containing contract methods mapped to their respective names.
- `wallet: Wallet`

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
- `readonly address: AztecAddress`
- `readonly artifact: ContractArtifact`
- `methods: {}` - An object containing contract methods mapped to their respective names.
- `wallet: Wallet`

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
new ContractFunctionInteraction(wallet: Wallet, contractAddress: AztecAddress, functionDao: FunctionAbi, args: any[], authWitnesses?: AuthWitness[], capsules?: Capsule[], extraHashedArgs?: HashedValues[])
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
- `request(options?: RequestInteractionOptions) => Promise<ExecutionPayload>` - Returns the execution payload that allows this operation to happen on chain.
- `send(options: SendInteractionOptions) => SentTx` - Sends a transaction to the contract function with the specified options. This function throws an error if called on a utility function. It creates and signs the transaction if necessary, and returns a SentTx instance, which can be used to track the transaction status, receipt, and events.
- `simulate<T extends SimulateInteractionOptions>(options: T) => Promise<SimulationReturn<Exclude<T["fee"], undefined>["estimateGas"]>>` - Simulate a transaction and get information from its execution. Differs from prove in a few important ways: 1. It returns the values of the function execution, plus additional metadata if requested 2. It supports `utility`, `private` and `public` functions
- `with(options: { authWitnesses?: AuthWitness[]; capsules?: Capsule[]; extraHashedArgs?: HashedValues[] }) => ContractFunctionInteraction` - Augments this ContractFunctionInteraction with additional metadata, such as authWitnesses, capsules, and extraHashedArgs. This is useful when creating a "batteries included" interaction, such as registering a contract class with its associated capsule instead of having the user provide them externally.

### DeployAccountMethod

Modified version of the DeployMethod used to deploy account contracts. Supports deploying contracts that can pay for their own fee, plus some preconfigured options to avoid errors.

Extends: `DeployMethod<TContract>`

**Constructor**
```typescript
new DeployAccountMethod(publicKeys: PublicKeys, wallet: Wallet, artifact: ContractArtifact, postDeployCtor: (instance: ContractInstanceWithAddress, wallet: Wallet) => TContract, salt: Fr, args?: any[], constructorNameOrArtifact?: string | FunctionArtifact)
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
- `convertDeployOptionsToRequestOptions(options: DeployOptions) => RequestDeployOptions`
- `getInitializationExecutionPayload(options?: RequestDeployOptions) => Promise<ExecutionPayload>` - Returns the calls necessary to initialize the contract.
- `getInstance(options?: RequestDeployOptions) => Promise<ContractInstanceWithAddress>` - Builds the contract instance and returns it.
- `getPublicationExecutionPayload(options?: RequestDeployOptions) => Promise<ExecutionPayload>` - Returns an execution payload for: - publication of the contract class and - publication of the contract instance to enable public execution depending on the provided options.
- `profile(options: Omit<RequestDeployOptions, "deployer"> & { universalDeploy?: boolean } & Pick<SendInteractionOptions, "fee" | "from"> & Omit<SendInteractionOptions, "fee"> & { fee?: SimulationInteractionFeeOptions; includeMetadata?: boolean; ... } & { profileMode: "gates" | "execution-steps" | "full"; skipProofGeneration?: boolean }) => Promise<TxProfileResult>` - Simulate a deployment and profile the gate count for each function in the transaction.
- `register(options?: RequestDeployOptions) => Promise<TContract>` - Adds this contract to the wallet and returns the Contract object.
- `request(opts?: RequestDeployAccountOptions) => Promise<ExecutionPayload>` - Returns the execution payload that allows this operation to happen on chain.
- `send(options: DeployOptions) => DeploySentTx<TContract>` - Send a contract deployment transaction (initialize and/or publish) using the provided options. This function extends the 'send' method from the ContractFunctionInteraction class, allowing us to send a transaction specifically for contract deployment.
- `simulate(options: SimulateDeployOptions) => Promise<{ estimatedGas: Pick<GasSettings, "gasLimits" | "teardownGasLimits">; offchainEffects: OffchainEffect[]; ... }>` - Simulate the deployment
- `with(options: { authWitnesses?: AuthWitness[]; capsules?: Capsule[] }) => DeployMethod<ContractBase>` - Augments this DeployMethod with additional metadata, such as authWitnesses and capsules.

### DeployMethod

Contract interaction for deployment. Handles class publication, instance publication, and initialization of the contract. Note that for some contracts, a tx is not required as part of its "creation": If there are no public functions, and if there are no initialization functions, then technically the contract has already been "created", and all of the contract's functions (private and utility) can be interacted-with immediately, without any "deployment tx". Extends the BaseContractInteraction class.

Extends: `BaseContractInteraction`

**Constructor**
```typescript
new DeployMethod(publicKeys: PublicKeys, wallet: Wallet, artifact: ContractArtifact, postDeployCtor: (instance: ContractInstanceWithAddress, wallet: Wallet) => TContract, args?: any[], constructorNameOrArtifact?: string | FunctionArtifact, authWitnesses?: AuthWitness[], capsules?: Capsule[])
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
- `convertDeployOptionsToRequestOptions(options: DeployOptions) => RequestDeployOptions`
- `getInitializationExecutionPayload(options?: RequestDeployOptions) => Promise<ExecutionPayload>` - Returns the calls necessary to initialize the contract.
- `getInstance(options?: RequestDeployOptions) => Promise<ContractInstanceWithAddress>` - Builds the contract instance and returns it.
- `getPublicationExecutionPayload(options?: RequestDeployOptions) => Promise<ExecutionPayload>` - Returns an execution payload for: - publication of the contract class and - publication of the contract instance to enable public execution depending on the provided options.
- `profile(options: Omit<RequestDeployOptions, "deployer"> & { universalDeploy?: boolean } & Pick<SendInteractionOptions, "fee" | "from"> & Omit<SendInteractionOptions, "fee"> & { fee?: SimulationInteractionFeeOptions; includeMetadata?: boolean; ... } & { profileMode: "gates" | "execution-steps" | "full"; skipProofGeneration?: boolean }) => Promise<TxProfileResult>` - Simulate a deployment and profile the gate count for each function in the transaction.
- `register(options?: RequestDeployOptions) => Promise<TContract>` - Adds this contract to the wallet and returns the Contract object.
- `request(options?: RequestDeployOptions) => Promise<ExecutionPayload>` - Returns the execution payload that allows this operation to happen on chain.
- `send(options: DeployOptions) => DeploySentTx<TContract>` - Send a contract deployment transaction (initialize and/or publish) using the provided options. This function extends the 'send' method from the ContractFunctionInteraction class, allowing us to send a transaction specifically for contract deployment.
- `simulate(options: SimulateDeployOptions) => Promise<{ estimatedGas: Pick<GasSettings, "gasLimits" | "teardownGasLimits">; offchainEffects: OffchainEffect[]; ... }>` - Simulate the deployment
- `with(options: { authWitnesses?: AuthWitness[]; capsules?: Capsule[] }) => DeployMethod<ContractBase>` - Augments this DeployMethod with additional metadata, such as authWitnesses and capsules.

### DeploySentTx

A contract deployment transaction sent to the network, extending SentTx with methods to publish a contract instance.

Extends: `SentTx`

**Constructor**
```typescript
new DeploySentTx(wallet: Wallet, sendTx: () => Promise<TxHash>, postDeployCtor: (instance: ContractInstanceWithAddress, wallet: Wallet) => TContract, instanceGetter: () => Promise<ContractInstanceWithAddress>)
```

**Properties**
- `sendTxError?: Error`
- `sendTxPromise: Promise<void>`
- `txHash?: TxHash`
- `walletOrNode: AztecNode | Wallet`

**Methods**
- `deployed(opts?: DeployedWaitOpts) => Promise<TContract>` - Awaits for the tx to be mined and returns the contract instance. Throws if tx is not mined.
- `getInstance() => Promise<ContractInstanceWithAddress>` - Returns the contract instance for this deployment.
- `getReceipt() => Promise<TxReceipt>` - Retrieve the transaction receipt associated with the current SentTx instance. The function fetches the transaction hash using 'getTxHash' and then queries the PXE to get the corresponding transaction receipt.
- `getTxHash() => Promise<TxHash>` - Retrieves the transaction hash of the SentTx instance. The function internally awaits for the 'txHashPromise' to resolve, and then returns the resolved transaction hash.
- `wait(opts?: DeployedWaitOpts) => Promise<DeployTxReceipt<TContract>>` - Awaits for the tx to be mined and returns the receipt along with a contract instance. Throws if tx is not mined.
- `waitForReceipt(opts?: WaitOpts) => Promise<TxReceipt>`

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
- `static fromBuffer(buffer: Buffer | BufferReader) => EthAddress` - Deserializes from a buffer or reader, corresponding to a write in cpp.
- `static fromField(fr: Fr) => EthAddress` - Converts a field to a eth address.
- `static fromFields(fields: Fr[] | FieldReader) => EthAddress`
- `static fromNumber(num: number | bigint) => EthAddress` - Converts a number into an address. Useful for testing.
- `static fromPlainObject(obj: any) => EthAddress` - Creates an EthAddress from a plain object without Zod validation. This method is optimized for performance and skips validation, making it suitable for deserializing trusted data (e.g., from C++ via MessagePack). Handles buffers (20 or 32 bytes), strings, or existing instances.
- `static fromString(address: string) => EthAddress` - Creates an EthAddress instance from a valid Ethereum address string. The input 'address' can be either in checksum format or lowercase, and it can be prefixed with '0x'. Throws an error if the input is not a valid Ethereum address.
- `static isAddress(address: string) => boolean` - Determines if the given string represents a valid Ethereum address. A valid address should meet the following criteria: 1. Contains exactly 40 hex characters (excluding an optional '0x' prefix). 2. Is either all lowercase, all uppercase, or has a valid checksum based on EIP-55.
- `isZero() => boolean` - Checks if the EthAddress instance represents a zero address. A zero address consists of 20 bytes filled with zeros and is considered an invalid address.
- `static random() => EthAddress` - Create a random EthAddress instance with 20 random bytes. This method generates a new Ethereum address with a randomly generated set of 20 bytes. It is useful for generating test addresses or unique identifiers.
- `toBuffer() => any` - Returns a 20-byte buffer representation of the Ethereum address.
- `toBuffer32() => any` - Returns a 32-byte buffer representation of the Ethereum address, with the original 20-byte address occupying the last 20 bytes and the first 12 bytes being zero-filled. This format is commonly used in smart contracts when handling addresses as 32-byte values.
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
- `static fromBuffer(buffer: Buffer | BufferReader) => EventSelector` - Deserializes from a buffer or reader, corresponding to a write in cpp.
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
- `authWitnesses: AuthWitness[]`
- `calls: FunctionCall[]`
- `capsules: Capsule[]`
- `extraHashedArgs: HashedValues[]`
- `feePayer?: AztecAddress`

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
- `getGasSettings() => GasSettings` - The gas settings (if any) used to compute the execution payload of the payment method

### Fq

Fq field class.

Extends: `BaseField`

**Constructor**
```typescript
new Fq(value: number | bigint | boolean | Buffer | Fq)
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
- `cmp(rhs: BaseField) => -1 | 0 | 1`
- `equals(rhs: BaseField) => boolean`
- `static fromBuffer(buffer: Buffer | BufferReader) => Fq`
- `static fromBufferReduce(buffer: Buffer) => Fq`
- `static fromHexString(buf: string) => Fq` - Creates a Fq instance from a hex string.
- `static fromHighLow(high: Fr, low: Fr) => Fq`
- `static fromString(buf: string) => Fq` - Creates a Fq instance from a string.
- `isEmpty() => boolean`
- `isZero() => boolean`
- `lt(rhs: BaseField) => boolean`
- `modulus() => bigint`
- `static random() => Fq`
- `sqrt() => Promise<Fq>` - Computes a square root of the field element.
- `toBigInt() => bigint`
- `toBool() => boolean`
- `toBuffer() => Buffer` - We return a copy of the Buffer to ensure this remains immutable.
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
new Fr(value: number | bigint | boolean | Fr | Buffer)
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
- `cmp(rhs: BaseField) => -1 | 0 | 1`
- `div(rhs: Fr) => Fr`
- `ediv(rhs: Fr) => Fr`
- `equals(rhs: BaseField) => boolean`
- `static fromBuffer(buffer: Buffer | BufferReader) => Fr`
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
- `sqrt() => Promise<Fr>` - Computes a square root of the field element.
- `square() => Fr`
- `sub(rhs: Fr) => Fr`
- `toBigInt() => bigint`
- `toBool() => boolean`
- `toBuffer() => Buffer` - We return a copy of the Buffer to ensure this remains immutable.
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
- `args: Fr[]`
- `hideMsgSender: boolean`
- `isStatic: boolean`
- `name: string`
- `returnTypes: AbiType[]`
- `selector: FunctionSelector`
- `to: AztecAddress`
- `type: FunctionType`

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
- `static fromBuffer(buffer: Buffer | BufferReader) => FunctionSelector` - Deserializes from a buffer or reader, corresponding to a write in cpp.
- `static fromField(fr: Fr) => FunctionSelector` - Converts a field to selector.
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
- `blockNumber: BlockNumber`
- `chainId: Fr`
- `coinbase: EthAddress`
- `feeRecipient: AztecAddress`
- `gasFees: GasFees`
- `static schema: unknown`
- `slotNumber: SlotNumber`
- `timestamp: bigint`
- `version: Fr`

**Methods**
- `[custom]() => string`
- `clone() => GlobalVariables`
- `static empty(fields?: Partial<FieldsOf<GlobalVariables>>) => GlobalVariables`
- `equals(other: this) => boolean`
- `static from(fields: FieldsOf<GlobalVariables>) => GlobalVariables`
- `static fromBuffer(buffer: Buffer | BufferReader) => GlobalVariables`
- `static fromFields(fields: Fr[] | FieldReader) => GlobalVariables`
- `static fromPlainObject(obj: any) => GlobalVariables` - Creates a GlobalVariables instance from a plain object without Zod validation. This method is optimized for performance and skips validation, making it suitable for deserializing trusted data (e.g., from C++ via MessagePack).
- `static getFields(fields: FieldsOf<GlobalVariables>) => readonly []`
- `getSize() => number`
- `isEmpty() => boolean`
- `static random(overrides?: Partial<FieldsOf<GlobalVariables>>) => GlobalVariables`
- `toBuffer() => any`
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
- `readonly hash: Fr`
- `static schema: unknown`
- `readonly values: Fr[]`

**Methods**
- `static from(fields: FieldsOf<HashedValues>) => HashedValues`
- `static fromArgs(args: Fr[]) => Promise<HashedValues>`
- `static fromBuffer(buffer: Buffer | BufferReader) => HashedValues`
- `static fromCalldata(calldata: Fr[]) => Promise<HashedValues>`
- `static getFields(fields: FieldsOf<HashedValues>) => readonly []`
- `getSize() => number`
- `static random() => HashedValues`
- `toBuffer() => any`

### L1Actor

The sender of an L1 to L2 message or recipient of an L2 to L1 message.

**Constructor**
```typescript
new L1Actor(sender: EthAddress, chainId: number)
```

**Properties**
- `readonly chainId: number`
- `readonly sender: EthAddress`

**Methods**
- `static empty() => L1Actor`
- `static fromBuffer(buffer: Buffer | BufferReader) => L1Actor`
- `static random() => L1Actor`
- `toBuffer() => Buffer`
- `toFields() => Fr[]`

### L1FeeJuicePortalManager

Helper for interacting with the FeeJuicePortal on L1.

**Constructor**
```typescript
new L1FeeJuicePortalManager(portalAddress: EthAddress, tokenAddress: EthAddress, handlerAddress: EthAddress, extendedClient: ExtendedViemWalletClient, logger: Logger)
```

**Methods**
- `bridgeTokensPublic(to: AztecAddress, amount: bigint, mint?: boolean) => Promise<L2AmountClaim>` - Bridges fee juice from L1 to L2 publicly. Handles L1 ERC20 approvals. Returns once the tx has been mined.
- `getTokenManager() => L1TokenManager` - Returns the associated token manager for the L1 ERC20.
- `static new(node: AztecNode, extendedClient: ExtendedViemWalletClient, logger: Logger) => Promise<L1FeeJuicePortalManager>` - Creates a new instance

### L1ToL2Message

The format of an L1 to L2 Message.

**Constructor**
```typescript
new L1ToL2Message(sender: L1Actor, recipient: L2Actor, content: Fr, secretHash: Fr, index: Fr)
```

**Properties**
- `readonly content: Fr`
- `readonly index: Fr`
- `readonly recipient: L2Actor`
- `readonly secretHash: Fr`
- `readonly sender: L1Actor`

**Methods**
- `static empty() => L1ToL2Message`
- `static fromBuffer(buffer: Buffer | BufferReader) => L1ToL2Message`
- `static fromString(data: string) => L1ToL2Message`
- `hash() => Fr`
- `static random() => Promise<L1ToL2Message>`
- `toBuffer() => Buffer`
- `toFields() => Fr[]` - Returns each element within its own field so that it can be consumed by an acvm oracle call.
- `toString() => string`

### L1ToL2TokenPortalManager

Helper for interacting with a test TokenPortal on L1 for sending tokens to L2.

**Constructor**
```typescript
new L1ToL2TokenPortalManager(portalAddress: EthAddress, tokenAddress: EthAddress, handlerAddress: EthAddress, extendedClient: ExtendedViemWalletClient, logger: Logger)
```

**Properties**
- `extendedClient: ExtendedViemWalletClient`
- `logger: Logger`
- `readonly portal: { abi: readonly []; address: string }`
- `readonly tokenManager: L1TokenManager`

**Methods**
- `bridgeTokensPrivate(to: AztecAddress, amount: bigint, mint?: boolean) => Promise<L2AmountClaimWithRecipient>` - Bridges tokens from L1 to L2 privately. Handles token approvals. Returns once the tx has been mined.
- `bridgeTokensPublic(to: AztecAddress, amount: bigint, mint?: boolean) => Promise<L2AmountClaim>` - Bridges tokens from L1 to L2. Handles token approvals. Returns once the tx has been mined.
- `getTokenManager() => L1TokenManager` - Returns the token manager for the underlying L1 token.

### L1TokenManager

Helper for managing an ERC20 on L1.

**Constructor**
```typescript
new L1TokenManager(tokenAddress: EthAddress, handlerAddress: EthAddress, extendedClient: ExtendedViemWalletClient, logger: Logger)
```

**Properties**
- `readonly handlerAddress: EthAddress`
- `readonly tokenAddress: EthAddress`

**Methods**
- `approve(amount: bigint, address: string, addressName?: string) => Promise<void>` - Approves tokens for the given address. Returns once the tx has been mined.
- `getL1TokenBalance(address: string) => Promise<bigint>` - Returns the balance of the given address.
- `getMintAmount() => Promise<bigint>` - Returns the amount of tokens available to mint via the handler.
- `mint(address: string, addressName?: string) => Promise<void>` - Mints a fixed amount of tokens for the given address. Returns once the tx has been mined.

### L1TokenPortalManager

Helper for interacting with a test TokenPortal on L1 for both withdrawing from and bridging to L2.

Extends: `L1ToL2TokenPortalManager`

**Constructor**
```typescript
new L1TokenPortalManager(portalAddress: EthAddress, tokenAddress: EthAddress, handlerAddress: EthAddress, outboxAddress: EthAddress, extendedClient: ExtendedViemWalletClient, logger: Logger)
```

**Properties**
- `extendedClient: ExtendedViemWalletClient`
- `logger: Logger`
- `readonly portal: { abi: readonly []; address: string }`
- `readonly tokenManager: L1TokenManager`

**Methods**
- `bridgeTokensPrivate(to: AztecAddress, amount: bigint, mint?: boolean) => Promise<L2AmountClaimWithRecipient>` - Bridges tokens from L1 to L2 privately. Handles token approvals. Returns once the tx has been mined.
- `bridgeTokensPublic(to: AztecAddress, amount: bigint, mint?: boolean) => Promise<L2AmountClaim>` - Bridges tokens from L1 to L2. Handles token approvals. Returns once the tx has been mined.
- `getL2ToL1MessageLeaf(amount: bigint, recipient: EthAddress, l2Bridge: AztecAddress, callerOnL1?: EthAddress) => Promise<Fr>` - Computes the L2 to L1 message leaf for the given parameters.
- `getTokenManager() => L1TokenManager` - Returns the token manager for the underlying L1 token.
- `withdrawFunds(amount: bigint, recipient: EthAddress, blockNumber: bigint, messageIndex: bigint, siblingPath: SiblingPath<number>) => Promise<void>` - Withdraws funds from the portal by consuming an L2 to L1 message. Returns once the tx is mined on L1.

### L2Actor

The recipient of an L2 message.

**Constructor**
```typescript
new L2Actor(recipient: AztecAddress, version: number)
```

**Properties**
- `readonly recipient: AztecAddress`
- `readonly version: number`

**Methods**
- `static empty() => L2Actor`
- `static fromBuffer(buffer: Buffer | BufferReader) => L2Actor`
- `static random() => Promise<L2Actor>`
- `toBuffer() => Buffer`
- `toFields() => Fr[]`

### L2Block

The data that makes up the rollup proof, with encoder decoder functions.

**Constructor**
```typescript
new L2Block(archive: AppendOnlyTreeSnapshot, header: L2BlockHeader, body: Body, blockHash?: Fr)
```

**Properties**
- `archive: AppendOnlyTreeSnapshot`
- `body: Body`
- `header: L2BlockHeader`
- `number: unknown`
- `static schema: unknown`
- `slot: unknown`
- `timestamp: unknown`

**Methods**
- `static empty() => L2Block` - Creates an L2 block containing empty data.
- `equals(other: L2Block) => boolean`
- `static fromBuffer(buf: Buffer | BufferReader) => L2Block` - Deserializes a block from a buffer
- `static fromCheckpoint(checkpoint: Checkpoint) => L2Block`
- `static fromString(str: string) => L2Block` - Deserializes L2 block from a buffer.
- `getBlockHeader() => BlockHeader`
- `getCheckpointBlobFields() => Fr[]`
- `getCheckpointHeader() => CheckpointHeader`
- `getStats() => { blockNumber: BlockNumber; blockTimestamp: number; ... }` - Returns stats used for logging.
- `hash() => Promise<Fr>` - Returns the block's hash (hash of block header).
- `static random(l2BlockNum: BlockNumber, txsPerBlock?: number, numPublicCallsPerTx?: number, numPublicLogsPerCall?: number, inHash?: Fr, slotNumber?: number, maxEffects?: number) => Promise<L2Block>` - Creates an L2 block containing random data.
- `toBlobFields() => Fr[]`
- `toBlockBlobData() => BlockBlobData`
- `toBlockInfo() => L2BlockInfo`
- `toBuffer() => any` - Serializes a block
- `toCheckpoint() => Checkpoint`
- `toL2Block() => L2BlockNew`
- `toString() => string` - Serializes a block to a string.

### LogId

A globally unique log id.

**Constructor**
```typescript
new LogId(blockNumber: BlockNumber, txIndex: number, logIndex: number)
```

**Properties**
- `readonly blockNumber: BlockNumber`
- `readonly logIndex: number`
- `static schema: unknown`
- `readonly txIndex: number`

**Methods**
- `static fromBuffer(buffer: Buffer | BufferReader) => LogId` - Creates a LogId from a buffer.
- `static fromString(data: string) => LogId` - Creates a LogId from a string.
- `static random() => LogId`
- `toBuffer() => Buffer` - Serializes log id to a buffer.
- `toHumanReadable() => string` - Serializes log id to a human readable string.
- `toString() => string` - Converts the LogId instance to a string.

### Note

The Note class represents a Note emitted from a Noir contract as a vector of Fr (finite field) elements. This data also represents a preimage to a note hash.

Extends: `Vector<Fr>`

**Constructor**
```typescript
new Note(items: Fr[])
```

**Properties**
- `items: Fr[]`
- `length: unknown`
- `static schema: unknown`

**Methods**
- `equals(other: Note) => boolean`
- `static fromBuffer(buffer: Buffer | BufferReader) => Note` - Create a Note instance from a Buffer or BufferReader. The input 'buffer' can be either a Buffer containing the serialized Fr elements or a BufferReader instance. This function reads the Fr elements in the buffer and constructs a Note with them.
- `static fromString(str: string) => Note` - Creates a new Note instance from a hex string.
- `static random() => Note` - Generates a random Note instance with a variable number of items. The number of items is determined by a random value between 1 and 10 (inclusive). Each item in the Note is generated using the Fr.random() method.
- `toBuffer() => any`
- `toFriendlyJSON() => Fr[]`
- `toJSON() => any`
- `toString() => string` - Returns a hex representation of the note.

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
- `static fromBuffer(buffer: Buffer | BufferReader) => NoteSelector` - Deserializes from a buffer or reader, corresponding to a write in cpp.
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
- `readonly isInfinite: boolean`
- `readonly kind: string` - Used to differentiate this class from AztecAddress
- `static schema: unknown`
- `static SIZE_IN_BYTES: number`
- `readonly x: Fr`
- `readonly y: Fr`
- `static ZERO: Point`

**Methods**
- `equals(rhs: Point) => boolean` - Check if two Point instances are equal by comparing their buffer values. Returns true if the buffer values are the same, and false otherwise.
- `static fromBuffer(buffer: Buffer | BufferReader) => Point` - Create a Point instance from a given buffer or BufferReader. The input 'buffer' should have exactly 64 bytes representing the x and y coordinates.
- `static fromCompressedBuffer(buffer: Buffer | BufferReader) => Promise<Point>` - Create a Point instance from a compressed buffer. The input 'buffer' should have exactly 33 bytes representing the x coordinate and the sign of the y coordinate.
- `static fromFields(fields: Fr[] | FieldReader) => Point`
- `static fromPlainObject(obj: any) => Point` - Creates a Point from a plain object without Zod validation. This method is optimized for performance and skips validation, making it suitable for deserializing trusted data (e.g., from C++ via MessagePack). Handles buffers, existing instances, or objects with x, y, and isInfinite fields.
- `static fromString(str: string) => Point` - Create a Point instance from a hex-encoded string. The input should be prefixed with '0x' or not, and have exactly 128 hex characters representing the x and y coordinates. Throws an error if the input length is invalid or coordinate values are out of range.
- `static fromXAndSign(x: Fr, sign: boolean) => Promise<Point>` - Uses the x coordinate and isPositive flag (+/-) to reconstruct the point.
- `hash() => Promise<Fr>`
- `isOnGrumpkin() => boolean`
- `isZero() => boolean`
- `static random() => Promise<Point>` - Generate a random Point instance.
- `toBigInts() => { isInfinite: bigint; x: bigint; y: bigint }` - Returns the contents of the point as BigInts.
- `toBuffer() => any` - Converts the Point instance to a Buffer representation of the coordinates.
- `toCompressedBuffer() => any` - Converts the Point instance to a compressed Buffer representation of the coordinates.
- `toFields() => Fr[]` - Returns the contents of the point as an array of 2 fields.
- `toJSON() => string`
- `toNoirStruct() => { is_infinite: boolean; x: Fr; y: Fr }`
- `toShortString() => string` - Generate a short string representation of the Point instance. The returned string includes the first 10 and last 4 characters of the full string representation, with '...' in between to indicate truncation. This is useful for displaying or logging purposes when the full string representation may be too long.
- `toString() => string` - Convert the Point instance to a hexadecimal string representation. The output string is prefixed with '0x' and consists of exactly 128 hex characters, representing the concatenated x and y coordinates of the point.
- `toWrappedNoirStruct() => { inner: { is_infinite: boolean; x: Fr; y: Fr } }`
- `toXAndSign() => []` - Returns the x coordinate and the sign of the y coordinate.
- `static YFromX(x: Fr) => Promise<Fr>`

### PrivateFeePaymentMethod

Holds information about how the fee for a transaction is to be paid.
Implements: `FeePaymentMethod`

**Constructor**
```typescript
new PrivateFeePaymentMethod(paymentContract: AztecAddress, sender: AztecAddress, wallet: Wallet, gasSettings: GasSettings, setMaxFeeToOne?: boolean)
```

**Properties**
- `gasSettings: GasSettings` - Gas settings used to compute the maximum fee the user is willing to pay

**Methods**
- `getAsset() => Promise<AztecAddress>` - The asset used to pay the fee.
- `getExecutionPayload() => Promise<ExecutionPayload>` - Creates an execution payload to pay the fee using a private function through an FPC in the desired asset
- `getFeePayer() => Promise<AztecAddress>` - The expected fee payer for this tx.
- `getGasSettings() => GasSettings` - The gas settings (if any) used to compute the execution payload of the payment method

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
- `getGasSettings() => GasSettings` - The gas settings (if any) used to compute the execution payload of the payment method

### PublicKeys

**Constructor**
```typescript
new PublicKeys(masterNullifierPublicKey: Point, masterIncomingViewingPublicKey: Point, masterOutgoingViewingPublicKey: Point, masterTaggingPublicKey: Point)
```

**Properties**
- `masterIncomingViewingPublicKey: Point`
- `masterNullifierPublicKey: Point`
- `masterOutgoingViewingPublicKey: Point`
- `masterTaggingPublicKey: Point`
- `static schema: unknown`

**Methods**
- `static default() => PublicKeys`
- `encodeToNoir() => Fr[]`
- `equals(other: PublicKeys) => boolean` - Determines if this PublicKeys instance is equal to the given PublicKeys instance. Equality is based on the content of their respective buffers.
- `static from(fields: FieldsOf<PublicKeys>) => PublicKeys`
- `static fromBuffer(buffer: Buffer | BufferReader) => PublicKeys` - Creates an PublicKeys instance from a given buffer or BufferReader. If the input is a Buffer, it wraps it in a BufferReader before processing. Throws an error if the input length is not equal to the expected size.
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

### SentTx

The SentTx class represents a sent transaction through the PXE (or directly to a node) providing methods to fetch its hash, receipt, and mining status.

**Constructor**
```typescript
new SentTx(walletOrNode: AztecNode | Wallet, sendTx: () => Promise<TxHash>)
```

**Properties**
- `sendTxError?: Error`
- `sendTxPromise: Promise<void>`
- `txHash?: TxHash`
- `walletOrNode: AztecNode | Wallet`

**Methods**
- `getReceipt() => Promise<TxReceipt>` - Retrieve the transaction receipt associated with the current SentTx instance. The function fetches the transaction hash using 'getTxHash' and then queries the PXE to get the corresponding transaction receipt.
- `getTxHash() => Promise<TxHash>` - Retrieves the transaction hash of the SentTx instance. The function internally awaits for the 'txHashPromise' to resolve, and then returns the resolved transaction hash.
- `wait(opts?: WaitOpts) => Promise<TxReceipt>` - Awaits for a tx to be mined and returns the receipt. Throws if tx is not mined.
- `waitForReceipt(opts?: WaitOpts) => Promise<TxReceipt>`

### SetPublicAuthwitContractInteraction

Convenience class designed to wrap the very common interaction of setting a public authwit in the AuthRegistry contract

Extends: `ContractFunctionInteraction`

**Properties**
- `args: any[]`
- `authWitnesses: AuthWitness[]`
- `capsules: Capsule[]`
- `contractAddress: AztecAddress`
- `functionDao: FunctionAbi`
- `log: Logger`
- `wallet: Wallet`

**Methods**
- `static create(wallet: Wallet, from: AztecAddress, messageHashOrIntent: Fr | CallIntent | IntentInnerHash | ContractFunctionInteractionCallIntent, authorized: boolean) => Promise<SetPublicAuthwitContractInteraction>`
- `getFunctionCall() => Promise<{ args: Fr[]; hideMsgSender: boolean; ... }>` - Returns the encoded function call wrapped by this interaction Useful when generating authwits
- `profile(options?: Omit<ProfileInteractionOptions, "from">) => Promise<TxProfileResult>` - Overrides the profile method, adding the sender of the authwit (authorizer) as from and preventing misuse
- `request(options?: RequestInteractionOptions) => Promise<ExecutionPayload>` - Returns the execution payload that allows this operation to happen on chain.
- `send(options?: Omit<SendInteractionOptions, "from">) => SentTx` - Overrides the send method, adding the sender of the authwit (authorizer) as from and preventing misuse
- `simulate<T extends SimulateInteractionOptions>(options: Omit<T, "from">) => Promise<SimulationReturn<T["includeMetadata"]>>` - Overrides the simulate method, adding the sender of the authwit (authorizer) as from and preventing misuse
- `with(options: { authWitnesses?: AuthWitness[]; capsules?: Capsule[]; extraHashedArgs?: HashedValues[] }) => ContractFunctionInteraction` - Augments this ContractFunctionInteraction with additional metadata, such as authWitnesses, capsules, and extraHashedArgs. This is useful when creating a "batteries included" interaction, such as registering a contract class with its associated capsule instead of having the user provide them externally.

### SiblingPath

Contains functionality to compute and serialize/deserialize a sibling path. E.g. Sibling path for a leaf at index 3 in a tree of depth 3 consists of: d0: [ root ] d1: [ ] [*] d2: [*] [ ] [ ] [ ] d3: [ ] [ ] [*] [ ] [ ] [ ] [ ] [ ]. And the elements would be ordered as: [ leaf_at_index_2, node_at_level_2_index_0, node_at_level_1_index_1 ].

**Constructor**
```typescript
new SiblingPath(pathSize: N, path: Buffer[])
```

**Properties**
- `pathSize: N`
- `static schema: unknown`

**Methods**
- `static deserialize<N extends number>(buf: Buffer, offset?: number) => { adv: number; elem: SiblingPath<N> }` - Deserializes a SiblingPath object from a slice of a part of a buffer and returns the amount of bytes advanced.
- `static fromBuffer<N extends number>(buf: Buffer, offset?: number) => SiblingPath<N>` - Deserializes a SiblingPath from a buffer.
- `static fromString<N extends number>(repr: string) => SiblingPath<N>` - Deserializes a SiblingPath object from a hex string representation.
- `getSubtreeSiblingPath<SubtreeHeight extends number, SubtreeSiblingPathHeight extends number>(subtreeHeight: SubtreeHeight) => SiblingPath<SubtreeSiblingPathHeight>` - Generate a subtree path from the current sibling path.
- `static random<N extends number>(number: N) => SiblingPath<N>`
- `static schemaFor<N extends number>(size: N) => ZodEffects<ZodEffects<ZodFor<any>, SiblingPath<N>, any>, SiblingPath<N>, any>`
- `toBuffer() => Buffer` - Serializes this SiblingPath object to a buffer.
- `toBufferArray() => Buffer[]` - Returns the path buffer underlying the sibling path.
- `toFields() => Fr[]` - Convert the Sibling Path object into an array of field elements.
- `toJSON() => any`
- `toString() => string` - Serializes this SiblingPath object to a hex string representation.
- `toTuple() => Tuple<Fr, N>` - Convert Sibling Path object into a tuple of field elements.
- `static ZERO<N extends number>(size: N, zeroElement: Buffer, hasher: Hasher) => SiblingPath<N>` - Returns sibling path hashed up from the a element.

### SignerlessAccount

Account implementation which creates a transaction using the multicall protocol contract as entrypoint.
Implements: `Account`

**Constructor**
```typescript
new SignerlessAccount(chainInfo: ChainInfo)
```

**Methods**
- `createAuthWit(_intent: Fr | Buffer | CallIntent | IntentInnerHash) => Promise<AuthWitness>` - Computes an authentication witness from either a message hash
- `createTxExecutionRequest(exec: ExecutionPayload, gasSettings: GasSettings) => Promise<TxExecutionRequest>` - Generates an execution request out of set of function calls.
- `getAddress() => AztecAddress` - Returns the address for this account.
- `getChainId() => Fr` - Returns the chain id for this account
- `getCompleteAddress() => CompleteAddress` - Returns the complete address for this account.
- `getVersion() => Fr` - Returns the rollup version for this account

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
- `getGasSettings() => GasSettings` - The gas settings (if any) used to compute the execution payload of the payment method

### Tx

The interface of an L2 transaction.

Extends: `Gossipable`

**Constructor**
```typescript
new Tx(txHash: TxHash, data: PrivateKernelTailCircuitPublicInputs, chonkProof: ChonkProof, contractClassLogFields: ContractClassLogFields[], publicFunctionCalldata: HashedValues[])
```

**Properties**
- `readonly chonkProof: ChonkProof`
- `readonly contractClassLogFields: ContractClassLogFields[]`
- `readonly data: PrivateKernelTailCircuitPublicInputs`
- `static p2pTopic: TopicType` - The p2p topic identifier, this determines how the message is handled
- `readonly publicFunctionCalldata: HashedValues[]`
- `static schema: unknown`
- `readonly txHash: TxHash`

**Methods**
- `static clone(tx: Tx, cloneProof?: boolean) => Tx` - Clones a tx, making a deep copy of all fields.
- `static computeTxHash(fields: Pick<FieldsOf<Tx>, "data">) => Promise<TxHash>`
- `static create(fields: Omit<FieldsOf<Tx>, "txHash">) => Promise<Tx>`
- `static from(fields: FieldsOf<Tx>) => Tx`
- `static fromBuffer(buffer: Buffer | BufferReader) => Tx` - Deserializes the Tx object from a Buffer.
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
- `getTeardownPublicCallRequestWithCalldata() => PublicCallRequestWithCalldata`
- `getTotalPublicCalldataCount() => number`
- `getTxHash() => TxHash` - Return transaction hash.
- `hasPublicCalls() => boolean`
- `numberOfPublicCalls() => number`
- `p2pMessageLoggingIdentifier() => Promise<Buffer32>` - A digest of the message information **used for logging only**. The identifier used for deduplication is `getMsgIdFn` as defined in `encoding.ts` which is a hash over topic and data.
- `static random(args?: { randomProof?: boolean; txHash?: string | TxHash }) => Tx` - Creates a random tx.
- `recomputeHash() => Promise<TxHash>` - Recomputes the tx hash. Used for testing purposes only when a property of the tx was mutated.
- `toBuffer() => any` - Serializes the Tx object into a Buffer.
- `toMessage() => Buffer`
- `validateTxHash() => Promise<boolean>` - Validates that the tx hash matches the computed hash from the tx data. This should be called when deserializing a tx from an untrusted source.

### TxExecutionRequest

Request to execute a transaction. Similar to TxRequest, but has the full args.

**Constructor**
```typescript
new TxExecutionRequest(origin: AztecAddress, functionSelector: FunctionSelector, firstCallArgsHash: Fr, txContext: TxContext, argsOfCalls: HashedValues[], authWitnesses: AuthWitness[], capsules: Capsule[], salt?: Fr)
```

**Properties**
- `argsOfCalls: HashedValues[]`
- `authWitnesses: AuthWitness[]`
- `capsules: Capsule[]`
- `firstCallArgsHash: Fr`
- `functionSelector: FunctionSelector`
- `origin: AztecAddress`
- `salt: Fr`
- `static schema: unknown`
- `txContext: TxContext`

**Methods**
- `[custom]() => string`
- `static from(fields: FieldsOf<TxExecutionRequest>) => TxExecutionRequest`
- `static fromBuffer(buffer: Buffer | BufferReader) => TxExecutionRequest` - Deserializes from a buffer or reader, corresponding to a write in cpp.
- `static fromString(str: string) => TxExecutionRequest` - Deserializes from a string, corresponding to a write in cpp.
- `static getFields(fields: FieldsOf<TxExecutionRequest>) => readonly []`
- `static random() => Promise<TxExecutionRequest>`
- `toBuffer() => any` - Serialize as a buffer.
- `toString() => string` - Serialize as a string.
- `toTxRequest() => TxRequest`

### TxHash

A class representing hash of Aztec transaction.

**Constructor**
```typescript
new TxHash(hash: Fr)
```

**Properties**
- `readonly hash: Fr`
- `static schema: unknown`
- `static SIZE: unknown`

**Methods**
- `equals(other: TxHash) => boolean`
- `static fromBigInt(value: bigint) => TxHash`
- `static fromBuffer(buffer: Uint8Array | BufferReader) => TxHash`
- `static fromField(value: Fr) => TxHash`
- `static fromString(str: string) => TxHash`
- `static random() => TxHash`
- `toBigInt() => bigint`
- `toBuffer() => any`
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
new TxReceipt(txHash: TxHash, status: TxStatus, error: string, transactionFee?: bigint, blockHash?: L2BlockHash, blockNumber?: BlockNumber)
```

**Properties**
- `blockHash?: L2BlockHash`
- `blockNumber?: BlockNumber`
- `error: string`
- `static schema: unknown`
- `status: TxStatus`
- `transactionFee?: bigint`
- `txHash: TxHash`

**Methods**
- `static empty() => TxReceipt`
- `static from(fields: FieldsOf<TxReceipt>) => TxReceipt`
- `static statusFromRevertCode(revertCode: RevertCode) => SUCCESS | APP_LOGIC_REVERTED | TEARDOWN_REVERTED | BOTH_REVERTED`

### UnsafeContract

Unsafe constructor for ContractBase that bypasses the check that the instance is registered in the wallet.

Extends: `ContractBase`

**Constructor**
```typescript
new UnsafeContract(instance: ContractInstanceWithAddress, artifact: ContractArtifact, wallet: Wallet)
```

**Properties**
- `readonly address: AztecAddress`
- `readonly artifact: ContractArtifact`
- `methods: {}` - An object containing contract methods mapped to their respective names.
- `wallet: Wallet`

**Methods**
- `withWallet(wallet: Wallet) => this` - Creates a new instance of the contract wrapper attached to a different wallet.

## Interfaces

### AccountContract

An account contract instance. Knows its artifact, deployment arguments, how to create transaction execution requests out of function calls, and how to authorize actions.

**Methods**
- `getAuthWitnessProvider(address: CompleteAddress) => AuthWitnessProvider` - Returns the auth witness provider for the given address.
- `getContractArtifact() => Promise<ContractArtifact>` - Returns the artifact of this account contract.
- `getInitializationFunctionAndArgs() => Promise<{ constructorArgs: any[]; constructorName: string }>` - Returns the initializer function name and arguments for this instance, or undefined if this contract does not require initialization.
- `getInterface(address: CompleteAddress, chainInfo: ChainInfo) => AccountInterface` - Returns the account interface for this account contract given an instance at the provided address. The account interface is responsible for assembling tx requests given requested function calls, and for creating signed auth witnesses given action identifiers (message hashes).

### AccountInterface

Handler for interfacing with an account. Knows how to create transaction execution requests and authorize actions for its corresponding account.

Extends: `EntrypointInterface`, `AuthWitnessProvider`

**Methods**
- `createAuthWit(messageHash: Fr | Buffer) => Promise<AuthWitness>` - Computes an authentication witness from either a message hash
- `createTxExecutionRequest(exec: ExecutionPayload, gasSettings: GasSettings, options?: any) => Promise<TxExecutionRequest>` - Generates an execution request out of set of function calls.
- `getAddress() => AztecAddress` - Returns the address for this account.
- `getChainId() => Fr` - Returns the chain id for this account
- `getCompleteAddress() => CompleteAddress` - Returns the complete address for this account.
- `getVersion() => Fr` - Returns the rollup version for this account

### AuthWitnessProvider

Creates authorization witnesses.

**Methods**
- `createAuthWit(messageHash: Fr | Buffer) => Promise<AuthWitness>` - Computes an authentication witness from either a message hash

### AztecNode

The aztec node. We will probably implement the additional interfaces by means other than Aztec Node as it's currently a privacy leak

Extends: `Pick<L2BlockSource, "getBlocks" | "getPublishedBlocks" | "getBlockHeader" | "getL2Tips">`

**Methods**
- `findLeavesIndexes(blockNumber: BlockNumber | "latest", treeId: MerkleTreeId, leafValues: Fr[]) => Promise<DataInBlock<bigint>[]>` - Find the indexes of the given leaves in the given tree along with a block metadata pointing to the block in which the leaves were inserted.
- `getAllowedPublicSetup() => Promise<AllowedElement[]>` - Returns the list of allowed public setup elements configured for this node.
- `getArchiveMembershipWitness(blockNumber: BlockNumber | "latest", archive: Fr) => Promise<MembershipWitness<30>>` - Returns a membership witness for a given archive leaf at a given block.
- `getArchiveSiblingPath(blockNumber: BlockNumber | "latest", leafIndex: bigint) => Promise<SiblingPath<30>>` - Returns a sibling path for a leaf in the committed historic blocks tree.
- `getBlock(number: BlockNumber | "latest") => Promise<L2Block>` - Get a block specified by its number.
- `getBlockByArchive(archive: Fr) => Promise<L2Block>` - Get a block specified by its archive root.
- `getBlockByHash(blockHash: Fr) => Promise<L2Block>` - Get a block specified by its hash.
- `getBlockHeader(blockNumber?: BlockNumber | "latest") => Promise<BlockHeader>` - Returns the currently committed block header.
- `getBlockHeaderByArchive(archive: Fr) => Promise<BlockHeader>` - Get a block header specified by its archive root.
- `getBlockHeaderByHash(blockHash: Fr) => Promise<BlockHeader>` - Get a block header specified by its hash.
- `getBlockNumber() => Promise<BlockNumber>` - Method to fetch the latest block number synchronized by the node.
- `getBlocks(from: BlockNumber, limit: number) => Promise<L2Block[]>` - Method to request blocks. Will attempt to return all requested blocks but will return only those available.
- `getChainId() => Promise<number>` - Method to fetch the chain id of the base-layer for the rollup.
- `getContract(address: AztecAddress) => Promise<ContractInstanceWithAddress>` - Returns a publicly deployed contract instance given its address.
- `getContractClass(id: Fr) => Promise<ContractClassPublic>` - Returns a registered contract class given its id.
- `getContractClassLogs(filter: LogFilter) => Promise<GetContractClassLogsResponse>` - Gets contract class logs based on the provided filter.
- `getCurrentBaseFees() => Promise<GasFees>` - Method to fetch the current base fees.
- `getEncodedEnr() => Promise<string>` - Returns the ENR of this node for peer discovery, if available.
- `getL1ContractAddresses() => Promise<L1ContractAddresses>` - Method to fetch the currently deployed l1 contract addresses.
- `getL1ToL2MessageBlock(l1ToL2Message: Fr) => Promise<BlockNumber>` - Returns the L2 block number in which this L1 to L2 message becomes available, or undefined if not found.
- `getL1ToL2MessageMembershipWitness(blockNumber: BlockNumber | "latest", l1ToL2Message: Fr) => Promise<[]>` - Returns the index and a sibling path for a leaf in the committed l1 to l2 data tree.
- `getL2Tips() => Promise<L2Tips>` - Returns the tips of the L2 chain.
- `getL2ToL1Messages(blockNumber: BlockNumber | "latest") => Promise<Fr[][]>` - Returns all the L2 to L1 messages in a block.
- `getLogsByTags(tags: Fr[], logsPerTag?: number) => Promise<TxScopedL2Log[][]>` - Gets all logs that match any of the received tags (i.e. logs with their first field equal to a tag).
- `getLowNullifierMembershipWitness(blockNumber: BlockNumber | "latest", nullifier: Fr) => Promise<NullifierMembershipWitness>` - Returns a low nullifier membership witness for a given nullifier at a given block.
- `getMaxPriorityFees() => Promise<GasFees>` - Method to fetch the current max priority fee of txs in the mempool.
- `getNodeInfo() => Promise<NodeInfo>` - Returns the information about the server's node. Includes current Node version, compatible Noir version, L1 chain identifier, protocol version, and L1 address of the rollup contract.
- `getNodeVersion() => Promise<string>` - Method to fetch the version of the package.
- `getNoteHashMembershipWitness(blockNumber: BlockNumber | "latest", noteHash: Fr) => Promise<MembershipWitness<42>>` - Returns a membership witness for a given note hash at a given block.
- `getNoteHashSiblingPath(blockNumber: BlockNumber | "latest", leafIndex: bigint) => Promise<SiblingPath<42>>` - Returns a sibling path for the given index in the note hash tree.
- `getNullifierMembershipWitness(blockNumber: BlockNumber | "latest", nullifier: Fr) => Promise<NullifierMembershipWitness>` - Returns a nullifier membership witness for a given nullifier at a given block.
- `getNullifierSiblingPath(blockNumber: BlockNumber | "latest", leafIndex: bigint) => Promise<SiblingPath<42>>` - Returns a sibling path for the given index in the nullifier tree.
- `getPendingTxCount() => Promise<number>` - Retrieves the number of pending txs
- `getPendingTxs(limit?: number, after?: TxHash) => Promise<Tx[]>` - Method to retrieve pending txs.
- `getProtocolContractAddresses() => Promise<ProtocolContractAddresses>` - Method to fetch the protocol contract addresses.
- `getProvenBlockNumber() => Promise<BlockNumber>` - Fetches the latest proven block number.
- `getPublicDataSiblingPath(blockNumber: BlockNumber | "latest", leafIndex: bigint) => Promise<SiblingPath<40>>` - Returns a sibling path for a leaf in the committed public data tree.
- `getPublicDataWitness(blockNumber: BlockNumber | "latest", leafSlot: Fr) => Promise<PublicDataWitness>` - Returns a public data tree witness for a given leaf slot at a given block.
- `getPublicLogs(filter: LogFilter) => Promise<GetPublicLogsResponse>` - Gets public logs based on the provided filter.
- `getPublicStorageAt(blockNumber: BlockNumber | "latest", contract: AztecAddress, slot: Fr) => Promise<Fr>` - Gets the storage value at the given contract storage slot.
- `getPublishedBlocks(from: BlockNumber, limit: number, proven?: boolean) => Promise<PublishedL2Block[]>` - Equivalent to getBlocks but includes publish data.
- `getTxByHash(txHash: TxHash) => Promise<Tx>` - Method to retrieve a single pending tx.
- `getTxEffect(txHash: TxHash) => Promise<IndexedTxEffect>` - Gets a tx effect.
- `getTxReceipt(txHash: TxHash) => Promise<TxReceipt>` - Fetches a transaction receipt for a given transaction hash. Returns a mined receipt if it was added to the chain, a pending receipt if it's still in the mempool of the connected Aztec node, or a dropped receipt if not found in the connected Aztec node.
- `getTxsByHash(txHashes: TxHash[]) => Promise<Tx[]>` - Method to retrieve multiple pending txs.
- `getValidatorsStats() => Promise<ValidatorsStats>` - Returns stats for validators if enabled.
- `getValidatorStats(validatorAddress: EthAddress, fromSlot?: SlotNumber, toSlot?: SlotNumber) => Promise<SingleValidatorStats>` - Returns stats for a single validator if enabled.
- `getVersion() => Promise<number>` - Method to fetch the version of the rollup the node is connected to.
- `getWorldStateSyncStatus() => Promise<WorldStateSyncStatus>` - Returns the sync status of the node's world state
- `isL1ToL2MessageSynced(l1ToL2Message: Fr) => Promise<boolean>` - Returns whether an L1 to L2 message is synced by archiver.
- `isReady() => Promise<boolean>` - Method to determine if the node is ready to accept transactions.
- `isValidTx(tx: Tx, options?: { isSimulation?: boolean; skipFeeEnforcement?: boolean }) => Promise<TxValidationResult>` - Returns true if the transaction is valid for inclusion at the current state. Valid transactions can be made invalid by *other* transactions if e.g. they emit the same nullifiers, or come become invalid due to e.g. the include_by_timestamp property.
- `registerContractFunctionSignatures(functionSignatures: string[]) => Promise<void>` - Registers contract function signatures for debugging purposes.
- `sendTx(tx: Tx) => Promise<void>` - Method to submit a transaction to the p2p pool.
- `simulatePublicCalls(tx: Tx, skipFeeEnforcement?: boolean) => Promise<PublicSimulationOutput>` - Simulates the public part of a transaction with the current state. This currently just checks that the transaction execution succeeds.

### ContractArtifact

Defines artifact of a contract.

**Properties**
- `fileMap: DebugFileMap` - The map of file ID to the source code and path of the file.
- `functions: FunctionArtifact[]` - The functions of the contract. Includes private and utility functions, plus the public dispatch function.
- `name: string` - The name of the contract.
- `nonDispatchPublicFunctions: FunctionAbi[]` - The public functions of the contract, excluding dispatch.
- `outputs: { globals: Record<string, AbiValue[]>; structs: Record<string, AbiType[]> }` - The outputs of the contract.
- `storageLayout: Record<string, FieldLayout>` - Storage layout

### FeePaymentMethod

Holds information about how the fee for a transaction is to be paid.

**Methods**
- `getAsset() => Promise<AztecAddress>` - The asset used to pay the fee.
- `getExecutionPayload() => Promise<ExecutionPayload>` - Returns the data to be added to the final execution request to pay the fee in the given asset
- `getFeePayer() => Promise<AztecAddress>` - The expected fee payer for this tx.
- `getGasSettings() => GasSettings` - The gas settings (if any) used to compute the execution payload of the payment method

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

### NodeInfo

Provides basic information about the running node.

**Properties**
- `enr: string` - The node's ENR.
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

## Functions

### abiChecker
```typescript
function abiChecker(artifact: ContractArtifact) => boolean
```
Validates the given ContractArtifact object by checking its functions and their parameters. Ensures that the ABI has at least one function, a constructor, valid bytecode, and correct parameter types. Throws an error if any inconsistency is detected during the validation process.

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

### computeAppNullifierSecretKey
```typescript
function computeAppNullifierSecretKey(masterNullifierSecretKey: Fq, app: AztecAddress) => Promise<Fr>
```

### computeAuthWitMessageHash
```typescript
function computeAuthWitMessageHash(intent: CallIntent | IntentInnerHash | ContractFunctionInteractionCallIntent, metadata: ChainInfo) => Promise<Fr>
```

### computeInnerAuthWitHash
```typescript
function computeInnerAuthWitHash(args: Fr[]) => Promise<Fr>
```

### computeInnerAuthWitHashFromAction
```typescript
function computeInnerAuthWitHashFromAction(caller: AztecAddress, action: ContractFunctionInteraction | FunctionCall) => Promise<Fr>
```

### computeSecretHash
```typescript
function computeSecretHash(secret: Fr) => Promise<Fr>
```
Computes a hash of a secret.

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

### createAztecNodeClient
```typescript
function createAztecNodeClient(url: string, versions?: Partial<ComponentsVersions>, fetch?: (host: string, body: unknown, extraHeaders?: Record<string, string>, noRetry?: boolean) => Promise<{ headers: { get: (header: string) => string | null | undefined }; response: any }>, batchWindowMS?: number) => AztecNode
```

### createLogger
```typescript
function createLogger(module: string) => Logger
```

### decodeFromAbi
```typescript
function decodeFromAbi(typ: AbiType[], buffer: Fr[]) => AbiDecoded
```
Decodes values in a flattened Field array using a provided ABI.

### deriveKeys
```typescript
function deriveKeys(secretKey: Fr) => Promise<{ masterIncomingViewingSecretKey: Fq; masterNullifierSecretKey: Fq; ... }>
```
Computes secret and public keys and public keys hash from a secret key.

### deriveMasterIncomingViewingSecretKey
```typescript
function deriveMasterIncomingViewingSecretKey(secretKey: Fr) => GrumpkinScalar
```

### deriveMasterNullifierSecretKey
```typescript
function deriveMasterNullifierSecretKey(secretKey: Fr) => GrumpkinScalar
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
function generatePublicKey(privateKey: Fq) => Promise<PublicKey>
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

### getClassRegistryContract
```typescript
function getClassRegistryContract(wallet: Wallet) => Promise<UnsafeContract>
```
Returns a Contract wrapper for the contract class registry.

### getContractClassFromArtifact
```typescript
function getContractClassFromArtifact(artifact: ContractArtifact | ContractArtifactWithHash) => Promise<ContractClassWithId & ContractClassIdPreimage>
```
Creates a ContractClass from a contract compilation artifact.

### getContractInstanceFromInstantiationParams
```typescript
function getContractInstanceFromInstantiationParams(artifact: ContractArtifact, opts: ContractInstantiationData) => Promise<ContractInstanceWithAddress>
```
Generates a Contract Instance from some instantiation params.

### getDecodedPublicEvents
```typescript
function getDecodedPublicEvents<T>(node: AztecNode, eventMetadataDef: EventMetadataDefinition, from: number, limit: number) => Promise<T[]>
```
Returns decoded public events given search parameters.

### getFeeJuice
```typescript
function getFeeJuice(wallet: Wallet) => Promise<UnsafeContract>
```
Returns a Contract wrapper for the fee juice contract

### getFeeJuiceBalance
```typescript
function getFeeJuiceBalance(owner: AztecAddress, node: AztecNode) => Promise<bigint>
```
Returns the owner's fee juice balance. Note: This is used only e2e_local_network_example test. Consider nuking.

### getGasLimits
```typescript
function getGasLimits(simulationResult: TxSimulationResult, pad?: number) => { gasLimits: Gas; teardownGasLimits: Gas }
```
Returns suggested total and teardown gas limits for a simulated tx.

### getInstanceRegistryContract
```typescript
function getInstanceRegistryContract(wallet: Wallet) => Promise<UnsafeContract>
```
Returns a Contract wrapper for the contract instance registry.

### getMessageHashFromIntent
```typescript
function getMessageHashFromIntent(messageHashOrIntent: Fr | CallIntent | IntentInnerHash | ContractFunctionInteractionCallIntent, chainInfo: ChainInfo) => Promise<Fr>
```
Compute an authentication witness message hash from an intent and metadata. This is just a wrapper around computeAuthwitMessageHash that allows receiving an already computed messageHash as input

### getTimestampRangeForEpoch
```typescript
function getTimestampRangeForEpoch(epochNumber: EpochNumber, constants: Pick<L1RollupConstants, "epochDuration" | "l1GenesisTime" | "slotDuration" | "ethereumSlotDuration">) => []
```
Returns the range of L1 timestamps (inclusive) for a given epoch number. Note that the endTimestamp is the start timestamp of the last L1 slot for the epoch.

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

### isL1ToL2MessageReady
```typescript
function isL1ToL2MessageReady(node: Pick<AztecNode, "getBlockNumber" | "getL1ToL2MessageBlock">, l1ToL2MessageHash: Fr, opts: { forPublicConsumption: boolean; messageBlockNumber?: number }) => Promise<boolean>
```
Returns whether the L1 to L2 message is ready to be consumed.

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

### lookupValidity
```typescript
function lookupValidity(wallet: Wallet, onBehalfOf: AztecAddress, intent: CallIntent | IntentInnerHash | ContractFunctionInteractionCallIntent, witness: AuthWitness) => Promise<{ isValidInPrivate: boolean; isValidInPublic: boolean }>
```
Lookup the validity of an authwit in private and public contexts. Uses the chain id and version of the wallet.

### mergeExecutionPayloads
```typescript
function mergeExecutionPayloads(requests: ExecutionPayload[]) => ExecutionPayload
```
Merges an array ExecutionPayloads combining their calls, authWitnesses, capsules and extraArgHashes.

### merkleTreeIds
```typescript
function merkleTreeIds() => MerkleTreeId[]
```

### publishContractClass
```typescript
function publishContractClass(wallet: Wallet, artifact: ContractArtifact) => Promise<ContractFunctionInteraction>
```
Sets up a call to publish a contract class given its artifact.

### publishInstance
```typescript
function publishInstance(wallet: Wallet, instance: ContractInstanceWithAddress) => Promise<ContractFunctionInteraction>
```
Sets up a call to the canonical contract instance registry to publish a contract instance.

### readFieldCompressedString
```typescript
function readFieldCompressedString(field: NoirFieldCompressedString) => string
```

### toProfileOptions
```typescript
function toProfileOptions(options: ProfileInteractionOptions) => ProfileOptions
```
Transforms and cleans up the higher level ProfileInteractionOptions defined by the interaction into ProfileOptions, which are the ones that can be serialized and forwarded to the wallet

### toSendOptions
```typescript
function toSendOptions(options: SendInteractionOptions) => SendOptions
```
Transforms and cleans up the higher level SendInteractionOptions defined by the interaction into SendOptions, which are the ones that can be serialized and forwarded to the wallet

### toSimulateOptions
```typescript
function toSimulateOptions(options: SimulateInteractionOptions) => SimulateOptions
```
Transforms and cleans up the higher level SimulateInteractionOptions defined by the interaction into SimulateOptions, which are the ones that can be serialized and forwarded to the wallet

### waitForL1ToL2MessageReady
```typescript
function waitForL1ToL2MessageReady(node: Pick<AztecNode, "getBlockNumber" | "getL1ToL2MessageBlock">, l1ToL2MessageHash: Fr, opts: { forPublicConsumption: boolean; timeoutSeconds: number }) => Promise<boolean>
```
Waits for the L1 to L2 message to be ready to be consumed.

### waitForNode
```typescript
function waitForNode(node: AztecNode, logger?: Logger) => Promise<void>
```

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
type Account = AccountInterface & AuthwitnessIntentProvider
```
A type defining an account, capable of both creating authwits and using them to authenticate transaction execution requests.

### Aliased
```typescript
type Aliased = { alias: string; item: T }
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
type BatchableMethods = Pick<Wallet, "registerContract" | "sendTx" | "registerSender" | "simulateUtility" | "simulateTx">
```
Helper type that represents all methods that can be batched.

### BatchedMethod
```typescript
type BatchedMethod = { args: Parameters<BatchableMethods[T]>; name: T }
```
From the batchable methods, we create a type that represents a method call with its name and arguments. This is what the wallet will accept as arguments to the `batch` method.

### BatchedMethodResult
```typescript
type BatchedMethodResult = unknown
```
Helper type to extract the return type of a batched method

### BatchedMethodResultWrapper
```typescript
type BatchedMethodResultWrapper = { name: T["name"]; result: BatchedMethodResult<T> }
```
Wrapper type for batch results that includes the method name for discriminated union deserialization. Each result is wrapped as { name: 'methodName', result: ActualResult } to allow proper deserialization when AztecAddress and TxHash would otherwise be ambiguous (both are hex strings).

### CallIntent
```typescript
type CallIntent = { call: FunctionCall; caller: AztecAddress }
```
Intent with a call

### ChainInfo
```typescript
type ChainInfo = { chainId: Fr; version: Fr }
```
Information on the connected chain. Used by wallets when constructing transactions to protect against replay attacks.

### ContractClassWithId
```typescript
type ContractClassWithId = ContractClass & Pick<ContractClassCommitments, "id">
```
A contract class with its precomputed id.

### ContractFunctionInteractionCallIntent
```typescript
type ContractFunctionInteractionCallIntent = { action: ContractFunctionInteraction; caller: AztecAddress }
```
Intent with a ContractFunctionInteraction

### ContractInstanceWithAddress
```typescript
type ContractInstanceWithAddress = ContractInstance & { address: AztecAddress }
```

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
type DeployAccountOptions = Omit<DeployOptions, "contractAddressSalt" | "universalDeploy">
```
The configuration options for the send/prove methods. Omits: - The contractAddressSalt, since for account contracts that is fixed in the constructor. - UniversalDeployment flag, since account contracts are always deployed with it set to true

### DeployOptions
```typescript
type DeployOptions = Omit<RequestDeployOptions, "deployer"> & { universalDeploy?: boolean } & Pick<SendInteractionOptions, "from" | "fee">
```
Extends the deployment options with the required parameters to send the transaction

### DeployTxReceipt
```typescript
type DeployTxReceipt = FieldsOf<TxReceipt> & { contract: TContract; instance: ContractInstanceWithAddress }
```
Extends a transaction receipt with a contract instance that represents the newly deployed contract.

### DeployedWaitOpts
```typescript
type DeployedWaitOpts = WaitOpts & { wallet?: Wallet }
```
Options related to waiting for a deployment tx.

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

### FeeEstimationOptions
```typescript
type FeeEstimationOptions = { estimatedGasPadding?: number; estimateGas?: boolean }
```
Options used to tweak the simulation and add gas estimation capabilities

### FeePaymentMethodOption
```typescript
type FeePaymentMethodOption = { paymentMethod?: FeePaymentMethod }
```
Interactions allow configuring a custom fee payment method that gets bundled with the transaction before sending it to the wallet

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
type GasSettingsOption = { gasSettings?: Partial<FieldsOf<GasSettings>> }
```
User-defined partial gas settings for the interaction. This type is completely optional since the wallet will fill in the missing options

### GrumpkinScalar
```typescript
type GrumpkinScalar = typeof Fq
```

### INITIAL_L2_BLOCK_NUM
```typescript
type INITIAL_L2_BLOCK_NUM = BlockNumber
```
The initial L2 block number (typed as BlockNumber). This is the first block number in the Aztec L2 chain.

### IntentInnerHash
```typescript
type IntentInnerHash = { consumer: AztecAddress; innerHash: Fr }
```
Intent with an inner hash

### InteractionFeeOptions
```typescript
type InteractionFeeOptions = GasSettingsOption & FeePaymentMethodOption
```
Fee options as set by a user.

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
type L2Claim = { claimSecret: Fr; claimSecretHash: Fr; ... }
```
L1 to L2 message info to claim it on L2.

### LogFilter
```typescript
type LogFilter = { afterLog?: LogId; contractAddress?: AztecAddress; ... }
```
Log filter used to fetch L2 logs.

### Logger
```typescript
type Logger = { [key: string]: unknown } & { error: ErrorLogFn } & { createChild: (childModule: string) => Logger; isLevelEnabled: (level: LogLevel) => boolean; ... }
```
Logger that supports multiple severity levels.

### PartialAddress
```typescript
type PartialAddress = Fr
```
A type which along with public key forms a preimage of a contract address. See the link below for more details https://github.com/AztecProtocol/aztec-packages/blob/master/docs/docs/concepts/foundation/accounts/keys.md#addresses-partial-addresses-and-public-keys

### PrivateEvent
```typescript
type PrivateEvent = { event: T; metadata: InTx }
```
An ABI decoded private event with associated metadata.

### PrivateEventFilter
```typescript
type PrivateEventFilter = { contractAddress: AztecAddress; fromBlock?: BlockNumber; ... }
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
Options for profiling interactions with the wallet. Overrides the fee settings of an interaction with a simplified version that only hints at the wallet wether the interaction contains a fee payment method or not

### ProtocolContractAddress
```typescript
type ProtocolContractAddress = Record<ProtocolContractName, AztecAddress>
```

### PublicKey
```typescript
type PublicKey = Point
```
Represents a user public key.

### RequestDeployAccountOptions
```typescript
type RequestDeployAccountOptions = Omit<RequestDeployOptions, "contractAddressSalt">
```
The configuration options for the request method. Omits the contractAddressSalt, since for account contracts that is fixed in the constructor

### RequestDeployOptions
```typescript
type RequestDeployOptions = RequestInteractionOptions & { contractAddressSalt?: Fr; deployer?: AztecAddress; ... }
```
Options for deploying a contract on the Aztec network. Allows specifying a contract address salt and different options to tweak contract publication and initialization

### RequestInteractionOptions
```typescript
type RequestInteractionOptions = { authWitnesses?: AuthWitness[]; capsules?: Capsule[]; fee?: FeePaymentMethodOption }
```
Represents the options to configure a request from a contract interaction. Allows specifying additional auth witnesses and capsules to use during execution

### Salt
```typescript
type Salt = Fr | number | bigint
```
A contract deployment salt.

### SendInteractionOptions
```typescript
type SendInteractionOptions = RequestInteractionOptions & { fee?: InteractionFeeOptions; from: AztecAddress }
```
Represents options for calling a (constrained) function in a contract.

### SendOptions
```typescript
type SendOptions = Omit<SendInteractionOptions, "fee"> & { fee?: GasSettingsOption }
```
Options for sending/proving interactions with the wallet. Overrides the fee settings of an interaction with a simplified version that only hints at the wallet wether the interaction contains a fee payment method or not

### SimulateDeployAccountOptions
```typescript
type SimulateDeployAccountOptions = Omit<SimulateDeployOptions, "contractAddressSalt">
```
The configuration options for the simulate method. Omits the contractAddressSalt, since for account contracts that is fixed in the constructor

### SimulateDeployOptions
```typescript
type SimulateDeployOptions = Omit<DeployOptions, "fee"> & { fee?: SimulationInteractionFeeOptions; includeMetadata?: boolean; ... }
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
Options for simulating interactions with the wallet. Overrides the fee settings of an interaction with a simplified version that only hints at the wallet wether the interaction contains a fee payment method or not

### SimulationInteractionFeeOptions
```typescript
type SimulationInteractionFeeOptions = InteractionFeeOptions & FeeEstimationOptions
```
Fee options that can be set for simulation *only*

### SimulationReturn
```typescript
type SimulationReturn = unknown
```
Represents the result type of a simulation. By default, it will just be the return value of the simulated function If `includeMetadata` is set to true in `SimulateInteractionOptions` on the input of `simulate(...)`, it will provide extra information.

### U128Like
```typescript
type U128Like = bigint | number
```
Any type that can be converted into a U128.

### WaitForProvenOpts
```typescript
type WaitForProvenOpts = { interval?: number; provenTimeout?: number }
```
Options for waiting for a transaction to be proven.

### WaitOpts
```typescript
type WaitOpts = { dontThrowOnRevert?: boolean; ignoreDroppedReceiptsFor?: number; ... }
```
Options related to waiting for a tx.

### Wallet
```typescript
type Wallet = {}
```
The wallet interface.

### WrappedFieldLike
```typescript
type WrappedFieldLike = { inner: FieldLike } | FieldLike
```
Any type that can be converted into a struct with a single `inner` field.

## Enums

### Comparator
The comparator to use to compare.

Values: `1`, `5`, `6`, `3`, `4`, `2`

### FunctionType
Aztec.nr function types.

Values: `private`, `public`, `utility`

### MerkleTreeId
Defines the possible Merkle tree IDs.

Values: `4`, `3`, `1`, `0`, `2`

### TxStatus
Possible status of a transaction.

Values: `app_logic_reverted`, `both_reverted`, `dropped`, `pending`, `success`, `teardown_reverted`

## Cross-Package References

This package references types from other Aztec packages:

**@aztec/blob-lib**
- `BlockBlobData`, `TxBlobData`

**@aztec/entrypoints**
- `AuthWitnessProvider`, `ChainInfo`, `DefaultAccountEntrypointOptions`, `EntrypointInterface`

**@aztec/ethereum**
- `ExtendedViemWalletClient`, `L1ContractAddresses`

**@aztec/foundation**
- `BaseField`, `BlockNumber`, `Buffer32`, `BufferReader`, `EpochNumber`, `ErrorLogFn`, `EthAddress`, `FieldReader`, `FieldsOf`, `Fq`, `Fr`, `GrumpkinScalar`, `Hasher`, `LogLevel`, `Logger`, `MembershipWitness`, `N`, `Point`, `SiblingPath`, `SlotNumber`, `SubtreeHeight`, `SubtreeSiblingPathHeight`, `Tuple`, `ZodFor`

**@aztec/protocol-contracts**
- `ProtocolContractName`

**@aztec/stdlib**
- `ABIParameterSchema`, `APP_LOGIC_REVERTED`, `AbiDecoded`, `AbiErrorType`, `AbiType`, `AbiValue`, `AllowedElement`, `AppendOnlyTreeSnapshot`, `ArrayType`, `AuthWitness`, `AuthorizationSelector`, `AztecAddress`, `AztecNode`, `BOTH_REVERTED`, `BasicType`, `BlockHeader`, `Body`, `Capsule`, `Checkpoint`, `CheckpointHeader`, `ChonkProof`, `CompleteAddress`, `ComponentsVersions`, `ContractArtifact`, `ContractArtifactWithHash`, `ContractClass`, `ContractClassCommitments`, `ContractClassIdPreimage`, `ContractClassLog`, `ContractClassLogFields`, `ContractClassPublic`, `ContractClassWithId`, `ContractInstance`, `ContractInstanceWithAddress`, `ContractInstantiationData`, `DataInBlock`, `DebugFileMap`, `EventMetadataDefinition`, `EventSelector`, `ExecutionPayload`, `FieldLayout`, `FunctionAbi`, `FunctionArtifact`, `FunctionCall`, `FunctionDebugMetadata`, `FunctionSelector`, `FunctionType`, `Gas`, `GasFees`, `GasSettings`, `GetContractClassLogsResponse`, `GetPublicLogsResponse`, `GlobalVariables`, `Gossipable`, `HashedValues`, `InTx`, `IndexedTxEffect`, `IntegerType`, `L1Actor`, `L1RollupConstants`, `L1ToL2Message`, `L2Actor`, `L2Block`, `L2BlockHash`, `L2BlockHeader`, `L2BlockInfo`, `L2BlockNew`, `L2BlockSource`, `L2LogsSource`, `L2Tips`, `LogFilter`, `LogId`, `MerkleTreeId`, `NodeInfo`, `NoirCompiledContract`, `NoirFunctionEntry`, `Note`, `NoteSelector`, `NullifierMembershipWitness`, `OffchainEffect`, `PrivateExecutionStep`, `PrivateKernelTailCircuitPublicInputs`, `ProtocolContractAddresses`, `ProvingStats`, `PublicCallRequestWithCalldata`, `PublicDataWitness`, `PublicKey`, `PublicKeys`, `PublicSimulationOutput`, `PublishedL2Block`, `RevertCode`, `SUCCESS`, `Selector`, `SimulationStats`, `SingleValidatorStats`, `StringType`, `StructType`, `TEARDOWN_REVERTED`, `TopicType`, `TupleType`, `Tx`, `TxContext`, `TxEffect`, `TxExecutionRequest`, `TxHash`, `TxProfileResult`, `TxReceipt`, `TxRequest`, `TxScopedL2Log`, `TxSimulationResult`, `TxStats`, `TxStatus`, `TxValidationResult`, `ValidatorsStats`, `Vector`, `WorldStateSyncStatus`
