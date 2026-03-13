#include "barretenberg/vm2/simulation/gadgets/bytecode_hashing.hpp"

#include <utility>

#include "barretenberg/common/assert.hpp"
#include "barretenberg/common/bb_bench.hpp"
#include "barretenberg/vm2/common/field.hpp"
#include "barretenberg/vm2/simulation/lib/contract_crypto.hpp"

namespace bb::avm2::simulation {

/**
 * @brief Verify that the given @p bytecode_id matches the expected bytecode commitment
 *        which is a Poseidon2 hash of the bytecode prepended by metadata information.
 *
 * Encodes the bytecode as field elements, prepends a domain-separated length field,
 * and hashes via Poseidon2. Asserts the result matches the expected @p bytecode_id
 * and emits a BytecodeHashingEvent for tracegen.
 *
 * @param bytecode_id Unique identifier for this bytecode in the trace (commitment value).
 * @param bytecode Raw bytecode bytes to hash.
 * @throws Assertion failure if the computed hash does not match @p bytecode_id.
 */
void BytecodeHasher::assert_public_bytecode_commitment(const BytecodeId& bytecode_id,
                                                       const std::vector<uint8_t>& bytecode)
{
    BB_BENCH_NAME("BytecodeHasher::assert_public_bytecode_commitment");
    auto bytecode_length_in_bytes = bytecode.size();

    std::vector<FF> inputs = { compute_public_bytecode_first_field(bytecode_length_in_bytes) };
    auto bytecode_as_fields = encode_bytecode(bytecode);
    inputs.insert(inputs.end(), bytecode_as_fields.begin(), bytecode_as_fields.end());

    FF hash = hasher.hash(inputs);
    // This will throw an unexpected exception if it fails.
    BB_ASSERT_EQ(hash, bytecode_id, "Public bytecode commitment hash mismatch");

    events.emit({ .bytecode_id = bytecode_id,
                  .bytecode_length_in_bytes = static_cast<uint32_t>(bytecode_length_in_bytes),
                  .bytecode_fields = std::move(bytecode_as_fields) });
}

} // namespace bb::avm2::simulation
