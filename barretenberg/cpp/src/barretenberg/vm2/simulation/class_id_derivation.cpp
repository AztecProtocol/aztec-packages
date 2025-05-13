#include "barretenberg/vm2/simulation/class_id_derivation.hpp"

#include <cassert>

#include "barretenberg/vm2/common/aztec_constants.hpp"
#include "barretenberg/vm2/simulation/lib/contract_crypto.hpp"
#include "barretenberg/vm2/simulation/poseidon2.hpp"

namespace bb::avm2::simulation {

void ClassIdDerivation::assert_derivation(const ContractClassId& class_id, const ContractClass& klass)
{
    // TODO: Cache and deduplicate.
    FF computed_class_id = poseidon2.hash({ GENERATOR_INDEX__CONTRACT_LEAF,
                                            klass.artifact_hash,
                                            klass.private_function_root,
                                            klass.public_bytecode_commitment });
    (void)computed_class_id; // Silence unused variable warning when assert is stripped out
    assert(computed_class_id == class_id);
    events.emit({ .class_id = class_id, .klass = klass });
}

} // namespace bb::avm2::simulation
