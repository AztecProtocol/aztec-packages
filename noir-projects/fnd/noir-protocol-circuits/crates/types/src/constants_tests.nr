use crate::{
    address::AztecAddress,
    constants::{
        BLOCK_END_PREFIX, CHECKPOINT_END_PREFIX, CONTRACT_CLASS_PUBLISHED_MAGIC_VALUE,
        CONTRACT_CLASS_REGISTRY_BYTECODE_CAPSULE_SLOT, CONTRACT_INSTANCE_PUBLISHED_MAGIC_VALUE,
        CONTRACT_INSTANCE_UPDATED_MAGIC_VALUE, DOM_SEP__APP_SILOED_ECDH_SHARED_SECRET,
        DOM_SEP__AUTHWIT_INNER, DOM_SEP__AUTHWIT_OUTER, DOM_SEP__BLOB_CHALLENGE_Z,
        DOM_SEP__BLOB_GAMMA_ACC, DOM_SEP__BLOB_GAMMA_FINAL, DOM_SEP__BLOB_HASHED_Y_LIMBS,
        DOM_SEP__BLOB_Z_ACC, DOM_SEP__BLOCK_HEADER_HASH, DOM_SEP__BLOCK_HEADERS_HASH,
        DOM_SEP__CONSTRAINED_MSG_LOG_TAG, DOM_SEP__CONSTRAINED_MSG_SENDER_SECRET,
        DOM_SEP__CONTRACT_ADDRESS_V2, DOM_SEP__CONTRACT_CLASS_ID, DOM_SEP__EVENT_COMMITMENT,
        DOM_SEP__EVENT_LOG_TAG, DOM_SEP__FBSK_M, DOM_SEP__FUNCTION_ARGS,
        DOM_SEP__HANDSHAKE_FORGERY_PROTECTION, DOM_SEP__INITIALIZER,
        DOM_SEP__INTERACTIVE_HANDSHAKE_SIGNATURE, DOM_SEP__IVSK_M, DOM_SEP__MERKLE_HASH,
        DOM_SEP__MESSAGE_NULLIFIER, DOM_SEP__MSSK_M, DOM_SEP__NHK_M,
        DOM_SEP__NON_INTERACTIVE_HANDSHAKE_LOG_TAG, DOM_SEP__NOTE_HASH, DOM_SEP__NOTE_HASH_NONCE,
        DOM_SEP__NOTE_NULLIFIER, DOM_SEP__NULLIFIER_MERKLE, DOM_SEP__OVSK_M,
        DOM_SEP__PARTIAL_ADDRESS, DOM_SEP__PARTIAL_NOTE_VALIDITY_COMMITMENT,
        DOM_SEP__PRIVATE_FUNCTION_LEAF, DOM_SEP__PRIVATE_INITIALIZATION_NULLIFIER,
        DOM_SEP__PRIVATE_LOG_FIRST_FIELD, DOM_SEP__PRIVATE_TX_HASH, DOM_SEP__PROTOCOL_CONTRACTS,
        DOM_SEP__PUBLIC_BYTECODE, DOM_SEP__PUBLIC_CALLDATA, DOM_SEP__PUBLIC_DATA_MERKLE,
        DOM_SEP__PUBLIC_INITIALIZATION_NULLIFIER, DOM_SEP__PUBLIC_KEYS_HASH,
        DOM_SEP__PUBLIC_LEAF_SLOT, DOM_SEP__PUBLIC_STORAGE_MAP_SLOT, DOM_SEP__PUBLIC_TX_HASH,
        DOM_SEP__RETRIEVED_BYTECODES_MERKLE, DOM_SEP__SALTED_INITIALIZATION_HASH,
        DOM_SEP__SECRET_HASH, DOM_SEP__SIGNATURE_PAYLOAD, DOM_SEP__SILOED_NOTE_HASH,
        DOM_SEP__SILOED_NULLIFIER, DOM_SEP__SINGLE_PUBLIC_KEY_HASH, DOM_SEP__TSK_M,
        DOM_SEP__TX_EFFECT_FIELD_HASH, DOM_SEP__TX_EFFECT_HASH, DOM_SEP__TX_EFFECT_LEAF,
        DOM_SEP__TX_EFFECTS_TREE, DOM_SEP__TX_REQUEST, DOM_SEP__UNCONSTRAINED_MSG_LOG_TAG,
        DOM_SEP__UNIQUE_NOTE_HASH, DOM_SEP__WRITTEN_SLOTS_MERKLE, NULL_MSG_SENDER_CONTRACT_ADDRESS,
        SIDE_EFFECT_MASKING_ADDRESS, TX_START_PREFIX,
    },
    hash::poseidon2_hash_bytes,
    traits::{FromField, ToField},
};

