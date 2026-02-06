# @aztec/test-wallet

Version: v4.0.0-nightly.20260205

## Quick Import Reference

```typescript
import {
  ProvenTx,
  TestWallet,
  deployFundedSchnorrAccounts,
  proveInteraction,
  registerInitialLocalNetworkAccountsInWallet,
  // ... and more
} from '@aztec/test-wallet';
```

## Classes

### ProvenTx

A proven transaction that can be sent to the network. Returned by the `prove` method of the test wallet

Extends: `Tx`

**Constructor**
```typescript
new ProvenTx(node: AztecNode, tx: Tx, offchainEffects: OffchainEffect[], stats?: ProvingStats)
```

**Properties**
- `readonly chonkProof: ChonkProof` - Proof from the private kernel circuit.
- `readonly contractClassLogFields: ContractClassLogFields[]` - Contract class log fields emitted from the tx. Their order should match the order of the log hashes returned from `this.data.getNonEmptyContractClassLogsHashes`. This claimed data is reconciled against a hash of this data (that is contained within the tx's public inputs (`this.data`)), in data_validator.ts.
- `readonly data: PrivateKernelTailCircuitPublicInputs` - Output of the private kernel circuit for this tx.
- `offchainEffects: OffchainEffect[]` - The offchain effects emitted during the execution of the transaction.
- `static p2pTopic: TopicType` - The p2p topic identifier, this determines how the message is handled
- `readonly publicFunctionCalldata: HashedValues[]` - An array of calldata for the enqueued public function calls and the teardown function call. This claimed data is reconciled against hashes of this data (that are contained within the tx's public inputs (`this.data`)), in data_validator.ts.
- `static schema: unknown`
- `stats?: ProvingStats`
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
- `send(options?: Omit<ProvenTxSendOpts, "wait">) => Promise<TxReceipt>` - Sends the transaction to the network.
- `toBuffer() => Buffer<ArrayBufferLike>` - Serializes the Tx object into a Buffer.
- `toMessage() => Buffer`
- `validateTxHash() => Promise<boolean>` - Validates that the tx hash matches the computed hash from the tx data. This should be called when deserializing a tx from an untrusted source.

### TestWallet

A TestWallet implementation to be used in server settings (e.g. e2e tests). Note that the only difference from `lazy` and `bundle` test wallets is that it uses the `createPXE` function from the `pxe/server` package.

Extends: `BaseTestWallet`

**Constructor**
```typescript
new TestWallet(pxe: PXE, aztecNode: AztecNode)
```

**Properties**
- `accounts: Map<string, Account>`
- `readonly aztecNode: AztecNode`
- `cancellableTransactions: boolean`
- `log: Logger`
- `minFeePadding: number`
- `readonly pxe: PXE`

**Methods**
- `batch<T extends readonly BatchedMethod[]>(methods: T) => Promise<BatchResults<T>>`
- `completeFeeOptions(from: AztecAddress, feePayer?: AztecAddress, gasSettings?: Partial<FieldsOf<GasSettings>>) => Promise<FeeOptions>` - Completes partial user-provided fee options with wallet defaults.
- `completeFeeOptionsForEstimation(from: AztecAddress, feePayer?: AztecAddress, gasSettings?: Partial<FieldsOf<GasSettings>>) => Promise<{ accountFeePaymentMethodOptions: AccountFeePaymentMethodOptions; gasSettings: GasSettings; walletFeePaymentMethod?: FeePaymentMethod }>` - Completes partial user-provided fee options with unreasonably high gas limits for gas estimation. Uses the same logic as completeFeeOptions but sets high limits to avoid running out of gas during estimation.
- `contextualizeError(err: Error, ...context: string[]) => Error`
- `static create(node: AztecNode, overridePXEConfig?: Partial<PXEConfig>, options: PXECreationOptions) => Promise<TestWallet>`
- `createAccount(accountData?: AccountData) => Promise<AccountManager>` - Creates a new account with the provided account data or generates random values and uses SchnorrAccountContract if not provided.
- `createAuthWit(from: AztecAddress, intent: IntentInnerHash | CallIntent | ContractFunctionInteractionCallIntent) => Promise<AuthWitness>` - Creates and returns an authwit according the the rules of the provided account. This authwit can be verified by the account contract
- `createECDSAKAccount(secret: Fr, salt: Fr, signingKey: Buffer) => Promise<AccountManager>`
- `createECDSARAccount(secret: Fr, salt: Fr, signingKey: Buffer) => Promise<AccountManager>`
- `createSchnorrAccount(secret: Fr, salt: Fr, signingKey?: Fq) => Promise<AccountManager>`
- `createTxExecutionRequestFromPayloadAndFee(executionPayload: ExecutionPayload, from: AztecAddress, feeOptions: FeeOptions) => Promise<TxExecutionRequest>`
- `disableSimulatedSimulations() => void` - Disable the "simulated simulation" path for simulateTx.
- `enableSimulatedSimulations() => void` - Enable the "simulated simulation" path for simulateTx.
- `getAccountFromAddress(address: AztecAddress) => Promise<Account>`
- `getAccounts() => Promise<{ alias: string; item: AztecAddress }[]>`
- `getAddressBook() => Promise<Aliased<AztecAddress>[]>` - Returns the list of aliased contacts associated with the wallet. This base implementation directly returns PXE's senders, but note that in general contacts are a superset of senders. - Senders: Addresses we check during synching in case they sent us notes, - Contacts: more general concept akin to a phone's contact list.
- `getChainInfo() => Promise<ChainInfo>`
- `getContractClassMetadata(id: Fr) => Promise<{ isArtifactRegistered: boolean; isContractClassPubliclyRegistered: boolean }>`
- `getContractMetadata(address: AztecAddress) => Promise<{ instance: ContractInstanceWithAddress | undefined; isContractInitialized: boolean; ... }>`
- `getFakeAccountDataFor(address: AztecAddress) => Promise<{ account: BaseAccount; artifact: ContractArtifact; instance: ContractInstanceWithAddress }>` - Creates a stub account that impersonates the given address, allowing kernelless simulations to bypass the account's authorization mechanisms via contract overrides.
- `getNotes(filter: NotesFilter) => Promise<NoteDao[]>` - A debugging utility to get notes based on the provided filter. Note that this should not be used in production code because the structure of notes is considered to be an implementation detail of contracts. This is only meant to be used for debugging purposes. If you need to obtain note-related information in production code, please implement a custom utility function on your contract and call that function instead (e.g. `get_balance(owner: AztecAddress) -> u128` utility function on a Token contract).
- `getPrivateEvents<T>(eventDef: EventMetadataDefinition, eventFilter: PrivateEventFilter) => Promise<PrivateEvent<T>[]>`
- `getSyncedBlockHeader() => Promise<BlockHeader>` - Returns the block header up to which the wallet has synced.
- `getTxReceipt(txHash: TxHash) => Promise<TxReceipt>` - Retrieves the transaction receipt for a given transaction hash. This is a passthrough to the underlying node, provided for convenience in testing.
- `lookupValidity(onBehalfOf: AztecAddress, intent: IntentInnerHash | CallIntent | ContractFunctionInteractionCallIntent, witness: AuthWitness) => Promise<{ isValidInPrivate: boolean; isValidInPublic: boolean }>` - Lookup the validity of an authwit in private and public contexts. Uses the chain id and version of the wallet.
- `profileTx(executionPayload: ExecutionPayload, opts: ProfileOptions) => Promise<TxProfileResult>`
- `proveTx(exec: ExecutionPayload, opts: Omit<SendOptions, "wait">) => Promise<ProvenTx>` - A utility to prove a transaction using this wallet and return it to be sent by a different entity on their own accord Note that this should not be used in production code since a proven transaction could be sent to a malicious node to index and track. It also makes it very difficult for the wallet to keep track of the interaction.
- `registerContract(instance: ContractInstanceWithAddress, artifact?: ContractArtifact, secretKey?: Fr) => Promise<ContractInstanceWithAddress>`
- `registerSender(address: AztecAddress, _alias?: string) => Promise<AztecAddress>`
- `requestCapabilities(_manifest: AppCapabilities) => Promise<WalletCapabilities>` - Request capabilities from the wallet. This method is wallet-implementation-dependent and must be provided by classes extending BaseWallet. Embedded wallets typically don't support capability-based authorization (no user authorization flow), while external wallets (browser extensions, hardware wallets) implement this to reduce authorization friction by allowing apps to request permissions upfront. Consider making it abstract so implementing it is a conscious decision. Leaving it as-is while the feature stabilizes.
- `sendTx<W extends InteractionWaitOptions>(executionPayload: ExecutionPayload, opts: SendOptions<W>) => Promise<SendReturn<W>>`
- `setMinFeePadding(value?: number) => void`
- `setPublicAuthWit(from: AztecAddress, messageHashOrIntent: Fr | IntentInnerHash | CallIntent | ContractFunctionInteractionCallIntent, authorized: boolean) => Promise<SetPublicAuthwitContractInteraction>` - Returns an interaction that can be used to set the authorization status of an intent
- `simulateTx(executionPayload: ExecutionPayload, opts: SimulateOptions) => Promise<TxSimulationResult>`
- `simulateUtility(call: FunctionCall, authwits?: AuthWitness[]) => Promise<UtilitySimulationResult>`
- `stop() => Promise<void>` - Stops the internal job queue. This function is typically used when tearing down tests.
- `sync() => Promise<void>` - Triggers a sync of the wallet with the node to update the latest block header. Blocks until the sync is complete.

## Interfaces

### AccountData

Data for generating an account.

**Properties**
- `contract: AccountContract` - Contract that backs the account.
- `salt: Fr` - Contract address salt.
- `secret: Fr` - Secret to derive the keys for the account.

## Functions

### deployFundedSchnorrAccounts
```typescript
function deployFundedSchnorrAccounts(wallet: BaseTestWallet, accountsData: InitialAccountData[], waitOptions?: WaitOpts) => Promise<AccountManager[]>
```
Deploys the SchnorrAccount contracts backed by prefunded addresses at genesis. This can be directly used to pay for transactions in FeeJuice.

### proveInteraction
```typescript
function proveInteraction(wallet: BaseTestWallet, interaction: ContractFunctionInteraction | DeployMethod<ContractBase>, options: SendInteractionOptions | DeployOptions) => Promise<ProvenTx>
```
Helper function to prove an interaction via a TestWallet

### registerInitialLocalNetworkAccountsInWallet
```typescript
function registerInitialLocalNetworkAccountsInWallet(wallet: BaseTestWallet) => Promise<AztecAddress[]>
```
Registers the initial local network accounts in the wallet.

## Cross-Package References

This package references types from other Aztec packages:

**@aztec/accounts**
- `InitialAccountData`

**@aztec/aztec.js**
- `Account`, `AccountContract`, `AccountManager`, `Aliased`, `AppCapabilities`, `BaseAccount`, `BatchResults`, `BatchedMethod`, `CallIntent`, `ContractBase`, `ContractFunctionInteraction`, `ContractFunctionInteractionCallIntent`, `DeployMethod`, `DeployOptions`, `FeePaymentMethod`, `IntentInnerHash`, `InteractionWaitOptions`, `PrivateEvent`, `PrivateEventFilter`, `ProfileOptions`, `SendInteractionOptions`, `SendOptions`, `SendReturn`, `SetPublicAuthwitContractInteraction`, `SimulateOptions`, `WaitOpts`, `WalletCapabilities`

**@aztec/entrypoints**
- `AccountFeePaymentMethodOptions`, `ChainInfo`

**@aztec/foundation**
- `Buffer32`, `BufferReader`, `FieldsOf`, `Fq`, `Fr`, `Logger`

**@aztec/pxe**
- `PXE`, `PXEConfig`, `PXECreationOptions`

**@aztec/stdlib**
- `AuthWitness`, `AztecAddress`, `AztecNode`, `BlockHeader`, `ChonkProof`, `ContractArtifact`, `ContractClassLog`, `ContractClassLogFields`, `ContractInstanceWithAddress`, `EventMetadataDefinition`, `ExecutionPayload`, `FunctionCall`, `GasSettings`, `GetPublicLogsResponse`, `HashedValues`, `L2LogsSource`, `NoteDao`, `NotesFilter`, `OffchainEffect`, `PrivateKernelTailCircuitPublicInputs`, `ProvingStats`, `PublicCallRequestWithCalldata`, `TopicType`, `Tx`, `TxExecutionRequest`, `TxHash`, `TxProfileResult`, `TxReceipt`, `TxSimulationResult`, `TxStats`, `UtilitySimulationResult`

**@aztec/wallet-sdk**
- `FeeOptions`, `T`, `W`
