# @aztec/aztec.js

Version: v5.0.0-rc.1

## Quick Import Reference

```typescript
import {
  AccountManager,
  AccountWithSecretKey,
  BaseAccount,
  BatchCall,
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
- `getAccount() => Promise<AccountWithSecretKey>` - Returns a Wallet instance associated with this account. Use it to create Contract instances to be interacted with from this account.
- `getAccountContract() => AccountContract` - Returns the account contract that backs this account.
- `getCompleteAddress() => Promise<CompleteAddress>` - Gets the calculated complete address associated with this account. Does not require the account to have been published for public execution.
- `getDeployMethod() => Promise<DeployAccountMethod<Contract>>` - Returns a preconfigured deploy method that contains all the necessary function calls to deploy the account contract.
- `getInstance() => ContractInstanceWithAddress` - Returns the contract instance definition associated with this account. Does not require the account to have been published for public execution.
- `getPublicKeys() => any`
- `getPublicKeysHash() => any`
- `getSecretKey() => Fr` - Returns the secret key used to derive the rest of the privacy keys for this contract
- `hasInitializer() => Promise<boolean>` - Returns whether this account contract has an initializer function.

### AccountWithSecretKey

Extends BaseAccount with the encryption private key. Not required for implementing the wallet interface but useful for testing purposes or exporting an account to another pxe.
Implements: `Account`

**Constructor**
```typescript
new AccountWithSecretKey(account: any, secretKey: Fr)
```

**Methods**
- `createAuthWit(intent: IntentInnerHash | CallIntent, chainInfo: ChainInfo) => Promise<AuthWitness>`
- `createTxExecutionRequest(exec: ExecutionPayload, gasSettings: GasSettings, chainInfo: ChainInfo, options?: any) => Promise<TxExecutionRequest>`
- `getAddress() => AztecAddress`
- `getCompleteAddress() => CompleteAddress`
- `getEncryptionSecret() => Promise<any>` - Returns the encryption secret, the secret of the encryption point—the point that others use to encrypt messages to this account note - this ensures that the address secret always corresponds to an address point with y being positive dev - this is also referred to as the address secret, which decrypts payloads encrypted to an address point
- `getSecretKey() => Fr` - Returns the encryption private key associated with this account.
- `wrapExecutionPayload(exec: ExecutionPayload, chainInfo: ChainInfo, options?: any) => Promise<ExecutionPayload>`

### BaseAccount

An account implementation that uses authwits as an authentication mechanism and can assemble transaction execution requests for an entrypoint.
Implements: `Account`

**Constructor**
```typescript
new BaseAccount(entrypoint: EntrypointInterface, authWitnessProvider: AuthWitnessProvider, completeAddress: CompleteAddress)
```

**Methods**
- `createAuthWit(messageHashOrIntent: IntentInnerHash | CallIntent, chainInfo: ChainInfo) => Promise<AuthWitness>`
- `createTxExecutionRequest(exec: ExecutionPayload, gasSettings: GasSettings, chainInfo: ChainInfo, options: DefaultAccountEntrypointOptions) => Promise<TxExecutionRequest>`
- `getAddress() => AztecAddress`
- `getCompleteAddress() => CompleteAddress`
- `wrapExecutionPayload(exec: ExecutionPayload, chainInfo: ChainInfo, options?: any) => Promise<ExecutionPayload>`

### BatchCall

A batch of function calls to be sent as a single transaction through a wallet.

Extends: `BaseContractInteraction`

**Constructor**
```typescript
new BatchCall(wallet: Wallet, interactions: any[], extraHashedArgs: HashedValues[])
```

**Properties**
- `authWitnesses: AuthWitness[]`
- `capsules: Capsule[]`
- `interactions: any[]`
- `log: any`
- `wallet: Wallet`

**Methods**
- `getExecutionPayloads() => Promise<ExecutionPayload[]>`
- `request(options: RequestInteractionOptions) => Promise<ExecutionPayload>` - Returns an execution request that represents this operation.
- `send<TReturn>(options: SendInteractionOptionsWithoutWait) => Promise<TxSendResultMined<TReturn>>` - Sends a transaction to the contract function with the specified options. By default, waits for the transaction to be mined and returns the receipt (or custom type).
- `simulate(options: SimulateInteractionOptions) => Promise<SimulationResult>` - Simulates/executes the batch, supporting private, public and utility functions. Although this is a single interaction with the wallet, private and public functions will be grouped into a single ExecutionPayload that the wallet will simulate as a single transaction. Utility function calls will be executed one by one.

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
- `log: any`
- `wallet: Wallet`

**Methods**
- `getFunctionCall() => Promise<any>` - Returns the encoded function call wrapped by this interaction Useful when generating authwits
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
new DeployAccountMethod(publicKeys: PublicKeys, wallet: Wallet, artifact: ContractArtifact, postDeployCtor: (instance: ContractInstanceWithAddress, wallet: Wallet) => TContract, salt: Fr, immutablesHash: Fr, account: any, args: any[], constructorNameOrArtifact?: any, authWitnesses: AuthWitness[], capsules: Capsule[], extraHashedArgs: HashedValues[])
```

