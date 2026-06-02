use core::poseidon::PoseidonTrait;
use core::hash::HashStateTrait;

/// Full private-swap kernel workload — apples-to-apples with the Rust inline runner.
///
/// Mirrors TxExecutionContext::new + run_private_swap + finalize from:
///   shared/aztec-sdk/src/tx_context.rs
///   shared/test-contracts/src/runner_inline.rs
///
/// Operations (matching Rust exactly):
///   1.  TX nullifier: hash([0xFF], TX_NULLIFIER) = 1 hash
///   2.  Constructor: silo first nullifier with zero_addr = 1 hash
///   3.  FPC fee authwit: fee_inner (3-field) + fee_null (authwit sep) + silo nullifier = 3 hashes
///   4.  Enqueue fee_token public call (counter only, no hash)
///   5.  Token0 authwit: t0_inner (3-field) + authwit null + silo = 3 hashes
///   6.  Token0 note hash: poseidon3 = 1 hash
///   7.  Token0 Merkle verify: 42 compress = 42 hashes
///   8.  Token0 nullifier: NOTE_NULLIFIER sep + silo = 2 hashes
///   9.  Token0 change note: poseidon3 + SILOED_NOTE_HASH silo = 2 hashes
///   10. Token0 private log (counter only, no hash)
///   11. Enqueue token0 public call (counter only, no hash)
///   12. Token1: same as Token0 = 47 hashes
///   13. Enqueue AMM public call (counter only, no hash)
///   14. Finalize: 2 nonces (NOTE_HASH_NONCE) + 2 unique (UNIQUE_NOTE_HASH) = 4 hashes
///   Total: 1 + 1 + 3 + 3 + 42 + 2 + 2 + 3 + 42 + 2 + 2 + 4 = ~107 Poseidon hashes

// ──────────────────────────────────────────────
// Domain separators (from data-types/src/domain_separator.rs)
// ──────────────────────────────────────────────
const TX_NULLIFIER: felt252         = 1025801951;
const SILOED_NULLIFIER: felt252     = 57496191;
const AUTHWIT_NULLIFIER: felt252    = 1239150694;
const NOTE_NULLIFIER: felt252       = 50789342;
const SILOED_NOTE_HASH: felt252     = 3361878420;
const NOTE_HASH_NONCE: felt252      = 1721808740;
const UNIQUE_NOTE_HASH: felt252     = 226850429;

// ──────────────────────────────────────────────
// Gas constants (from data-types/src/constants.rs)
// ──────────────────────────────────────────────
const DA_GAS_PER_FIELD: u32         = 32;
const TX_DA_GAS_OVERHEAD: u32       = 96;
const PUBLIC_TX_L2_GAS_OVERHEAD: u32 = 540000;
const L2_GAS_PER_NOTE_HASH: u32    = 9200;
const L2_GAS_PER_NULLIFIER: u32    = 16000;
const L2_GAS_PER_PRIVATE_LOG: u32  = 2500;

// ──────────────────────────────────────────────
// Hash helpers
// ──────────────────────────────────────────────

/// 2-field Poseidon2 compress.
fn poseidon2(a: felt252, b: felt252) -> felt252 {
    PoseidonTrait::new().update(a).update(b).finalize()
}

/// 3-field Poseidon2 hash.
fn poseidon3(a: felt252, b: felt252, c: felt252) -> felt252 {
    PoseidonTrait::new().update(a).update(b).update(c).finalize()
}

/// Domain-separated 2-field hash: hash(sep, a, b).
/// Matches Rust's poseidon2_hash_with_separator(&[a, b], sep).
fn hash_sep2(sep: felt252, a: felt252, b: felt252) -> felt252 {
    PoseidonTrait::new().update(sep).update(a).update(b).finalize()
}

/// Domain-separated 1-field hash: hash(sep, a).
/// Matches Rust's poseidon2_hash_with_separator(&[a], sep).
fn hash_sep1(sep: felt252, a: felt252) -> felt252 {
    PoseidonTrait::new().update(sep).update(a).finalize()
}

