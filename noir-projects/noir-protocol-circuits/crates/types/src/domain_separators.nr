use crate::{
    constants::{
        DOM_SEP__AUTHWIT_INNER, DOM_SEP__AUTHWIT_NULLIFIER, DOM_SEP__AUTHWIT_OUTER,
        DOM_SEP__BLOCK_HEADER_HASH, DOM_SEP__CONTRACT_ADDRESS_V1, DOM_SEP__CONTRACT_CLASS_ID,
        DOM_SEP__EVENT_COMMITMENT, DOM_SEP__FUNCTION_ARGS, DOM_SEP__INITIALIZATION_NULLIFIER,
        DOM_SEP__INITIALIZER, DOM_SEP__IVSK_M, DOM_SEP__MESSAGE_NULLIFIER, DOM_SEP__NHK_M,
        DOM_SEP__NOTE_HASH, DOM_SEP__NOTE_HASH_NONCE, DOM_SEP__NOTE_NULLIFIER, DOM_SEP__OVSK_M,
        DOM_SEP__PARTIAL_ADDRESS, DOM_SEP__PARTIAL_NOTE_VALIDITY_COMMITMENT,
        DOM_SEP__PRIVATE_FUNCTION_LEAF, DOM_SEP__PRIVATE_LOG_FIRST_FIELD, DOM_SEP__PRIVATE_TX_HASH,
        DOM_SEP__PROTOCOL_CONTRACTS, DOM_SEP__PUBLIC_BYTECODE, DOM_SEP__PUBLIC_CALLDATA,
        DOM_SEP__PUBLIC_KEYS_HASH, DOM_SEP__PUBLIC_LEAF_SLOT, DOM_SEP__PUBLIC_STORAGE_MAP_SLOT,
        DOM_SEP__PUBLIC_TX_HASH, DOM_SEP__SECRET_HASH, DOM_SEP__SIGNATURE_PAYLOAD,
        DOM_SEP__SILOED_NOTE_HASH, DOM_SEP__SILOED_NULLIFIER, DOM_SEP__SYMMETRIC_KEY,
        DOM_SEP__SYMMETRIC_KEY_2, DOM_SEP__TSK_M, DOM_SEP__TX_NULLIFIER, DOM_SEP__TX_REQUEST,
        DOM_SEP__UNIQUE_NOTE_HASH,
    },
    hash::poseidon2_hash,
    traits::ToField,
};

// Regression tests:

// Domain separators are human-readable strings.
// We hash them, for "nothing up my sleeve" purposes, and so that
// we can tidily use the first 4 bytes of the hash as a domain separator.
// For legacy reasons, we reduce the domain separator to a u32.
fn derive_dom_sep<let N: u32>(dom_sep_str: str<N>) -> u32 {
    let dom_sep_field = dom_sep_str.to_field();
    let dom_sep_hash = poseidon2_hash([dom_sep_field]);
    dom_sep_hash as u32
}

fn assert_dom_sep_matches_derived<let N: u32>(expected_dom_sep: u32, dom_sep_str: str<N>) {
    let derived = derive_dom_sep(dom_sep_str);
    assert_eq(
        expected_dom_sep,
        derived,
        f"Unexpected domain separator: {dom_sep_str} (derived: {derived})",
    );
}

#[test]
unconstrained fn note_hash_matches_derived() {
    assert_dom_sep_matches_derived(DOM_SEP__NOTE_HASH, "az_note_hash");
}

#[test]
unconstrained fn note_hash_nonce_matches_derived() {
    assert_dom_sep_matches_derived(DOM_SEP__NOTE_HASH_NONCE, "az_note_hash_nonce");
}

#[test]
unconstrained fn unique_note_hash_matches_derived() {
    assert_dom_sep_matches_derived(DOM_SEP__UNIQUE_NOTE_HASH, "az_unique_note_hash");
}

#[test]
unconstrained fn siloed_note_hash_matches_derived() {
    assert_dom_sep_matches_derived(DOM_SEP__SILOED_NOTE_HASH, "az_siloed_note_hash");
}

#[test]
unconstrained fn note_nullifier_matches_derived() {
    assert_dom_sep_matches_derived(DOM_SEP__NOTE_NULLIFIER, "az_note_nullifier");
}

#[test]
unconstrained fn siloed_nullifier_matches_derived() {
    assert_dom_sep_matches_derived(DOM_SEP__SILOED_NULLIFIER, "az_siloed_nullifier");
}

#[test]
unconstrained fn private_log_first_field_matches_derived() {
    assert_dom_sep_matches_derived(
        DOM_SEP__PRIVATE_LOG_FIRST_FIELD,
        "az_private_log_first_field",
    );
}

