#include "barretenberg/vm2/simulation/bytecode_hashing.hpp"

#include "barretenberg/vm/aztec_constants.hpp"
#include "barretenberg/vm2/simulation/lib/contract_crypto.hpp"

namespace bb::avm2::simulation {

FF BytecodeHasher::compute_public_bytecode_commitment(const BytecodeId bytecode_id,
                                                      const std::vector<uint8_t>& bytecode)
{
    auto bytecode_length_in_bytes = static_cast<uint32_t>(bytecode.size());
    std::vector<FF> contract_bytecode_fields = encode_bytecode(bytecode);
    FF running_hash = bytecode_length_in_bytes;
    for (const FF& contract_bytecode_field : contract_bytecode_fields) {
        // This emits events to our hasher (poseidon2 hash) subtrace
        running_hash = hasher.hash({ contract_bytecode_field, running_hash });
    }
    events.emit({ .bytecode_id = bytecode_id,
                  .bytecode_length = bytecode_length_in_bytes,
                  .bytecode_fields = std::move(contract_bytecode_fields) });
    return running_hash;
}

} // namespace bb::avm2::simulation
