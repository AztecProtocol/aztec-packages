# `noir_rs`: A Pure Rust Implementation of the Noir zkSNARK Proving Scheme

Welcome to `noir_rs`, a Rust-centric package designed for users seeking a straightforward, lightweight interface to generate and verify zkSNARK proofs without any WebAssembly (WASM) dependency.

![Version](https://img.shields.io/badge/version-0.19.3-blue)

## Key Highlights:

- **Pure Rust**: Capitalize on the safety and concurrency features Rust offers with this entire implementation.
- **Barretenberg Backend**: Leverages an up-to-date Barretenberg backend optimized for Rust bindings.
- **Native FFI Bindings**: Provides foreign function interface (FFI) bindings to the compiled library for a seamless interaction with the Barretenberg backend.
- **Proof Generation & Verification**: Enables zkSNARK proof generation and verification using the Barretenberg backend.
- **ACVM Integration**: Incorporates the ACVM (Arbitrary Computation Virtual Machine) package, allowing execution of circuits and solving for witnesses.

## Motivation:

zkSNARKs are rapidly gaining traction in the tech world, opening doors to various applications. The core motivations behind `noir_rs` include:

- **Rust-centric Design**: With Rust's performance, safety, and concurrency features, it provides a robust foundation for a zkSNARK platform.
- **Mobile Compatibility**: By avoiding WASM and creating a Rust-native solution, `noir_rs` is optimized for mobile devices.
- **Ease of Use**: Our goal is to offer developers a straightforward toolset for generating and verifying zkSNARK proofs without intricate configurations or dependencies.

## How it Works:

1. **Barretenberg Backend**: `noir_rs` employs a Barretenberg backend adjusted for Rust bindings, crucial for zkSNARK proof generation, verification, and as the ACVM's blackbox solver.
2. **FFI Bindings**: Through FFI, the project binds to the Barretenberg library, ensuring a seamless and efficient interaction.
3. **ACVM Integration**: The ACVM package is fundamental to `noir_rs`, facilitating circuit execution and witness solving, streamlining zkSNARK proof generation.

## Future Work:

**Swift Bridge for Darwin-based Systems**: An upcoming enhancement for `noir_rs` is crafting a Swift bridge, allowing developers to generate and verify zkSNARK proofs within their apps, broadening support to macOS, iOS, and other Darwin-based systems.

## Development Commands:

### Building the Project:
```
cargo build
```

### Running Tests:
```
cargo test
```

### Building with Specific Target:

Rust supports a wide range of platforms and architectures. Below are some of the commonly used target triplets:

- **Linux (x86_64)**: `x86_64-unknown-linux-gnu`
- **Linux (ARMv7)**: `armv7-unknown-linux-gnueabihf`
- **Windows (MSVC)**: `x86_64-pc-windows-msvc`
- **macOS (x86_64)**: `x86_64-apple-darwin`
- **iOS**: `aarch64-apple-ios`
- **Android**: `aarch64-linux-android`

To build for a specific target, use:
```
cargo build --target TARGET_TRIPLET
```
Replace `TARGET_TRIPLET` with your desired target from the list above or consult the [official Rust documentation](https://doc.rust-lang.org/beta/rustc/platform-support.html) for more available targets.