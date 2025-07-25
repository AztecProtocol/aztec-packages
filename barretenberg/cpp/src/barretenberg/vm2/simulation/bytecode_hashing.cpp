#include "barretenberg/vm2/simulation/bytecode_hashing.hpp"

#include "barretenberg/vm2/common/aztec_constants.hpp"
#include "barretenberg/vm2/simulation/lib/contract_crypto.hpp"

namespace bb::avm2::simulation {

FF BytecodeHasher::compute_public_bytecode_commitment(const FF& expected_commitment,
                                                      const std::vector<uint8_t>& bytecode)
{
    auto bytecode_length_in_bytes = static_cast<uint32_t>(bytecode.size());

    std::vector<FF> inputs = { GENERATOR_INDEX__PUBLIC_BYTECODE };
    auto bytecode_as_fields = encode_bytecode(bytecode);
    inputs.insert(inputs.end(), bytecode_as_fields.begin(), bytecode_as_fields.end());

    FF hash = hasher.hash(inputs);

    // Emit event for constraint generation, deduplicated by the expected commitment
    events.emit({ .bytecode_commitment = expected_commitment,
                  .bytecode_length = bytecode_length_in_bytes,
                  .bytecode_fields = std::move(bytecode_as_fields) });
    return hash;
}

} // namespace bb::avm2::simulation