**Properties**
- `readonly args: any[]` - Encoded constructor arguments for the contract.
- `readonly artifact: ContractArtifact` - Build artifact of the contract being deployed.
- `authWitnesses: AuthWitness[]`
- `capsules: Capsule[]`
- `constructorArtifact: any` - Constructor function to call.
- `readonly extraHashedArgs: HashedValues[]` - Extra hashed args propagated through `with(...)` and into the deploy payload.
- `readonly immutablesHash: Fr` - Immutables hash folded into the salted initialization hash.
- `log: any`
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
- `lockDeployer(_from: any) => void` - Universal deploys accept any sender, including `NO_FROM` / `undefined`.
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
new DeployMethod(wallet: Wallet, contract: DeployMethodContract<TContract>, salt: any, publicKeys: any, immutablesHash: any, payload: DeployMethodPayload)
```

**Properties**
- `readonly args: any[]` - Encoded constructor arguments for the contract.
- `readonly artifact: ContractArtifact` - Build artifact of the contract being deployed.
- `authWitnesses: AuthWitness[]`
- `capsules: Capsule[]`
- `constructorArtifact: any` - Constructor function to call.
- `readonly extraHashedArgs: HashedValues[]` - Extra hashed args propagated through `with(...)` and into the deploy payload.
- `readonly immutablesHash: Fr` - Immutables hash folded into the salted initialization hash.
- `log: any`
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
- `lockDeployer(from: any) => void` - Reconciles a send-time `from` with the deploy's deployer. Owned asserts an exact match; Universal accepts anything; Pending uses the first call to lock its deployer (transitioning into an Owned/Universal sibling), then defers to that sibling's assertion on subsequent calls. The "locks-or-asserts" name is intentional: only Pending mutates state, and only on its first invocation. Owned and Universal are pure assertions.
- `profile(options: RequestInteractionOptions & { skipClassPublication?: boolean; skipInitialization?: boolean; ... } & Pick<SendInteractionOptionsWithoutWait, "fee" | "from" | "additionalScopes"> & Omit<SendInteractionOptions<undefined>, "fee"> & { fee?: InteractionFeeOptions; includeMetadata?: boolean; ... } & { profileMode: "gates" | "execution-steps" | "full"; skipProofGeneration?: boolean }) => Promise<TxProfileResult>` - Simulate a deployment and profile the gate count for each function in the transaction.
- `register() => Promise<TContract>` - Adds this contract to the wallet and returns the Contract object.
- `request(options: RequestDeployOptions) => Promise<ExecutionPayload>` - Returns the execution payload that allows this operation to happen on chain. Requires the deployer to be known — call `getDeployerAddress()` first; on a `PendingDeployMethod` this throws unless a prior `send` / `simulate` / `profile` has already locked the deployer.
- `send(options: DeployOptionsWithoutWait) => Promise<DeployResultMined<TContract>>` - Send a contract deployment transaction (initialize and/or publish) using the provided options. By default, waits for the transaction to be mined and returns the deployed contract instance.
- `simulate(options: SimulateDeployOptions) => Promise<SimulationResult>` - Simulate the deployment
- `with(options: { authWitnesses?: AuthWitness[]; capsules?: Capsule[]; extraHashedArgs?: HashedValues[] }) => DeployMethod<TContract>` - Augments this DeployMethod with additional metadata, such as authWitnesses and capsules. The deployer lock is preserved: a Pending that has not yet been locked stays Pending; a Pending that has already locked, along with Owned and Universal, returns the matching locked flavor so the cloned method deploys at the same address as `this`.

### FeeJuicePaymentMethodWithClaim

Pay fee directly with Fee Juice claimed in the same tx. Claiming consumes an L1 to L2 message that "contains" the fee juice bridged from L1.
Implements: `FeePaymentMethod`

**Constructor**
```typescript
new FeeJuicePaymentMethodWithClaim(sender: AztecAddress, claim: Pick<L2AmountClaim, "claimAmount" | "claimSecret" | "messageLeafIndex">)
```

**Methods**
- `getAsset() => Promise<any>` - The asset used to pay the fee.
- `getExecutionPayload() => Promise<ExecutionPayload>` - Creates an execution payload to pay the fee in Fee Juice.
- `getFeePayer() => Promise<AztecAddress>` - The expected fee payer for this tx.
- `getGasSettings() => any` - The gas settings (if any) used to compute the execution payload of the payment method

### L1FeeJuicePortalManager

Helper for interacting with the FeeJuicePortal on L1.

**Constructor**
```typescript
new L1FeeJuicePortalManager(portalAddress: EthAddress, tokenAddress: EthAddress, handlerAddress: any, extendedClient: ExtendedViemWalletClient, logger: Logger)
```

**Methods**
- `bridgeTokensPublic(to: AztecAddress, amount: bigint | undefined, mint: boolean) => Promise<L2AmountClaim>` - Bridges fee juice from L1 to L2 publicly. Handles L1 ERC20 approvals. Returns once the tx has been mined.
- `getTokenManager() => L1TokenManager` - Returns the associated token manager for the L1 ERC20.
- `static new(node: AztecNode, extendedClient: ExtendedViemWalletClient, logger: Logger) => Promise<L1FeeJuicePortalManager>` - Creates a new instance

### L1ToL2TokenPortalManager

Helper for interacting with a test TokenPortal on L1 for sending tokens to L2.

**Constructor**
```typescript
new L1ToL2TokenPortalManager(portalAddress: EthAddress, tokenAddress: EthAddress, handlerAddress: any, extendedClient: ExtendedViemWalletClient, logger: Logger)
```

**Properties**
- `extendedClient: ExtendedViemWalletClient`
- `logger: Logger`
- `readonly portal: ViemContract<any>`
- `readonly tokenManager: L1TokenManager`

**Methods**
- `bridgeTokensPrivate(to: AztecAddress, amount: bigint, mint: boolean) => Promise<L2AmountClaimWithRecipient>` - Bridges tokens from L1 to L2 privately. Handles token approvals. Returns once the tx has been mined.
- `bridgeTokensPublic(to: AztecAddress, amount: bigint, mint: boolean) => Promise<L2AmountClaim>` - Bridges tokens from L1 to L2. Handles token approvals. Returns once the tx has been mined.
- `getTokenManager() => L1TokenManager` - Returns the token manager for the underlying L1 token.

### L1TokenManager

Helper for managing an ERC20 on L1.

**Constructor**
```typescript
new L1TokenManager(tokenAddress: EthAddress, handlerAddress: any, extendedClient: ExtendedViemWalletClient, logger: Logger)
```

**Properties**
- `readonly handlerAddress: any` - Address of the handler/faucet contract.
- `readonly tokenAddress: EthAddress` - Address of the ERC20 contract.

**Methods**
- `approve(amount: bigint, address: string, addressName: string) => Promise<void>` - Approves tokens for the given address. Returns once the tx has been mined.
- `getL1TokenBalance(address: string) => Promise<any>` - Returns the balance of the given address.
- `getMintAmount() => Promise<any>` - Returns the amount of tokens available to mint via the handler.
- `mint(address: string, addressName?: string) => Promise<void>` - Mints a fixed amount of tokens for the given address. Returns once the tx has been mined.

### L1TokenPortalManager

Helper for interacting with a test TokenPortal on L1 for both withdrawing from and bridging to L2.

Extends: `L1ToL2TokenPortalManager`

**Constructor**
```typescript
new L1TokenPortalManager(portalAddress: EthAddress, tokenAddress: EthAddress, handlerAddress: any, outboxAddress: EthAddress, extendedClient: ExtendedViemWalletClient, logger: Logger)
```

**Properties**
- `extendedClient: ExtendedViemWalletClient`
- `logger: Logger`
- `readonly portal: ViemContract<any>`
- `readonly tokenManager: L1TokenManager`

**Methods**
- `bridgeTokensPrivate(to: AztecAddress, amount: bigint, mint: boolean) => Promise<L2AmountClaimWithRecipient>` - Bridges tokens from L1 to L2 privately. Handles token approvals. Returns once the tx has been mined.
- `bridgeTokensPublic(to: AztecAddress, amount: bigint, mint: boolean) => Promise<L2AmountClaim>` - Bridges tokens from L1 to L2. Handles token approvals. Returns once the tx has been mined.
- `getL2ToL1MessageLeaf(amount: bigint, recipient: EthAddress, l2Bridge: AztecAddress, callerOnL1: EthAddress) => Promise<Fr>` - Computes the L2 to L1 message leaf for the given parameters.
- `getTokenManager() => L1TokenManager` - Returns the token manager for the underlying L1 token.
- `withdrawFunds(amount: bigint, recipient: EthAddress, epochNumber: EpochNumber, numCheckpointsInEpoch: number, messageIndex: bigint, siblingPath: SiblingPath<number>) => Promise<void>` - Withdraws funds from the portal by consuming an L2 to L1 message. Returns once the tx is mined on L1.

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
- `getGasSettings() => any` - The gas settings (if any) used to compute the execution payload of the payment method

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
- `getGasSettings() => any` - The gas settings (if any) used to compute the execution payload of the payment method

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
- `getFeePayer() => Promise<any>` - The expected fee payer for this tx.
- `getGasSettings() => any` - The gas settings (if any) used to compute the execution payload of the payment method

### TxSimulationResultWithAppOffset

Extends TxSimulationResult with the app call offset, which tracks where the app's calls begin in the flattened array of calls. Tracking of app call offset is a wallet-level concern: the wallet may wrap the app payload in an entrypoint or may prepend calls (this is typically done for fee payments).

Extends: `unknown`

**Constructor**
```typescript
new TxSimulationResultWithAppOffset(privateExecutionResult: PrivateExecutionResult, publicInputs: PrivateKernelTailCircuitPublicInputs, publicOutput?: any, stats?: any, appCallOffset: number | undefined)
```

**Properties**
- `readonly appCallOffset: number | undefined` - Index of the app's first call in a flattened array of calls. 0 = app call is the root execution itself (DefaultEntrypoint / NO_FROM). 1..N = wallet prepended calls before the app call. undefined = wallet did not send the field; use heuristic fallback.
- `static schema: unknown`

**Methods**
- `static fromResultAndOffset(result: TxSimulationResult, appCallOffset: number) => TxSimulationResultWithAppOffset` - Creates a TxSimulationResultWithAppOffset from an existing TxSimulationResult, attaching the app call offset computed by the wallet (i.e. how many calls precede the first app call in the flattened execution tree).
- `getPrivateReturnValuesOfAppCall(appCallIndex: number) => any` - Returns the private return values that correspond to the provided app call.
- `static random() => Promise<TxSimulationResultWithAppOffset>`

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
- `constructorArtifact: any` - Constructor function to call.
- `readonly extraHashedArgs: HashedValues[]` - Extra hashed args propagated through `with(...)` and into the deploy payload.
- `readonly immutablesHash: Fr` - Immutables hash folded into the salted initialization hash.
- `log: any`
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
- `lockDeployer(_from: any) => void` - Universal deploys accept any sender, including `NO_FROM` / `undefined`.
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
- `getAccount(address: CompleteAddress) => any` - Returns the account implementation for this account contract given an instance at the provided address. The account is responsible for assembling tx requests given requested function calls, and for creating signed auth witnesses given action identifiers (message hashes).
- `getAuthWitnessProvider(address: CompleteAddress) => AuthWitnessProvider` - Returns the auth witness provider for the given address.
- `getContractArtifact() => Promise<ContractArtifact>` - Returns the artifact of this account contract.
- `getImmutablesHash() => Promise<any>` - The hash of this account's immutable instantiation params, committed into its address. Returns undefined for accounts that have no immutables (these are instead deployed via an on-chain initializer, which contributes to the address through its initialization hash).
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

### AuthorizationProvider

Provides authorization for actions via the AuthWitness mechanism.

**Methods**
- `createAuthWit(intent: IntentInnerHash | CallIntent, chainInfo: ChainInfo) => Promise<AuthWitness>` - Creates an authentication witness from an inner hash with consumer, or a call intent

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
- `contract: any` - Contract address or '*' for any contract
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
- `getGasSettings() => any` - The gas settings (if any) used to compute the execution payload of the payment method

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

### extractOffchainOutput
```typescript
function extractOffchainOutput(effects: OffchainEffect[], anchorBlockTimestamp: bigint) => OffchainOutput
```
Splits an array of offchain effects into decoded offchain messages and remaining effects. Effects whose data starts with `OFFCHAIN_MESSAGE_IDENTIFIER` are parsed as messages and removed from the effects array.

### fastForwardContractUpdate
```typescript
function fastForwardContractUpdate(args: { instanceAddress: AztecAddress; newClassId: Fr; node: AztecNode }) => Promise<SimulationOverrides>
```
Builds `SimulationOverrides` that simulate a deployed instance as if it had already been upgraded to a new contract class. Mirrors a real on-chain upgrade (`pxe.updateContract` followed by waiting out the delay): - `publicStorage` rewrites the `ContractInstanceRegistry`'s delayed-public-mutable storage so the AVM's `UpdateCheck` resolves to the new class id. - `contracts` swaps the deployed instance for one whose `currentContractClassId` is bumped to the new class. The new class must already be registered on chain.

### generateClaimSecret
```typescript
function generateClaimSecret(logger?: any) => Promise<[]>
```
Generates a pair secret and secret hash

### generatePublicKey
```typescript
function generatePublicKey(privateKey: GrumpkinScalar) => Promise<PublicKey>
```
Method for generating a public grumpkin key from a private key.

### getAccountContractAddress
```typescript
function getAccountContractAddress(accountContract: AccountContract, secret: Fr, salt: Fr, immutablesHash?: any) => Promise<any>
```
Compute the address of an account contract from secret, salt and optional immutables hash

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
function waitForProven(node: AztecNode, receipt: TxReceipt, opts?: WaitForProvenOpts) => Promise<any>
```
Wait for a transaction to be proven by polling the node

## Types

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

### ContractArtifact
```typescript
type ContractArtifact = any
```

### ContractClassMetadata
```typescript
type ContractClassMetadata = unknown
```
Contract class metadata.

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

### GrantedCapability
```typescript
type GrantedCapability = GrantedAccountsCapability | GrantedContractsCapability | GrantedContractClassesCapability | GrantedSimulationCapability | GrantedTransactionCapability | GrantedDataCapability
```
Union type of all granted capabilities (wallet response). The wallet may augment capabilities with additional information: - AccountsCapability: adds specific accounts granted - Other capabilities: may reduce scope (e.g., '*' to specific addresses)

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
type PublicEventFilter = EventFilterBase & { contractAddress: AztecAddress }
```
Filter options when querying public events. The contract address is required because the public log index is keyed on `(contract, tag)`; tag-only queries are not supported.

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

## Enums

### ContractInitializationStatus
Whether the contract has been initialized.

Values: `INITIALIZED`, `UNINITIALIZED`, `UNKNOWN`