// Prefixes for hashing constants.
global DOM_SEP_PREFIX: str<10> = "az_dom_sep"; // For domain separators.
global PROTOCOL_CIRCUIT_PREFIX: str<5> = "az_pc"; // For constants used in the protocol circuits.
global AZTEC_NR_PREFIX: str<5> = "az_nr"; // For constants used in aztec-nr.

struct HashedValueTester<let NUM_VALUES: u32, let NUM_U32_VALUES: u32> {
    seen_u32: BoundedVec<u32, NUM_U32_VALUES>,
    seen_values: BoundedVec<Field, NUM_VALUES>,
}

impl<let NUM_VALUES: u32, let NUM_U32_VALUES: u32> HashedValueTester<NUM_VALUES, NUM_U32_VALUES> {
    pub fn new() -> Self {
        Self { seen_u32: BoundedVec::new(), seen_values: BoundedVec::new() }
    }

    fn assert_dom_sep_matches_derived<let N: u32>(
        &mut self,
        expected_dom_sep: u32,
        dom_sep_str: str<N>,
    ) {
        // For legacy reasons, we reduce the domain separator to a u32.
        // Most separators are simply used as a standalone field element when hashing
        // (via `poseidon2_hash_with_separator`) and would work fine as Fields. However, `DOM_SEP__PUBLIC_BYTECODE` is
        // an exception: in `compute_public_bytecode_commitment`, it is bit-packed into the low 32 bits of a field, with
        // the bytecode length shifted into bits 32+. Changing it to a Field would corrupt the length encoding.
        let derived = self.hash_to_u32(DOM_SEP_PREFIX, dom_sep_str);
        assert_eq(
            expected_dom_sep,
            derived,
            f"Unexpected domain separator: {dom_sep_str} (derived: {derived})",
        );
    }

    pub fn assert_protocol_circuit_values_matches_derived<let N: u32>(
        &mut self,
        expected_value: Field,
        name: str<N>,
    ) {
        let derived = self.hash_to_field(PROTOCOL_CIRCUIT_PREFIX, name);
        assert_eq(
            expected_value,
            derived,
            f"Unexpected protocol circuit value: {name} (derived: {derived})",
        );
    }

    pub fn assert_blob_prefixes_match_derived<let N: u32>(
        &mut self,
        expected_value: Field,
        name: str<N>,
    ) {
        // Blob prefixes are defined as Fields. But they only occupy part of a field (see create_tx_start_marker,
        // create_block_end_marker, create_checkpoint_end_marker), so we limit the actual values to be u32.
        let derived = self.hash_to_u32(PROTOCOL_CIRCUIT_PREFIX, name) as Field;
        assert_eq(expected_value, derived, f"Unexpected blob prefix: {name} (derived: {derived})");
    }

    pub fn assert_aztec_nr_values_matches_derived<let N: u32>(
        &mut self,
        expected_value: Field,
        name: str<N>,
    ) {
        let derived = self.hash_to_field(AZTEC_NR_PREFIX, name);
        assert_eq(
            expected_value,
            derived,
            f"Unexpected aztec-nr value: {name} (derived: {derived})",
        );
    }

    pub fn assert_unique(self) {
        Self::assert_unique_values(self.seen_u32, |a, b| a <= b);
        Self::assert_unique_values(self.seen_values, |a, b| !b.lt(a));
    }

    fn hash_to_field<let P: u32, let N: u32>(&mut self, prefix: str<P>, name: str<N>) -> Field {
        let bytes = prefix.as_bytes().concat("__".as_bytes()).concat(name.as_bytes());
        let hash = poseidon2_hash_bytes(bytes);
        self.seen_values.push(hash);
        hash
    }

