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
        // TODO: implement once we support more complex types
        quote { emit_public_log_opcode },
        quote { returndata_copy_opcode },
    ],
)]
pub mod avm;
pub mod aes128_decrypt;
#[generate_oracle_tests]
pub mod auth_witness;
pub mod block_header;
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
pub mod fact_store;
#[generate_oracle_tests]
pub mod public_call;
pub mod tx_resolution;
#[generate_oracle_tests]
pub mod resolve_custom_request;
#[generate_oracle_tests_excluding(
    @[
        quote { resolve_tagging_strategy_oracle }, // TODO: implement once we support more complex types
    ],
)]
pub mod resolve_tagging_strategy;
#[generate_oracle_tests]
pub mod tx_phase;
pub mod execution;
#[generate_oracle_tests]
pub mod execution_cache;
pub mod get_contract_instance;
pub mod get_l1_to_l2_membership_witness;
pub mod get_nullifier_membership_witness;
pub mod get_public_data_witness;
pub mod get_membership_witness;
pub mod keys;
pub mod key_validation_request;
pub mod logs;
pub mod message_processing;
#[generate_oracle_tests_excluding(
    @[
        quote { get_notes_oracle }, // TODO: implement once we support more complex types
        quote { get_next_tagging_index_oracle }, // TODO: implement once we support more complex types
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
pub mod shared_secret;
#[generate_oracle_tests]
pub mod storage;

// logging oracle is used by both noir-protocol-circuits and this crate and for this reason we just re-export it
// here from protocol circuits.
pub use crate::protocol::logging;
