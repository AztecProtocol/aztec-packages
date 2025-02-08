#include "barretenberg/vm2/simulation/class_id_derivation.hpp"

#include <cassert>

#include "barretenberg/vm/aztec_constants.hpp"
#include "barretenberg/vm2/simulation/lib/contract_crypto.hpp"

namespace bb::avm2::simulation {

void ClassIdDerivation::assert_derivation(const ContractClassId& class_id, const ContractClass& klass)
{
    // TODO: Cache and deduplicate.
    // TODO: Use gadget.
    assert(compute_contract_class_id(
               klass.artifact_hash, klass.private_function_root, klass.public_bytecode_commitment) == class_id);
    events.emit({ .class_id = class_id, .klass = klass });
}

} // namespace bb::avm2::simulation