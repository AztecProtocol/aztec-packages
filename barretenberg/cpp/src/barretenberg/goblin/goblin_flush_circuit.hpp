#pragma once

#include "barretenberg/goblin/goblin_verifier.hpp"
#include "barretenberg/goblin/types.hpp"
#include "barretenberg/stdlib/special_public_inputs/special_public_inputs.hpp"
#include "barretenberg/stdlib_circuit_builders/ultra_circuit_builder.hpp"

namespace bb {

/**
 * @brief Build the Goblin flush verification circuit.
 *
 * @details This circuit is an UltraCircuitBuilder that recursively verifies an ECCVM proof and a Translator proof. It
 * exposes GoblinFlushIO as public inputs:
 *   - KZG pairing points (from Translator)
 *   - IPA opening claim (from ECCVM, over Grumpkin)
 *   - merged_table (the table used by Translator to recursively verify the proof)
 *
 * @param native_proof The native Goblin proof (eccvm + ipa + translator)
 * @param merged_table The native merge table commitments (merged table)
 * @return UltraCircuitBuilder
 */
UltraCircuitBuilder build_goblin_flush_circuit(const GoblinProof& native_proof,
                                               const MergeVerifier::TableCommitments& merged_table);

} // namespace bb
