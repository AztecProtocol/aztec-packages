# Barretenberg

Barretenberg is a C++ library that implements various Zero-Knowledge Succinct Non-interactive Arguments of Knowledge (zk-SNARK) proof systems, cryptographic primitives, and supporting infrastructure. It's designed for efficiency, security, and flexibility, making it suitable for a wide range of applications requiring privacy-preserving computations.

## Key Features

- **Multiple Proof Systems**: Supports several zkSNARK implementations including:
  - **UltraPlonk**: A legacy version of PLONK
  - **UltraHonk**: A newer, more efficient PLONKish proving system
  - **ClientIVC**: A proving scheme optimized for [Aztec](https://aztec.network) client-side smart contract execution

- **Recursive Proof Verification**: Ability to verify proofs within proofs

- **Cryptographic Primitives**:
  - Elliptic curve operations (BN254, Grumpkin, Secp256k1)
  - Hash functions (Blake2s, Blake3s, Keccak/SHA-3)
  - Digital signatures (Schnorr, ECDSA)
  - Pedersen commitments

- **zkSNARK Infrastructure**:
  - Polynomial commitment schemes (KZG, IPA)
  - Sumcheck protocol with and without zero-knowledge
  - Circuit building tools
  - Execution trace management

- **Advanced Features**:
  - Memory operations (ROM/RAM)
  - Lookup tables (Plookup)
  - Efficient multi-scalar multiplication

## Relationship with Noir

Barretenberg serves as the cryptographic backend for [Noir](https://noir-lang.org), a domain-specific language for creating and verifying zero-knowledge proofs. The relationship works as follows:

1. **Noir Compilation**: Noir programs are compiled into ACIR (Abstract Circuit Intermediate Representation)
2. **ACIR Processing**: Barretenberg takes the ACIR instructions and converts them into a circuit representation
3. **Witness Generation**: Based on actual input values, Barretenberg computes a witness for the circuit
4. **Proof Generation**: Barretenberg creates a zero-knowledge proof that the computation was performed correctly
5. **Verification**: The proof can be verified using Barretenberg's verification algorithms, including on-chain via Solidity verifiers

This integration allows Noir developers to focus on writing application logic while Barretenberg handles the complex cryptographic operations underneath.

## Core Components

### bbup

A versioning tool allowing to install arbitrary versions of Barretenberg, as well as versions compatible with installed Nargo versions.

### bb Command Line Interface

The `bb` command line interface is the primary way to interact with Barretenberg directly. It provides commands for operations such as:

- Proving and verifying circuits
- Generating verification keys 
- Creating Solidity verifiers for on-chain verification
- Executing and verifying recursive proofs

### bb.js

bb.js is a TypeScript library that wraps the Barretenberg C++ implementation via WebAssembly (WASM) bindings. It allows developers to use Barretenberg's functionality directly in JavaScript/TypeScript environments, including browsers and Node.js.

### Proof Systems

#### UltraHonk

UltraHonk is an advanced proof system that offers improvements over the legacy UltraPlonk:

- More efficient proving times
- Smaller proof sizes
- Reduced memory usage
- Enhanced recursive proving capabilities

### Blockchain Integration

As the name implies, SNARKs are non-interactive, making them suitable to be verified in smart contracts. This enables applications where:

1. Verification happens on-chain (ensuring trustlessness)
2. Private data remains hidden while correctness is verified

Barretenberg produces Solidity smart contracts meant to be used on several EVM networks, as long as they implement the `ecMul`, `ecAdd`, `ecPairing`, and `modexp` EVM precompiles. For example:

- Ethereum
- Optimism
- Arbitrum
- Polygon PoS
- Scroll
- Celo
- BSC
- And many others

Several teams have been writing Barretenberg verifier implementations for other frameworks, for example [Starknet's Garaga](https://garaga.gitbook.io/garaga/deploy-your-snark-verifier-on-starknet/noir).

## Use Cases

Barretenberg and Noir together enable a wide range of privacy-preserving applications:

- Private transactions and token transfers
- Anonymous voting systems
- Zero-knowledge identity verification
- Private credentials and attestations
- Confidential smart contracts
- Secure multi-party computation
- Private order books and marketplaces

## Technical Architecture

Barretenberg is organized into several key modules:

- **Core Cryptography**: Finite field arithmetic, elliptic curve operations
- **Constraint Systems**: Circuit representations and constraint management
- **Proving Systems**: Implementation of various proving schemes
- **Commitment Schemes**: Polynomial commitment methods
- **DSL (Domain Specific Language)**: Interfaces with ACIR from Noir
- **Execution**: Witness generation and computation
- **Verification**: Proof verification both native and on-chain

## Further Resources

- [Noir Documentation](https://noir-lang.org/docs)
- [Aztec Protocol](https://aztec.network/)
- [Awesome Noir](https://github.com/noir-lang/awesome-noir) - Collection of resources, tools and examples
