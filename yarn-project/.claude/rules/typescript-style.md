# TypeScript Code Style

## Type Safety

- Avoid `as Type` casts; prefer type guards
- Never use `as any`; if a subclass need access to private members, change the visibility to `protected` instead of doing `this as any`
- Use branded types for common domain types (`SlotNumber`, `BlockNumber`, `EpochNumber`, etc.)
- Type guard functions follow `is<TypeName>` naming convention:
  ```typescript
  function isRevertCodeEnum(value: number): value is RevertCodeEnum { ... }
  ```

## Data Structures

**Plain types ("structs")** for simple local data with free functions + schema in same file:
```typescript
// Example: archiver/src/archiver/structs/inbox_message.ts
export type InboxMessage = {
  index: bigint;
  leaf: Fr;
  checkpointNumber: CheckpointNumber;
};

export function serializeInboxMessage(message: InboxMessage): Buffer { ... }
export function deserializeInboxMessage(buffer: Buffer): InboxMessage { ... }
```

**Classes** for richer structs with serialization, factory, and utility methods:
```typescript
// Example: stdlib/src/tx/block_header.ts
export class BlockHeader {
  constructor(public readonly lastArchive: AppendOnlyTreeSnapshot, ...) {}

  static get schema(): ZodFor<BlockHeader> { ... }
  static from(fields: FieldsOf<BlockHeader>) { ... }
  static fromBuffer(buffer: Buffer): BlockHeader { ... }
  static empty(): BlockHeader { ... }
  static random(): BlockHeader { ... }

  toBuffer(): Buffer { ... }
  hash(): Promise<Fr> { ... }
}
```

Avoid classes with only static methods; use free functions instead.

## Factory Patterns

For classes, use these static factory methods:
- `from(FieldsOf<T>)` - synchronous construction from plain object
- `create()` - async construction when validation is needed
- `fromBuffer()` / `fromString()` - deserialization
- `empty()` / `random()` - testing helpers

## Schema Patterns (Zod)

Use Zod for validating untrusted input. For classes, define a static schema getter:

```typescript
static get schema(): ZodFor<BlockHeader> {
  return z
    .object({
      lastArchive: AppendOnlyTreeSnapshot.schema,
      state: StateReference.schema,
      // ...
    })
    .transform(BlockHeader.from);
}
```

Use `zodFor<T>()` helper for type-safe schema definitions on plain types.

## Interfaces

Use interfaces only when:
- Multiple implementations exist
- Exposing APIs to the outside world
- Need to depend on a type without creating a runtime dependency

## Error Handling

- Custom errors extend `Error` and set `this.name`
- Use error hierarchies with base classes for domains
- Include `public readonly` properties for error context

```typescript
export class SequencerTooSlowError extends Error {
  constructor(
    public readonly proposedState: SequencerState,
    public readonly maxAllowedTime: number,
  ) {
    super(`Too far into slot for ${proposedState}...`);
    this.name = 'SequencerTooSlowError';
  }
}
```

## Class Style

- Be explicit with `private`/`public`/`protected`
- Use `readonly` whenever possible
- Method organization:
  1. Static properties/constants
  2. Instance properties
  3. Constructor
  4. Static factory methods (`from`, `create`, `empty`, `random`)
  5. Lifecycle methods (`start`, `stop`)
  6. Public API methods
  7. Protected methods
  8. Private methods

## JSDoc Comments

Document all classes, types, and interfaces with a JSDoc comment explaining their purpose. Include usage context when relevant (e.g., "Used by the sequencer to track pending transactions").

Document methods and properties unless meaning is obvious from the name. Skip JSDoc for:
- Trivial getters/setters (`get length()`, `set value()`)
- Constructor-injected dependencies (`private readonly db: Database`)
- Standard lifecycle methods (`start`, `stop`)

Interface methods always require JSDoc—interfaces define contracts, and consumers need clear documentation.

Use `@param` and `@returns` only when parameter names or return types don't convey meaning. Prefer descriptive names over annotations.

Keep comments concise. Use single-line format when possible:

```typescript
/** Computes the Merkle root of pending note hashes. */
computeRoot(): Fr { ... }

/** Maximum number of transactions per block. */
private readonly maxTxsPerBlock: number;
```

Multi-line only when explanation requires it:

```typescript
/**
 * Validates a transaction against current world state.
 * Checks nullifier non-existence and note hash membership.
 */
async validate(tx: Tx): Promise<boolean> { ... }
```

Avoid redundant "title" lines that repeat the name being documented:

```typescript
// BAD: Repeats class name as a title
/**
 * CheckpointProposal
 *
 * A checkpoint proposal is created by the leader...
 */
export class CheckpointProposal { ... }

// GOOD: Directly explains purpose
/** Created by the checkpoint leader to collect validator attestations. */
export class CheckpointProposal { ... }
```

## Enums vs Union Types

- **Numeric enums** for protocol constants that serialize to numbers
- **String enums** for status values and event names
- **`as const` arrays** with derived type for string literal unions:
  ```typescript
  const GasDimensions = ['da', 'l2'] as const;
  type GasDimensions = (typeof GasDimensions)[number];
  ```