// ──────────────────────────────────────────────
// Silo helpers (wrappers over hash_sep*)
// ──────────────────────────────────────────────

/// Silo a nullifier: poseidon2_hash_with_separator([contract_addr, value], SILOED_NULLIFIER).
fn silo_nullifier(contract_addr: felt252, value: felt252) -> felt252 {
    hash_sep2(SILOED_NULLIFIER, contract_addr, value)
}

/// Silo a note hash: poseidon2_hash_with_separator([contract_addr, value], SILOED_NOTE_HASH).
fn silo_note_hash(contract_addr: felt252, value: felt252) -> felt252 {
    hash_sep2(SILOED_NOTE_HASH, contract_addr, value)
}

/// Compute authwit nullifier: poseidon2_hash_with_separator([account, inner], AUTHWIT_NULLIFIER).
fn authwit_nullifier(account: felt252, inner: felt252) -> felt252 {
    hash_sep2(AUTHWIT_NULLIFIER, account, inner)
}

/// Compute note nullifier: poseidon2_hash_with_separator([note_hash, secret], NOTE_NULLIFIER).
fn note_nullifier(note_hash: felt252, secret: felt252) -> felt252 {
    hash_sep2(NOTE_NULLIFIER, note_hash, secret)
}

// ──────────────────────────────────────────────
// Merkle proof simulation
// ──────────────────────────────────────────────

/// Simulate Merkle proof verification: hash from leaf up 42 levels.
/// Uses the same deterministic sibling pattern as the Rust merkle_fixtures.
fn verify_merkle_proof(leaf: felt252, leaf_index: u64) -> felt252 {
    let mut current = leaf;
    let mut index = leaf_index;
    let mut level: u64 = 0;
    while level < 42 {
        // Deterministic sibling (matches Rust merkle_fixtures pattern)
        let sibling: felt252 = level.into() * 256 + 170; // 0xAA prefix

        if index % 2 == 0 {
            current = poseidon2(current, sibling);
        } else {
            current = poseidon2(sibling, current);
        }
        index = index / 2;
        level = level + 1;
    };
    current
}

// ──────────────────────────────────────────────
// Main workload
// ──────────────────────────────────────────────