    fn hash_to_u32<let P: u32, let N: u32>(&mut self, prefix: str<P>, name: str<N>) -> u32 {
        let hash = self.hash_to_field(prefix, name) as u32;
        self.seen_u32.push(hash);
        hash
    }

    fn assert_unique_values<Env, T, let N: u32>(
        values: BoundedVec<T, N>,
        ordering: fn[Env](T, T) -> bool,
    )
    where
        T: Eq,
    {
        let len = values.len();
        assert_eq(len, N, f"BoundedVec length too large. Reduce it from {N} to {len}.");

        let sorted = values.storage().sort_via(ordering);
        for i in 1..sorted.len() {
            let prev = sorted[i - 1];
            assert(sorted[i] != prev, f"Duplicate value: {prev}");
        }
    }
}

#[test]
fn hashed_values_match_derived() {
    let mut tester = HashedValueTester::<71, 66>::new();

    // -----------------
    // Domain separators
    // -----------------
    tester.assert_dom_sep_matches_derived(DOM_SEP__NOTE_HASH, "note_hash");
    tester.assert_dom_sep_matches_derived(DOM_SEP__NOTE_HASH_NONCE, "note_hash_nonce");
    tester.assert_dom_sep_matches_derived(DOM_SEP__UNIQUE_NOTE_HASH, "unique_note_hash");
    tester.assert_dom_sep_matches_derived(DOM_SEP__SILOED_NOTE_HASH, "siloed_note_hash");
    tester.assert_dom_sep_matches_derived(DOM_SEP__NOTE_NULLIFIER, "note_nullifier");
    tester.assert_dom_sep_matches_derived(DOM_SEP__SILOED_NULLIFIER, "siloed_nullifier");
    tester.assert_dom_sep_matches_derived(
        DOM_SEP__PRIVATE_LOG_FIRST_FIELD,
        "private_log_first_field",
    );
    tester.assert_dom_sep_matches_derived(DOM_SEP__PUBLIC_LEAF_SLOT, "public_leaf_slot");
    tester.assert_dom_sep_matches_derived(
        DOM_SEP__PUBLIC_STORAGE_MAP_SLOT,
        "public_storage_map_slot",
    );
    tester.assert_dom_sep_matches_derived(DOM_SEP__EVENT_LOG_TAG, "event_log_tag");
    tester.assert_dom_sep_matches_derived(
        DOM_SEP__UNCONSTRAINED_MSG_LOG_TAG,
        "unconstrained_msg_log_tag",
    );
    tester.assert_dom_sep_matches_derived(
        DOM_SEP__CONSTRAINED_MSG_LOG_TAG,
        "constrained_msg_log_tag",
    );
    tester.assert_dom_sep_matches_derived(
        DOM_SEP__CONSTRAINED_MSG_SENDER_SECRET,
        "constrained_msg_sender_secret",
    );
    tester.assert_dom_sep_matches_derived(
        DOM_SEP__NON_INTERACTIVE_HANDSHAKE_LOG_TAG,
        "non_interactive_handshake_log_tag",
    );
    tester.assert_dom_sep_matches_derived(
        DOM_SEP__INTERACTIVE_HANDSHAKE_SIGNATURE,
        "interactive_handshake_signature",
    );
    tester.assert_dom_sep_matches_derived(
        DOM_SEP__HANDSHAKE_FORGERY_PROTECTION,
        "handshake_forgery_protection",
    );
    tester.assert_dom_sep_matches_derived(DOM_SEP__MESSAGE_NULLIFIER, "message_nullifier");
    tester.assert_dom_sep_matches_derived(DOM_SEP__PRIVATE_FUNCTION_LEAF, "private_function_leaf");
    tester.assert_dom_sep_matches_derived(DOM_SEP__PUBLIC_BYTECODE, "public_bytecode");
    tester.assert_dom_sep_matches_derived(DOM_SEP__CONTRACT_CLASS_ID, "contract_class_id");
    tester.assert_dom_sep_matches_derived(DOM_SEP__INITIALIZER, "initializer");
    tester.assert_dom_sep_matches_derived(
        DOM_SEP__SALTED_INITIALIZATION_HASH,
        "salted_initialization_hash",
    );
    tester.assert_dom_sep_matches_derived(DOM_SEP__NHK_M, "nhk_m");
    tester.assert_dom_sep_matches_derived(DOM_SEP__IVSK_M, "ivsk_m");
    tester.assert_dom_sep_matches_derived(DOM_SEP__OVSK_M, "ovsk_m");
    tester.assert_dom_sep_matches_derived(DOM_SEP__TSK_M, "tsk_m");
    tester.assert_dom_sep_matches_derived(DOM_SEP__MSSK_M, "mssk_m");
    tester.assert_dom_sep_matches_derived(DOM_SEP__FBSK_M, "fbsk_m");
    tester.assert_dom_sep_matches_derived(DOM_SEP__PUBLIC_KEYS_HASH, "public_keys_hash");
    tester.assert_dom_sep_matches_derived(DOM_SEP__SINGLE_PUBLIC_KEY_HASH, "single_public_key_hash");
    tester.assert_dom_sep_matches_derived(DOM_SEP__PARTIAL_ADDRESS, "partial_address");
    tester.assert_dom_sep_matches_derived(DOM_SEP__CONTRACT_ADDRESS_V2, "contract_address_v2");
    tester.assert_dom_sep_matches_derived(DOM_SEP__BLOCK_HEADER_HASH, "block_header_hash");
    tester.assert_dom_sep_matches_derived(DOM_SEP__TX_REQUEST, "tx_request");
    tester.assert_dom_sep_matches_derived(DOM_SEP__PUBLIC_TX_HASH, "public_tx_hash");
    tester.assert_dom_sep_matches_derived(DOM_SEP__PRIVATE_TX_HASH, "private_tx_hash");
    tester.assert_dom_sep_matches_derived(DOM_SEP__TX_EFFECT_FIELD_HASH, "tx_effect_field_hash");
    tester.assert_dom_sep_matches_derived(DOM_SEP__TX_EFFECT_HASH, "tx_effect_hash");
    tester.assert_dom_sep_matches_derived(DOM_SEP__TX_EFFECT_LEAF, "tx_effect_leaf");
    tester.assert_dom_sep_matches_derived(DOM_SEP__TX_EFFECTS_TREE, "tx_effects_tree");
    tester.assert_dom_sep_matches_derived(DOM_SEP__PUBLIC_CALLDATA, "public_calldata");
    tester.assert_dom_sep_matches_derived(DOM_SEP__FUNCTION_ARGS, "function_args");
    tester.assert_dom_sep_matches_derived(DOM_SEP__PROTOCOL_CONTRACTS, "protocol_contracts");
    tester.assert_dom_sep_matches_derived(DOM_SEP__EVENT_COMMITMENT, "event_commitment");
    tester.assert_dom_sep_matches_derived(DOM_SEP__AUTHWIT_INNER, "authwit_inner");
    tester.assert_dom_sep_matches_derived(DOM_SEP__AUTHWIT_OUTER, "authwit_outer");
    tester.assert_dom_sep_matches_derived(
        DOM_SEP__APP_SILOED_ECDH_SHARED_SECRET,
        "app_siloed_ecdh_shared_secret",
    );
    tester.assert_dom_sep_matches_derived(
        DOM_SEP__PARTIAL_NOTE_VALIDITY_COMMITMENT,
        "partial_note_validity_commitment",
    );
    tester.assert_dom_sep_matches_derived(
        DOM_SEP__PUBLIC_INITIALIZATION_NULLIFIER,
        "public_initialization_nullifier",
    );
    tester.assert_dom_sep_matches_derived(
        DOM_SEP__PRIVATE_INITIALIZATION_NULLIFIER,
        "private_initialization_nullifier",
    );
    tester.assert_dom_sep_matches_derived(DOM_SEP__SECRET_HASH, "secret_hash");
    tester.assert_dom_sep_matches_derived(DOM_SEP__SIGNATURE_PAYLOAD, "signature_payload");
    tester.assert_dom_sep_matches_derived(DOM_SEP__BLOCK_HEADERS_HASH, "block_headers_hash");
    tester.assert_dom_sep_matches_derived(DOM_SEP__BLOB_HASHED_Y_LIMBS, "blob_hashed_y_limbs");
    tester.assert_dom_sep_matches_derived(DOM_SEP__BLOB_CHALLENGE_Z, "blob_challenge_z");
    tester.assert_dom_sep_matches_derived(DOM_SEP__BLOB_Z_ACC, "blob_z_acc");
    tester.assert_dom_sep_matches_derived(DOM_SEP__BLOB_GAMMA_ACC, "blob_gamma_acc");
    tester.assert_dom_sep_matches_derived(DOM_SEP__BLOB_GAMMA_FINAL, "blob_gamma_final");
    tester.assert_dom_sep_matches_derived(DOM_SEP__MERKLE_HASH, "merkle_hash");
    tester.assert_dom_sep_matches_derived(DOM_SEP__NULLIFIER_MERKLE, "nullifier_merkle");
    tester.assert_dom_sep_matches_derived(DOM_SEP__PUBLIC_DATA_MERKLE, "public_data_merkle");
    tester.assert_dom_sep_matches_derived(DOM_SEP__WRITTEN_SLOTS_MERKLE, "written_slots_merkle");
    tester.assert_dom_sep_matches_derived(
        DOM_SEP__RETRIEVED_BYTECODES_MERKLE,
        "retrieved_bytecodes_merkle",
    );

    // --------------------------
    // Protocol circuit constants
    // --------------------------
    tester.assert_protocol_circuit_values_matches_derived(
        SIDE_EFFECT_MASKING_ADDRESS.to_field(),
        "side_effect_masking_address",
    );
    tester.assert_blob_prefixes_match_derived(TX_START_PREFIX, "blob_tx_start");
    tester.assert_blob_prefixes_match_derived(BLOCK_END_PREFIX, "blob_block_end");
    tester.assert_blob_prefixes_match_derived(CHECKPOINT_END_PREFIX, "blob_checkpoint_end");

    // ------------------
    // Aztec-nr constants
    // ------------------
    tester.assert_aztec_nr_values_matches_derived(
        CONTRACT_CLASS_REGISTRY_BYTECODE_CAPSULE_SLOT,
        "contract_class_registry_bytecode_capsule_slot",
    );
    tester.assert_aztec_nr_values_matches_derived(
        CONTRACT_CLASS_PUBLISHED_MAGIC_VALUE,
        "contract_class_published",
    );
    tester.assert_aztec_nr_values_matches_derived(
        CONTRACT_INSTANCE_PUBLISHED_MAGIC_VALUE,
        "contract_instance_published",
    );
    tester.assert_aztec_nr_values_matches_derived(
        CONTRACT_INSTANCE_UPDATED_MAGIC_VALUE,
        "contract_instance_updated",
    );

    tester.assert_unique();
}

