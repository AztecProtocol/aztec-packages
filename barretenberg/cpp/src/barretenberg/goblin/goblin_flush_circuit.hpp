#pragma once

#include "barretenberg/goblin/goblin_verifier.hpp"
#include "barretenberg/goblin/types.hpp"
#include "barretenberg/stdlib/special_public_inputs/special_public_inputs.hpp"
#include "barretenberg/stdlib_circuit_builders/ultra_circuit_builder.hpp"

namespace bb {

/**
 * @brief Build Circuit C: the Goblin flush verification circuit.
 *
 * @details Circuit C is an UltraCircuitBuilder that recursively verifies a complete Goblin proof
 * (Merge + ECCVM + Translator). It exposes GoblinFlushIO as public inputs:
 *   - Aggregated KZG pairing points (from Merge and Translator)
 *   - IPA opening claim (from ECCVM, over Grumpkin)
 *   - merged_table (if the sequence is A, K, A_G, then merged_table is the merge of the ecc operations up to K)
 *
 * @param native_proof The native Goblin proof (merge + eccvm + ipa + translator)
 * @param merged_table The native merge table commitments (merged table)
 * @return UltraCircuitBuilder The circuit builder for Circuit C with GoblinFlushIO public inputs
 */
UltraCircuitBuilder build_goblin_flush_circuit(const GoblinProof& native_proof,
                                               const MergeVerifier::TableCommitments& merged_table);

} // namespace bb
