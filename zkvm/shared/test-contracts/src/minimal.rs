use zkvm_data_types::field::Digest;
use zkvm_data_types::precompiles::Precompiles;
use zkvm_data_types::side_effects::ExecutionResult;
use zkvm_data_types::types::{AztecAddress, FunctionSelector};
use zkvm_data_types::domain_separator;
use zkvm_aztec_sdk::context::PrivateContext;

/// Minimal contract: computes 1 note hash and 1 nullifier via real Poseidon2.
///
/// Crypto work:
///   - 1 × poseidon2_hash (note hash = H(owner, value, randomness))
///   - 1 × poseidon2_hash_with_separator (nullifier = H(note_hash, secret_key))
///
/// Then the kernel will additionally do:
///   - 1 × silo_note_hash (poseidon2)
///   - 1 × silo_nullifier (poseidon2)
///   - 1 × compute_note_hash_nonce (poseidon2)
///   - 1 × compute_unique_note_hash (poseidon2)
///
/// Total: 6 Poseidon2 calls for the simplest possible tx.
pub fn minimal<P: Precompiles>(
    contract_address: AztecAddress<P::Digest>,
    msg_sender: AztecAddress<P::Digest>,
    owner: P::Digest,
    value: P::Digest,
    randomness: P::Digest,
    secret_key: P::Digest,
) -> ExecutionResult<P::Digest> {
    let mut ctx = PrivateContext::new(
        contract_address,
        msg_sender,
        FunctionSelector { inner: 0x01 },
        0,
    );

    // Compute note hash: H(owner, value, randomness)
    let note_hash = P::poseidon2_hash(&[owner, value, randomness]);
    ctx.emit_note_hash(note_hash);

    // Compute nullifier: H_sep(note_hash, secret_key, NOTE_NULLIFIER)
    let nullifier = P::poseidon2_hash_with_separator(
        &[note_hash, secret_key],
        domain_separator::NOTE_NULLIFIER,
    );
    let nh_counter = 0; // the note hash we just emitted
    ctx.emit_nullifier_for_note_hash(nullifier, note_hash, nh_counter);

    ctx.into_execution_result()
}

#[cfg(test)]
mod tests {
    use super::*;
    use zkvm_data_types::field::NativeDigest;
    use zkvm_data_types::precompiles::NativePrecompiles;

    #[test]
    fn minimal_computes_hashes() {
        let result = minimal::<NativePrecompiles>(
            AztecAddress { inner: NativeDigest::from_u64(100) },
            AztecAddress { inner: NativeDigest::from_u64(200) },
            NativeDigest::from_u64(1), // owner
            NativeDigest::from_u64(2), // value
            NativeDigest::from_u64(3), // randomness
            NativeDigest::from_u64(4), // secret_key
        );

        assert_eq!(result.note_hashes.len(), 1);
        assert_eq!(result.nullifiers.len(), 1);
        // Note hash should be a real hash, not just the raw value
        assert_ne!(result.note_hashes[0].value, NativeDigest::from_u64(1));
        // Nullifier references the note hash
        assert_eq!(result.nullifiers[0].nullified_note_hash, result.note_hashes[0].value);
    }

    #[cfg(feature = "bn254")]
    #[test]
    fn minimal_with_real_poseidon2() {
        use zkvm_crypto_bn254::digest::Bn254Digest;
        use zkvm_crypto_bn254::native_precompiles::Bn254Precompiles;

        let result = minimal::<Bn254Precompiles>(
            AztecAddress { inner: Bn254Digest::from_u64(100) },
            AztecAddress { inner: Bn254Digest::from_u64(200) },
            Bn254Digest::from_u64(1),
            Bn254Digest::from_u64(2),
            Bn254Digest::from_u64(3),
            Bn254Digest::from_u64(4),
        );

        assert_eq!(result.note_hashes.len(), 1);
        assert_eq!(result.nullifiers.len(), 1);
        assert!(!result.note_hashes[0].value.is_zero());
        assert!(!result.nullifiers[0].value.is_zero());
    }
}
