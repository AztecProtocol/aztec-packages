# @aztec/wallets

Version: v4.3.1

## Quick Import Reference

```typescript
import {
  BrowserEmbeddedWallet,
  NodeEmbeddedWallet,
  WalletDB,
  deployFundedSchnorrAccounts,
  registerInitialLocalNetworkAccountsInWallet,
  // ... and more
} from '@aztec/wallets';
```

## Classes

### BrowserEmbeddedWallet

Extends: `EmbeddedWallet`

**Constructor**
```typescript
new BrowserEmbeddedWallet(pxe: PXE, aztecNode: AztecNode, walletDB: WalletDB, accountContracts: AccountContractsProvider, log?: Logger)
```

**Properties**
- `accountContracts: AccountContractsProvider`
- `readonly aztecNode: AztecNode`
- `cancellableTransactions: boolean`
- `estimatedGasPadding: number`
- `log: Logger`
- `minFeePadding: number`
- `readonly pxe: PXE`
- `walletDB: WalletDB`

**Methods**
- `batch<T extends readonly BatchedMethod[]>(methods: T) => Promise<BatchResults<T>>`
- `buildAccountOverrides(addresses: AztecAddress[]) => Promise<ContractOverrides>` - Builds contract overrides for all provided addresses by replacing their account contracts with stub implementations. Uses a type-specific stub artifact so that the stub's constructor selector matches the real account's constructor.
- `completeFeeOptions(config: CompleteFeeOptionsConfig) => Promise<FeeOptions>` - Completes partial user-provided fee options with wallet defaults.
- `computeAppCallOffset(from: AztecAddress | "NO_FROM", feeOptions: FeeOptions) => Promise<number>` - Computes the index where the app's calls begin in the flattened array of calls (0 = entrypoint/root, 1..N = fee calls, N+1 = app).
- `contextualizeError(err: Error, ...context: string[]) => Error`
- `static create<T extends BrowserEmbeddedWallet>(this: (pxe: PXE, aztecNode: AztecNode, walletDB: WalletDB, accountContracts: AccountContractsProvider, log?: Logger) => T, nodeOrUrl: string | AztecNode, options: EmbeddedWalletOptions) => Promise<T>`
- `createAccountInternal(type: "schnorr" | "ecdsasecp256r1" | "ecdsasecp256k1", secret: Fr, salt: Fr, signingKey: Buffer) => Promise<AccountManager>`
- `createAndStoreAccount(alias: string, type: "schnorr" | "ecdsasecp256r1" | "ecdsasecp256k1", secret: Fr, salt: Fr, signingKey: Buffer) => Promise<AccountManager>`
- `createAuthWit(from: AztecAddress, messageHashOrIntent: IntentInnerHash | CallIntent) => Promise<AuthWitness>`
- `createECDSAKAccount(secret: Fr, salt: Fr, signingKey: Buffer, alias?: string) => Promise<AccountManager>`
- `createECDSARAccount(secret: Fr, salt: Fr, signingKey: Buffer, alias?: string) => Promise<AccountManager>`
- `createSchnorrAccount(secret: Fr, salt: Fr, signingKey?: Fq, alias?: string) => Promise<AccountManager>`
- `createTxExecutionRequestFromPayloadAndFee(executionPayload: ExecutionPayload, from: AztecAddress | "NO_FROM", feeOptions: FeeOptions) => Promise<TxExecutionRequest>`
- `executeUtility(call: FunctionCall, opts: ExecuteUtilityOptions) => Promise<UtilityExecutionResult>`
- `getAccountFromAddress(address: AztecAddress) => Promise<Account>`
- `getAccounts() => Promise<Aliased<AztecAddress>[]>`
- `getAddressBook() => Promise<Aliased<AztecAddress>[]>` - Returns the list of aliased contacts associated with the wallet. This base implementation directly returns PXE's senders, but note that in general contacts are a superset of senders. - Senders: Addresses we check during synching in case they sent us notes, - Contacts: more general concept akin to a phone's contact list.
- `getChainInfo() => Promise<ChainInfo>`
- `getContractClassMetadata(id: Fr) => Promise<{ isArtifactRegistered: boolean; isContractClassPubliclyRegistered: boolean }>`
- `getContractMetadata(address: AztecAddress) => Promise<{ initializationStatus: ContractInitializationStatus; instance: ContractInstanceWithAddress | undefined; ... }>` - Returns metadata about a contract, including whether it has been initialized, published, and updated.
- `getContractName(address: AztecAddress) => Promise<string | undefined>` - Resolves a contract address to a human-readable name via PXE, if available.
- `getPrivateEvents<T>(eventDef: EventMetadataDefinition, eventFilter: PrivateEventFilter) => Promise<PrivateEvent<T>[]>`
- `profileTx(executionPayload: ExecutionPayload, opts: ProfileOptions) => Promise<TxProfileResult>`
- `registerContract(instance: ContractInstanceWithAddress, artifact?: ContractArtifact, secretKey?: Fr) => Promise<ContractInstanceWithAddress>`
- `registerSender(address: AztecAddress, alias: string) => Promise<AztecAddress>`
- `requestCapabilities(_manifest: AppCapabilities) => Promise<WalletCapabilities>` - Request capabilities from the wallet. This method is wallet-implementation-dependent and must be provided by classes extending BaseWallet. Embedded wallets typically don't support capability-based authorization (no user authorization flow), while external wallets (browser extensions, hardware wallets) implement this to reduce authorization friction by allowing apps to request permissions upfront. Consider making it abstract so implementing it is a conscious decision. Leaving it as-is while the feature stabilizes.
- `scopesFrom(from: AztecAddress | "NO_FROM", additionalScopes?: AztecAddress[]) => AztecAddress[]`
- `sendTx<W extends InteractionWaitOptions>(executionPayload: ExecutionPayload, opts: SendOptions<W>) => Promise<SendReturn<W>>` - Overrides the base sendTx to add a pre-simulation step before the actual send. The simulation estimates actual gas usage and captures call authorization requests to generate the necessary authwitnesses.
- `setEstimatedGasPadding(value?: number) => void`
- `setMinFeePadding(value?: number) => void`
- `simulateTx(executionPayload: ExecutionPayload, opts: SimulateOptions) => Promise<TxSimulationResultWithAppOffset>` - Simulates a transaction, optimizing leading public static calls by running them directly on the node while sending the remaining calls through the standard PXE path. Return values from both paths are merged back in original call order.
- `simulateViaEntrypoint(executionPayload: ExecutionPayload, opts: SimulateViaEntrypointOptions) => Promise<TxSimulationResultWithAppOffset>` - Simulates calls via a stub account entrypoint, bypassing real account authorization. This allows kernelless simulation with contract overrides, skipping expensive private kernel circuit execution.
- `stop() => Promise<void>`

