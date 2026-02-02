//! Exactly the same as the vm2 tracegen helper, but with filling precomputed columns
//! in a separate method. This is because precomputed columns are expensive to fill, and we want to
//! fill them on the fuzzer startup.

#include "barretenberg/avm_fuzzer/common/fuzzer_tracegen_helper.hpp"

#include <array>
#include <functional>
#include <span>
#include <string>
#include <vector>

#include "barretenberg/common/constexpr_utils.hpp"
#include "barretenberg/common/std_array.hpp"
#include "barretenberg/common/thread.hpp"
#include "barretenberg/numeric/bitop/get_msb.hpp"
#include "barretenberg/vm2/common/map.hpp"
#include "barretenberg/vm2/constraining/flavor.hpp"
#include "barretenberg/vm2/generated/columns.hpp"
#include "barretenberg/vm2/tooling/stats.hpp"
#include "barretenberg/vm2/tracegen/address_derivation_trace.hpp"
#include "barretenberg/vm2/tracegen/alu_trace.hpp"
#include "barretenberg/vm2/tracegen/bitwise_trace.hpp"
#include "barretenberg/vm2/tracegen/bytecode_trace.hpp"
#include "barretenberg/vm2/tracegen/calldata_trace.hpp"
#include "barretenberg/vm2/tracegen/class_id_derivation_trace.hpp"
#include "barretenberg/vm2/tracegen/context_stack_trace.hpp"
#include "barretenberg/vm2/tracegen/contract_instance_retrieval_trace.hpp"
#include "barretenberg/vm2/tracegen/data_copy_trace.hpp"
#include "barretenberg/vm2/tracegen/ecc_trace.hpp"
#include "barretenberg/vm2/tracegen/execution_trace.hpp"
#include "barretenberg/vm2/tracegen/field_gt_trace.hpp"
#include "barretenberg/vm2/tracegen/gt_trace.hpp"
#include "barretenberg/vm2/tracegen/internal_call_stack_trace.hpp"
#include "barretenberg/vm2/tracegen/keccakf1600_trace.hpp"
#include "barretenberg/vm2/tracegen/l1_to_l2_message_tree_trace.hpp"
#include "barretenberg/vm2/tracegen/lib/interaction_builder.hpp"
#include "barretenberg/vm2/tracegen/lib/shared_index_cache.hpp"
#include "barretenberg/vm2/tracegen/memory_trace.hpp"
#include "barretenberg/vm2/tracegen/merkle_check_trace.hpp"
#include "barretenberg/vm2/tracegen/note_hash_tree_check_trace.hpp"
#include "barretenberg/vm2/tracegen/nullifier_tree_check_trace.hpp"
#include "barretenberg/vm2/tracegen/opcodes/emit_unencrypted_log_trace.hpp"
#include "barretenberg/vm2/tracegen/opcodes/get_contract_instance_trace.hpp"
#include "barretenberg/vm2/tracegen/poseidon2_trace.hpp"
#include "barretenberg/vm2/tracegen/precomputed_trace.hpp"
#include "barretenberg/vm2/tracegen/public_data_tree_trace.hpp"
#include "barretenberg/vm2/tracegen/public_inputs_trace.hpp"
#include "barretenberg/vm2/tracegen/range_check_trace.hpp"
#include "barretenberg/vm2/tracegen/retrieved_bytecodes_tree_check.hpp"
#include "barretenberg/vm2/tracegen/sha256_trace.hpp"
#include "barretenberg/vm2/tracegen/to_radix_trace.hpp"
#include "barretenberg/vm2/tracegen/trace_container.hpp"
#include "barretenberg/vm2/tracegen/tx_trace.hpp"
#include "barretenberg/vm2/tracegen/update_check_trace.hpp"
#include "barretenberg/vm2/tracegen/written_public_data_slots_tree_check_trace.hpp"

namespace bb::avm2::fuzzer {

using namespace bb::avm2::simulation;
using namespace bb::avm2::tracegen;

namespace {

void execute_jobs(std::span<std::function<void()>> jobs)
{
    parallel_for(jobs.size(), [&](size_t i) { jobs[i](); });
}

} // namespace

TraceContainer AvmFuzzerTraceGenHelper::generate_trace_without_precomputed_columns(TraceContainer& trace,
                                                                                   EventsContainer&& events,
                                                                                   const PublicInputs& public_inputs)
{
    auto jobs = concatenate(build_public_inputs_columns_jobs(trace, public_inputs),
                            build_fill_trace_columns_jobs(trace, std::move(events)));
    execute_jobs(jobs);
}

} // namespace bb::avm2::fuzzer
