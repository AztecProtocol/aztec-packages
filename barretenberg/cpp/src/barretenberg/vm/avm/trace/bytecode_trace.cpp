
#include "barretenberg/vm/avm/trace/bytecode_trace.hpp"
#include "barretenberg/crypto/poseidon2/poseidon2.hpp"
#include "barretenberg/crypto/poseidon2/poseidon2_params.hpp"
#include "barretenberg/vm/avm/trace/common.hpp"
namespace bb::avm_trace {

using poseidon2 = crypto::Poseidon2<crypto::Poseidon2Bn254ScalarFieldParams>;
void AvmBytecodeTraceBuilder::build_bytecode_columns()
{
    // Loop over the hints, getting the bytecode
    for (auto& contract_bytecode : all_contracts_bytecode) {
        FF running_hash = FF::zero();
        // This should be checked to be the same as MAX_PACKED_PUBLIC_BYTECODE_SIZE_IN_FIELDS
        size_t bytecode_length = contract_bytecode.size();
        for (size_t i = 0; i < bytecode_length; ++i) {
            bytecode_trace.push_back(BytecodeTraceEntry{
                .packed_bytecode = contract_bytecode[i],
                .running_hash = running_hash,
                .bytecode_length_remaining = static_cast<uint16_t>(contract_bytecode.size() - i),
            });
            running_hash = poseidon2::hash({ contract_bytecode[i], running_hash });
        }
        // Now running_hash actually contains the bytecode hash
        BytecodeTraceEntry last_entry{};
        last_entry.running_hash = running_hash;
        last_entry.bytecode_length_remaining = 0;
        // TODO: Come back to this later
        // last_entry.class_id = _
        // last_entry.contract_address = _
    }
}

void AvmBytecodeTraceBuilder::finalize(std::vector<AvmFullRow<FF>>& main_trace)
{
    for (size_t i = 0; i < bytecode_trace.size(); i++) {
        auto const& src = bytecode_trace.at(i);
        auto& dest = main_trace.at(i);
        dest.bytecode_running_hash = src.running_hash;
        dest.bytecode_length_remaining = src.bytecode_length_remaining;
        dest.bytecode_packed = src.packed_bytecode;
        dest.bytecode_end_latch = src.bytecode_length_remaining == 0 ? FF::one() : FF::zero();
    }
}

} // namespace bb::avm_trace
