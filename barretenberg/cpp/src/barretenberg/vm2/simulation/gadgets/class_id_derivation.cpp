#include "barretenberg/vm2/simulation/gadgets/class_id_derivation.hpp"

#include <cassert>

#include "barretenberg/aztec/aztec_constants.hpp"
#include "barretenberg/vm2/simulation/gadgets/poseidon2.hpp"

namespace bb::avm2::simulation {

/**
 * @brief Computes the contract class ID and emits a ClassIdDerivationEvent. Corresponds to
 * the subtrace class_id_derivation.pil.
 *
 * If the class ID has already been derived, an event has already been emitted and we skip
 * repeating the computation and emission. Otherwise, we call the poseidon trace to perform
 * the hash defining the class ID, given as:
 *  Poseidon2(DOM_SEP__CONTRACT_CLASS_ID, artifact_hash, private_functions_root, public_bytecode_commitment)
 * and we add the output to the local cache.
 *
 * @throws Unexpected exception if
 *        - the calculated class ID does not match that stored in the @p klass itself.
 *
 * @param klass The contract class.
 */
void ClassIdDerivation::assert_derivation(const ContractClassWithCommitment& klass)
{
    // Check if we've already derived this class_id.
    if (cached_derivations.contains(klass.id)) {
        // Already processed this class_id - cache hit, don't emit event.
        return;
    }

    // First time seeing this class_id - do the actual derivation.
    // Emits Poseidon2HashEvent and Poseidon2PermutationEvents, see #[CLASS_ID_POSEIDON2_i]
    // lookups in class_id_derivation.pil.
    FF computed_class_id = poseidon2.hash({ DOM_SEP__CONTRACT_CLASS_ID,
                                            klass.artifact_hash,
                                            klass.private_functions_root,
                                            klass.public_bytecode_commitment });
    // This will throw an unexpected exception if it fails. If we have reached this point,
    // the contract class registry should have enforced this.
    BB_ASSERT_EQ(computed_class_id, klass.id, "Computed class ID mismatch");

    // Cache this derivation so we don't repeat it.
    cached_derivations.insert(klass.id);

    // Emits ClassIdDerivationEvent.
    events.emit({ .class_id = klass.id,
                  .artifact_hash = klass.artifact_hash,
                  .private_functions_root = klass.private_functions_root,
                  .public_bytecode_commitment = klass.public_bytecode_commitment });
}

} // namespace bb::avm2::simulation
