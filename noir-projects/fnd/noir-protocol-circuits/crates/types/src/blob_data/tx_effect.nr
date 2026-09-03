use crate::{
    abis::{
        contract_class_log::ContractClassLog, private_log::PrivateLog,
        public_data_write::PublicDataWrite, public_logs::PublicLogs,
    },
    constants::{
        DOM_SEP__TX_EFFECT_CATEGORIES_HASH, DOM_SEP__TX_EFFECT_CATEGORY_HASH,
        DOM_SEP__TX_EFFECTS_TREE, DOM_SEP__TX_EFFECTS_TREE_LEAF, MAX_CONTRACT_CLASS_LOGS_PER_TX,
        MAX_L2_TO_L1_MSGS_PER_TX, MAX_NOTE_HASHES_PER_TX, MAX_NULLIFIERS_PER_TX,
        MAX_PRIVATE_LOGS_PER_TX, MAX_TOTAL_PUBLIC_DATA_UPDATE_REQUESTS_PER_TX,
        NUM_TX_EFFECT_CATEGORIES, TX_EFFECT_CATEGORIES_HASH_PREIMAGE_LENGTH,
    },
    hash::{compute_contract_class_log_hash, poseidon2_hash_with_separator},
    traits::{Deserialize, Empty, Serialize, ToField},
};
use super::tx_blob_data::{create_tx_blob_data_sections, TxBlobDataSections, TxEffectArrayLengths};

#[derive(Deserialize, Eq, Serialize)]
pub struct TxEffect {
    pub revert_code: u8,
    pub tx_hash: Field,
    pub transaction_fee: Field,
    pub note_hashes: [Field; MAX_NOTE_HASHES_PER_TX],
    pub nullifiers: [Field; MAX_NULLIFIERS_PER_TX],
    pub l2_to_l1_msgs: [Field; MAX_L2_TO_L1_MSGS_PER_TX],
    pub public_data_writes: [PublicDataWrite; MAX_TOTAL_PUBLIC_DATA_UPDATE_REQUESTS_PER_TX],
    pub private_logs: [PrivateLog; MAX_PRIVATE_LOGS_PER_TX],
    pub public_logs: PublicLogs,
    pub contract_class_logs: [ContractClassLog; MAX_CONTRACT_CLASS_LOGS_PER_TX],
    pub contract_class_log_hashes: [Field; MAX_CONTRACT_CLASS_LOGS_PER_TX],
}

impl Empty for TxEffect {
    fn empty() -> Self {
        TxEffect {
            revert_code: 0,
            tx_hash: 0,
            transaction_fee: 0,
            note_hashes: [0; MAX_NOTE_HASHES_PER_TX],
            nullifiers: [0; MAX_NULLIFIERS_PER_TX],
            l2_to_l1_msgs: [0; MAX_L2_TO_L1_MSGS_PER_TX],
            public_data_writes: [
                PublicDataWrite::empty(); MAX_TOTAL_PUBLIC_DATA_UPDATE_REQUESTS_PER_TX
            ],
            private_logs: [PrivateLog::empty(); MAX_PRIVATE_LOGS_PER_TX],
            public_logs: PublicLogs::empty(),
            contract_class_logs: [ContractClassLog::empty(); MAX_CONTRACT_CLASS_LOGS_PER_TX],
            contract_class_log_hashes: [0; MAX_CONTRACT_CLASS_LOGS_PER_TX],
        }
    }
}

/// Hashes all fields of one tx-effect category over that category's commitment preimage.
///
/// This is called once for each of note hashes, nullifiers, L2-to-L1 messages, public-data writes, private logs,
/// public logs and contract-class logs. The resulting seven category hashes are then hashed with the tx start marker
/// and transaction fee to form the categories hash. An empty category hashes to 0 rather than to a hash of nothing;
/// every category count is bound by the tx start marker.
fn compute_tx_effect_category_hash<let N: u32>(blob_fields: [Field; N], length: u32) -> Field {
    if length == 0 {
        0
    } else {
        let inputs_with_separator =
            [(DOM_SEP__TX_EFFECT_CATEGORY_HASH as Field)].concat(blob_fields);
        poseidon::poseidon2::Poseidon2::hash(inputs_with_separator, length + 1)
    }
}

