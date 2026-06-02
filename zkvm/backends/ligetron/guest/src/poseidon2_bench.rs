/// Ligetron Poseidon2 benchmark — uses Ligetron's SDK directly.
///
/// This exercises Poseidon2 hashing over BN254 via Ligetron's host function
/// imports, which generate optimized constraints. It simulates the hash-heavy
/// portion of an Aztec private function execution:
///
/// 1. Compute note hashes (Poseidon2 of address + value + randomness)
/// 2. Silo note hashes (Poseidon2 of contract_address + note_hash)
/// 3. Compute nullifiers (Poseidon2 with domain separator)
/// 4. Merkle membership verification (42 Poseidon2 compress calls)
///
/// This is NOT the full kernel logic — it's the crypto-heavy core that
/// dominates proving cost. The goal is to measure Ligetron's Poseidon2
/// proving performance for ~107 hash operations (matching private_swap).

use ligetron::bn254fr::Bn254Fr;
use ligetron::poseidon2::poseidon2_hash;
use ligetron::*;

/// Poseidon2 two-to-one compression (for Merkle trees).
fn compress(left: &Bn254Fr, right: &Bn254Fr) -> Bn254Fr {
    poseidon2_hash(&[left.clone(), right.clone()])
}

/// Poseidon2 hash with domain separator.
fn hash_with_sep(inputs: &[Bn254Fr], separator: u32) -> Bn254Fr {
    let sep = Bn254Fr::from_u32(separator);
    let mut all = vec![sep];
    all.extend(inputs.iter().cloned());
    poseidon2_hash(&all)
}

/// Simulate Merkle membership verification: hash leaf to root via 42-deep path.
fn verify_merkle_path(leaf: &Bn254Fr, path: &[Bn254Fr; 42], indices: u64) -> Bn254Fr {
    let mut current = leaf.clone();
    for i in 0..42 {
        let bit = (indices >> i) & 1;
        if bit == 0 {
            current = compress(&current, &path[i]);
        } else {
            current = compress(&path[i], &current);
        }
    }
    current
}

fn main() {
    let args = get_args();
    let num_hashes: usize = args.get_as_int(1).try_into().unwrap_or(107);

    // Deterministic "random" field elements for the benchmark.
    let mut elements: Vec<Bn254Fr> = Vec::new();
    for i in 0..50 {
        elements.push(Bn254Fr::from_u32(i + 1));
    }

    let mut hash_count: usize = 0;

    // --- Note hashes (like token_transfer/private_swap) ---
    // Each note: H(address, value, randomness) = 1 hash
    let contract_address = Bn254Fr::from_u32(0xABCD);
    for i in 0..4 {
        let _note_hash = poseidon2_hash(&[
            elements[i * 3].clone(),
            elements[i * 3 + 1].clone(),
            elements[i * 3 + 2].clone(),
        ]);
        hash_count += 1;
    }

    // --- Silo note hashes: H(contract_address, note_hash) ---
    for i in 0..4 {
        let note_hash = poseidon2_hash(&[
            elements[i].clone(),
            elements[i + 1].clone(),
        ]);
        let _siloed = compress(&contract_address, &note_hash);
        hash_count += 2;
    }

    // --- Nullifiers with domain separator ---
    for i in 0..4 {
        let _nullifier = hash_with_sep(
            &[elements[i].clone(), elements[i + 10].clone()],
            42, // domain separator
        );
        hash_count += 1;
    }

    // --- Merkle membership proofs (2 reads x 42-deep tree = 84 hashes) ---
    let merkle_path: [Bn254Fr; 42] = core::array::from_fn(|i| Bn254Fr::from_u32((i + 100) as u32));
    let leaf1 = Bn254Fr::from_u32(0xDEAD);
    let leaf2 = Bn254Fr::from_u32(0xBEEF);

    let root1 = verify_merkle_path(&leaf1, &merkle_path, 0x12345678);
    hash_count += 42;
    let root2 = verify_merkle_path(&leaf2, &merkle_path, 0x87654321);
    hash_count += 42;

    // --- Additional hashes to reach ~107 total ---
    while hash_count < num_hashes {
        let _ = poseidon2_hash(&[
            Bn254Fr::from_u32(hash_count as u32),
            Bn254Fr::from_u32((hash_count + 1) as u32),
        ]);
        hash_count += 1;
    }

    // Commit a "result" so the prover has something to verify.
    // In the real system this would be the KernelPublicInputs.
    Bn254Fr::assert_equal(&root1, &root1); // trivial assertion
    Bn254Fr::assert_equal(&root2, &root2);

    println!("Completed {} Poseidon2 hashes", hash_count);
}
