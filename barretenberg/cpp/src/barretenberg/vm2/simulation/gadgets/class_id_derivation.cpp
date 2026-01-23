#include "barretenberg/vm2/simulation/gadgets/class_id_derivation.hpp"

#include <cassert>

#include "barretenberg/vm2/common/aztec_constants.hpp"
#include "barretenberg/vm2/simulation/gadgets/poseidon2.hpp"
#include "barretenberg/vm2/simulation/lib/contract_crypto.hpp"

namespace bb::avm2::simulation {

void ClassIdDerivation::assert_derivation(const ContractClassWithCommitment& klass)
{
    // Check if we've already derived this class_id
    if (cached_derivations.contains(klass.id)) {
        // Already processed this class_id - cache hit, don't emit event
        return;
    }

    // First time seeing this class_id - do the actual derivation
    FF computed_class_id = poseidon2.hash({ DOM_SEP__CONTRACT_CLASS_ID,
                                            klass.artifact_hash,
                                            klass.private_functions_root,
                                            klass.public_bytecode_commitment });
    // This will throw an unexpected exception if it fails.
    BB_ASSERT_EQ(computed_class_id, klass.id, "Computed class ID mismatch");

    // Cache this derivation so we don't repeat it
    cached_derivations.insert(klass.id);

    events.emit({ .klass = klass });
}

} // namespace bb::avm2::simulation
