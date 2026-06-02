# zkWASM Backend

zkWASM (DelphinusLab) backend for the Aztec zkVM exploration. Compiles guest
kernel logic to WebAssembly and proves execution inside zkWASM's halo2-based
ZKSNARK circuits.

## Directory Layout

```
zkwasm/
  guest/          -- Rust guest crate, compiles to wasm32-unknown-unknown
  prover/         -- DelphinusLab/zkWasm clone (halo2 prover + CLI)
```

## Prerequisites

- Rust toolchain with `wasm32-unknown-unknown` target:
  ```
  rustup target add wasm32-unknown-unknown
  ```
- `clang` and `lld` (required by zkWASM's halo2 build)
- `wasm-opt` (optional, from binaryen -- reduces WASM size):
  ```
  cargo install wasm-opt
  ```

## Step 1: Build the Prover CLI

```bash
cd prover
cargo build --release
```

The binary is produced at `prover/target/release/zkwasm-cli`.

> **Note:** The upstream README references `delphinus-cli` but this build
> produces `zkwasm-cli`. They are the same binary.

## Step 2: Build the Guest WASM Module

```bash
cd guest
cargo build --target wasm32-unknown-unknown --release
```

Output: `guest/target/wasm32-unknown-unknown/release/zkwasm_guest.wasm` (~165 KB).

### Optional: Optimize with wasm-opt

```bash
wasm-opt -Oz \
  -o guest/target/wasm32-unknown-unknown/release/zkwasm_guest_opt.wasm \
  guest/target/wasm32-unknown-unknown/release/zkwasm_guest.wasm
```

## Step 3: Setup (Key Generation)

Creates the proving/verification keys and circuit params for the WASM image.

```bash
ZKWASM=./prover/target/release/zkwasm-cli
WASM=./guest/target/wasm32-unknown-unknown/release/zkwasm_guest.wasm
PARAMS_DIR=./params
NAME=aztec-kernel

mkdir -p $PARAMS_DIR

$ZKWASM --params $PARAMS_DIR $NAME setup --wasm $WASM -k 18
```

CLI flags for setup:
| Flag | Default | Description |
|------|---------|-------------|
| `-k <K>` | 22 | Circuit size (2^K rows). Range: 18..22. Lower = faster but may overflow. |
| `--host <MODE>` | default | Host environment: `default` or `standard` (more ZK plugins). |
| `--scheme <SCHEME>` | shplonk | Polynomial commitment: `shplonk` or `gwc`. |
| `--phantom <FNS>` | none | Comma-separated phantom function names (bodies ignored in circuit). |

Setup writes a config file and circuit data into `$PARAMS_DIR`.

## Step 4: Dry Run (Optional)

Execute the WASM without generating a proof to check correctness:

```bash
mkdir -p ./output

$ZKWASM --params $PARAMS_DIR $NAME dry-run \
  --wasm $WASM \
  --output ./output \
  --public 0:i64
```

## Step 5: Prove

Generate a proof. The `--public` flag supplies the workload ID to `wasm_input(0)`.

```bash
$ZKWASM --params $PARAMS_DIR $NAME prove \
  --wasm $WASM \
  --output ./output \
  --public 0:i64
```

Workload IDs (passed as public input):
| ID | Workload |
|----|----------|
| 0 | Minimal |
| 1 | TokenTransfer |
| 2 | PrivateSwap |
| 3 | Heavy |
| 4 | KernelHeavy |

Start with `0:i64` (Minimal) for the smallest trace.

### Prove flags

| Flag | Description |
|------|-------------|
| `--public <V:T>` | Public input. Format: `value:type` where type = `i64`, `bytes`, `bytes-packed`. |
| `--private <V:T>` | Private (witness) input. Same format. |
| `-m` / `--mock` | Run mock test before proving (useful for debugging constraint failures). |
| `--file` | Use file-backed tables for large traces (slower but lower memory). |

## Step 6: Verify

```bash
$ZKWASM --params $PARAMS_DIR $NAME verify --output ./output
```

## Guest Architecture

The guest entry point is `zkmain()` (exported via `#[wasm_bindgen]`):

1. Reads a workload ID from public input via `zkwasm_rust_sdk::wasm_input(0)`.
2. Dispatches to the corresponding test workload from `zkvm-test-contracts`.
3. Runs the kernel assembly pipeline (`run_workload_end_to_end`).
4. Outputs serialized KPI length via `zkwasm_rust_sdk::wasm_output()`.

Dependencies:
- `zkwasm-rust-sdk` -- DelphinusLab's guest SDK (wasm_input/wasm_output intrinsics)
- `zkvm-kernel-logic` -- shared kernel verify & assemble logic
- `zkvm-data-types` -- shared types
- `zkvm-test-contracts` -- workload generators

## Troubleshooting

**"constraint not satisfied" / mock test failure:**
The circuit size `-k` may be too small for the workload. Try `-k 20` or `-k 22`.
Setup must be re-run when changing `-k`.

**OOM during proving:**
Use `--file` flag to enable file-backed trace tables, or increase available RAM.
k=22 requires ~16 GB+ RAM.

**Missing `clang`/`lld`:**
Install via `apt install clang lld` (Ubuntu) or `brew install llvm` (macOS).

## Known issue: bulk memory extension not supported

zkWASM does not support the WebAssembly bulk memory extension (opcode 0xFC).
Modern Rust compilers (1.82+) emit `memory.copy` and `memory.fill` instructions
by default when targeting wasm32. Our guest has 123 `memory.copy` instructions.

Stripping these with `wasm-opt --disable-bulk-memory` or `RUSTFLAGS="-C
target-feature=-bulk-memory"` does NOT work — they come from LLVM's core
library routines (memcpy/memset), not from Rust target features.

Replacing them with loop-based alternatives would massively inflate the
instruction count and make proving much less efficient.

**Status**: zkWASM cannot prove our guest in its current form. Options:
1. Wait for zkWASM to add bulk memory support
2. Use a different WASM-native zkVM
3. Use an older Rust toolchain (pre-1.82) that doesn't emit bulk memory ops
