# barretenberg-rs

Rust bindings for [Barretenberg](https://github.com/AztecProtocol/aztec-packages/tree/master/barretenberg), a C++ cryptographic library for zero-knowledge proofs.

## Features

- **PipeBackend**: Spawns the `bb` binary and communicates via msgpack over stdin/stdout
- **FfiBackend**: Links directly to static libraries for maximum performance (requires `ffi` feature)
- Async support with Tokio

## Installation

```toml
[dependencies]
barretenberg-rs = "0.1"
```

### Feature Flags

- `native` (default): Enables PipeBackend with Tokio async runtime
- `ffi`: Enables FfiBackend with static linking to libbarretenberg
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
    let response = api.blake2s(b"hello world".to_vec())?;
    println!("Hash: {}", hex::encode(&response.hash));

    api.destroy()?;
    Ok(())
}
```

### FfiBackend (requires `ffi` feature)

```rust
use barretenberg_rs::{BarretenbergApi, backends::FfiBackend};

fn main() -> Result<(), Box<dyn std::error::Error>> {
    let backend = FfiBackend::new();
    let mut api = BarretenbergApi::new(backend);

    let response = api.blake2s(b"hello world".to_vec())?;
    println!("Hash: {}", hex::encode(&response.hash));

    api.destroy()?;
    Ok(())
}
```

## Supported Targets

The FFI backend provides pre-built static libraries for:

- Linux x86_64 (glibc)
- Linux arm64 (glibc)
- macOS x86_64
- macOS arm64 (Apple Silicon)
- iOS arm64 (device)
- iOS arm64 Simulator (Apple Silicon)

## API

The `BarretenbergApi` exposes cryptographic primitives including:

- **Hashing**: Blake2s, Blake3, Poseidon2, Pedersen, SHA256, Keccak256
- **Signatures**: ECDSA (secp256k1, secp256r1), Schnorr
- **Curve operations**: BN254, Grumpkin, secp256k1
- **Encryption**: AES-128-CBC
- **Proof systems**: UltraHonk, MegaHonk, ClientIVC

## License

Apache-2.0