/// The tx start marker and category hashes of a tx effect. They are derived from the same category data, so they are
/// computed together.
fn compute_tx_effect_categories_hash_inputs(
    tx_effect: TxEffect,
    array_lengths: TxEffectArrayLengths,
    blob_data_sections: TxBlobDataSections,
) -> (Field, [Field; NUM_TX_EFFECT_CATEGORIES]) {
    let contract_class_log_hash_fields = [
        tx_effect.contract_class_logs[0].contract_address.to_field(),
        tx_effect.contract_class_log_hashes[0],
    ];
    let num_contract_class_log_hash_fields = array_lengths.contract_class_logs * 2;

    let category_hashes = [
        compute_tx_effect_category_hash(tx_effect.note_hashes, array_lengths.note_hashes),
        compute_tx_effect_category_hash(tx_effect.nullifiers, array_lengths.nullifiers),
        compute_tx_effect_category_hash(tx_effect.l2_to_l1_msgs, array_lengths.l2_to_l1_msgs),
        compute_tx_effect_category_hash(
            blob_data_sections.public_data_write_fields,
            blob_data_sections.num_public_data_write_fields,
        ),
        compute_tx_effect_category_hash(
            blob_data_sections.private_log_fields,
            blob_data_sections.num_private_log_fields,
        ),
        compute_tx_effect_category_hash(
            tx_effect.public_logs.payload,
            tx_effect.public_logs.length,
        ),
        compute_tx_effect_category_hash(
            contract_class_log_hash_fields,
            num_contract_class_log_hash_fields,
        ),
    ];

    (blob_data_sections.tx_start_marker, category_hashes)
}

/// Hash committing to the full contents of a tx's effects.
///
/// The hash is structured rather than flat: each variable-length effect category is hashed on its own first, and
/// this hash is taken over those category hashes plus the small scalar fields inline. Proving a single field (e.g.
/// one note hash) therefore only requires the preimage of that category hash, with the other category hashes as
/// opaque witnesses.
///
/// Each category-hash preimage is that category's slice of the blob encoding over the actual runtime length, except
/// for the contract-class log. Its preimage is the contract address and full padded-log hash that the tx base already
/// validates against the kernel output. The tx start marker binds the revert code, every array count and the total
/// blob field count; the transaction fee is small enough to inline. The tx hash is bound at the leaf level instead.
pub fn compute_tx_effect_categories_hash(
    tx_effect: TxEffect,
    array_lengths: TxEffectArrayLengths,
) -> Field {
    let blob_data_sections = create_tx_blob_data_sections(tx_effect, array_lengths);
    compute_tx_effect_categories_hash_from_blob_data_sections(
        tx_effect,
        array_lengths,
        blob_data_sections,
    )
}

pub fn compute_tx_effect_categories_hash_from_blob_data_sections(
    tx_effect: TxEffect,
    array_lengths: TxEffectArrayLengths,
    blob_data_sections: TxBlobDataSections,
) -> Field {
    let (tx_start_marker, category_hashes) =
        compute_tx_effect_categories_hash_inputs(tx_effect, array_lengths, blob_data_sections);

    let hash_inputs: [Field; TX_EFFECT_CATEGORIES_HASH_PREIMAGE_LENGTH] =
        [tx_start_marker, tx_effect.transaction_fee].concat(category_hashes);

    poseidon2_hash_with_separator(hash_inputs, DOM_SEP__TX_EFFECT_CATEGORIES_HASH)
}

/// This tx's leaf of the block's tx effects tree: a hash binding the tx hash to the hash of the tx's effects.
///
/// A holder of the block header can verify "tx X was included in this block and produced exactly effects E" with a
/// membership proof against `BlockHeader.tx_effects_tree_root`. The verifier must recompute this leaf from the tx
/// effect (or otherwise validate the leaf preimage under `DOM_SEP__TX_EFFECTS_TREE_LEAF`): because the tree has
/// variable-depth paths, accepting a bare untrusted leaf could let an internal node be presented as a leaf.
pub fn compute_tx_effects_tree_leaf(
    tx_effect: TxEffect,
    array_lengths: TxEffectArrayLengths,
) -> Field {
    let blob_data_sections = create_tx_blob_data_sections(tx_effect, array_lengths);
    compute_tx_effects_tree_leaf_from_blob_data_sections(
        tx_effect,
        array_lengths,
        blob_data_sections,
    )
}

