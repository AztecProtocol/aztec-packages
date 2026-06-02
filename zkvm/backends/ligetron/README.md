# Ligetron Backend

Ligetron (Ligero Inc.) — WASM-native zkVM with Ligero proof system. Proves
WASM execution directly with per-opcode constraint generation. Has native
BN254 Poseidon2, ECDSA, EdDSA host functions that generate optimized
constraints.

## Benchmark Results

107 Poseidon2 hashes over BN254 (matching private_swap workload hash count):

| Metric | Value |
|--------|-------|
| Linear constraints | 91,262 |
| Quadratic constraints | 71,064 |
| Proving time (software Vulkan) | **~2.7s** |
| Peak memory | **247 MB** |
| Proof valid | true |

For comparison: Cairo/Stwo 11.5s/3GB, SP1 45s/17GB, RISC Zero 40s/9.4GB.

## Prerequisites

Ubuntu 24.04. All commands below assume you're on a fresh system.

### 1. System packages

```bash
sudo apt-get update
sudo apt-get install -y \
  g++-13 cmake libgmp-dev libboost-all-dev libssl-dev zlib1g-dev libtbb-dev \
  libx11-dev libxrandr-dev libxinerama-dev libxcursor-dev libxi-dev libx11-xcb-dev \
  mesa-common-dev libgl1-mesa-dev mesa-vulkan-drivers vulkan-tools libvulkan1
```

### 2. Build WABT v1.0.36 (must be this version — newer versions have API breaks)

```bash
cd /mnt/user-data/mike
git clone --depth 1 --branch 1.0.36 https://github.com/WebAssembly/wabt.git
cd wabt
git submodule update --init
mkdir build && cd build
cmake ..
make -j$(nproc)
sudo make install
```

### 3. Build Dawn (Google's WebGPU implementation)

This is the biggest dependency. Takes ~15 minutes to build.

```bash
cd /mnt/user-data/mike
git clone https://dawn.googlesource.com/dawn
cd dawn
git checkout cec4482eccee45696a7c0019e750c77f101ced04
mkdir release && cd release
cmake \
  -DDAWN_FETCH_DEPENDENCIES=ON \
  -DDAWN_BUILD_MONOLITHIC_LIBRARY=STATIC \
  -DDAWN_ENABLE_INSTALL=ON \
  -DCMAKE_BUILD_TYPE=Release \
  -DCMAKE_CXX_FLAGS="-Wno-changes-meaning" \
  -G "Unix Makefiles" \
  ..
make -j$(nproc)
sudo make install
```

### 4. Build Ligetron

```bash
cd /mnt/user-data/mike
git clone https://github.com/ligeroinc/ligero-prover.git ligetron
cd ligetron
mkdir build && cd build
cmake -DCMAKE_BUILD_TYPE=Release -DCMAKE_CXX_FLAGS="-Wno-changes-meaning" ..
make -j$(nproc)
```

This produces:
- `build/webgpu_prover` — the prover CLI
- `build/webgpu_verifier` — the verifier CLI

### 5. Software Vulkan (for machines without a GPU)

Mesa's lavapipe provides software Vulkan rendering. Installed with `mesa-vulkan-drivers`.

Verify it works:
```bash
VK_ICD_FILENAMES=/usr/share/vulkan/icd.d/lvp_icd.json vulkaninfo --summary
```

Prefix all Ligetron commands with `VK_ICD_FILENAMES=/usr/share/vulkan/icd.d/lvp_icd.json`
when using software Vulkan.

## Building the Guest

The guest compiles Rust to `wasm32-wasip1` using the Ligetron SDK.

```bash
# Ensure WASM target is installed
rustup target add wasm32-wasip1

# Build the Poseidon2 benchmark (uses Ligetron SDK's BN254/Poseidon2)
cd zkvm/backends/ligetron/guest
cargo build --release --bin ligetron-poseidon2

# Build the structural test (uses NativePrecompiles, no Ligetron SDK at runtime)
cargo build --release --bin ligetron-guest
```

Output: `target/wasm32-wasip1/release/ligetron-poseidon2.wasm` (88 KB)

## Running the Benchmark

```bash
cd /mnt/user-data/mike/ligetron  # must be in ligetron dir for shader files

# With software Vulkan (no GPU):
VK_ICD_FILENAMES=/usr/share/vulkan/icd.d/lvp_icd.json \
  ./build/webgpu_prover '{"program":"/path/to/ligetron-poseidon2.wasm", "args":[{"i64":107}]}'

# With real GPU (if available):
./build/webgpu_prover '{"program":"/path/to/ligetron-poseidon2.wasm", "args":[{"i64":107}]}'
```

The `args` array is passed to the WASM program. `{"i64":107}` sets the number of
Poseidon2 hashes to compute (107 matches private_swap).

## Architecture Notes

- **Proof system:** Ligero (MPC-in-the-head, 2-round, hash-based, post-quantum)
- **Constraint model:** Linear + quadratic constraints over BN254 Fr
- **WASM interpretation:** Each WASM opcode generates constraints as it executes
- **Host functions:** BN254 field ops and Poseidon2 are intercepted by the prover
  and generate optimized constraints (not software field arithmetic)
- **Memory model:** Prover commits row-by-row, discards committed rows — 
  memory is bounded by the WASM program's live state, not the trace length

## File Structure

```
guest/
  src/
    main.rs                  Structural test with NativePrecompiles
    poseidon2_bench.rs       Poseidon2 benchmark using Ligetron SDK
    ligetron_precompiles.rs  (WIP) Precompiles trait impl for Ligetron
  Cargo.toml                 Depends on shared crates + ligetron SDK
  .cargo/config.toml         Default target = wasm32-wasip1
```
