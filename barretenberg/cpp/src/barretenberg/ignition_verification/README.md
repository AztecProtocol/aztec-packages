# Ignition Verification

A standalone tool that cryptographically verifies the Aztec Ignition trusted setup ceremony and the integrity of the BN254 Structured Reference String (SRS) derived from it.

## Background

The Aztec Ignition ceremony was a multi-party computation (MPC) in which 176 participants each contributed secret randomness to produce a ~100.8 million-point BN254 SRS. The security guarantee is that the SRS is safe as long as **at least one** participant destroyed their secret. This tool lets anyone independently verify:

1. The sealed SRS has valid power-of-tau structure.
2. The SRS committed to the CDN matches the sealed transcripts.
3. Every participant's contribution is correctly chained to its predecessor.

## Three Verification Checks

### 1. Power-of-Tau Structure (`verify-structure`)

Confirms that the 100.8M G1 points in the 20 sealed transcript files form a valid power-of-tau sequence: `[τ·G1, τ²·G1, …, τ^N·G1]`.

**Method:** Fiat-Shamir batch pairing check. A deterministic seed (`"aztec-ignition-verification-2020"`) derives a random scalar r_i for each consecutive pair (g1[i], g1[i+1]). Accumulates R = Σ r_i·g1[i] and L = Σ r_i·g1[i+1], then verifies a single pairing equation:

```
e(L, G2_generator) · e(-R, τ·G2) == 1
```

This reduces 100,799,999 individual pairing checks to one batch operation.

**Also checks:** The sealed G2 point (τ·G2) matches the value hardcoded in `bn254_crs_data.hpp`. BLAKE2B checksums embedded at the end of each transcript file are verified before the expensive pairing work to catch corrupted downloads early.

### 2. CDN Hash Cross-Check (runs as part of `verify-structure`)

Verifies that the first 33,554,432 G1 points from the sealed transcripts match the chunk hashes hardcoded in barretenberg's `bn254_g1_chunk_hashes.hpp`.

**Method:** Splits points into 257 chunks of 131,072 points (8 MB each), serializes in CDN format (x-first big-endian, prepending the BN254 generator), computes SHA-256 per chunk, and compares against the hardcoded hashes. This binds the ceremony output to what barretenberg actually ships.

### 3. Participant Chain Linkage (`verify-chain`)

Verifies that all 176 participant contributions plus the sealed result form a valid chain — each participant built on the previous one's output.

**Method:** Downloads ~300 bytes per participant via HTTP Range requests from S3 (~55 KB total). For each link (i → i+1), checks:

```
e(g1[i+1], G2_generator) == e(g1[i], individual_g2[i+1])
```

This confirms participant i+1 multiplied by their secret on top of participant i's cumulative result.

**Also checks:** Downloaded chain data is verified against a hardcoded SHA-256 commitment (over all 177 entries' G1 + G2 data) to prevent S3 tampering. When run via `verify-all`, the sealed G1 and G2 from the chain are cross-checked against the local transcript to ensure both verification paths used consistent data.

## Usage

```bash
# Build
cd barretenberg/cpp
cmake --preset default
cd build && ninja ignition_verifier

# Download the 20 sealed transcripts (~75 GB total)
# Hosted on S3: https://aztec-ignition.s3.eu-west-2.amazonaws.com/MAIN+IGNITION/sealed/
# Files: transcript00.dat through transcript19.dat
for i in $(seq -w 0 19); do
  curl -O "https://aztec-ignition.s3.eu-west-2.amazonaws.com/MAIN+IGNITION/sealed/transcript${i}.dat"
done

# Verify sealed transcript structure + CDN hashes
./bin/ignition_verifier verify-structure /path/to/transcripts/

# Verify participant chain (downloads from S3 automatically)
./bin/ignition_verifier verify-chain

# Run all checks
./bin/ignition_verifier verify-all /path/to/transcripts/

# Machine-readable output
./bin/ignition_verifier verify-all /path/to/transcripts/ --json

# Recompute the chain data commitment (for updating the hardcoded hash)
./bin/ignition_verifier compute-chain-commitment
```

## Module Structure

| File | Purpose |
|---|---|
| `main.cpp` | CLI entry point, orchestrates all checks and cross-checks |
| `transcript_loader.{hpp,cpp}` | Parses Ignition transcript binary format, handles endianness conversion, deserializes G1/G2 points with on-curve validation |
| `structure_check.{hpp,cpp}` | Batch Fiat-Shamir pairing verification of power-of-tau structure |
| `hash_check.{hpp,cpp}` | SHA-256 chunk hash verification against CDN-committed values |
| `chain_check.{hpp,cpp}` | Downloads and verifies 176-participant chain via pairing checks |
| `chain_commitment.{hpp,cpp}` | Hardcoded SHA-256 commitment over chain data to detect S3 tampering |
| `checksum_check.{hpp,cpp}` | BLAKE2B checksum verification of transcript files |
| `blake2b.{hpp,cpp}` | BLAKE2B hash implementation (reference, CC0-licensed) |
| `report.{hpp,cpp}` | Aggregates results, outputs human-readable or JSON reports |
| `participant_list.hpp` | Static list of 176 participant S3 directory names |
| `*.test.cpp` | Unit tests (BLAKE2B vectors, synthetic SRS, corruption detection, deserialization) |

## Key Numbers

- **100,800,000** G1 points across 20 transcripts (5,040,000 per file)
- **176** ceremony participants
- **100,799,999** consecutive pairs verified in the batch pairing check
- **257** CDN chunks hash-checked (covering 33,554,432 points)
- **~55 KB** downloaded for chain verification (HTTP Range requests)

## Dependencies

- `barretenberg/ecc` — BN254 elliptic curve operations and pairings
- `barretenberg/crypto/sha256` — Fiat-Shamir hashing and chunk hashes
- `barretenberg/srs/factories` — Hardcoded CRS data, CDN chunk hashes, HTTP download utilities