pub fn compute_tx_effects_tree_leaf_from_blob_data_sections(
    tx_effect: TxEffect,
    array_lengths: TxEffectArrayLengths,
    blob_data_sections: TxBlobDataSections,
) -> Field {
    poseidon2_hash_with_separator(
        [
            tx_effect.tx_hash,
            compute_tx_effect_categories_hash_from_blob_data_sections(
                tx_effect,
                array_lengths,
                blob_data_sections,
            ),
        ],
        DOM_SEP__TX_EFFECTS_TREE_LEAF,
    )
}

/// Combines the tx effects tree roots of two adjacent subtrees of txs, as the rollup tree is walked upwards.
///
/// Unlike `accumulate_out_hash`, zero roots are NOT skipped: there are no padding txs, so every leaf is a real tx
/// and the tree shape is a function of the number of txs alone. The separator differs from
/// [`DOM_SEP__TX_EFFECTS_TREE_LEAF`], so an internal node can never be confused with a leaf.
pub fn accumulate_tx_effects_tree_root(left_root: Field, right_root: Field) -> Field {
    poseidon2_hash_with_separator([left_root, right_root], DOM_SEP__TX_EFFECTS_TREE)
}

mod tests {
    use crate::{
        abis::{
            contract_class_log::ContractClassLog, log::Log, private_log::PrivateLog,
            public_data_write::PublicDataWrite, public_logs::PublicLogs,
        },
        address::AztecAddress,
        constants::{
            CONTRACT_CLASS_LOG_SIZE_IN_FIELDS, DOM_SEP__TX_EFFECT_CATEGORIES_HASH,
            DOM_SEP__TX_EFFECT_CATEGORY_HASH, DOM_SEP__TX_EFFECTS_TREE,
            DOM_SEP__TX_EFFECTS_TREE_LEAF, FLAT_PUBLIC_LOGS_PAYLOAD_LENGTH,
            MAX_CONTRACT_CLASS_LOGS_PER_TX, MAX_L2_TO_L1_MSGS_PER_TX, MAX_NOTE_HASHES_PER_TX,
            MAX_NULLIFIERS_PER_TX, MAX_PRIVATE_LOGS_PER_TX,
            MAX_TOTAL_PUBLIC_DATA_UPDATE_REQUESTS_PER_TX, MAX_TX_BLOB_DATA_SIZE_IN_FIELDS,
            PRIVATE_LOG_SIZE_IN_FIELDS,
        },
        hash::{compute_contract_class_log_hash, poseidon2_hash_with_separator},
        traits::{Empty, FromField},
    };
    use crate::blob_data::{
        SpongeBlob,
        tx_blob_data::{create_tx_blob_data_sections, create_tx_start_marker},
    };
    use super::{
        accumulate_tx_effects_tree_root, compute_tx_effect_categories_hash,
        compute_tx_effect_categories_hash_inputs, compute_tx_effects_tree_leaf, TxEffect,
        TxEffectArrayLengths,
    };

    /// Copies `items` into a zero-padded array of size `M`.
    fn pad_end<let N: u32, let M: u32>(items: [Field; N]) -> [Field; M] {
        let mut padded = [0; M];
        for i in 0..N {
            padded[i] = items[i];
        }
        padded
    }

    global TX_HASH: Field = 0x1234;
    global TRANSACTION_FEE: Field = 42;
    global REVERT_CODE: u8 = 1;
    global CONTRACT_CLASS_LOG_ADDRESS: Field = 77;
    global PUBLIC_LOG_ADDRESS: Field = 200;

