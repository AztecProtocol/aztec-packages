use zkvm_data_types::field::Digest;
use zkvm_data_types::precompiles::Precompiles;
use zkvm_data_types::side_effects::ExecutionResult;
use zkvm_data_types::types::{AztecAddress, FunctionSelector};
use zkvm_data_types::domain_separator;
use zkvm_aztec_sdk::context::PrivateContext;

/// Kernel-heavy: 32 transient note-nullifier pairs, all with real hashing.
/// Every note hash has a matching nullifier — stresses squashing logic.
/// Crypto: ~64 Poseidon2 (32 note hashes + 32 nullifiers).
pub fn kernel_heavy<P: Precompiles>(
    contract_address: AztecAddress<P::Digest>,
    msg_sender: AztecAddress<P::Digest>,
    secret_key: P::Digest,
) -> ExecutionResult<P::Digest> {
    let mut ctx = PrivateContext::new(
        contract_address, msg_sender,
        FunctionSelector { inner: 0x01 },
        0,
    );

    for i in 0..32u32 {
        let owner = msg_sender.inner;
        let value = P::Digest::from_bytes32(&{
            let mut b = [0u8; 32]; b[0] = i as u8; b[1] = 0x01; b
        });
        let randomness = P::Digest::from_bytes32(&{
            let mut b = [0u8; 32]; b[0] = i as u8; b[1] = 0x02; b
        });

        let note_hash = P::poseidon2_hash(&[owner, value, randomness]);
        ctx.emit_note_hash(note_hash);
        let nh_counter = ctx.current_counter() - 1;

        let nullifier = P::poseidon2_hash_with_separator(
            &[note_hash, secret_key],
            domain_separator::NOTE_NULLIFIER,
        );
        ctx.emit_nullifier_for_note_hash(nullifier, note_hash, nh_counter);
    }

    ctx.into_execution_result()
}

#[cfg(test)]
mod tests {
    use super::*;
    use zkvm_data_types::field::NativeDigest;
    use zkvm_data_types::precompiles::NativePrecompiles;

    #[test]
    fn kernel_heavy_pairs_with_real_hashes() {
        let result = kernel_heavy::<NativePrecompiles>(
            AztecAddress { inner: NativeDigest::from_u64(1) },
            AztecAddress { inner: NativeDigest::from_u64(2) },
            NativeDigest::from_u64(42),
        );
        assert_eq!(result.note_hashes.len(), 32);
        assert_eq!(result.nullifiers.len(), 32);
        assert_eq!(result.note_hash_nullifier_counters.len(), 32);
        // Each nullifier references its note hash
        for (nh, n) in result.note_hashes.iter().zip(result.nullifiers.iter()) {
            assert_eq!(n.nullified_note_hash, nh.value);
            assert!(!nh.value.is_zero());
        }
    }
}
