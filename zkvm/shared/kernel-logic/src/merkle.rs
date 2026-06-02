use zkvm_data_types::kernel_output::KernelError;
use zkvm_data_types::precompiles::Precompiles;
use zkvm_data_types::types::MembershipWitness;

/// Verify a Merkle membership witness: hash the leaf up the sibling path
/// and check that the computed root matches the expected root.
pub fn verify_membership_witness<P: Precompiles>(
    leaf: &P::Digest,
    witness: &MembershipWitness<P::Digest>,
    expected_root: &P::Digest,
) -> Result<(), KernelError> {
    let mut current = *leaf;
    let mut index = witness.leaf_index;

    for sibling in &witness.sibling_path {
        if index & 1 == 0 {
            current = P::poseidon2_compress(&current, sibling);
        } else {
            current = P::poseidon2_compress(sibling, &current);
        }
        index >>= 1;
    }

    if current == *expected_root {
        Ok(())
    } else {
        Err(KernelError::InvalidMerkleWitness { request_index: 0 })
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use alloc::vec;
    use zkvm_data_types::field::NativeDigest;
    use zkvm_data_types::precompiles::NativePrecompiles;

    #[test]
    fn verify_single_level_tree() {
        // Build a 2-leaf tree: root = compress(leaf0, leaf1)
        let leaf0 = NativeDigest::from_u64(10);
        let leaf1 = NativeDigest::from_u64(20);
        let root = NativePrecompiles::poseidon2_compress(&leaf0, &leaf1);

        // Witness for leaf0: sibling is leaf1, index 0
        let witness = MembershipWitness {
            leaf_index: 0,
            sibling_path: vec![leaf1],
        };

        assert!(verify_membership_witness::<NativePrecompiles>(&leaf0, &witness, &root).is_ok());
    }

    #[test]
    fn verify_wrong_root_fails() {
        let leaf0 = NativeDigest::from_u64(10);
        let leaf1 = NativeDigest::from_u64(20);
        let wrong_root = NativeDigest::from_u64(999);

        let witness = MembershipWitness {
            leaf_index: 0,
            sibling_path: vec![leaf1],
        };

        assert!(verify_membership_witness::<NativePrecompiles>(&leaf0, &witness, &wrong_root).is_err());
    }
}
