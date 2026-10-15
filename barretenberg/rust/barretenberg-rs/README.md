# barretenberg-rs

Rust bindings for [Barretenberg](https://github.com/AztecProtocol/aztec-packages/tree/next/barretenberg), a C++ cryptographic library for zero-knowledge proofs.

## Features

- **PipeBackend**: Spawns the `bb` binary and communicates via msgpack over stdin/stdout
- **FfiBackend**: Links directly to static libraries for maximum performance (`ffi` feature, on by default)
- Async support with Tokio

## Installation

```toml
[dependencies]
barretenberg-rs = "5"  # use the version that matches your bb
```

### Feature Flags

- `native` (default): Enables PipeBackend with Tokio async runtime
- `ffi` (default): Enables FfiBackend with static linking to `libbb-external.a`
- `async`: Enables async API support

## Usage

### PipeBackend (default)

Requires the `bb` binary to be available. Download from [Barretenberg releases](https://github.com/AztecProtocol/barretenberg/releases).

```rust
use barretenberg_rs::{BarretenbergApi, backends::PipeBackend};

fn main() -> Result<(), Box<dyn std::error::Error>> {
    let backend = PipeBackend::new("/path/to/bb", Some(4))?;
    let mut api = BarretenbergApi::new(backend);

    // Hash some data
    let response = api.blake2s(b"hello world")?;
    println!("Hash: {}", hex::encode(&response.hash));

    api.destroy()?;
    Ok(())
}
```

### FfiBackend (`ffi` feature, default)

```rust
use barretenberg_rs::{BarretenbergApi, backends::FfiBackend};

fn main() -> Result<(), Box<dyn std::error::Error>> {
    let backend = FfiBackend::new()?;
    let mut api = BarretenbergApi::new(backend);

    let response = api.blake2s(b"hello world")?;
    println!("Hash: {}", hex::encode(&response.hash));

    api.destroy()?;
    Ok(())
}
```

## Supported Targets

At build time, the FFI backend downloads a pre-built static library from the GitHub release of the crate version (needs network access and `curl`). Set `BB_LIB_DIR` to a directory containing `libbb-external.a` to use a local build instead. Pre-built libraries exist for:

- Linux x86_64 (glibc)
- Linux arm64 (glibc)
- macOS x86_64
- macOS arm64 (Apple Silicon)
- iOS arm64 (device)
- iOS arm64 Simulator (Apple Silicon)
- Android arm64 and x86_64

## API

The `BarretenbergApi` exposes cryptographic primitives including:

- **Hashing**: Blake2s, Poseidon2, Pedersen
- **Signatures**: ECDSA (secp256k1, secp256r1), Schnorr
- **Curve operations**: BN254, Grumpkin, secp256k1
- **Encryption**: AES-128-CBC
- **Proof systems**: UltraHonk, Chonk, AVM

## License

Apache-2.0
