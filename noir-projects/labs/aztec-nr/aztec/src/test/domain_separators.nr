//! Domain separator tests.
//!
//! Every domain separator is derived by truncating a poseidon hash to `u32` (see the `az_dom_sep` derivation in the
//! protocol crate), so all separators - whether owned by the protocol or by aztec-nr - share a single `u32` space. A
//! collision would let one hashing context be substituted for another.
//!
//! This test checks two things about aztec-nr's separators: that each matches the value derived from its name, and
//! that the whole set (every aztec-nr separator plus every protocol separator) is collision-free. The protocol enforces
//! the same for its own separators in its own tests.

use crate::authwit::account::DOM_SEP__TX_NULLIFIER;
use crate::authwit::auth::DOM_SEP__AUTHWIT_NULLIFIER;
use crate::keys::ecdh_shared_secret::{DOM_SEP__ECDH_FIELD_MASK, DOM_SEP__ECDH_SUBKEY};
use crate::macros::functions::initialization_utils::DOM_SEP__INITIALIZATION_NULLIFIER;
use crate::messages::delivery::constrained_delivery::DOM_SEP__CONSTRAINED_MSG_NULLIFIER;
use crate::note::partial_note::{DOM_SEP__NOTE_COMPLETION_LOG_TAG, DOM_SEP__PARTIAL_NOTE_COMMITMENT};
use crate::state_vars::single_use_claim::DOM_SEP__SINGLE_USE_CLAIM_NULLIFIER;

use crate::protocol::constants::{
    DOM_SEP__APP_SILOED_ECDH_SHARED_SECRET, DOM_SEP__AUTHWIT_INNER, DOM_SEP__AUTHWIT_OUTER, DOM_SEP__BLOB_CHALLENGE_Z,
    DOM_SEP__BLOB_GAMMA_ACC, DOM_SEP__BLOB_GAMMA_FINAL, DOM_SEP__BLOB_HASHED_Y_LIMBS, DOM_SEP__BLOB_Z_ACC,
    DOM_SEP__BLOCK_HEADER_HASH, DOM_SEP__BLOCK_HEADERS_HASH, DOM_SEP__CONSTRAINED_MSG_LOG_TAG,
    DOM_SEP__CONSTRAINED_MSG_SENDER_SECRET, DOM_SEP__CONTRACT_ADDRESS_V2, DOM_SEP__CONTRACT_CLASS_ID,
    DOM_SEP__EVENT_COMMITMENT, DOM_SEP__EVENT_LOG_TAG, DOM_SEP__FBSK_M, DOM_SEP__FUNCTION_ARGS,
    DOM_SEP__HANDSHAKE_FORGERY_PROTECTION, DOM_SEP__INITIALIZER, DOM_SEP__INTERACTIVE_HANDSHAKE_SIGNATURE,
    DOM_SEP__IVSK_M, DOM_SEP__MERKLE_HASH, DOM_SEP__MESSAGE_NULLIFIER, DOM_SEP__MSSK_M, DOM_SEP__NHK_M,
    DOM_SEP__NON_INTERACTIVE_HANDSHAKE_LOG_TAG, DOM_SEP__NOTE_HASH, DOM_SEP__NOTE_HASH_NONCE, DOM_SEP__NOTE_NULLIFIER,
    DOM_SEP__NULLIFIER_MERKLE, DOM_SEP__OVSK_M, DOM_SEP__PARTIAL_ADDRESS, DOM_SEP__PARTIAL_NOTE_VALIDITY_COMMITMENT,
    DOM_SEP__PRIVATE_FUNCTION_LEAF, DOM_SEP__PRIVATE_INITIALIZATION_NULLIFIER, DOM_SEP__PRIVATE_LOG_FIRST_FIELD,
    DOM_SEP__PRIVATE_TX_HASH, DOM_SEP__PROTOCOL_CONTRACTS, DOM_SEP__PUBLIC_BYTECODE, DOM_SEP__PUBLIC_CALLDATA,
    DOM_SEP__PUBLIC_DATA_MERKLE, DOM_SEP__PUBLIC_INITIALIZATION_NULLIFIER, DOM_SEP__PUBLIC_KEYS_HASH,
    DOM_SEP__PUBLIC_LEAF_SLOT, DOM_SEP__PUBLIC_STORAGE_MAP_SLOT, DOM_SEP__PUBLIC_TX_HASH,
    DOM_SEP__RETRIEVED_BYTECODES_MERKLE, DOM_SEP__SALTED_INITIALIZATION_HASH, DOM_SEP__SECRET_HASH,
    DOM_SEP__SIGNATURE_PAYLOAD, DOM_SEP__SILOED_NOTE_HASH, DOM_SEP__SILOED_NULLIFIER, DOM_SEP__SINGLE_PUBLIC_KEY_HASH,
    DOM_SEP__TSK_M, DOM_SEP__TX_REQUEST, DOM_SEP__UNCONSTRAINED_MSG_LOG_TAG, DOM_SEP__UNIQUE_NOTE_HASH,
    DOM_SEP__WRITTEN_SLOTS_MERKLE,
};
use crate::protocol::hash::poseidon2_hash_bytes;

