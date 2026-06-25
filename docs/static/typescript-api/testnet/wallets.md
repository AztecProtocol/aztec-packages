# @aztec/wallets

Version: v5.0.0-rc.1

## Quick Import Reference

```typescript
import {
  BrowserEmbeddedWallet,
  NodeEmbeddedWallet,
  WalletDB,
  createFundedInitializerlessAccounts,
  registerInitialLocalNetworkAccountsInWallet,
  // ... and more
} from '@aztec/wallets';
```

## Classes

### BrowserEmbeddedWallet

Extends: `EmbeddedWallet`

**Constructor**
```typescript
new BrowserEmbeddedWallet(pxe: PXE, aztecNode: AztecNode, walletDB: WalletDB, accountContracts: AccountContractsProvider, log?: any)
```

**Properties**
- `accountContracts: AccountContractsProvider`
- `estimatedGasPadding: number`
- `stubClassIds: Map<"schnorr" | "schnorr_initializerless" | "ecdsasecp256r1" | "ecdsasecp256k1", Fr>`
- `walletDB: WalletDB`

**Methods**
- `buildAccountOverrides(addresses: AztecAddress[]) => Promise<ContractOverrides>` - Builds contract overrides for all provided addresses by replacing their account contracts with stub implementations. Uses a type-specific stub artifact so that the stub's constructor selector matches the real account's constructor.
- `static create<T extends BrowserEmbeddedWallet>(this: (pxe: PXE, aztecNode: AztecNode, walletDB: WalletDB, accountContracts: AccountContractsProvider, log?: any) => T, nodeOrUrl: any, options: EmbeddedWalletOptions) => Promise<T>`
- `createAccountInternal(type: "schnorr" | "schnorr_initializerless" | "ecdsasecp256r1" | "ecdsasecp256k1", secret: Fr, salt: Fr, signingKey: Buffer) => Promise<AccountManager>`
- `createAndStoreAccount(alias: string, type: "schnorr" | "schnorr_initializerless" | "ecdsasecp256r1" | "ecdsasecp256k1", secret: Fr, salt: Fr, signingKey: Buffer) => Promise<AccountManager>`
- `createECDSAKAccount(secret: Fr, salt: Fr, signingKey: Buffer, alias?: string) => Promise<AccountManager>`
- `createECDSARAccount(secret: Fr, salt: Fr, signingKey: Buffer, alias?: string) => Promise<AccountManager>`
- `createSchnorrAccount(secret: Fr, salt: Fr, signingKey?: any, alias?: string) => Promise<AccountManager>`
- `createSchnorrInitializerlessAccount(secret: Fr, salt: Fr, signingKey?: any, alias?: string) => Promise<AccountManager>`
- `executeUtility(call: FunctionCall, opts: ExecuteUtilityOptions) => Promise<UtilityExecutionResult>`
- `getAccountFromAddress(address: AztecAddress) => Promise<Account>`
- `getAccounts() => Promise<Aliased<AztecAddress>[]>`
- `getAddressBook() => Promise<Aliased<AztecAddress>[]>`
- `getPrivateEvents<T>(eventDef: EventMetadataDefinition, eventFilter: PrivateEventFilter) => Promise<PrivateEvent<T>[]>`
- `initStubClasses() => Promise<void>` - Hashes and registers the stub class for every supported account type with PXE, populating stubClassIds. Called on wallet initialization.
- `profileTx(executionPayload: ExecutionPayload, opts: ProfileOptions) => Promise<TxProfileResult>`
- `registerContract(instance: ContractInstanceWithAddress, artifact?: any, secretKey?: any) => Promise<ContractInstanceWithAddress>`
- `registerSender(address: AztecAddress, alias: string) => Promise<any>`
- `sendTx<W extends InteractionWaitOptions>(executionPayload: ExecutionPayload, opts: SendOptions<W>) => Promise<SendReturn<W>>` - Overrides the base sendTx to add a pre-simulation step before the actual send. The simulation estimates actual gas usage and captures call authorization requests to generate the necessary authwitnesses.
- `setEstimatedGasPadding(value?: number) => void`
- `setMinFeePadding(value?: number) => void`
- `simulateTx(executionPayload: ExecutionPayload, opts: SimulateOptions) => Promise<TxSimulationResultWithAppOffset>` - Overrides the base simulateTx to drive PXE syncing explicitly. The PXE created by the embedded wallet has autoSync disabled (so we can share one sync across simulate+send in sendTx); for standalone simulations we still need a fresh anchor block, which we provide here.
- `simulateViaEntrypoint(executionPayload: ExecutionPayload, opts: SimulateViaEntrypointOptions) => Promise<TxSimulationResultWithAppOffset>` - Simulates calls via a stub account entrypoint, bypassing real account authorization. This allows kernelless simulation with contract overrides, skipping expensive private kernel circuit execution.
- `stop() => Promise<void>`

