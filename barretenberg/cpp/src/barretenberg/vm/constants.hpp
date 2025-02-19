#pragma once

#include "barretenberg/vm/aztec_constants.hpp"

#include <cstddef>
#include <cstdint>

// Keep it aligned with the XXX__KERNEL_INPUTS_COL_OFFSET constants defined in constants.nr
inline const std::size_t KERNEL_INPUTS_LENGTH = 15;

inline const std::size_t KERNEL_OUTPUTS_LENGTH =
    MAX_NOTE_HASH_READ_REQUESTS_PER_CALL + MAX_NULLIFIER_READ_REQUESTS_PER_CALL +
    MAX_NULLIFIER_NON_EXISTENT_READ_REQUESTS_PER_CALL + MAX_L1_TO_L2_MSG_READ_REQUESTS_PER_CALL +
    MAX_PUBLIC_DATA_UPDATE_REQUESTS_PER_CALL + MAX_PUBLIC_DATA_READS_PER_CALL + MAX_NOTE_HASHES_PER_CALL +
    MAX_NULLIFIERS_PER_CALL + MAX_L2_TO_L1_MSGS_PER_CALL + MAX_PUBLIC_LOGS_PER_CALL;

static_assert(KERNEL_INPUTS_LENGTH < AVM_PUBLIC_COLUMN_MAX_SIZE,
              "The kernel inputs length cannot exceed the max size of a public column. This is a requirement for the "
              "avm recursive verifier.");

static_assert(KERNEL_OUTPUTS_LENGTH < AVM_PUBLIC_COLUMN_MAX_SIZE,
              "The kernel outputs length cannot exceed the max size of a public column. This is a requirement for the "
              "avm recursive verifier.");

// START INDEXES in the PUBLIC_CIRCUIT_PUBLIC_INPUTS
// These line up with indexes found in
// https://github.com/AztecProtocol/aztec-packages/blob/master/yarn-project/circuits.js/src/structs/public_circuit_public_inputs.ts
inline const uint32_t SENDER_PCPI_OFFSET = 0;
inline const uint32_t ADDRESS_PCPI_OFFSET = 1;
inline const uint32_t IS_STATIC_CALL_PCPI_OFFSET = 3;

inline const uint32_t PCPI_GLOBALS_START = PUBLIC_CIRCUIT_PUBLIC_INPUTS_LENGTH - 7 - GLOBAL_VARIABLES_LENGTH;

// Global Variables
inline const uint32_t CHAIN_ID_PCPI_OFFSET = PCPI_GLOBALS_START;
inline const uint32_t VERSION_PCPI_OFFSET = PCPI_GLOBALS_START + 1;
inline const uint32_t BLOCK_NUMBER_PCPI_OFFSET = PCPI_GLOBALS_START + 2;
inline const uint32_t TIMESTAMP_PCPI_OFFSET = PCPI_GLOBALS_START + 3;
// Global Variables - fees
inline const uint32_t FEE_PER_DA_GAS_PCPI_OFFSET = PCPI_GLOBALS_START + 6;
inline const uint32_t FEE_PER_L2_GAS_PCPI_OFFSET = PCPI_GLOBALS_START + 7;

// Top-level PublicCircuitPublicInputs members
inline const uint32_t DA_START_GAS_LEFT_PCPI_OFFSET = PUBLIC_CIRCUIT_PUBLIC_INPUTS_LENGTH - 3 - GAS_LENGTH;
inline const uint32_t L2_START_GAS_LEFT_PCPI_OFFSET = PUBLIC_CIRCUIT_PUBLIC_INPUTS_LENGTH - 2 - GAS_LENGTH;
inline const uint32_t DA_END_GAS_LEFT_PCPI_OFFSET = PUBLIC_CIRCUIT_PUBLIC_INPUTS_LENGTH - 3;
inline const uint32_t L2_END_GAS_LEFT_PCPI_OFFSET = PUBLIC_CIRCUIT_PUBLIC_INPUTS_LENGTH - 2;
inline const uint32_t TRANSACTION_FEE_PCPI_OFFSET = PUBLIC_CIRCUIT_PUBLIC_INPUTS_LENGTH - 1;