- **Discriminated unions** with `type` field for variant types

## Optional vs Nullable

- Prefer `undefined` over `null`
- Use `compactArray()` from foundation to filter undefined values

## Resource Management

Prefer `using`/`await using` over `try`/`finally` for cleanup of disposable resources:

```typescript
// Good: using statement ensures cleanup even on exceptions
using fork = await this.worldState.fork(blockNumber);
const result = await processWithFork(fork);
return result;

// Bad: try/finally is more verbose and error-prone
const fork = await this.worldState.fork(blockNumber);
try {
  const result = await processWithFork(fork);
  return result;
} finally {
  await fork.close();
}
```

- Use `using` for `Disposable` resources (implements `[Symbol.dispose](): void`)
- Use `await using` for `AsyncDisposable` resources (implements `[Symbol.asyncDispose](): Promise<void>`)
- When the resource is obtained asynchronously but disposed synchronously, use `using x = await getResource()`

## KV Store Transactions

When working with `AztecAsyncKVStore`, wrap related reads and writes in `store.transactionAsync()` to ensure atomicity:

```typescript
// Good: All reads and writes in a single transaction
public async tryAdd(item: Item): Promise<boolean> {
  return await this.store.transactionAsync(async () => {
    const exists = await this.items.hasAsync(item.id);
    if (exists) {
      return false;
    }
    await this.items.set(item.id, item.toBuffer());
    return true;
  });
}

// Bad: Race condition - reads outside transaction, write inside
public async tryAdd(item: Item): Promise<boolean> {
  const exists = await this.items.hasAsync(item.id);  // Read outside transaction
  if (exists) {
    return false;
  }
  await this.store.transactionAsync(async () => {
    await this.items.set(item.id, item.toBuffer());  // Write inside transaction
  });
  return true;
}
```

Without transactions, concurrent operations can see inconsistent state (e.g., two callers both pass the `exists` check and both write).

## General Style

- Prefer `const` over `let`
- Prefer `async`/`await` over `.then()`/`.catch()` callbacks
- Named exports only (no default exports)
- Explicit return types on public API methods; inferred types acceptable on private/internal methods
- Only export types that are needed by external consumers; keep internal option types private
- Avoid `const self = this`; use arrow functions to preserve `this` context instead

## Collections

- Prefer high-level collection functions (`find`, `filter`, `map`, and other helpers from `foundation/src/collection/`) over imperative loops, but prefer imperative loops over `forEach` and complex `reduce`
- Prefer `sum(items.map(item => item.value))` over `reduce((acc, items) => acc + items.value, 0)` for addition


## Code Duplication

Avoid duplicating logic unless clarity benefits from keeping it inline. When extracting:

- **Same class**: Extract to a `private` helper method
- **Same package, multiple files**: Extract to a free function in a dedicated helper file
- **Complex logic spanning multiple concerns**: Extract to a dedicated class

**For two classes with similar behavior:**
- If public APIs are nearly identical: use **inheritance** (extend a common base class)
- If behavior overlaps but APIs differ: use **composition** (inject shared logic as a dependency)

## Foundation Utilities

- Check `foundation` for existing utilities before reimplementing
- Extract general (non-domain) utilities to `foundation`

## Using `Set`/`Map`

Avoid `Set`/`Map` of non-primitive class instances; this leads to errors with `has()` checks. Use primitive keys (strings, numbers) instead.

## Logging

- Be generous with logging, but not excessive
- Include structured context objects
- Use appropriate log levels: `trace`, `debug`, `verbose`, `info`, `warn`, `error`

```typescript
this.log.info(`Preparing checkpoint ${checkpointNumber}`, {
  slot,
  checkpointNumber,
  proposer,
});
```

## Import Organization

Order imports as follows:
1. External `@aztec/*` packages
2. Foundation utilities (`@aztec/foundation/*`)
3. Protocol-specific packages
4. Node.js built-ins (`node:events`, `node:fs`)
5. Third-party packages (`viem`, `zod`)
6. Relative imports (with `.js` extension)

Use `import type` for type-only imports.

## Event Handling

Use `TypedEventEmitter<TEventMap>` interface for typed events:

```typescript
type SequencerEvents = {
  ['state-changed']: (args: { oldState: SequencerState; newState: SequencerState }) => void;
  ['block-proposed']: (args: { blockNumber: BlockNumber }) => void;
};

export class Sequencer extends (EventEmitter as new () => TypedEventEmitter<SequencerEvents>) {
  // ...
}
```

## Function Arguments

Simplify function arguments to single expressions where possible:

```typescript
// Good: Single expression
mock.getData.mockImplementation((id: string) =>
  Promise.resolve(items.find(item => item.id === id)),
);

// Bad: Unnecessary block with loop
mock.getData.mockImplementation((id: string) => {
  for (const item of items) {
    if (item.id === id) {
      return Promise.resolve(item);
    }
  }
  return Promise.resolve(undefined);
});
```