#[test]
unconstrained fn public_leaf_slot_matches_derived() {
    assert_dom_sep_matches_derived(DOM_SEP__PUBLIC_LEAF_SLOT, "az_public_leaf_slot");
}

#[test]
unconstrained fn public_storage_map_slot_matches_derived() {
    assert_dom_sep_matches_derived(
        DOM_SEP__PUBLIC_STORAGE_MAP_SLOT,
        "az_public_storage_map_slot",
    );
}

#[test]
unconstrained fn message_nullifier_matches_derived() {
    assert_dom_sep_matches_derived(DOM_SEP__MESSAGE_NULLIFIER, "az_message_nullifier");
}

#[test]
unconstrained fn private_function_leaf_matches_derived() {
    assert_dom_sep_matches_derived(DOM_SEP__PRIVATE_FUNCTION_LEAF, "az_private_function_leaf");
}

#[test]
unconstrained fn public_bytecode_matches_derived() {
    assert_dom_sep_matches_derived(DOM_SEP__PUBLIC_BYTECODE, "az_public_bytecode");
}

#[test]
unconstrained fn contract_class_id_matches_derived() {
    assert_dom_sep_matches_derived(DOM_SEP__CONTRACT_CLASS_ID, "az_contract_class_id");
}

#[test]
unconstrained fn initializer_matches_derived() {
    assert_dom_sep_matches_derived(DOM_SEP__INITIALIZER, "az_initializer");
}

#[test]
unconstrained fn nhk_m_matches_derived() {
    assert_dom_sep_matches_derived(DOM_SEP__NHK_M, "az_nhk_m");
}

#[test]
unconstrained fn ivsk_m_matches_derived() {
    assert_dom_sep_matches_derived(DOM_SEP__IVSK_M, "az_ivsk_m");
}

#[test]
unconstrained fn ovsk_m_matches_derived() {
    assert_dom_sep_matches_derived(DOM_SEP__OVSK_M, "az_ovsk_m");
}

#[test]
unconstrained fn tsk_m_matches_derived() {
    assert_dom_sep_matches_derived(DOM_SEP__TSK_M, "az_tsk_m");
}

#[test]
unconstrained fn public_keys_hash_matches_derived() {
    assert_dom_sep_matches_derived(DOM_SEP__PUBLIC_KEYS_HASH, "az_public_keys_hash");
}

#[test]
unconstrained fn partial_address_matches_derived() {
    assert_dom_sep_matches_derived(DOM_SEP__PARTIAL_ADDRESS, "az_partial_address");
}

#[test]
unconstrained fn contract_address_v1_matches_derived() {
    assert_dom_sep_matches_derived(DOM_SEP__CONTRACT_ADDRESS_V1, "az_contract_address_v1");
}

#[test]
unconstrained fn block_header_hash_matches_derived() {
    assert_dom_sep_matches_derived(DOM_SEP__BLOCK_HEADER_HASH, "az_block_header_hash");
}

#[test]
unconstrained fn tx_request_matches_derived() {
    assert_dom_sep_matches_derived(DOM_SEP__TX_REQUEST, "az_tx_request");
}

#[test]
unconstrained fn public_tx_hash_matches_derived() {
    assert_dom_sep_matches_derived(DOM_SEP__PUBLIC_TX_HASH, "az_public_tx_hash");
}

#[test]
unconstrained fn private_tx_hash_matches_derived() {
    assert_dom_sep_matches_derived(DOM_SEP__PRIVATE_TX_HASH, "az_private_tx_hash");
}

#[test]
unconstrained fn public_calldata_matches_derived() {
    assert_dom_sep_matches_derived(DOM_SEP__PUBLIC_CALLDATA, "az_public_calldata");
}

#[test]
unconstrained fn function_args_matches_derived() {
    assert_dom_sep_matches_derived(DOM_SEP__FUNCTION_ARGS, "az_function_args");
}

#[test]
unconstrained fn protocol_contracts_matches_derived() {
    assert_dom_sep_matches_derived(DOM_SEP__PROTOCOL_CONTRACTS, "az_protocol_contracts");
}

#[test]
unconstrained fn event_commitment_matches_derived() {
    assert_dom_sep_matches_derived(DOM_SEP__EVENT_COMMITMENT, "az_event_commitment");
}

#[test]
unconstrained fn authwit_inner_matches_derived() {
    assert_dom_sep_matches_derived(DOM_SEP__AUTHWIT_INNER, "az_authwit_inner");
}