### NodeEmbeddedWallet

Extends: `EmbeddedWallet`

**Constructor**
```typescript
new NodeEmbeddedWallet(pxe: PXE, aztecNode: AztecNode, walletDB: WalletDB, accountContracts: AccountContractsProvider, log?: Logger)
```

**Properties**
- `accountContracts: AccountContractsProvider`
- `readonly aztecNode: AztecNode`
- `cancellableTransactions: boolean`
- `estimatedGasPadding: number`
- `log: Logger`
- `minFeePadding: number`
- `readonly pxe: PXE`
- `walletDB: WalletDB`

**Methods**
- `batch<T extends readonly BatchedMethod[]>(methods: T) => Promise<BatchResults<T>>`
- `buildAccountOverrides(addresses: AztecAddress[]) => Promise<ContractOverrides>` - Builds contract overrides for all provided addresses by replacing their account contracts with stub implementations. Uses a type-specific stub artifact so that the stub's constructor selector matches the real account's constructor.
- `completeFeeOptions(config: CompleteFeeOptionsConfig) => Promise<FeeOptions>` - Completes partial user-provided fee options with wallet defaults.
- `computeAppCallOffset(from: AztecAddress | "NO_FROM", feeOptions: FeeOptions) => Promise<number>` - Computes the index where the app's calls begin in the flattened array of calls (0 = entrypoint/root, 1..N = fee calls, N+1 = app).
- `contextualizeError(err: Error, ...context: string[]) => Error`
- `static create<T extends NodeEmbeddedWallet>(this: (pxe: PXE, aztecNode: AztecNode, walletDB: WalletDB, accountContracts: AccountContractsProvider, log?: Logger) => T, nodeOrUrl: string | AztecNode, options: EmbeddedWalletOptions) => Promise<T>`
- `createAccountInternal(type: "schnorr" | "ecdsasecp256r1" | "ecdsasecp256k1", secret: Fr, salt: Fr, signingKey: Buffer) => Promise<AccountManager>`
- `createAndStoreAccount(alias: string, type: "schnorr" | "ecdsasecp256r1" | "ecdsasecp256k1", secret: Fr, salt: Fr, signingKey: Buffer) => Promise<AccountManager>`
- `createAuthWit(from: AztecAddress, messageHashOrIntent: IntentInnerHash | CallIntent) => Promise<AuthWitness>`
- `createECDSAKAccount(secret: Fr, salt: Fr, signingKey: Buffer, alias?: string) => Promise<AccountManager>`
- `createECDSARAccount(secret: Fr, salt: Fr, signingKey: Buffer, alias?: string) => Promise<AccountManager>`
- `createSchnorrAccount(secret: Fr, salt: Fr, signingKey?: Fq, alias?: string) => Promise<AccountManager>`
- `createTxExecutionRequestFromPayloadAndFee(executionPayload: ExecutionPayload, from: AztecAddress | "NO_FROM", feeOptions: FeeOptions) => Promise<TxExecutionRequest>`
- `executeUtility(call: FunctionCall, opts: ExecuteUtilityOptions) => Promise<UtilityExecutionResult>`
- `getAccountFromAddress(address: AztecAddress) => Promise<Account>`
- `getAccounts() => Promise<Aliased<AztecAddress>[]>`
- `getAddressBook() => Promise<Aliased<AztecAddress>[]>` - Returns the list of aliased contacts associated with the wallet. This base implementation directly returns PXE's senders, but note that in general contacts are a superset of senders. - Senders: Addresses we check during synching in case they sent us notes, - Contacts: more general concept akin to a phone's contact list.
- `getChainInfo() => Promise<ChainInfo>`
- `getContractClassMetadata(id: Fr) => Promise<{ isArtifactRegistered: boolean; isContractClassPubliclyRegistered: boolean }>`
- `getContractMetadata(address: AztecAddress) => Promise<{ initializationStatus: ContractInitializationStatus; instance: ContractInstanceWithAddress | undefined; ... }>` - Returns metadata about a contract, including whether it has been initialized, published, and updated.
- `getContractName(address: AztecAddress) => Promise<string | undefined>` - Resolves a contract address to a human-readable name via PXE, if available.
- `getPrivateEvents<T>(eventDef: EventMetadataDefinition, eventFilter: PrivateEventFilter) => Promise<PrivateEvent<T>[]>`
- `profileTx(executionPayload: ExecutionPayload, opts: ProfileOptions) => Promise<TxProfileResult>`
- `registerContract(instance: ContractInstanceWithAddress, artifact?: ContractArtifact, secretKey?: Fr) => Promise<ContractInstanceWithAddress>`
- `registerSender(address: AztecAddress, alias: string) => Promise<AztecAddress>`
- `requestCapabilities(_manifest: AppCapabilities) => Promise<WalletCapabilities>` - Request capabilities from the wallet. This method is wallet-implementation-dependent and must be provided by classes extending BaseWallet. Embedded wallets typically don't support capability-based authorization (no user authorization flow), while external wallets (browser extensions, hardware wallets) implement this to reduce authorization friction by allowing apps to request permissions upfront. Consider making it abstract so implementing it is a conscious decision. Leaving it as-is while the feature stabilizes.
- `scopesFrom(from: AztecAddress | "NO_FROM", additionalScopes?: AztecAddress[]) => AztecAddress[]`
- `sendTx<W extends InteractionWaitOptions>(executionPayload: ExecutionPayload, opts: SendOptions<W>) => Promise<SendReturn<W>>` - Overrides the base sendTx to add a pre-simulation step before the actual send. The simulation estimates actual gas usage and captures call authorization requests to generate the necessary authwitnesses.
- `setEstimatedGasPadding(value?: number) => void`
- `setMinFeePadding(value?: number) => void`
- `simulateTx(executionPayload: ExecutionPayload, opts: SimulateOptions) => Promise<TxSimulationResultWithAppOffset>` - Simulates a transaction, optimizing leading public static calls by running them directly on the node while sending the remaining calls through the standard PXE path. Return values from both paths are merged back in original call order.
- `simulateViaEntrypoint(executionPayload: ExecutionPayload, opts: SimulateViaEntrypointOptions) => Promise<TxSimulationResultWithAppOffset>` - Simulates calls via a stub account entrypoint, bypassing real account authorization. This allows kernelless simulation with contract overrides, skipping expensive private kernel circuit execution.
- `stop() => Promise<void>`

