/// Merkle proof fixtures for benchmarking.
///
/// ALL tree building is HOST-SIDE work. The guest only receives a
/// (leaf, sibling_path, root) tuple and hashes from leaf to root.
/// That's 42 × Poseidon2 compress calls per read — nothing else.
///
/// The `generate_*` functions here simulate the HOST generating hints.
/// In the real protocol, the PXE fetches these from the Aztec node.
use alloc::collections::BTreeMap;
use alloc::vec::Vec;
use zkvm_data_types::field::Digest;
use zkvm_data_types::precompiles::Precompiles;
use zkvm_data_types::types::MembershipWitness;

pub const NOTE_HASH_TREE_HEIGHT: usize = 42;

/// HOST-SIDE: generate witnesses for multiple leaves sharing one root.
///
/// Builds a sparse Merkle tree, extracts sibling paths. This is host
/// computation — it does NOT run inside the VM.
pub fn generate_read_witnesses<P: Precompiles>(
    leaves: &[P::Digest],
) -> (Vec<MembershipWitness<P::Digest>>, P::Digest) {
    // Precompute empty hashes for each level
    let mut empty = Vec::with_capacity(NOTE_HASH_TREE_HEIGHT + 1);
    empty.push(P::Digest::zero());
    for _ in 0..NOTE_HASH_TREE_HEIGHT {
        let prev = *empty.last().unwrap();
        empty.push(P::poseidon2_compress(&prev, &prev));
    }

    // Insert leaves at indices 0..N
    let mut nodes: BTreeMap<(usize, u64), P::Digest> = BTreeMap::new();
    for (i, leaf) in leaves.iter().enumerate() {
        nodes.insert((0, i as u64), *leaf);
    }

    // Hash up level by level
    for level in 0..NOTE_HASH_TREE_HEIGHT {
        let indices: Vec<u64> = nodes.keys()
            .filter(|(l, _)| *l == level).map(|(_, i)| *i).collect();
        let mut parents = alloc::collections::BTreeSet::new();
        for idx in &indices { parents.insert(idx / 2); }
        for p in parents {
            let l = nodes.get(&(level, p * 2)).copied().unwrap_or(empty[level]);
            let r = nodes.get(&(level, p * 2 + 1)).copied().unwrap_or(empty[level]);
            nodes.insert((level + 1, p), P::poseidon2_compress(&l, &r));
        }
    }

    let root = nodes.get(&(NOTE_HASH_TREE_HEIGHT, 0)).copied()
        .unwrap_or(empty[NOTE_HASH_TREE_HEIGHT]);

    let witnesses = leaves.iter().enumerate().map(|(i, _)| {
        let mut path = Vec::with_capacity(NOTE_HASH_TREE_HEIGHT);
        let mut idx = i as u64;
        for level in 0..NOTE_HASH_TREE_HEIGHT {
            let sib = idx ^ 1;
            path.push(nodes.get(&(level, sib)).copied().unwrap_or(empty[level]));
            idx >>= 1;
        }
        MembershipWitness { leaf_index: i as u64, sibling_path: path }
    }).collect();

    (witnesses, root)
}