    /// A tx effect with a couple of items in every field, small enough that the expected hashes can be written out
    /// by hand.
    fn small_fixture() -> (TxEffect, TxEffectArrayLengths) {
        let mut tx_effect = TxEffect::empty();
        tx_effect.revert_code = REVERT_CODE;
        tx_effect.tx_hash = TX_HASH;
        tx_effect.transaction_fee = TRANSACTION_FEE;
        tx_effect.note_hashes[0] = 11;
        tx_effect.note_hashes[1] = 12;
        tx_effect.nullifiers[0] = 21;
        tx_effect.l2_to_l1_msgs[0] = 31;
        tx_effect.public_data_writes[0] = PublicDataWrite { leaf_slot: 41, value: 42 };
        tx_effect.private_logs[0] = PrivateLog::new(pad_end([101, 102, 103]), 3);
        // A well-formed encoding of a single public log: `[num_fields, contract_address, ...fields]`. The TS mirror
        // of this fixture builds the payload out of a `PublicLog`, so an arbitrary payload could not be reproduced.
        tx_effect.public_logs = PublicLogs::new(pad_end([2, PUBLIC_LOG_ADDRESS, 201, 202]), 4);
        tx_effect.contract_class_logs[0] = ContractClassLog {
            log: Log::new(pad_end([301, 302]), 2),
            contract_address: AztecAddress::from_field(CONTRACT_CLASS_LOG_ADDRESS),
        };
        tx_effect.contract_class_log_hashes[0] =
            compute_contract_class_log_hash(tx_effect.contract_class_logs[0].log.fields);

        let array_lengths = TxEffectArrayLengths {
            note_hashes: 2,
            nullifiers: 1,
            l2_to_l1_msgs: 1,
            public_data_writes: 1,
            private_logs: 1,
            contract_class_logs: 1,
        };

        (tx_effect, array_lengths)
    }

    fn category_hash<let N: u32>(blob_fields: [Field; N]) -> Field {
        poseidon2_hash_with_separator(blob_fields, DOM_SEP__TX_EFFECT_CATEGORY_HASH)
    }

    /// The tx start marker of the fixture, computed independently of the code under test.
    fn small_fixture_tx_start_marker() -> Field {
        // 3 leading fields, 2 note hashes, 1 nullifier, 1 l2->l1 msg, 1 write (2 fields), 1 private log (1 length
        // field + 3 fields), 4 public log fields, 1 contract class log (1 address field + 2 fields).
        let num_blob_fields = 3 + 2 + 1 + 1 + 2 + 4 + 4 + 3;
        let (_, array_lengths) = small_fixture();
        create_tx_start_marker(
            num_blob_fields,
            array_lengths,
            3, // private_logs_length
            4, // public_logs_length
            2, // contract_class_log_length
            REVERT_CODE,
        )
    }

    #[test]
    fn leaf_of_small_fixture_matches_hand_computed_value() {
        let (tx_effect, array_lengths) = small_fixture();

        let expected_categories_hash = poseidon2_hash_with_separator(
            [
                small_fixture_tx_start_marker(),
                TRANSACTION_FEE,
                category_hash([11, 12]),
                category_hash([21]),
                category_hash([31]),
                category_hash([41, 42]),
                category_hash([3, 101, 102, 103]),
                category_hash([2, PUBLIC_LOG_ADDRESS, 201, 202]),
                category_hash(
                    [CONTRACT_CLASS_LOG_ADDRESS, tx_effect.contract_class_log_hashes[0]],
                ),
            ],
            DOM_SEP__TX_EFFECT_CATEGORIES_HASH,
        );
        assert_eq(
            compute_tx_effect_categories_hash(tx_effect, array_lengths),
            expected_categories_hash,
        );

        let expected_leaf = poseidon2_hash_with_separator(
            [TX_HASH, expected_categories_hash],
            DOM_SEP__TX_EFFECTS_TREE_LEAF,
        );
        assert_eq(compute_tx_effects_tree_leaf(tx_effect, array_lengths), expected_leaf);
    }

    /// Pins the leaf of the fixture against the TypeScript implementation, which mirrors the fixture field for field.
    /// Both sides must agree: the archiver recomputes the tx effects tree root from the effects it decodes from blobs,
    /// and compares it against the root the rollup circuits put in the block header.
    #[test]
    fn leaf_of_small_fixture_matches_typescript() {
        let (tx_effect, array_lengths) = small_fixture();

        // Generated from yarn-project/stdlib/src/tx/tx_effect.test.ts
        let test_data_tx_effect_leaf =
            0x2d0cc62a893d49f71987d6bddb8d5d3f1efe4c7f015cbc8f4b7b2b04331a8978;

        assert_eq(compute_tx_effects_tree_leaf(tx_effect, array_lengths), test_data_tx_effect_leaf);
    }

