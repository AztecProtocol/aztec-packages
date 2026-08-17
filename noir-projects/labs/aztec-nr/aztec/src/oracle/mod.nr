//! Standard PXE oracles.

use crate::macros::oracle_testing::{generate_oracle_tests, generate_oracle_tests_excluding};

#[generate_oracle_tests_excluding(
    @[
        // Not implemented by TXE/PXE, so we won't test them.
        quote { transaction_fee_opcode },
        quote { min_fee_per_l2_gas_opcode },
        quote { min_fee_per_da_gas_opcode },
        quote { l2_gas_left_opcode },
        quote { da_gas_left_opcode },
        quote { note_hash_exists_opcode },
        quote { l1_to_l2_msg_exists_opcode },
        quote { send_l2_to_l1_msg_opcode },
        quote { calldata_copy_opcode },
        quote { return_opcode },
        quote { revert_opcode },
    ],
)]
pub mod avm;
#[generate_oracle_tests]
pub mod aes128_decrypt;
#[generate_oracle_tests]
pub mod auth_witness;
#[generate_oracle_tests]
pub mod block_header;
#[generate_oracle_tests]
pub mod call_private_function;
#[generate_oracle_tests]
pub mod call_utility_function;
#[generate_oracle_tests]
pub mod capsules;
#[generate_oracle_tests]
pub(crate) mod ephemeral_oracles;
#[generate_oracle_tests]
pub(crate) mod transient_oracles;
#[generate_oracle_tests]
pub mod contract_sync;
#[generate_oracle_tests_excluding(
    @[
        // TODO: implement once the test resolver can serve EphemeralArray contents.
        quote { record_fact_oracle },
        quote { get_fact_collection_oracle },
        quote { get_fact_collections_by_type_oracle },
    ],
)]
pub mod fact_store;
#[generate_oracle_tests]
pub mod public_call;
// TODO: cover with oracle tests once the test resolver can serve EphemeralArray contents.
pub mod tx_resolution;
#[generate_oracle_tests]
pub mod resolve_custom_request;
#[generate_oracle_tests_excluding(
    @[
        // TODO: needs a hand-written multi-scenario synthesizer entry (enum-like type with private fields,
        // one named scenario per constructor) on both sides.
        quote { resolve_tagging_strategy_oracle },
    ],
)]
pub mod resolve_tagging_strategy;
#[generate_oracle_tests]
pub mod tx_phase;
#[generate_oracle_tests]
pub mod execution;
#[generate_oracle_tests]
pub mod execution_cache;
#[generate_oracle_tests]
pub mod get_contract_instance;
#[generate_oracle_tests]
pub mod get_l1_to_l2_membership_witness;
#[generate_oracle_tests]
pub mod get_nullifier_membership_witness;
#[generate_oracle_tests]
pub mod get_public_data_witness;
#[generate_oracle_tests_excluding(
    @[
        // TODO: cover once the test resolver can serve EphemeralArray contents.
        quote { are_block_hashes_in_archive_oracle },
    ],
)]
pub mod get_membership_witness;
#[generate_oracle_tests]
pub mod keys;
#[generate_oracle_tests]
pub mod key_validation_request;
#[generate_oracle_tests]
pub mod logs;
#[generate_oracle_tests_excluding(
    @[
        // TODO: cover with oracle tests once the test resolver can serve EphemeralArray contents.
        quote { get_pending_tagged_logs_oracle },
        quote { validate_and_store_enqueued_notes_and_events_oracle },
        quote { get_logs_by_tag_oracle },
        quote { get_tx_effects_oracle },
    ],
)]
pub mod message_processing;
#[generate_oracle_tests_excluding(
    @[
        // TODO: implement once the test resolver can serve EphemeralArray contents.
        quote { get_notes_oracle },
    ],
)]
pub mod notes;
#[generate_oracle_tests]
pub mod nullifiers;
#[generate_oracle_tests]
pub mod offchain_effect;
#[generate_oracle_tests]
pub mod version;
#[generate_oracle_tests]
pub mod random;
// TODO: cover with oracle tests once the test resolver can serve EphemeralArray contents.
pub mod shared_secret;
#[generate_oracle_tests]
pub mod storage;

// logging oracle is used by both noir-protocol-circuits and this crate and for this reason we just re-export it
// here from protocol circuits.
pub use crate::protocol::logging;