#[test]
unconstrained fn authwit_outer_matches_derived() {
    assert_dom_sep_matches_derived(DOM_SEP__AUTHWIT_OUTER, "az_authwit_outer");
}

#[test]
unconstrained fn authwit_nullifier_matches_derived() {
    assert_dom_sep_matches_derived(DOM_SEP__AUTHWIT_NULLIFIER, "az_authwit_nullifier");
}

#[test]
unconstrained fn symmetric_key_matches_derived() {
    assert_dom_sep_matches_derived(DOM_SEP__SYMMETRIC_KEY, "az_symmetric_key");
}

#[test]
unconstrained fn symmetric_key_2_matches_derived() {
    assert_dom_sep_matches_derived(DOM_SEP__SYMMETRIC_KEY_2, "az_symmetric_key_2");
}

#[test]
unconstrained fn partial_note_validity_commitment_matches_derived() {
    // Using shorter string "az_partial_note_validity" because the full string exceeds 31 chars
    assert_dom_sep_matches_derived(
        DOM_SEP__PARTIAL_NOTE_VALIDITY_COMMITMENT,
        "az_partial_note_validity",
    );
}

#[test]
unconstrained fn initialization_nullifier_matches_derived() {
    assert_dom_sep_matches_derived(
        DOM_SEP__INITIALIZATION_NULLIFIER,
        "az_initialization_nullifier",
    );
}

#[test]
unconstrained fn secret_hash_matches_derived() {
    assert_dom_sep_matches_derived(DOM_SEP__SECRET_HASH, "az_secret_hash");
}

#[test]
unconstrained fn tx_nullifier_matches_derived() {
    assert_dom_sep_matches_derived(DOM_SEP__TX_NULLIFIER, "az_tx_nullifier");
}

#[test]
unconstrained fn signature_payload_matches_derived() {
    assert_dom_sep_matches_derived(DOM_SEP__SIGNATURE_PAYLOAD, "az_signature_payload");
}

#[test]
unconstrained fn no_dom_sep_collisions() {
    let dom_seps = [
        DOM_SEP__NOTE_HASH,
        DOM_SEP__NOTE_HASH_NONCE,
        DOM_SEP__UNIQUE_NOTE_HASH,
        DOM_SEP__SILOED_NOTE_HASH,
        DOM_SEP__NOTE_NULLIFIER,
        DOM_SEP__SILOED_NULLIFIER,
        DOM_SEP__PRIVATE_LOG_FIRST_FIELD,
        DOM_SEP__PUBLIC_LEAF_SLOT,
        DOM_SEP__PUBLIC_STORAGE_MAP_SLOT,
        DOM_SEP__MESSAGE_NULLIFIER,
        DOM_SEP__PRIVATE_FUNCTION_LEAF,
        DOM_SEP__PUBLIC_BYTECODE,
        DOM_SEP__CONTRACT_CLASS_ID,
        DOM_SEP__INITIALIZER,
        DOM_SEP__NHK_M,
        DOM_SEP__IVSK_M,
        DOM_SEP__OVSK_M,
        DOM_SEP__TSK_M,
        DOM_SEP__PUBLIC_KEYS_HASH,
        DOM_SEP__PARTIAL_ADDRESS,
        DOM_SEP__CONTRACT_ADDRESS_V1,
        DOM_SEP__BLOCK_HEADER_HASH,
        DOM_SEP__TX_REQUEST,
        DOM_SEP__PUBLIC_TX_HASH,
        DOM_SEP__PRIVATE_TX_HASH,
        DOM_SEP__PUBLIC_CALLDATA,
        DOM_SEP__FUNCTION_ARGS,
        DOM_SEP__PROTOCOL_CONTRACTS,
        DOM_SEP__EVENT_COMMITMENT,
        DOM_SEP__AUTHWIT_INNER,
        DOM_SEP__AUTHWIT_OUTER,
        DOM_SEP__AUTHWIT_NULLIFIER,
        DOM_SEP__SYMMETRIC_KEY,
        DOM_SEP__SYMMETRIC_KEY_2,
        DOM_SEP__PARTIAL_NOTE_VALIDITY_COMMITMENT,
        DOM_SEP__INITIALIZATION_NULLIFIER,
        DOM_SEP__SECRET_HASH,
        DOM_SEP__TX_NULLIFIER,
        DOM_SEP__SIGNATURE_PAYLOAD,
    ];

    for i in 0..dom_seps.len() {
        for j in (i + 1)..dom_seps.len() {
            assert(
                dom_seps[i] != dom_seps[j],
                f"Duplicate domain separators found at indices {i} {j}",
            );
        }
    }
}