    /// The sponge must absorb the same field stream as the flat blob encoding.
    #[test]
    fn tx_blob_sections_match_flat_blob_encoding() {
        let (tx_effect, array_lengths) = small_fixture();
        let mut sectioned_sponge = SpongeBlob::init();
        sectioned_sponge.absorb_tx_blob_data(tx_effect, array_lengths);

        let expected_blob_fields: [Field; MAX_TX_BLOB_DATA_SIZE_IN_FIELDS] = pad_end([
            small_fixture_tx_start_marker(),
            TX_HASH,
            TRANSACTION_FEE,
            11,
            12,
            21,
            31,
            41,
            42,
            3,
            101,
            102,
            103,
            2,
            PUBLIC_LOG_ADDRESS,
            201,
            202,
            CONTRACT_CLASS_LOG_ADDRESS,
            301,
            302,
        ]);

        let mut flat_sponge = SpongeBlob::init();
        flat_sponge.absorb(expected_blob_fields, 20);

        assert_eq(sectioned_sponge, flat_sponge);
    }

    #[test]
    fn empty_effect_has_zero_category_hashes() {
        let tx_effect = TxEffect::empty();
        let array_lengths = TxEffectArrayLengths {
            note_hashes: 0,
            nullifiers: 0,
            l2_to_l1_msgs: 0,
            public_data_writes: 0,
            private_logs: 0,
            contract_class_logs: 0,
        };

        let blob_data_sections = create_tx_blob_data_sections(tx_effect, array_lengths);
        let (tx_start_marker, category_hashes) =
            compute_tx_effect_categories_hash_inputs(tx_effect, array_lengths, blob_data_sections);
        assert_eq(category_hashes, [0; 7]);

        // The marker still binds the (zero) counts and the 3 leading blob fields, so the tx effect hash of an
        // effect-less tx is not a hash of nothing.
        let expected_categories_hash = poseidon2_hash_with_separator(
            [tx_start_marker, 0, 0, 0, 0, 0, 0, 0, 0],
            DOM_SEP__TX_EFFECT_CATEGORIES_HASH,
        );
        assert_eq(
            compute_tx_effect_categories_hash(tx_effect, array_lengths),
            expected_categories_hash,
        );
    }

    #[test]
    fn empty_category_hashes_to_zero_while_others_do_not() {
        let mut tx_effect = TxEffect::empty();
        tx_effect.note_hashes[0] = 11;
        let array_lengths = TxEffectArrayLengths {
            note_hashes: 1,
            nullifiers: 0, // Empty, unlike the note hashes.
            l2_to_l1_msgs: 0,
            public_data_writes: 0,
            private_logs: 0,
            contract_class_logs: 0,
        };

        let blob_data_sections = create_tx_blob_data_sections(tx_effect, array_lengths);
        let (_, category_hashes) =
            compute_tx_effect_categories_hash_inputs(tx_effect, array_lengths, blob_data_sections);

        assert_eq(category_hashes[0], category_hash([11]));
        assert(category_hashes[0] != 0);
        // Every other field is empty.
        for i in 1..category_hashes.len() {
            assert_eq(category_hashes[i], 0);
        }
    }

    #[test]
    fn array_counts_are_bound_by_the_tx_start_marker() {
        // One note hash, then a trailing zero note hash counted as real. Reading the second entry as data or as
        // padding must not give the same effect hash, even though the field's payload is unchanged.
        let mut tx_effect = TxEffect::empty();
        tx_effect.note_hashes[0] = 11;

        let mut array_lengths = TxEffectArrayLengths {
            note_hashes: 1,
            nullifiers: 0,
            l2_to_l1_msgs: 0,
            public_data_writes: 0,
            private_logs: 0,
            contract_class_logs: 0,
        };
        let one_note_hash = compute_tx_effect_categories_hash(tx_effect, array_lengths);

        array_lengths.note_hashes = 2;
        let two_note_hashes = compute_tx_effect_categories_hash(tx_effect, array_lengths);

        assert(one_note_hash != two_note_hashes);
    }

