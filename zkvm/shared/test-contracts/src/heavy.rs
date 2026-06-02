use zkvm_data_types::field::Digest;
use zkvm_data_types::precompiles::Precompiles;
use zkvm_data_types::side_effects::ExecutionResult;
use zkvm_data_types::types::{AztecAddress, FunctionSelector};
use zkvm_data_types::domain_separator;
use zkvm_aztec_sdk::context::PrivateContext;

/// Heavy workload: many side effects, all with real hashing.
/// 16 note hashes + 16 nullifiers + 8 logs + 2 public calls.
/// Crypto: ~40 Poseidon2 (16 note hashes + 16 nullifiers + 8 log hashes).
pub fn heavy<P: Precompiles>(
    contract_address: AztecAddress<P::Digest>,
    msg_sender: AztecAddress<P::Digest>,
    secret_key: P::Digest,
) -> ExecutionResult<P::Digest> {
    let mut ctx = PrivateContext::new(
        contract_address, msg_sender,
        FunctionSelector { inner: 0x01 },
        0,
    );

    for i in 0..16u32 {
        let owner = msg_sender.inner;
        let value = P::Digest::from_bytes32(&{
            let mut b = [0u8; 32]; b[0] = i as u8; b[1] = 0x01; b
        });
        let randomness = P::Digest::from_bytes32(&{
            let mut b = [0u8; 32]; b[0] = i as u8; b[1] = 0x02; b
        });

        let note_hash = P::poseidon2_hash(&[owner, value, randomness]);
        ctx.emit_note_hash(note_hash);

        let nullifier = P::poseidon2_hash_with_separator(
            &[note_hash, secret_key],
            domain_separator::NOTE_NULLIFIER,
        );
        ctx.emit_nullifier(nullifier);
    }

    for i in 0..8u32 {
        let log_content = P::Digest::from_bytes32(&{
            let mut b = [0u8; 32]; b[0] = i as u8; b[1] = 0x03; b
        });
        ctx.emit_private_log(alloc::vec![log_content]);
    }

    for i in 0..2u32 {
        let calldata = P::Digest::from_bytes32(&{
            let mut b = [0u8; 32]; b[0] = i as u8; b[1] = 0x04; b
        });
        ctx.enqueue_public_call(
            contract_address, FunctionSelector { inner: 0x10 + i }, calldata,
        );
    }

    ctx.into_execution_result()
}

#[cfg(test)]
mod tests {
    use super::*;
    use zkvm_data_types::field::NativeDigest;
    use zkvm_data_types::precompiles::NativePrecompiles;

    #[test]
    fn heavy_counts_and_real_hashes() {
        let result = heavy::<NativePrecompiles>(
            AztecAddress { inner: NativeDigest::from_u64(1) },
            AztecAddress { inner: NativeDigest::from_u64(2) },
            NativeDigest::from_u64(42),
        );
        assert_eq!(result.note_hashes.len(), 16);
        assert_eq!(result.nullifiers.len(), 16);
        assert_eq!(result.private_logs.len(), 8);
        assert_eq!(result.public_call_requests.len(), 2);
        // Hashes are computed, not zero
        assert!(!result.note_hashes[0].value.is_zero());
    }
}
