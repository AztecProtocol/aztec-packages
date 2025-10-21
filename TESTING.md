# Testing the BB CLI → Msgpack Migration

## Unit Tests Created

### `yarn-project/bb-prover/src/bb/msgpack_api.test.ts`

Comprehensive unit tests for the msgpack buffer conversion logic that enables in-memory proof operations.

**Test Coverage:**

1. **`toMsgpackProof` format conversion**
   - Verifies correct splitting of Aztec `Proof` buffer into:
     - Public inputs (first N * 32 bytes)
     - Proof fields (remaining bytes)
   - Validates 32-byte field alignment
   - Tests array chunking logic

2. **`fromMsgpackProof` format conversion**
   - Verifies reconstruction of Aztec `RecursiveProof` from field arrays
   - Tests Buffer → Fr conversions
   - Validates proof length matching

3. **Round-trip conversion**
   - Ensures data preservation through full to/from cycle
   - Verifies buffer equality after conversion
   - Tests with various proof sizes

**What These Tests Validate:**
- Core buffer manipulation correctness
- Msgpack format compatibility
- No data loss during conversions
- Proper field element handling

## Running Tests

### Prerequisites

Install dependencies from git root:

```bash
cd $(git rev-parse --show-toplevel)
./bootstrap.sh
```

This will:
- Install all monorepo dependencies
- Link portal packages (noir, bb.js, etc.)
- Build required dependencies

### Running Unit Tests

```bash
cd yarn-project/bb-prover
yarn test msgpack_api.test.ts
```

### Running All BB-Prover Tests

```bash
cd yarn-project/bb-prover
yarn test
```

**Note:** The bb-prover package includes integration tests (`avm_proving_tests/`) that:
- Require the full BB binary and ACVM
- Take significant time to run
- Test end-to-end proof generation

## Test Strategy

### Unit Tests (Fast)
- **File:** `msgpack_api.test.ts`
- **Runtime:** < 1 second
- **Coverage:** Buffer conversion logic
- **Dependencies:** Minimal (Fr, Proof classes only)

### Integration Tests (Slow)
- **Files:** `avm_proving_tests/*.test.ts`
- **Runtime:** Minutes per test
- **Coverage:** Full proof generation pipeline
- **Dependencies:** BB binary, ACVM, full circuits

## Validation Without Dependencies

You can verify TypeScript correctness without installing dependencies:

```bash
cd yarn-project/bb-prover
npx tsc --noEmit src/bb/msgpack_api.test.ts
```

Expected: Only dependency resolution errors (missing node_modules), no syntax errors.

## What to Test After Migration

1. **Unit Tests**
   - ✅ Buffer conversion logic (msgpack_api.test.ts)
   - Suggested: Add tests for error cases (invalid proof lengths, etc.)

2. **Integration Tests**
   - All existing AVM proving tests should pass unchanged
   - Tests use public API (`BBNativeRollupProver`) which hasn't changed
   - Internal implementation (CLI → msgpack) is transparent to tests

3. **Performance Tests**
   - Benchmark proof generation time: CLI vs msgpack
   - Expected: 5-10× speedup for I/O-bound operations
   - Measure file I/O count reduction

## Migration Impact on Tests

**No test changes required** because:
- `BBNativeRollupProver` interface unchanged
- All public methods work identically
- Only internal implementation changed (file I/O → msgpack)

Existing tests automatically validate the msgpack implementation.

## Test Execution Log

Once dependencies are installed, running the unit tests should show:

```
PASS src/bb/msgpack_api.test.ts
  BBMsgpackProver buffer conversions
    toMsgpackProof format
      ✓ should split proof into public inputs and proof fields correctly
    fromMsgpackProof format
      ✓ should reconstruct proof from field arrays correctly
      ✓ should convert field buffers to Fr array correctly
    round-trip conversion
      ✓ should preserve proof data through to/from msgpack conversion

Test Suites: 1 passed, 1 total
Tests:       4 passed, 4 total
```

## Recommended Test Workflow

1. **First:** Run unit tests to validate buffer logic
   ```bash
   yarn test msgpack_api.test.ts
   ```

2. **Then:** Run a single AVM integration test
   ```bash
   yarn test avm_minimal_proving.test.ts
   ```

3. **Finally:** Run full test suite
   ```bash
   yarn test
   ```

## CI/CD Considerations

- Unit tests should run on every commit (fast feedback)
- Integration tests can run on PR/merge (slower but comprehensive)
- Consider adding performance regression tests for I/O metrics
