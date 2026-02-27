---
status: pending
priority: p3
issue_id: "010"
tags: [code-review, quality, documentation]
dependencies: []
---

# Minor Code Quality Fixes

## Problem Statement

Several minor code quality issues were identified that don't affect correctness but should be addressed for consistency with codebase conventions.

## Findings

### 1. Missing JSDoc on `EpochCacheView` and `EpochCacheViewFactory` interfaces

Per the style guide: "Interface methods always require JSDoc." Both new interfaces and all their methods lack documentation. These define public API contracts.

**File**: `epoch-cache/src/epoch_cache.ts:39-51`

### 2. `catch (err: any)` should be `catch (err: unknown)`

Per type safety conventions, `any` should be avoided. Found in:
- `checkpoint_proposal_job.ts:656`
- `checkpoint_proposal_job.ts:911` (`handleHASigningError`)

### 3. `EpochCacheViewImpl` methods lack explicit access modifiers

Per convention: "Be explicit with `private`/`public`/`protected`." All methods on `EpochCacheViewImpl` have no access modifier.

**File**: `epoch-cache/src/epoch_cache.ts:440-470`

### 4. `TestEpochCache` defaults `proposerPipeliningEnabled = true`

Production defaults to `false`. Test defaulting to `true` creates asymmetry that could cause subtle test-vs-production discrepancies.

**File**: `epoch-cache/src/test/test_epoch_cache.ts:40`

### 5. `setProposerPipeliningEnabled` returns void, not `this`

All other setters on `TestEpochCache` return `this` for fluent API. This one returns `void`, breaking the pattern.

**File**: `epoch-cache/src/test/test_epoch_cache.ts:132`

### 6. `isProposerPipeliningEnabled()` not on `EpochCacheInterface`

The method is on the class but not the interface. `EpochCacheViewFactoryImpl` takes the concrete `EpochCache` class instead of the interface because of this. Should either add to interface or pass the boolean directly to the factory.

### 7. Grammar error in log message

`sequencer.ts:397`: `"Preparing checkpoint proposal ${checkpointNumber} at for proposal slot"` -- "at for" is a typo.

### 8. `toBaseSlot` silently clamps negative results to 0

Should throw an error for negative results rather than silently producing incorrect behavior:
```typescript
if (result < 0) {
  throw new Error(`toBaseSlot produced negative slot`);
}
```

### 9. `PipelineConfig` naming inconsistency with filename

Type is `PipelineConfig`, file is `pipelining-config.ts`. Other configs match their filenames.

## Acceptance Criteria

- [ ] JSDoc added to `EpochCacheView` and `EpochCacheViewFactory` interfaces
- [ ] `catch (err: any)` replaced with `catch (err: unknown)` and type guards
- [ ] Explicit access modifiers on `EpochCacheViewImpl` methods
- [ ] `TestEpochCache.proposerPipeliningEnabled` defaults to `false`
- [ ] Grammar fixed in log message