### NodeEmbeddedWallet

Extends: `EmbeddedWallet`

**Constructor**
```typescript
new NodeEmbeddedWallet(pxe: PXE, aztecNode: AztecNode, walletDB: WalletDB, accountContracts: AccountContractsProvider, log?: any)
```

**Properties**
- `accountContracts: AccountContractsProvider`
- `estimatedGasPadding: number`
- `stubClassIds: Map<"schnorr" | "schnorr_initializerless" | "ecdsasecp256r1" | "ecdsasecp256k1", Fr>`
- `walletDB: WalletDB`

**Methods**
- `buildAccountOverrides(addresses: AztecAddress[]) => Promise<ContractOverrides>` - Builds contract overrides for all provided addresses by replacing their account contracts with stub implementations. Uses a type-specific stub artifact so that the stub's constructor selector matches the real account's constructor.
- `static create<T extends NodeEmbeddedWallet>(this: (pxe: PXE, aztecNode: AztecNode, walletDB: WalletDB, accountContracts: AccountContractsProvider, log?: any) => T, nodeOrUrl: any, options: EmbeddedWalletOptions) => Promise<T>`
- `createAccountInternal(type: "schnorr" | "schnorr_initializerless" | "ecdsasecp256r1" | "ecdsasecp256k1", secret: Fr, salt: Fr, signingKey: Buffer) => Promise<AccountManager>`
- `createAndStoreAccount(alias: string, type: "schnorr" | "schnorr_initializerless" | "ecdsasecp256r1" | "ecdsasecp256k1", secret: Fr, salt: Fr, signingKey: Buffer) => Promise<AccountManager>`
- `createECDSAKAccount(secret: Fr, salt: Fr, signingKey: Buffer, alias?: string) => Promise<AccountManager>`
- `createECDSARAccount(secret: Fr, salt: Fr, signingKey: Buffer, alias?: string) => Promise<AccountManager>`
- `createSchnorrAccount(secret: Fr, salt: Fr, signingKey?: any, alias?: string) => Promise<AccountManager>`
- `createSchnorrInitializerlessAccount(secret: Fr, salt: Fr, signingKey?: any, alias?: string) => Promise<AccountManager>`
- `executeUtility(call: FunctionCall, opts: ExecuteUtilityOptions) => Promise<UtilityExecutionResult>`
- `getAccountFromAddress(address: AztecAddress) => Promise<Account>`
- `getAccounts() => Promise<Aliased<AztecAddress>[]>`
- `getAddressBook() => Promise<Aliased<AztecAddress>[]>`
- `getPrivateEvents<T>(eventDef: EventMetadataDefinition, eventFilter: PrivateEventFilter) => Promise<PrivateEvent<T>[]>`
- `initStubClasses() => Promise<void>` - Hashes and registers the stub class for every supported account type with PXE, populating stubClassIds. Called on wallet initialization.
- `profileTx(executionPayload: ExecutionPayload, opts: ProfileOptions) => Promise<TxProfileResult>`
- `registerContract(instance: ContractInstanceWithAddress, artifact?: any, secretKey?: any) => Promise<ContractInstanceWithAddress>`
- `registerSender(address: AztecAddress, alias: string) => Promise<any>`
- `sendTx<W extends InteractionWaitOptions>(executionPayload: ExecutionPayload, opts: SendOptions<W>) => Promise<SendReturn<W>>` - Overrides the base sendTx to add a pre-simulation step before the actual send. The simulation estimates actual gas usage and captures call authorization requests to generate the necessary authwitnesses.
- `setEstimatedGasPadding(value?: number) => void`
- `setMinFeePadding(value?: number) => void`
- `simulateTx(executionPayload: ExecutionPayload, opts: SimulateOptions) => Promise<TxSimulationResultWithAppOffset>` - Overrides the base simulateTx to drive PXE syncing explicitly. The PXE created by the embedded wallet has autoSync disabled (so we can share one sync across simulate+send in sendTx); for standalone simulations we still need a fresh anchor block, which we provide here.
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
- `retrieveAccount(address: any) => Promise<{ address: any; salt: any; ... }>`
- `storeAccount(address: AztecAddress, __namedParameters: { alias: string | undefined; salt: Fr; ... }, log: LogFn) => Promise<void>`
- `storeSender(address: AztecAddress, alias: string, log: LogFn) => Promise<void>`

## Functions

### createFundedInitializerlessAccounts
```typescript
function createFundedInitializerlessAccounts(wallet: WalletWithSchnorrAccounts, accountsData: InitialAccountData[]) => Promise<any[]>
```
Creates the given (genesis-funded) test accounts as initializerless schnorr accounts. Initializerless accounts need no deployment tx — creating one registers the instance and materializes its immutable keys locally — so the accounts are usable as soon as they are created, funded via genesis at their addresses.

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
