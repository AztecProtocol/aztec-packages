# @aztec/entrypoints

Version: 5.1.0

## Quick Import Reference

```typescript
import {
  DefaultAccountEntrypoint,
  DefaultEntrypoint,
  DefaultMultiCallEntrypoint,
  EncodedAppEntrypointCalls,
  encode,
  // ... and more
} from '@aztec/entrypoints';
```

## Classes

### DefaultAccountEntrypoint

Implementation for an entrypoint interface that follows the default entrypoint signature for an account, which accepts an AppPayload and a FeePayload as defined in noir-libs/aztec-noir/src/entrypoint module
Implements: `EntrypointInterface`

**Constructor**
```typescript
new DefaultAccountEntrypoint(address: AztecAddress, auth: AuthWitnessProvider)
```

**Methods**
- `createTxExecutionRequest(exec: ExecutionPayload, gasSettings: GasSettings, chainInfo: ChainInfo, options: DefaultAccountEntrypointOptions) => Promise<TxExecutionRequest>` - Generates an execution request out of set of function calls.
- `wrapExecutionPayload(exec: ExecutionPayload, chainInfo: ChainInfo, options: DefaultAccountEntrypointOptions) => Promise<ExecutionPayload>` - Wraps an execution payload such that it is executed *via* this entrypoint. This returns an ExecutionPayload with the entrypoint as the caller for the wrapped payload. Useful for account self-funding deployments and batching calls beyond the limit of a single entrypoint call.

### DefaultEntrypoint

Default implementation of the entrypoint interface. It calls a function on a contract directly
Implements: `EntrypointInterface`

**Constructor**
```typescript
new DefaultEntrypoint()
```

**Methods**
- `createTxExecutionRequest(exec: ExecutionPayload, gasSettings: GasSettings, chainInfo: ChainInfo) => Promise<TxExecutionRequest>` - Generates an execution request out of set of function calls.
- `wrapExecutionPayload(exec: ExecutionPayload, _chainInfo: ChainInfo, _options?: any) => Promise<ExecutionPayload>` - Wraps an execution payload such that it is executed *via* this entrypoint. This returns an ExecutionPayload with the entrypoint as the caller for the wrapped payload. Useful for account self-funding deployments and batching calls beyond the limit of a single entrypoint call.

### DefaultMultiCallEntrypoint

Implementation for an entrypoint interface that can execute multiple function calls in a single transaction
Implements: `EntrypointInterface`

**Constructor**
```typescript
new DefaultMultiCallEntrypoint(address: AztecAddress)
```

**Methods**
- `createTxExecutionRequest(exec: ExecutionPayload, gasSettings: GasSettings, chainInfo: ChainInfo) => Promise<TxExecutionRequest>` - Generates an execution request out of set of function calls.
- `wrapExecutionPayload(exec: ExecutionPayload, _chainInfo: ChainInfo, _options?: any) => Promise<ExecutionPayload>` - Wraps an execution payload such that it is executed *via* this entrypoint. This returns an ExecutionPayload with the entrypoint as the caller for the wrapped payload. Useful for account self-funding deployments and batching calls beyond the limit of a single entrypoint call.

### EncodedAppEntrypointCalls

Entrypoints derive their arguments from the calls that they'll ultimate make. This utility class helps in creating the payload for the entrypoint by taking into account how the calls are encoded and hashed.
Implements: `EncodedCalls`

**Constructor**
```typescript
new EncodedAppEntrypointCalls(encodedFunctionCalls: EncodedFunctionCall[], hashedArguments: HashedValues[], domainSeparator: number, tx_nonce: Fr)
```

**Properties**
- `domainSeparator: number` - The index of the generator to use for hashing
- `encodedFunctionCalls: EncodedFunctionCall[]` - Function calls in the expected format (Noir's convention)
- `hashedArguments: HashedValues[]` - The hashed args for the call, ready to be injected in the execution cache
- `tx_nonce: Fr` - A nonce to inject into the payload of the transaction. When used with cancellable=true, this nonce will be used to compute a nullifier that allows cancelling this transaction by submitting a new one with the same nonce but higher fee. The nullifier ensures only one transaction can succeed.

**Methods**
- `static create(functionCalls: FunctionCall[] | [], txNonce: Fr) => Promise<EncodedAppEntrypointCalls>` - Encodes the functions for the app-portion of a transaction from a set of function calls and a nonce
- `functionCallsToFields() => Fr[]` - Serializes the function calls to an array of fields.
- `hash() => Promise<Fr>` - Hashes the payload
- `toFields() => Fr[]` - Serializes the payload to an array of fields

## Interfaces

### AuthWitnessProvider

Creates authorization witnesses.

**Methods**
- `createAuthWit(messageHash: Fr | Buffer<ArrayBufferLike>) => Promise<AuthWitness>` - Computes an authentication witness from either a message hash

### EntrypointInterface

Creates transaction execution requests out of a set of function calls, a fee payment method and general options for the transaction

**Methods**
- `createTxExecutionRequest(exec: ExecutionPayload, gasSettings: GasSettings, chainInfo: ChainInfo, options?: any) => Promise<TxExecutionRequest>` - Generates an execution request out of set of function calls.
- `wrapExecutionPayload(exec: ExecutionPayload, chainInfo: ChainInfo, options?: any) => Promise<ExecutionPayload>` - Wraps an execution payload such that it is executed *via* this entrypoint. This returns an ExecutionPayload with the entrypoint as the caller for the wrapped payload. Useful for account self-funding deployments and batching calls beyond the limit of a single entrypoint call.

## Functions

### encode
```typescript
function encode(calls: FunctionCall[]) => Promise<EncodedCalls>
```
Encodes FunctionCalls for execution, following Noir's convention

## Types

### APP_MAX_CALLS
```typescript
type APP_MAX_CALLS = 5
```

### ChainInfo
```typescript
type ChainInfo = unknown
```
Information on the connected chain. Used by wallets when constructing transactions to protect against replay attacks.

### DefaultAccountEntrypointOptions
```typescript
type DefaultAccountEntrypointOptions = unknown
```
General options for the tx execution.

### EncodedCalls
```typescript
type EncodedCalls = unknown
```
Type that represents function calls ready to be sent to a circuit for execution

### EncodedFunctionCall
```typescript
type EncodedFunctionCall = unknown
```
Encoded function call for an Aztec entrypoint

## Enums

### AccountFeePaymentMethodOptions
The mechanism via which an account contract will pay for a transaction in which it gets invoked.

Values: `0`, `2`, `1`

## Cross-Package References

This package references types from other Aztec packages:

**@aztec/foundation**
- `Fr`

**@aztec/stdlib**
- `AuthWitness`, `AztecAddress`, `ExecutionPayload`, `FunctionCall`, `GasSettings`, `HashedValues`, `TxExecutionRequest`
