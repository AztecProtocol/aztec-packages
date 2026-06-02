#![no_std]
extern crate alloc;

pub mod bundle;
pub mod constants;
pub mod domain_separator;
pub mod field;
pub mod kernel_output;
pub mod precompiles;
pub mod side_effects;
pub mod types;

#[cfg(test)]
mod tests {
    use super::*;
    use field::{Digest, NativeDigest};
    use types::AztecAddress;
    use side_effects::{NoteHash, Nullifier, ScopedNullifier};

    #[test]
    fn serde_roundtrip_note_hash() {
        let nh = NoteHash {
            value: NativeDigest::from_u64(42),
            counter: 7,
        };
        let bytes = postcard::to_allocvec(&nh).unwrap();
        let nh2: NoteHash<NativeDigest> = postcard::from_bytes(&bytes).unwrap();
        assert_eq!(nh, nh2);
    }

    #[test]
    fn serde_roundtrip_scoped_nullifier() {
        let sn = ScopedNullifier {
            nullifier: Nullifier {
                value: NativeDigest::from_u64(100),
                counter: 3,
                nullified_note_hash: NativeDigest::from_u64(42),
            },
            contract_address: AztecAddress { inner: NativeDigest::from_u64(999) },
        };
        let bytes = postcard::to_allocvec(&sn).unwrap();
        let sn2: ScopedNullifier<NativeDigest> = postcard::from_bytes(&bytes).unwrap();
        assert_eq!(sn, sn2);
    }

    #[test]
    fn serde_roundtrip_kernel_public_inputs() {
        use kernel_output::{KernelPublicInputs, TxConstantData, PrivateToRollupAccumulatedData};
        use types::{BlockHeader, Gas, TxContext, GasSettings};

        let kpi = KernelPublicInputs {
            constants: TxConstantData {
                anchor_block_header: BlockHeader {
                    last_archive_root: NativeDigest::from_u64(1),
                    note_hash_tree_root: NativeDigest::from_u64(2),
                    nullifier_tree_root: NativeDigest::from_u64(3),
                    public_data_tree_root: NativeDigest::from_u64(4),
                    l1_to_l2_message_tree_root: NativeDigest::from_u64(5),
                    global_variables_hash: NativeDigest::from_u64(6),
                    block_number: 100,
                    slot_number: 200,
                    timestamp: 1234567890,
                },
                tx_context: TxContext {
                    chain_id: 1,
                    version: 1,
                    gas_settings: GasSettings {
                        gas_limits: Gas { da_gas: 1000, l2_gas: 2000 },
                        teardown_gas_limits: Gas::zero(),
                        max_fees_per_gas: Gas { da_gas: 10, l2_gas: 20 },
                        max_priority_fees_per_gas: Gas::zero(),
                    },
                },
                vk_tree_root: NativeDigest::from_u64(7),
                protocol_contracts_hash: NativeDigest::from_u64(8),
            },
            gas_used: Gas { da_gas: 500, l2_gas: 1000 },
            fee_payer: AztecAddress { inner: NativeDigest::from_u64(42) },
            expiration_timestamp: 9999999,
            for_rollup: Some(PrivateToRollupAccumulatedData {
                note_hashes: alloc::vec![NativeDigest::from_u64(10)],
                nullifiers: alloc::vec![NativeDigest::from_u64(20)],
                l2_to_l1_msgs: alloc::vec![],
                private_logs: alloc::vec![],
                contract_class_log_hashes: alloc::vec![],
            }),
            for_public: None,
        };

        let bytes = postcard::to_allocvec(&kpi).unwrap();
        let kpi2: KernelPublicInputs<NativeDigest> = postcard::from_bytes(&bytes).unwrap();
        assert_eq!(kpi, kpi2);
    }

    #[test]
    fn digest_zero_check() {
        assert!(NativeDigest::zero().is_zero());
        assert!(!NativeDigest::from_u64(1).is_zero());
    }
}