// Kernel output pil offset (Where update objects are inlined)

// Side Effects (offsets to vectors in PublicCircuitPublicInputs)
inline const uint32_t NOTE_HASH_EXISTS_PCPI_OFFSET = CALL_CONTEXT_LENGTH + 2;
inline const uint32_t NULLIFIER_EXISTS_PCPI_OFFSET =
    NOTE_HASH_EXISTS_PCPI_OFFSET + (MAX_NOTE_HASH_READ_REQUESTS_PER_CALL * READ_REQUEST_LENGTH);

inline const uint32_t NULLIFIER_NON_EXISTS_PCPI_OFFSET =
    NULLIFIER_EXISTS_PCPI_OFFSET + (MAX_NULLIFIER_READ_REQUESTS_PER_CALL * READ_REQUEST_LENGTH);

inline const uint32_t L1_TO_L2_MSG_READ_REQUESTS_PCPI_OFFSET =
    NULLIFIER_NON_EXISTS_PCPI_OFFSET + (MAX_NULLIFIER_NON_EXISTENT_READ_REQUESTS_PER_CALL * READ_REQUEST_LENGTH);

inline const uint32_t PUBLIC_DATA_UPDATE_PCPI_OFFSET =
    L1_TO_L2_MSG_READ_REQUESTS_PCPI_OFFSET + (MAX_L1_TO_L2_MSG_READ_REQUESTS_PER_CALL * READ_REQUEST_LENGTH);

inline const uint32_t PUBLIC_DATA_READ_PCPI_OFFSET =
    PUBLIC_DATA_UPDATE_PCPI_OFFSET +
    (MAX_PUBLIC_DATA_UPDATE_REQUESTS_PER_CALL * CONTRACT_STORAGE_UPDATE_REQUEST_LENGTH);

inline const uint32_t PUBLIC_CALLSTACK_PCPI_OFFSET =
    PUBLIC_DATA_READ_PCPI_OFFSET + (MAX_PUBLIC_DATA_READS_PER_CALL * CONTRACT_STORAGE_READ_LENGTH);

inline const uint32_t NEW_NOTE_HASHES_PCPI_OFFSET =
    PUBLIC_CALLSTACK_PCPI_OFFSET + (MAX_ENQUEUED_CALLS_PER_CALL * PUBLIC_INNER_CALL_REQUEST_LENGTH);

inline const uint32_t NEW_NULLIFIERS_PCPI_OFFSET =
    NEW_NOTE_HASHES_PCPI_OFFSET + (MAX_NOTE_HASHES_PER_CALL * NOTE_HASH_LENGTH);

// TODO(md): Note legnth of nullifier is 3? - it includes the note it is nullifying too
inline const uint32_t NEW_L2_TO_L1_MSGS_PCPI_OFFSET =
    NEW_NULLIFIERS_PCPI_OFFSET + (MAX_NULLIFIERS_PER_CALL * NULLIFIER_LENGTH);

inline const uint32_t START_SIDE_EFFECT_COUNTER_PCPI_OFFSET =
    NEW_L2_TO_L1_MSGS_PCPI_OFFSET + (MAX_L2_TO_L1_MSGS_PER_CALL * L2_TO_L1_MESSAGE_LENGTH);

// The +2 here is because the order is
// START_SIDE_EFFECT_COUNTER
// END_SIDE_EFFECT_COUNTER -> + 1
// NEW_UNENCRYPTED_LOGS -> + 2
// TODO(#11124): Edit this in line with public logs?
inline const uint32_t NEW_UNENCRYPTED_LOGS_PCPI_OFFSET = START_SIDE_EFFECT_COUNTER_PCPI_OFFSET + 2;

// END INDEXES in the PUBLIC_CIRCUIT_PUBLIC_INPUTS