### WalletDB

**Constructor**
```typescript
new WalletDB(store: AztecAsyncKVStore, userLog: LogFn)
```

**Methods**
- `close() => Promise<void>`
- `deleteAccount(address: AztecAddress) => Promise<void>`
- `listAccounts() => Promise<Aliased<AztecAddress>[]>`
- `listSenders() => Promise<Aliased<AztecAddress>[]>`
- `retrieveAccount(address: string | AztecAddress) => Promise<{ address: string | AztecAddress; salt: Fr; ... }>`
- `storeAccount(address: AztecAddress, __namedParameters: { alias: string | undefined; salt: Fr; ... }, log: LogFn) => Promise<void>`
- `storeSender(address: AztecAddress, alias: string, log: LogFn) => Promise<void>`

## Functions

### deployFundedSchnorrAccounts
```typescript
function deployFundedSchnorrAccounts(wallet: WalletWithSchnorrAccounts, accountsData: InitialAccountData[], waitOptions?: WaitOpts) => Promise<AccountManager[]>
```

### registerInitialLocalNetworkAccountsInWallet
```typescript
function registerInitialLocalNetworkAccountsInWallet(wallet: WalletWithSchnorrAccounts) => Promise<AztecAddress[]>
```

## Types

### AccountType
```typescript
type AccountType = typeof AccountTypes[number]
```

