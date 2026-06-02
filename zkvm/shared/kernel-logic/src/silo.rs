use zkvm_data_types::field::Digest;
use zkvm_data_types::precompiles::Precompiles;
use zkvm_data_types::types::AztecAddress;
use zkvm_data_types::domain_separator;

/// Silo a note hash by contract address.
/// `siloed = poseidon2_hash_with_separator([contract, note_hash], SILOED_NOTE_HASH)`
pub fn silo_note_hash<P: Precompiles>(
    contract: &AztecAddress<P::Digest>,
    note_hash: &P::Digest,
) -> P::Digest {
    P::poseidon2_hash_with_separator(
        &[contract.inner, *note_hash],
        domain_separator::SILOED_NOTE_HASH,
    )
}

/// Silo a nullifier by contract address.
/// `siloed = poseidon2_hash_with_separator([contract, nullifier], SILOED_NULLIFIER)`
pub fn silo_nullifier<P: Precompiles>(
    contract: &AztecAddress<P::Digest>,
    nullifier: &P::Digest,
) -> P::Digest {
    P::poseidon2_hash_with_separator(
        &[contract.inner, *nullifier],
        domain_separator::SILOED_NULLIFIER,
    )
}

/// Compute the nonce for making a note hash unique.
/// `nonce = poseidon2_hash_with_separator([first_nullifier, note_index], NOTE_HASH_NONCE)`
pub fn compute_note_hash_nonce<P: Precompiles>(
    first_nullifier: &P::Digest,
    note_index: u32,
) -> P::Digest {
    let index_digest = P::Digest::from_bytes32(&{
        let mut bytes = [0u8; 32];
        bytes[..4].copy_from_slice(&note_index.to_le_bytes());
        bytes
    });
    P::poseidon2_hash_with_separator(
        &[*first_nullifier, index_digest],
        domain_separator::NOTE_HASH_NONCE,
    )
}

/// Compute a unique note hash from a nonce and a siloed note hash.
/// `unique = poseidon2_hash_with_separator([nonce, siloed], UNIQUE_NOTE_HASH)`
pub fn compute_unique_note_hash<P: Precompiles>(
    nonce: &P::Digest,
    siloed_note_hash: &P::Digest,
) -> P::Digest {
    P::poseidon2_hash_with_separator(
        &[*nonce, *siloed_note_hash],
        domain_separator::UNIQUE_NOTE_HASH,
    )
}
