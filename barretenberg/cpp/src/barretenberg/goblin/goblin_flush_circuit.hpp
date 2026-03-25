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
 *   - T_prev: the concatenation of all merge tables up to the circuit before the last kernel
 *   - t: subtable commitments to the operations performed by the last kernel
 *
 * @param native_proof The native Goblin proof (merge + eccvm + ipa + translator)
 * @param native_merge_commitments The native merge input commitments (t and T_prev)
 * @return UltraCircuitBuilder The circuit builder for Circuit C with GoblinFlushIO public inputs
 */
UltraCircuitBuilder build_goblin_flush_circuit(const GoblinProof& native_proof,
                                               const MergeVerifier::InputCommitments& native_merge_commitments);

} // namespace bb
