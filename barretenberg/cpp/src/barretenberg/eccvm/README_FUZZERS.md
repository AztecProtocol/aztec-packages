# ECCVM Fuzzer

`eccvm.fuzzer.cpp` builds an `ECCOpQueue` from random input, constructs an `ECCVMCircuitBuilder` from it, and checks the trace with `ECCVMTraceChecker::check`. It does not construct a proof.

## Input format

The input is a sequence of 67-byte `FuzzerTuple`s. The number of operations is `Size / sizeof(FuzzerTuple)`; shorter inputs are ignored.

```cpp
enum class OpType : uint8_t { ADD = 0, MUL = 1, EQ_AND_RESET = 2, MERGE = 3, EMPTY_ROW = 4, MAX_OP = 5 };

struct FieldVMDataChunk { std::array<uint8_t, 64> data; }; // input for FieldVM scalar computation
struct SingleOp { OpType op_type; uint8_t generator_index; uint8_t scalar_index; };
struct FuzzerTuple { FieldVMDataChunk fieldvm_data; SingleOp operation; };
```

The fuzzer prepares its inputs as follows:

1. It runs a `FieldVM` over the concatenated 64-byte chunks, with at most 65536 steps. Inversion, square root, batch inversion, power and division are disabled. The 32 elements of the FieldVM state are the candidate scalars.
2. It builds 4 points. Each point is a linear combination of 4 derived base generators, with the first 16 candidate scalars as coefficients.
3. It appends a hiding op whose `Px`, `Py` are the first two candidate scalars (not curve points).

Each `SingleOp` then runs one operation:

| `op_type` | Effect |
| --- | --- |
| `ADD` | `add_accumulate` of the selected point |
| `MUL` | `mul_accumulate` of the selected point by candidate scalar `scalar_index % 32` |
| `EQ_AND_RESET` | `eq_and_reset()` |
| `MERGE` | `eq_and_reset()`, then `merge()` |
| `EMPTY_ROW` | `empty_row_for_testing()` |
| other | no operation |

For `ADD` and `MUL`, the low 7 bits of `generator_index` select one of the 4 points (`(generator_index & 0x7F) % 4`), and the top bit negates it.

After the last tuple, the fuzzer always appends `eq_and_reset()` and `merge()`.

If the check fails, the fuzzer prints the operation sequence and stops at `assert(result == true)`. There is no exception handling.

## Effects of the `FUZZING` macro

The `fuzzing` preset defines `FUZZING`. It changes two things:

- `ECCVMTraceChecker::check` takes a third argument, `disable_fixed_dyadic_trace_size`. The fuzzer passes `true`, so the trace is not padded to the fixed ECCVM size.
- The trace checker skips rows where `Relation::skip` returns true, as sumcheck does. Without `FUZZING` it evaluates every relation on every row. The trace checker runs six relations through this path (Transcript, PointTable, Wnaf, MSM, Set, Bools); of these only `ECCVMSetRelation` has `skip`. It evaluates `ECCVMLookupRelation` separately, on every row.

The production sumcheck prover uses `skip` in every build.

## Build and run

From `barretenberg/cpp`:

```bash
cmake --preset fuzzing && cmake --build build-fuzzing --target eccvm_eccvm_fuzzer
mkdir -p corpus
timeout --signal=INT 360 ./build-fuzzing/bin/eccvm_eccvm_fuzzer -max_total_time=300 -workers=1 -jobs=1 corpus/
```

See the [Barretenberg fuzzing guide](../../../docs/Fuzzing.md) for corpus, crash and coverage options, and [the ECCVM README](README.md) for the circuit.
