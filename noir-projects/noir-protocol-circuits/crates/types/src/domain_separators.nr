use crate::{
    constants::{
        DOM_SEP__AUTHWIT_INNER, DOM_SEP__AUTHWIT_NULLIFIER, DOM_SEP__AUTHWIT_OUTER,
        DOM_SEP__BLOCK_HASH, DOM_SEP__CONSTRUCTOR, DOM_SEP__CONTRACT_ADDRESS_V1,
        DOM_SEP__CONTRACT_CLASS_ID, DOM_SEP__EVENT_COMMITMENT, DOM_SEP__FUNCTION_ARGS,
        DOM_SEP__FUNCTION_LEAF, DOM_SEP__INITIALIZATION_NULLIFIER, DOM_SEP__IVSK_M,
        DOM_SEP__MESSAGE_NULLIFIER, DOM_SEP__NOTE_HASH, DOM_SEP__NOTE_HASH_NONCE,
        DOM_SEP__NOTE_NULLIFIER, DOM_SEP__NSK_M, DOM_SEP__OUTER_NULLIFIER, DOM_SEP__OVSK_M,
        DOM_SEP__PARTIAL_ADDRESS, DOM_SEP__PARTIAL_NOTE_VALIDITY_COMMITMENT,
        DOM_SEP__PRIVATE_TX_HASH, DOM_SEP__PROTOCOL_CONTRACTS, DOM_SEP__PUBLIC_BYTECODE,
        DOM_SEP__PUBLIC_CALLDATA, DOM_SEP__PUBLIC_KEYS_HASH, DOM_SEP__PUBLIC_LEAF_INDEX,
        DOM_SEP__PUBLIC_TX_HASH, DOM_SEP__SECRET_HASH, DOM_SEP__SIGNATURE_PAYLOAD,
        DOM_SEP__SILOED_NOTE_HASH, DOM_SEP__SYMMETRIC_KEY, DOM_SEP__SYMMETRIC_KEY_2, DOM_SEP__TSK_M,
        DOM_SEP__TX_NULLIFIER, DOM_SEP__TX_REQUEST, DOM_SEP__UNIQUE_NOTE_HASH,
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
    let dom_sep = dom_sep_hash as u32;
    println(f"dom_sep: {dom_sep}");
    dom_sep
}

// TODO: update all domain separators to use the commented-out string-based approach. It's less brittle.

#[test]
unconstrained fn NOTE_HASH() {
    assert(DOM_SEP__NOTE_HASH == 1, "Unexpected domain separator");
    // assert(DOM_SEP__NOTE_HASH == derive_dom_sep("az_note_hash"), "Unexpected domain separator");
}

#[test]
unconstrained fn NOTE_HASH_NONCE() {
    assert(DOM_SEP__NOTE_HASH_NONCE == 2, "Unexpected domain separator");

    // assert(DOM_SEP__NOTE_HASH_NONCE == derive_dom_sep("az_note_hash_nonce"), "Unexpected domain separator");
}

#[test]
unconstrained fn UNIQUE_NOTE_HASH() {
    assert(DOM_SEP__UNIQUE_NOTE_HASH == 3, "Unexpected domain separator");
    // assert(DOM_SEP__UNIQUE_NOTE_HASH == derive_dom_sep("az_unique_note_hash"), "Unexpected domain separator");
}

#[test]
unconstrained fn SILOED_NOTE_HASH() {
    assert(DOM_SEP__SILOED_NOTE_HASH == 4, "Unexpected domain separator");
    // assert(DOM_SEP__SILOED_NOTE_HASH == derive_dom_sep("az_siloed_note_hash"), "Unexpected domain separator");
}

#[test]
unconstrained fn NOTE_NULLIFIER() {
    assert(DOM_SEP__NOTE_NULLIFIER == 53, "Unexpected domain separator");
    // assert(DOM_SEP__NOTE_NULLIFIER == derive_dom_sep("az_note_nullifier"), "Unexpected domain separator");
}

#[test]
unconstrained fn OUTER_NULLIFIER() {
    assert(DOM_SEP__OUTER_NULLIFIER == 7, "Unexpected domain separator");
    // assert(DOM_SEP__OUTER_NULLIFIER == derive_dom_sep("az_outer_nullifier"), "Unexpected domain separator");
}

#[test]
unconstrained fn PUBLIC_LEAF_INDEX() {
    assert(DOM_SEP__PUBLIC_LEAF_INDEX == 23, "Unexpected domain separator");
    // assert(DOM_SEP__PUBLIC_LEAF_INDEX == derive_dom_sep("az_public_leaf_index"), "Unexpected domain separator");
}

#[test]
unconstrained fn MESSAGE_NULLIFIER() {
    assert(DOM_SEP__MESSAGE_NULLIFIER == 5, "Unexpected domain separator");
    // assert(DOM_SEP__MESSAGE_NULLIFIER == derive_dom_sep("az_message_nullifier"), "Unexpected domain separator");
}

#[test]
unconstrained fn FUNCTION_LEAF() {
    assert(DOM_SEP__FUNCTION_LEAF == 11, "Unexpected domain separator");
    // assert(DOM_SEP__FUNCTION_LEAF == derive_dom_sep("az_function_leaf"), "Unexpected domain separator");
}

#[test]
unconstrained fn PUBLIC_BYTECODE() {
    assert(DOM_SEP__PUBLIC_BYTECODE == 60, "Unexpected domain separator");
    // assert(DOM_SEP__PUBLIC_BYTECODE == derive_dom_sep("az_public_bytecode"), "Unexpected domain separator");
}

#[test]
unconstrained fn CONTRACT_CLASS_ID() {
    assert(DOM_SEP__CONTRACT_CLASS_ID == 16, "Unexpected domain separator");
    // assert(DOM_SEP__CONTRACT_CLASS_ID == derive_dom_sep("az_contract_class_id"), "Unexpected domain separator");
}

#[test]
unconstrained fn CONSTRUCTOR() {
    assert(DOM_SEP__CONSTRUCTOR == 13, "Unexpected domain separator");
    // assert(DOM_SEP__CONSTRUCTOR == derive_dom_sep("az_constructor"), "Unexpected domain separator");
}

#[test]
unconstrained fn NSK_M() {
    assert(DOM_SEP__NSK_M == 48, "Unexpected domain separator");
    // assert(DOM_SEP__NSK_M == derive_dom_sep("az_nsk_m"), "Unexpected domain separator");
}

#[test]
unconstrained fn IVSK_M() {
    assert(DOM_SEP__IVSK_M == 49, "Unexpected domain separator");
    // assert(DOM_SEP__IVSK_M == derive_dom_sep("az_ivsk_m"), "Unexpected domain separator");
}

#[test]
unconstrained fn OVSK_M() {
    assert(DOM_SEP__OVSK_M == 50, "Unexpected domain separator");
    // assert(DOM_SEP__OVSK_M == derive_dom_sep("az_ovsk_m"), "Unexpected domain separator");
}

#[test]
unconstrained fn TSK_M() {
    assert(DOM_SEP__TSK_M == 51, "Unexpected domain separator");
    // assert(DOM_SEP__TSK_M == derive_dom_sep("az_tsk_m"), "Unexpected domain separator");
}

#[test]
unconstrained fn PUBLIC_KEYS_HASH() {
    assert(DOM_SEP__PUBLIC_KEYS_HASH == 52, "Unexpected domain separator");
    // assert(DOM_SEP__PUBLIC_KEYS_HASH == derive_dom_sep("az_public_keys_hash"), "Unexpected domain separator");
}

#[test]
unconstrained fn PARTIAL_ADDRESS() {
    assert(DOM_SEP__PARTIAL_ADDRESS == 27, "Unexpected domain separator");
    // assert(DOM_SEP__PARTIAL_ADDRESS == derive_dom_sep("az_partial_address"), "Unexpected domain separator");
}

#[test]
unconstrained fn CONTRACT_ADDRESS_V1() {
    assert(DOM_SEP__CONTRACT_ADDRESS_V1 == 15, "Unexpected domain separator");
    // assert(DOM_SEP__CONTRACT_ADDRESS_V1 == derive_dom_sep("az_contract_address_v1"), "Unexpected domain separator");
}

#[test]
unconstrained fn BLOCK_HASH() {
    assert(DOM_SEP__BLOCK_HASH == 28, "Unexpected domain separator");
    // assert(DOM_SEP__BLOCK_HASH == derive_dom_sep("az_block_hash"), "Unexpected domain separator");
}

#[test]
unconstrained fn TX_REQUEST() {
    assert(DOM_SEP__TX_REQUEST == 33, "Unexpected domain separator");
    // assert(DOM_SEP__TX_REQUEST == derive_dom_sep("az_tx_request"), "Unexpected domain separator");
}

#[test]
unconstrained fn PUBLIC_TX_HASH() {
    assert(DOM_SEP__PUBLIC_TX_HASH == 56, "Unexpected domain separator");
    // assert(DOM_SEP__PUBLIC_TX_HASH == derive_dom_sep("az_public_tx_hash"), "Unexpected domain separator");
}

#[test]
unconstrained fn PRIVATE_TX_HASH() {
    assert(DOM_SEP__PRIVATE_TX_HASH == 57, "Unexpected domain separator");
    // assert(DOM_SEP__PRIVATE_TX_HASH == derive_dom_sep("az_private_tx_hash"), "Unexpected domain separator");
}

#[test]
unconstrained fn PUBLIC_CALLDATA() {
    assert(DOM_SEP__PUBLIC_CALLDATA == 43, "Unexpected domain separator");
    // assert(DOM_SEP__PUBLIC_CALLDATA == derive_dom_sep("az_public_calldata"), "Unexpected domain separator");
}

#[test]
unconstrained fn FUNCTION_ARGS() {
    assert(DOM_SEP__FUNCTION_ARGS == 44, "Unexpected domain separator");
    // assert(DOM_SEP__FUNCTION_ARGS == derive_dom_sep("az_function_args"), "Unexpected domain separator");
}

#[test]
unconstrained fn PROTOCOL_CONTRACTS() {
    assert(DOM_SEP__PROTOCOL_CONTRACTS == 61, "Unexpected domain separator");
    // assert(DOM_SEP__PROTOCOL_CONTRACTS == derive_dom_sep("az_protocol_contracts"), "Unexpected domain separator");
}

#[test]
unconstrained fn EVENT_COMMITMENT() {
    assert(DOM_SEP__EVENT_COMMITMENT == 59, "Unexpected domain separator");
    // assert(DOM_SEP__EVENT_COMMITMENT == derive_dom_sep("az_event_commitment"), "Unexpected domain separator");
}

#[test]
unconstrained fn AUTHWIT_INNER() {
    assert(DOM_SEP__AUTHWIT_INNER == 45, "Unexpected domain separator");
    // assert(DOM_SEP__AUTHWIT_INNER == derive_dom_sep("az_authwit_inner"), "Unexpected domain separator");
}

#[test]
unconstrained fn AUTHWIT_OUTER() {
    assert(DOM_SEP__AUTHWIT_OUTER == 46, "Unexpected domain separator");
    // assert(DOM_SEP__AUTHWIT_OUTER == derive_dom_sep("az_authwit_outer"), "Unexpected domain separator");
}

#[test]
unconstrained fn AUTHWIT_NULLIFIER() {
    assert(DOM_SEP__AUTHWIT_NULLIFIER == 47, "Unexpected domain separator");
    // assert(DOM_SEP__AUTHWIT_NULLIFIER == derive_dom_sep("az_authwit_nullifier"), "Unexpected domain separator");
}

#[test]
unconstrained fn SYMMETRIC_KEY() {
    assert(DOM_SEP__SYMMETRIC_KEY == 54, "Unexpected domain separator");
    // assert(DOM_SEP__SYMMETRIC_KEY as u32 == derive_dom_sep("az_symmetric_key"), "Unexpected domain separator");
}

#[test]
unconstrained fn SYMMETRIC_KEY_2() {
    assert(DOM_SEP__SYMMETRIC_KEY_2 == 55, "Unexpected domain separator");
    // assert(DOM_SEP__SYMMETRIC_KEY_2 as u32 == derive_dom_sep("az_symmetric_key_2"), "Unexpected domain separator");
}

#[test]
unconstrained fn PARTIAL_NOTE_VALIDITY_COMMITMENT() {
    assert(DOM_SEP__PARTIAL_NOTE_VALIDITY_COMMITMENT == 58, "Unexpected domain separator");
    // assert(DOM_SEP__PARTIAL_NOTE_VALIDITY_COMMITMENT == derive_dom_sep("az_partial_note_validity_commitment"), "Unexpected domain separator");
}

#[test]
unconstrained fn INITIALIZATION_NULLIFIER() {
    assert(DOM_SEP__INITIALIZATION_NULLIFIER == 6, "Unexpected domain separator");
    // assert(DOM_SEP__INITIALIZATION_NULLIFIER == derive_dom_sep("az_initialization_nullifier"), "Unexpected domain separator");
}

#[test]
unconstrained fn SECRET_HASH() {
    assert(DOM_SEP__SECRET_HASH == 20, "Unexpected domain separator");
    // assert(DOM_SEP__SECRET_HASH == derive_dom_sep("az_secret_hash"), "Unexpected domain separator");
}

#[test]
unconstrained fn TX_NULLIFIER() {
    assert(DOM_SEP__TX_NULLIFIER == 32, "Unexpected domain separator");
    // assert(DOM_SEP__TX_NULLIFIER == derive_dom_sep("az_tx_nullifier"), "Unexpected domain separator");
}

#[test]
unconstrained fn SIGNATURE_PAYLOAD() {
    assert(DOM_SEP__SIGNATURE_PAYLOAD == 34, "Unexpected domain separator");
    // assert(DOM_SEP__SIGNATURE_PAYLOAD == derive_dom_sep("az_signature_payload"), "Unexpected domain separator");
}

#[test]
unconstrained fn no_dom_sep_collisions() {
    let dom_seps = [
        DOM_SEP__NOTE_HASH,
        DOM_SEP__NOTE_HASH_NONCE,
        DOM_SEP__UNIQUE_NOTE_HASH,
        DOM_SEP__SILOED_NOTE_HASH,
        DOM_SEP__NOTE_NULLIFIER,
        DOM_SEP__OUTER_NULLIFIER,
        DOM_SEP__PUBLIC_LEAF_INDEX,
        DOM_SEP__MESSAGE_NULLIFIER,
        DOM_SEP__FUNCTION_LEAF,
        DOM_SEP__PUBLIC_BYTECODE,
        DOM_SEP__CONTRACT_CLASS_ID,
        DOM_SEP__CONSTRUCTOR,
        DOM_SEP__NSK_M,
        DOM_SEP__IVSK_M,
        DOM_SEP__OVSK_M,
        DOM_SEP__TSK_M,
        DOM_SEP__PUBLIC_KEYS_HASH,
        DOM_SEP__PARTIAL_ADDRESS,
        DOM_SEP__CONTRACT_ADDRESS_V1,
        DOM_SEP__BLOCK_HASH,
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
        DOM_SEP__SYMMETRIC_KEY as u32,
        DOM_SEP__SYMMETRIC_KEY_2 as u32,
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