### EmbeddedWalletOptions
```typescript
type EmbeddedWalletOptions = unknown
```

### EmbeddedWalletPXEOptions
```typescript
type EmbeddedWalletPXEOptions = Partial<PXEConfig> & PXECreationOptions
```
Options for the PXE instance created by the EmbeddedWallet.

## Cross-Package References

This package references types from other Aztec packages:

**@aztec/accounts**
- `InitialAccountData`

**@aztec/aztec.js**
- `Account`, `AccountManager`, `Aliased`, `AppCapabilities`, `BatchResults`, `BatchedMethod`, `CallIntent`, `ContractInitializationStatus`, `ExecuteUtilityOptions`, `IntentInnerHash`, `InteractionWaitOptions`, `PrivateEvent`, `PrivateEventFilter`, `ProfileOptions`, `SendOptions`, `SendReturn`, `SimulateOptions`, `TxSimulationResultWithAppOffset`, `WaitOpts`, `WalletCapabilities`

**@aztec/entrypoints**
- `ChainInfo`

**@aztec/foundation**
- `Fq`, `Fr`, `LogFn`, `Logger`

**@aztec/kv-store**
- `AztecAsyncKVStore`

**@aztec/pxe**
- `PXE`, `PXEConfig`, `PXECreationOptions`

**@aztec/stdlib**
- `AuthWitness`, `AztecAddress`, `AztecNode`, `ContractArtifact`, `ContractInstanceWithAddress`, `ContractOverrides`, `EventMetadataDefinition`, `ExecutionPayload`, `FunctionCall`, `TxExecutionRequest`, `TxProfileResult`, `UtilityExecutionResult`

**@aztec/wallet-sdk**
- `CompleteFeeOptionsConfig`, `FeeOptions`, `SimulateViaEntrypointOptions`