    #[test]
    fn equal_count_cross_category_swap_changes_leaf() {
        let mut note_then_nullifier = TxEffect::empty();
        note_then_nullifier.tx_hash = TX_HASH;
        note_then_nullifier.note_hashes[0] = 11;
        note_then_nullifier.nullifiers[0] = 22;

        let mut nullifier_then_note = TxEffect::empty();
        nullifier_then_note.tx_hash = TX_HASH;
        nullifier_then_note.note_hashes[0] = 22;
        nullifier_then_note.nullifiers[0] = 11;

        let array_lengths = TxEffectArrayLengths {
            note_hashes: 1,
            nullifiers: 1,
            l2_to_l1_msgs: 0,
            public_data_writes: 0,
            private_logs: 0,
            contract_class_logs: 0,
        };

        assert(
            compute_tx_effects_tree_leaf(note_then_nullifier, array_lengths)
                != compute_tx_effects_tree_leaf(nullifier_then_note, array_lengths),
        );
    }

    #[test]
    fn scalar_mutations_change_leaf() {
        let (tx_effect, array_lengths) = small_fixture();
        let original_leaf = compute_tx_effects_tree_leaf(tx_effect, array_lengths);

        let (mut changed_revert_code, _) = small_fixture();
        changed_revert_code.revert_code += 1;
        assert(compute_tx_effects_tree_leaf(changed_revert_code, array_lengths) != original_leaf);

        let (mut changed_fee, _) = small_fixture();
        changed_fee.transaction_fee += 1;
        assert(compute_tx_effects_tree_leaf(changed_fee, array_lengths) != original_leaf);

        let (mut changed_tx_hash, _) = small_fixture();
        changed_tx_hash.tx_hash += 1;
        assert(compute_tx_effects_tree_leaf(changed_tx_hash, array_lengths) != original_leaf);
    }

    fn maximum_size_fixture() -> (TxEffect, TxEffectArrayLengths) {
        let mut tx_effect = TxEffect::empty();
        tx_effect.tx_hash = TX_HASH;
        tx_effect.transaction_fee = TRANSACTION_FEE;

        for i in 0..MAX_NOTE_HASHES_PER_TX {
            tx_effect.note_hashes[i] = (i + 1) as Field;
        }
        for i in 0..MAX_NULLIFIERS_PER_TX {
            tx_effect.nullifiers[i] = (i + 101) as Field;
        }
        for i in 0..MAX_L2_TO_L1_MSGS_PER_TX {
            tx_effect.l2_to_l1_msgs[i] = (i + 201) as Field;
        }
        for i in 0..MAX_TOTAL_PUBLIC_DATA_UPDATE_REQUESTS_PER_TX {
            tx_effect.public_data_writes[i] =
                PublicDataWrite { leaf_slot: (i + 301) as Field, value: (i + 401) as Field };
        }
        for i in 0..MAX_PRIVATE_LOGS_PER_TX {
            tx_effect.private_logs[i] = PrivateLog::new(
                [(i + 501) as Field; PRIVATE_LOG_SIZE_IN_FIELDS],
                PRIVATE_LOG_SIZE_IN_FIELDS,
            );
        }
        let mut public_log_payload = [601; FLAT_PUBLIC_LOGS_PAYLOAD_LENGTH];
        public_log_payload[0] = (FLAT_PUBLIC_LOGS_PAYLOAD_LENGTH - 2) as Field;
        public_log_payload[1] = 601;
        tx_effect.public_logs =
            PublicLogs::new(public_log_payload, FLAT_PUBLIC_LOGS_PAYLOAD_LENGTH);
        tx_effect.contract_class_logs[0] = ContractClassLog {
            log: Log::new(
                [701; CONTRACT_CLASS_LOG_SIZE_IN_FIELDS],
                CONTRACT_CLASS_LOG_SIZE_IN_FIELDS,
            ),
            contract_address: AztecAddress::from_field(801),
        };
        tx_effect.contract_class_log_hashes[0] =
            compute_contract_class_log_hash(tx_effect.contract_class_logs[0].log.fields);

        let array_lengths = TxEffectArrayLengths {
            note_hashes: MAX_NOTE_HASHES_PER_TX,
            nullifiers: MAX_NULLIFIERS_PER_TX,
            l2_to_l1_msgs: MAX_L2_TO_L1_MSGS_PER_TX,
            public_data_writes: MAX_TOTAL_PUBLIC_DATA_UPDATE_REQUESTS_PER_TX,
            private_logs: MAX_PRIVATE_LOGS_PER_TX,
            contract_class_logs: MAX_CONTRACT_CLASS_LOGS_PER_TX,
        };

        (tx_effect, array_lengths)
    }

