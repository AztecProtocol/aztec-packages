# @aztec/entrypoints

Version: v3.0.0-devnet.6-patch.1

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
new DefaultAccountEntrypoint(address: AztecAddress, auth: AuthWitnessProvider, chainId?: number, version?: number)
```

**Methods**
- `createTxExecutionRequest(exec: ExecutionPayload, gasSettings: GasSettings, options: DefaultAccountEntrypointOptions) => Promise<TxExecutionRequest>` - Generates an execution request out of set of function calls.

### DefaultEntrypoint

Default implementation of the entrypoint interface. It calls a function on a contract directly
Implements: `EntrypointInterface`

**Constructor**
```typescript
new DefaultEntrypoint(chainId: number, rollupVersion: number)
```

**Methods**
- `createTxExecutionRequest(exec: ExecutionPayload, gasSettings: GasSettings) => Promise<TxExecutionRequest>` - Generates an execution request out of set of function calls.

### DefaultMultiCallEntrypoint

Implementation for an entrypoint interface that can execute multiple function calls in a single transaction
Implements: `EntrypointInterface`

**Constructor**
```typescript
new DefaultMultiCallEntrypoint(chainId: number, version: number, address?: AztecAddress)
```

**Methods**
- `createTxExecutionRequest(exec: ExecutionPayload, gasSettings: GasSettings) => Promise<TxExecutionRequest>` - Generates an execution request out of set of function calls.

### EncodedAppEntrypointCalls

Entrypoints derive their arguments from the calls that they'll ultimate make. This utility class helps in creating the payload for the entrypoint by taking into account how the calls are encoded and hashed.
Implements: `EncodedCalls`

**Constructor**
```typescript
new EncodedAppEntrypointCalls(encodedFunctionCalls: EncodedFunctionCall[], hashedArguments: HashedValues[], generatorIndex: number, tx_nonce: Fr)
```

**Properties**
- `encodedFunctionCalls: EncodedFunctionCall[]` - Function calls in the expected format (Noir's convention)
- `generatorIndex: number`
- `hashedArguments: HashedValues[]` - The hashed args for the call, ready to be injected in the execution cache
- `tx_nonce: Fr`

**Methods**
- `static create(functionCalls: FunctionCall[] | [], txNonce?: Fr) => Promise<EncodedAppEntrypointCalls>` - Encodes the functions for the app-portion of a transaction from a set of function calls and a nonce
- `functionCallsToFields() => Fr[]` - Serializes the function calls to an array of fields.
- `hash() => Promise<Fr>` - Hashes the payload
- `toFields() => Fr[]` - Serializes the payload to an array of fields

## Interfaces

### AuthWitnessProvider

Creates authorization witnesses.

**Methods**
- `createAuthWit(messageHash: Fr | Buffer) => Promise<AuthWitness>` - Computes an authentication witness from either a message hash

### EntrypointInterface

Creates transaction execution requests out of a set of function calls, a fee payment method and general options for the transaction

**Methods**
- `createTxExecutionRequest(exec: ExecutionPayload, gasSettings: GasSettings, options?: any) => Promise<TxExecutionRequest>` - Generates an execution request out of set of function calls.

## Functions

### encode
```typescript
function encode(calls: FunctionCall[]) => Promise<EncodedCalls>
```
Encodes FunctionCalls for execution, following Noir's convention

## Types

### ChainInfo
```typescript
type ChainInfo = { chainId: Fr; version: Fr }
```
Information on the connected chain. Used by wallets when constructing transactions to protect against replay attacks.

### DEFAULT_CHAIN_ID
```typescript
type DEFAULT_CHAIN_ID = 31337
```
Default L1 chain ID to use when constructing txs (matches hardhat and anvil's default).

### DEFAULT_VERSION
```typescript
type DEFAULT_VERSION = 1
```
Default protocol version to use.

### DefaultAccountEntrypointOptions
```typescript
type DefaultAccountEntrypointOptions = { cancellable?: boolean; feePaymentMethodOptions: AccountFeePaymentMethodOptions; txNonce?: Fr }
```
General options for the tx execution.

### EncodedCalls
```typescript
type EncodedCalls = { encodedFunctionCalls: EncodedFunctionCall[]; hashedArguments: HashedValues[] }
```
Type that represents function calls ready to be sent to a circuit for execution

### EncodedFunctionCall
```typescript
type EncodedFunctionCall = { args_hash: Fr; function_selector: Fr; ... }
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