/// The complete set of domain separators owned by the protocol.
///
/// Kept in sync with the `protocol_types` crate.
global PROTOCOL_DOMAIN_SEPARATORS: [u32; 59] = [
    DOM_SEP__NOTE_HASH,
    DOM_SEP__NOTE_HASH_NONCE,
    DOM_SEP__UNIQUE_NOTE_HASH,
    DOM_SEP__SILOED_NOTE_HASH,
    DOM_SEP__NOTE_NULLIFIER,
    DOM_SEP__SILOED_NULLIFIER,
    DOM_SEP__PRIVATE_LOG_FIRST_FIELD,
    DOM_SEP__PUBLIC_LEAF_SLOT,
    DOM_SEP__PUBLIC_STORAGE_MAP_SLOT,
    DOM_SEP__EVENT_LOG_TAG,
    DOM_SEP__UNCONSTRAINED_MSG_LOG_TAG,
    DOM_SEP__CONSTRAINED_MSG_LOG_TAG,
    DOM_SEP__CONSTRAINED_MSG_SENDER_SECRET,
    DOM_SEP__NON_INTERACTIVE_HANDSHAKE_LOG_TAG,
    DOM_SEP__INTERACTIVE_HANDSHAKE_SIGNATURE,
    DOM_SEP__HANDSHAKE_FORGERY_PROTECTION,
    DOM_SEP__MESSAGE_NULLIFIER,
    DOM_SEP__PRIVATE_FUNCTION_LEAF,
    DOM_SEP__PUBLIC_BYTECODE,
    DOM_SEP__CONTRACT_CLASS_ID,
    DOM_SEP__INITIALIZER,
    DOM_SEP__SALTED_INITIALIZATION_HASH,
    DOM_SEP__NHK_M,
    DOM_SEP__IVSK_M,
    DOM_SEP__OVSK_M,
    DOM_SEP__TSK_M,
    DOM_SEP__MSSK_M,
    DOM_SEP__FBSK_M,
    DOM_SEP__PUBLIC_KEYS_HASH,
    DOM_SEP__SINGLE_PUBLIC_KEY_HASH,
    DOM_SEP__PARTIAL_ADDRESS,
    DOM_SEP__CONTRACT_ADDRESS_V2,
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
    DOM_SEP__APP_SILOED_ECDH_SHARED_SECRET,
    DOM_SEP__PARTIAL_NOTE_VALIDITY_COMMITMENT,
    DOM_SEP__PUBLIC_INITIALIZATION_NULLIFIER,
    DOM_SEP__PRIVATE_INITIALIZATION_NULLIFIER,
    DOM_SEP__SECRET_HASH,
    DOM_SEP__SIGNATURE_PAYLOAD,
    DOM_SEP__BLOCK_HEADERS_HASH,
    DOM_SEP__BLOB_HASHED_Y_LIMBS,
    DOM_SEP__BLOB_CHALLENGE_Z,
    DOM_SEP__BLOB_Z_ACC,
    DOM_SEP__BLOB_GAMMA_ACC,
    DOM_SEP__BLOB_GAMMA_FINAL,
    DOM_SEP__MERKLE_HASH,
    DOM_SEP__NULLIFIER_MERKLE,
    DOM_SEP__PUBLIC_DATA_MERKLE,
    DOM_SEP__WRITTEN_SLOTS_MERKLE,
    DOM_SEP__RETRIEVED_BYTECODES_MERKLE,
];

/// Prefix (and `__` joiner) hashed to derive every domain separator's `u32` value.
global DOMAIN_SEPARATOR_PREFIX: str<10> = "az_dom_sep";

#[test]
unconstrained fn domain_separators_are_valid() {
    // Every separator lives in one u32 space, so the whole set must be collision-free. Start from the protocol
    // separators (uniqueness only, as their derivation is checked by the protocol's own tests) and add aztec-nr's on
    // top (checking their derivation as we go).
    let mut all = PROTOCOL_DOMAIN_SEPARATORS.as_vector();

    // aztec-nr-owned separators
    all = all.push_back(derived(DOM_SEP__PARTIAL_NOTE_COMMITMENT, "partial_note_commitment"));
    all = all.push_back(derived(DOM_SEP__NOTE_COMPLETION_LOG_TAG, "note_completion_log_tag"));
    all = all
        .push_back(
            derived(
                DOM_SEP__SINGLE_USE_CLAIM_NULLIFIER,
                "single_use_claim_nullifier",
            ),
        );
    all = all.push_back(derived(DOM_SEP__TX_NULLIFIER, "tx_nullifier"));
    all = all.push_back(derived(DOM_SEP__AUTHWIT_NULLIFIER, "authwit_nullifier"));
    all = all.push_back(derived(DOM_SEP__ECDH_SUBKEY, "ecdh_subkey"));
    all = all.push_back(derived(DOM_SEP__ECDH_FIELD_MASK, "ecdh_field_mask"));
    all = all
        .push_back(
            derived(
                DOM_SEP__INITIALIZATION_NULLIFIER,
                "initialization_nullifier",
            ),
        );
    all = all
        .push_back(
            derived(
                DOM_SEP__CONSTRAINED_MSG_NULLIFIER,
                "constrained_msg_nullifier",
            ),
        );

    assert_all_unique(all);
}

/// Asserts `value` is the domain separator derived from `name`, and returns it.
fn derived<let N: u32>(value: u32, name: str<N>) -> u32 {
    let bytes = DOMAIN_SEPARATOR_PREFIX.as_bytes().concat("__".as_bytes()).concat(name.as_bytes());
    assert(value == poseidon2_hash_bytes(bytes) as u32);
    value
}

fn assert_all_unique(separators: [u32]) {
    for i in 0..separators.len() {
        for j in i + 1..separators.len() {
            assert(separators[i] != separators[j]);
        }
    }
}
