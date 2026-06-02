use alloc::vec::Vec;
use zkvm_data_types::bundle::TransientSquashPair;
use zkvm_data_types::field::Digest;
use zkvm_data_types::kernel_output::KernelError;
use zkvm_data_types::side_effects::{ScopedNoteHash, ScopedNullifier};

/// Build transient squash hints (host-side, not proven).
///
/// Identifies pairs of (note_hash, nullifier) that cancel each other within
/// the same transaction. A note_hash at index i is squashed by a nullifier at
/// index j if:
/// - They share the same contract_address
/// - The nullifier's nullified_note_hash equals the note_hash's value
/// - The note_hash counter maps to the nullifier counter in the provided map
///
/// Ported from build_transient_data_hints.ts.
pub fn build_transient_squash_hints<D: Digest>(
    note_hashes: &[ScopedNoteHash<D>],
    nullifiers: &[ScopedNullifier<D>],
    nh_to_nullifier_counter: &[(u32, u32)],
) -> Vec<TransientSquashPair> {
    let mut pairs = Vec::new();

    for (nh_idx, nh) in note_hashes.iter().enumerate() {
        // Find if this note hash has a corresponding nullifier counter
        let nh_counter = nh.note_hash.counter;
        if let Some(&(_, n_counter)) = nh_to_nullifier_counter
            .iter()
            .find(|&&(nhc, _)| nhc == nh_counter)
        {
            // Find the nullifier with matching counter
            if let Some((n_idx, _)) = nullifiers.iter().enumerate().find(|(_, n)| {
                n.nullifier.counter == n_counter
                    && n.contract_address == nh.contract_address
                    && n.nullifier.nullified_note_hash == nh.note_hash.value
            }) {
                pairs.push(TransientSquashPair {
                    note_hash_index: nh_idx as u32,
                    nullifier_index: n_idx as u32,
                });
            }
        }
    }

    pairs
}

/// Verify transient squash hints (guest-side, proven).
///
/// For each claimed pair, verify the note_hash and nullifier actually match,
/// then return the remaining (non-squashed) items.
pub fn verify_transient_squash<D: Digest>(
    note_hashes: &[ScopedNoteHash<D>],
    nullifiers: &[ScopedNullifier<D>],
    hints: &[TransientSquashPair],
) -> Result<(Vec<ScopedNoteHash<D>>, Vec<ScopedNullifier<D>>), KernelError> {
    let mut squashed_nh: alloc::collections::BTreeSet<u32> = alloc::collections::BTreeSet::new();
    let mut squashed_n: alloc::collections::BTreeSet<u32> = alloc::collections::BTreeSet::new();

    for pair in hints {
        let nh_idx = pair.note_hash_index;
        let n_idx = pair.nullifier_index;

        let nh = note_hashes.get(nh_idx as usize).ok_or(KernelError::InvalidSquashPair {
            note_hash_index: nh_idx,
            nullifier_index: n_idx,
            reason: "note hash index out of bounds",
        })?;
        let n = nullifiers.get(n_idx as usize).ok_or(KernelError::InvalidSquashPair {
            note_hash_index: nh_idx,
            nullifier_index: n_idx,
            reason: "nullifier index out of bounds",
        })?;

        // Verify same contract
        if nh.contract_address != n.contract_address {
            return Err(KernelError::InvalidSquashPair {
                note_hash_index: nh_idx,
                nullifier_index: n_idx,
                reason: "contract address mismatch",
            });
        }

        // Verify the nullifier references this note hash
        if n.nullifier.nullified_note_hash != nh.note_hash.value {
            return Err(KernelError::InvalidSquashPair {
                note_hash_index: nh_idx,
                nullifier_index: n_idx,
                reason: "nullified_note_hash does not match note hash value",
            });
        }

        squashed_nh.insert(nh_idx);
        squashed_n.insert(n_idx);
    }

    // Filter out squashed items
    let remaining_nhs: Vec<_> = note_hashes
        .iter()
        .enumerate()
        .filter(|(i, _)| !squashed_nh.contains(&(*i as u32)))
        .map(|(_, nh)| *nh)
        .collect();

    let remaining_ns: Vec<_> = nullifiers
        .iter()
        .enumerate()
        .filter(|(i, _)| !squashed_n.contains(&(*i as u32)))
        .map(|(_, n)| *n)
        .collect();

    Ok((remaining_nhs, remaining_ns))
}

#[cfg(test)]
mod tests {
    use super::*;
    use zkvm_data_types::field::NativeDigest;
    use zkvm_data_types::side_effects::{NoteHash, Nullifier};
    use zkvm_data_types::types::AztecAddress;

    fn make_nh(value: u64, counter: u32, contract: u64) -> ScopedNoteHash<NativeDigest> {
        ScopedNoteHash {
            note_hash: NoteHash { value: NativeDigest::from_u64(value), counter },
            contract_address: AztecAddress { inner: NativeDigest::from_u64(contract) },
        }
    }

    fn make_n(value: u64, counter: u32, nullified_nh: u64, contract: u64) -> ScopedNullifier<NativeDigest> {
        ScopedNullifier {
            nullifier: Nullifier {
                value: NativeDigest::from_u64(value),
                counter,
                nullified_note_hash: NativeDigest::from_u64(nullified_nh),
            },
            contract_address: AztecAddress { inner: NativeDigest::from_u64(contract) },
        }
    }

    #[test]
    fn squash_matching_pair() {
        let nhs = alloc::vec![make_nh(42, 0, 100)];
        let ns = alloc::vec![make_n(99, 1, 42, 100)];
        let map = alloc::vec![(0u32, 1u32)];

        let hints = build_transient_squash_hints(&nhs, &ns, &map);
        assert_eq!(hints.len(), 1);

        let (remaining_nhs, remaining_ns) = verify_transient_squash(&nhs, &ns, &hints).unwrap();
        assert_eq!(remaining_nhs.len(), 0);
        assert_eq!(remaining_ns.len(), 0);
    }

    #[test]
    fn squash_mismatched_contract_rejected() {
        let nhs = alloc::vec![make_nh(42, 0, 100)];
        let ns = alloc::vec![make_n(99, 1, 42, 200)]; // different contract
        let hints = alloc::vec![TransientSquashPair { note_hash_index: 0, nullifier_index: 0 }];

        let result = verify_transient_squash(&nhs, &ns, &hints);
        assert!(result.is_err());
    }

    #[test]
    fn squash_preserves_non_transient() {
        let nhs = alloc::vec![make_nh(42, 0, 100), make_nh(43, 2, 100)];
        let ns = alloc::vec![make_n(99, 1, 42, 100), make_n(88, 3, 0, 100)]; // second nullifier doesn't match any nh
        let hints = alloc::vec![TransientSquashPair { note_hash_index: 0, nullifier_index: 0 }];

        let (remaining_nhs, remaining_ns) = verify_transient_squash(&nhs, &ns, &hints).unwrap();
        assert_eq!(remaining_nhs.len(), 1); // nh(43) remains
        assert_eq!(remaining_ns.len(), 1);  // n(88) remains
    }
}
