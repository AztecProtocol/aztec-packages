#include "barretenberg/vm2/simulation/gadgets/bytecode_hashing.hpp"

#include "barretenberg/common/bb_bench.hpp"
#include "barretenberg/vm2/common/aztec_constants.hpp"
#include "barretenberg/vm2/simulation/lib/contract_crypto.hpp"

namespace bb::avm2::simulation {

void BytecodeHasher::assert_public_bytecode_commitment(const BytecodeId& bytecode_id,
                                                       const std::vector<uint8_t>& bytecode,
                                                       const FF& public_bytecode_commitment)
{
    BB_BENCH_NAME("BytecodeHasher::assert_public_bytecode_commitment");
    auto bytecode_length_in_bytes = static_cast<uint32_t>(bytecode.size());

    std::vector<FF> inputs = { compute_public_bytecode_separator(bytecode_length_in_bytes) };
    auto bytecode_as_fields = encode_bytecode(bytecode);
    inputs.insert(inputs.end(), bytecode_as_fields.begin(), bytecode_as_fields.end());

    FF hash = hasher.hash(inputs);
    // This will throw an unexpected exception if it fails.
    BB_ASSERT_EQ(hash, public_bytecode_commitment, "Public bytecode commitment hash mismatch");

    events.emit({ .bytecode_id = bytecode_id,
                  .bytecode_length = bytecode_length_in_bytes,
                  .bytecode_fields = std::move(bytecode_as_fields) });
}

} // namespace bb::avm2::simulation