#[executable]
fn main() -> Array<felt252> {
    // ── Addresses (addr(n) in Rust = felt252 n) ──
    let account:   felt252 = 1; // addr(1)
    let token0:    felt252 = 2; // addr(2)
    let token1:    felt252 = 3; // addr(3)
    let amm:       felt252 = 4; // addr(4)
    let fpc:       felt252 = 5; // addr(5)
    let fee_token: felt252 = 6; // addr(6)
    let zero_addr: felt252 = 0; // AztecAddress::zero()

    // ── Gas accumulators ──
    let mut da_gas: u32 = 0;
    let mut l2_gas: u32 = 0;

    // ── Side-effect counter ──
    let mut _counter: u32 = 0;

    // ─────────────────────────────────────────────────────────────────────────
    // Step 1: Compute first_nullifier (TX_NULLIFIER separator over 0xFF byte)
    // Rust: poseidon2_hash_with_separator(&[Digest::from_bytes32(&[0xFF, 0..])], TX_NULLIFIER)
    // In felt252 terms: from_bytes32 big-endian means 0xFF * 2^(31*8) — but since
    // Cairo arithmetic is over the Stark field (< 2^252), we use the same
    // canonical representation: just the big-endian u256 reduced mod p.
    // 0xFF_00...00 (31 zero bytes) = 0xFF * 256^31 as a felt252.
    // We compute it as a constant to avoid diverging from the Rust fixtures.
    // The exact value is: 0xFF * (2^248) mod p.
    // For benchmark purposes the exact value doesn't affect hash count — we use
    // a concrete felt252 that matches the serialization convention.
    // Rust's from_bytes32 big-endian: byte[0]=0xFF, rest=0 → value = 0xFF << (31*8)
    // = 0xFF00000000000000000000000000000000000000000000000000000000000000
    // As a decimal: 115339776388732929035197660848497720713218148788040405202452051345190
    // We hard-code this or use a variable; for proving cost purposes any felt252 works.
    // ─────────────────────────────────────────────────────────────────────────
    // NOTE: The Rust runner uses 0xFF as first byte. In Cairo felt252 big-endian encoding:
    //   val = 0xFF * 256^31 (mod stark_prime)
    // We define a concrete constant matching the Rust convention.
    // Rust uses a 32-byte LE array with byte[0]=0xFF. In Cairo, use 0xFF as a felt252;
    // the exact value doesn't affect benchmark cost, only hash output differs.
    let first_nullifier_raw: felt252 = hash_sep1(TX_NULLIFIER, 0xFF); // hash 1

    // ─────────────────────────────────────────────────────────────────────────
    // Step 2: Constructor — silo the first (protocol) nullifier with zero_addr
    // Rust: poseidon2_hash_with_separator(&[AztecAddress::zero().inner, first_nullifier], SILOED_NULLIFIER)
    // ─────────────────────────────────────────────────────────────────────────
    let siloed_first_nullifier: felt252 = silo_nullifier(zero_addr, first_nullifier_raw); // hash 2
    // gas: protocol nullifier is free (constructor, not metered)

    // Final outputs
    let mut siloed_nullifiers: Array<felt252> = ArrayTrait::new();
    siloed_nullifiers.append(siloed_first_nullifier);

    // ─────────────────────────────────────────────────────────────────────────
    // Step 3: FPC fee authwit
    // Rust: fee_inner = poseidon2_hash(&[fpc.inner, fee_token.inner, val(1)])  [addr(5), addr(6), val(1)]
    //       fee_null  = poseidon2_hash_with_separator(&[account.inner, fee_inner], AUTHWIT_NULLIFIER)
    //       emit_nullifier(fee_null, account)  →  silo with SILOED_NULLIFIER
    // ─────────────────────────────────────────────────────────────────────────
    let fee_inner: felt252 = poseidon3(fpc, fee_token, 1);                 // hash 3
    let fee_null_raw: felt252 = authwit_nullifier(account, fee_inner);     // hash 4
    let siloed_fee_null: felt252 = silo_nullifier(account, fee_null_raw);  // hash 5
    siloed_nullifiers.append(siloed_fee_null);
    _counter += 1; // emit_nullifier counter
    da_gas += DA_GAS_PER_FIELD;
    l2_gas += L2_GAS_PER_NULLIFIER;

    // enqueue_public_call(fee_token)
    _counter += 1;
    // set_fee_payer(fpc) — no counter, no hash

    // ─────────────────────────────────────────────────────────────────────────
    // Step 4: Token0 authwit
    // Rust: t0_inner = poseidon2_hash(&[amm.inner, token0.inner, val(3)])  [addr(4), addr(2), val(3)]
    //       emit_nullifier(poseidon2_hash_with_separator(&[account.inner, t0_inner], AUTHWIT_NULLIFIER), account)
    // ─────────────────────────────────────────────────────────────────────────
    let t0_inner: felt252 = poseidon3(amm, token0, 3);                        // hash 6
    let t0_auth_null_raw: felt252 = authwit_nullifier(account, t0_inner);     // hash 7
    let siloed_t0_auth_null: felt252 = silo_nullifier(account, t0_auth_null_raw); // hash 8
    siloed_nullifiers.append(siloed_t0_auth_null);
    _counter += 1; // emit_nullifier
    da_gas += DA_GAS_PER_FIELD;
    l2_gas += L2_GAS_PER_NULLIFIER;

    // ─────────────────────────────────────────────────────────────────────────
    // Step 5: Token0 note read (42 Merkle compress)
    // Rust: t0_nh = poseidon2_hash(&[account.inner, val(4), val(5)])  [addr(1), val(4), val(5)]
    //       verify_note_hash_read(t0_nh, witnesses[0])  →  42 compress
    // ─────────────────────────────────────────────────────────────────────────
    let t0_nh: felt252 = poseidon3(account, 4, 5);       // hash 9
    let _t0_root: felt252 = verify_merkle_proof(t0_nh, 0); // hashes 10-51 (42 compress)
    _counter += 1; // verify_note_hash_read

    // ─────────────────────────────────────────────────────────────────────────
    // Step 6: Token0 nullifier (settled note — not in pending, just emit standalone)
    // Rust: emit_nullifier(poseidon2_hash_with_separator(&[t0_nh, val(6)], NOTE_NULLIFIER), token0)
    // ─────────────────────────────────────────────────────────────────────────
    let t0_null_raw: felt252 = note_nullifier(t0_nh, 6);                    // hash 52
    let siloed_t0_null: felt252 = silo_nullifier(token0, t0_null_raw);      // hash 53
    siloed_nullifiers.append(siloed_t0_null);
    _counter += 1; // emit_nullifier
    da_gas += DA_GAS_PER_FIELD;
    l2_gas += L2_GAS_PER_NULLIFIER;

    // ─────────────────────────────────────────────────────────────────────────
    // Step 7: Token0 change note (emit_note_hash)
    // Rust: t0_change = poseidon2_hash(&[account.inner, val(7), val(8)])
    //       emit_note_hash(t0_change, token0)  →  silo with SILOED_NOTE_HASH, add to pending
    // ─────────────────────────────────────────────────────────────────────────
    let t0_change: felt252 = poseidon3(account, 7, 8);                // hash 54
    let siloed_t0_change: felt252 = silo_note_hash(token0, t0_change); // hash 55
    // add to pending (no squash in private_swap — change notes go to output)
    _counter += 1; // emit_note_hash
    da_gas += DA_GAS_PER_FIELD;
    l2_gas += L2_GAS_PER_NOTE_HASH;

    // emit_private_log([t0_change])
    _counter += 1;
    l2_gas += L2_GAS_PER_PRIVATE_LOG;

    // enqueue_public_call(token0)
    _counter += 1;

    // ─────────────────────────────────────────────────────────────────────────
    // Step 8: Token1 authwit
    // Rust: t1_inner = poseidon2_hash(&[amm.inner, token1.inner, val(10)])  [addr(4), addr(3), val(10)]
    //       emit_nullifier(poseidon2_hash_with_separator(&[account.inner, t1_inner], AUTHWIT_NULLIFIER), account)
    // ─────────────────────────────────────────────────────────────────────────
    let t1_inner: felt252 = poseidon3(amm, token1, 10);                          // hash 56
    let t1_auth_null_raw: felt252 = authwit_nullifier(account, t1_inner);        // hash 57
    let siloed_t1_auth_null: felt252 = silo_nullifier(account, t1_auth_null_raw); // hash 58
    siloed_nullifiers.append(siloed_t1_auth_null);
    _counter += 1;
    da_gas += DA_GAS_PER_FIELD;
    l2_gas += L2_GAS_PER_NULLIFIER;

    // ─────────────────────────────────────────────────────────────────────────
    // Step 9: Token1 note read (42 Merkle compress)
    // Rust: t1_nh = poseidon2_hash(&[account.inner, val(11), val(12)])  [addr(1), val(11), val(12)]
    //       verify_note_hash_read(t1_nh, witnesses[1])  →  42 compress
    // ─────────────────────────────────────────────────────────────────────────
    let t1_nh: felt252 = poseidon3(account, 11, 12);       // hash 59
    let _t1_root: felt252 = verify_merkle_proof(t1_nh, 1); // hashes 60-101 (42 compress)
    _counter += 1; // verify_note_hash_read

    // ─────────────────────────────────────────────────────────────────────────
    // Step 10: Token1 nullifier
    // Rust: emit_nullifier(poseidon2_hash_with_separator(&[t1_nh, val(13)], NOTE_NULLIFIER), token1)
    // ─────────────────────────────────────────────────────────────────────────
    let t1_null_raw: felt252 = note_nullifier(t1_nh, 13);               // hash 102
    let siloed_t1_null: felt252 = silo_nullifier(token1, t1_null_raw);  // hash 103
    siloed_nullifiers.append(siloed_t1_null);
    _counter += 1;
    da_gas += DA_GAS_PER_FIELD;
    l2_gas += L2_GAS_PER_NULLIFIER;

    // ─────────────────────────────────────────────────────────────────────────
    // Step 11: Token1 change note (emit_note_hash)
    // Rust: t1_change = poseidon2_hash(&[account.inner, val(14), val(15)])
    //       emit_note_hash(t1_change, token1)
    // ─────────────────────────────────────────────────────────────────────────
    let t1_change: felt252 = poseidon3(account, 14, 15);               // hash 104
    let siloed_t1_change: felt252 = silo_note_hash(token1, t1_change); // hash 105
    // add to pending (no squash in private_swap — change notes go to output)
    _counter += 1;
    da_gas += DA_GAS_PER_FIELD;
    l2_gas += L2_GAS_PER_NOTE_HASH;

    // emit_private_log([t1_change])
    _counter += 1;
    l2_gas += L2_GAS_PER_PRIVATE_LOG;

    // enqueue_public_call(token1)
    _counter += 1;

    // enqueue_public_call(amm)
    _counter += 1;

    // ─────────────────────────────────────────────────────────────────────────
    // Step 12: Finalize — uniquify pending note hashes
    // Rust: for each pending note hash at index i:
    //   nonce = poseidon2_hash_with_separator(&[first_nullifier, i_as_felt], NOTE_HASH_NONCE)
    //   unique = poseidon2_hash_with_separator(&[nonce, siloed], UNIQUE_NOTE_HASH)
    // ─────────────────────────────────────────────────────────────────────────

    // Pending index 0: t0_change
    let nonce0: felt252 = hash_sep2(NOTE_HASH_NONCE, first_nullifier_raw, 0); // hash 106
    let unique0: felt252 = hash_sep2(UNIQUE_NOTE_HASH, nonce0, siloed_t0_change); // hash 107

    // Pending index 1: t1_change
    let nonce1: felt252 = hash_sep2(NOTE_HASH_NONCE, first_nullifier_raw, 1); // hash 108
    let unique1: felt252 = hash_sep2(UNIQUE_NOTE_HASH, nonce1, siloed_t1_change); // hash 109

    // ─────────────────────────────────────────────────────────────────────────
    // Step 13: Gas overhead
    // Has public calls → PUBLIC_TX_L2_GAS_OVERHEAD
    // ─────────────────────────────────────────────────────────────────────────
    l2_gas += PUBLIC_TX_L2_GAS_OVERHEAD;
    da_gas += TX_DA_GAS_OVERHEAD;

    // ─────────────────────────────────────────────────────────────────────────
    // Step 14: Assemble output (KernelPublicInputs equivalent)
    // ─────────────────────────────────────────────────────────────────────────
    let mut output: Array<felt252> = ArrayTrait::new();

    // Uniquified note hashes (siloed + nonce-uniquified)
    output.append(unique0); // unique t0_change
    output.append(unique1); // unique t1_change

    // Siloed nullifiers
    output.append(*siloed_nullifiers[0]); // protocol (first) nullifier
    output.append(*siloed_nullifiers[1]); // fee authwit nullifier
    output.append(*siloed_nullifiers[2]); // t0 authwit nullifier
    output.append(*siloed_nullifiers[3]); // t0 note nullifier
    output.append(*siloed_nullifiers[4]); // t1 authwit nullifier
    output.append(*siloed_nullifiers[5]); // t1 note nullifier

    // Gas used
    output.append(da_gas.into());
    output.append(l2_gas.into());

    // Fee payer (fpc address)
    output.append(fpc);

    output
}
