# TypeScript Code Style

## Type Safety

- Avoid `as Type` casts; prefer type guards
- Never use `as any`
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

## General Style

- Prefer `const` over `let`
- Prefer `async`/`await` over `.then()`/`.catch()` callbacks
- Named exports only (no default exports)
- Explicit return types on public API methods; inferred types acceptable on private/internal methods

## Foundation Utilities

- Check `foundation` for existing utilities before reimplementing
- Extract general (non-domain) utilities to `foundation`

## Collections

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
