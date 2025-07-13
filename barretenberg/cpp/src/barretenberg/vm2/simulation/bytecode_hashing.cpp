#include "barretenberg/vm2/simulation/bytecode_hashing.hpp"

#include "barretenberg/vm2/common/aztec_constants.hpp"
#include "barretenberg/vm2/simulation/lib/contract_crypto.hpp"

namespace bb::avm2::simulation {

FF BytecodeHasher::compute_public_bytecode_commitment([[maybe_unused]] const ContractClassId class_id,
                                                      const std::vector<uint8_t>& bytecode)
{
    if (bytecode_commitments.contains(class_id)) {
        // Deduplicated! This was previously computed and cached.
        return bytecode_commitments[class_id];
    }

    [[maybe_unused]] auto bytecode_length_in_bytes = static_cast<uint32_t>(bytecode.size());

    std::vector<FF> inputs = { GENERATOR_INDEX__PUBLIC_BYTECODE };
    auto bytecode_as_fields = encode_bytecode(bytecode);
    inputs.insert(inputs.end(), bytecode_as_fields.begin(), bytecode_as_fields.end());

    FF hash = hasher.hash(inputs);

    // Cache the computed hash for deduplication
    bytecode_commitments[class_id] = hash;

    events.emit({ .class_id = class_id,
                  .bytecode_length = bytecode_length_in_bytes,
                  .bytecode_fields = std::move(bytecode_as_fields) });
    return hash;
}

} // namespace bb::avm2::simulation