#[test]
fn null_msg_sender_contract_address_matches_derived() {
    assert_eq(NULL_MSG_SENDER_CONTRACT_ADDRESS, AztecAddress::from_field(-1));
}

#[test(should_fail_with = "Duplicate value: 0x20f5895a4e837356c2d551743df6bf642756dcd93cd31cbd37c556c90bf7f244")]
fn assert_unique_values_can_catch_duplicate_fields() {
    let mut tester = HashedValueTester::<3, 1>::new();
    tester.assert_aztec_nr_values_matches_derived(
        CONTRACT_CLASS_PUBLISHED_MAGIC_VALUE,
        "contract_class_published",
    );
    tester.assert_dom_sep_matches_derived(DOM_SEP__SILOED_NOTE_HASH, "siloed_note_hash");
    tester.assert_aztec_nr_values_matches_derived(
        CONTRACT_CLASS_PUBLISHED_MAGIC_VALUE,
        "contract_class_published",
    );
    tester.assert_unique();
}

#[test(should_fail_with = "Duplicate value: 3361878420")]
fn assert_unique_values_can_catch_duplicate_u32s() {
    let mut tester = HashedValueTester::<3, 2>::new();
    tester.assert_dom_sep_matches_derived(DOM_SEP__SILOED_NOTE_HASH, "siloed_note_hash");
    tester.assert_aztec_nr_values_matches_derived(
        CONTRACT_CLASS_PUBLISHED_MAGIC_VALUE,
        "contract_class_published",
    );
    tester.assert_dom_sep_matches_derived(DOM_SEP__SILOED_NOTE_HASH, "siloed_note_hash");
    tester.assert_unique();
}