    #[test]
    fn maximum_size_effect_can_be_committed() {
        let (tx_effect, array_lengths) = maximum_size_fixture();
        assert(compute_tx_effects_tree_leaf(tx_effect, array_lengths) != 0);
        let mut sponge = SpongeBlob::init();
        sponge.absorb_tx_blob_data(tx_effect, array_lengths);
        assert(sponge != SpongeBlob::init());
    }

    #[test]
    fn cross_language_fixture_commitments() {
        let empty_lengths = TxEffectArrayLengths {
            note_hashes: 0,
            nullifiers: 0,
            l2_to_l1_msgs: 0,
            public_data_writes: 0,
            private_logs: 0,
            contract_class_logs: 0,
        };
        let empty_leaf = compute_tx_effects_tree_leaf(TxEffect::empty(), empty_lengths);
        let (small_effect, small_lengths) = small_fixture();
        let small_leaf = compute_tx_effects_tree_leaf(small_effect, small_lengths);
        let (maximum_effect, maximum_lengths) = maximum_size_fixture();
        let maximum_leaf = compute_tx_effects_tree_leaf(maximum_effect, maximum_lengths);
        let three_tx_root = accumulate_tx_effects_tree_root(
            accumulate_tx_effects_tree_root(empty_leaf, small_leaf),
            maximum_leaf,
        );

        let test_data_empty_tx_effect_leaf =
            0x036639112ad40a8f951bfcc348b9906cee3f554dd05d0903c6e32a42d3f15d5a;
        let test_data_maximum_tx_effect_leaf =
            0x228fa718cc3dd39f719454454739a177add7a7ee2a127c3923f47a6b23d68118;
        let test_data_three_tx_effects_tree_root =
            0x10aefe4df8cb37d89dc3278432c6c732c7b3740fb53d5ef128f86f9a9b4bbafb;

        assert_eq(empty_leaf, test_data_empty_tx_effect_leaf);
        assert_eq(maximum_leaf, test_data_maximum_tx_effect_leaf);
        assert_eq(three_tx_root, test_data_three_tx_effects_tree_root);
    }

    #[test]
    fn leaf_effect_hash_and_category_hashes_are_all_distinct() {
        let (tx_effect, array_lengths) = small_fixture();

        let leaf = compute_tx_effects_tree_leaf(tx_effect, array_lengths);
        let categories_hash = compute_tx_effect_categories_hash(tx_effect, array_lengths);
        let blob_data_sections = create_tx_blob_data_sections(tx_effect, array_lengths);
        let (tx_start_marker, category_hashes) =
            compute_tx_effect_categories_hash_inputs(tx_effect, array_lengths, blob_data_sections);

        assert(leaf != categories_hash);
        assert(leaf != TX_HASH);
        assert(categories_hash != TX_HASH);
        assert(leaf != tx_start_marker);
        assert(categories_hash != tx_start_marker);

        for i in 0..category_hashes.len() {
            assert(category_hashes[i] != 0);
            assert(category_hashes[i] != leaf);
            assert(category_hashes[i] != categories_hash);
            assert(category_hashes[i] != TX_HASH);
            for j in 0..i {
                assert(category_hashes[i] != category_hashes[j]);
            }
        }
    }

    #[test]
    fn tx_effects_tree_node_is_domain_separated_from_the_leaf() {
        let left = 111;
        let right = 222;

        assert_eq(
            accumulate_tx_effects_tree_root(left, right),
            poseidon2_hash_with_separator([left, right], DOM_SEP__TX_EFFECTS_TREE),
        );
        // Zero roots are not skipped, unlike `accumulate_out_hash`.
        assert(accumulate_tx_effects_tree_root(left, 0) != left);
        assert(accumulate_tx_effects_tree_root(0, right) != right);
        // A node can never be mistaken for a leaf.
        assert(
            accumulate_tx_effects_tree_root(left, right)
                != poseidon2_hash_with_separator([left, right], DOM_SEP__TX_EFFECTS_TREE_LEAF),
        );
    }
}
