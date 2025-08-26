#pragma once

#include <memory>
#include <vector>

#include "barretenberg/vm2/generated/columns.hpp"
#include "barretenberg/vm2/simulation/events/event_emitter.hpp"
#include "barretenberg/vm2/simulation/events/memory_event.hpp"
#include "barretenberg/vm2/tracegen/lib/interaction_builder.hpp"
#include "barretenberg/vm2/tracegen/lib/interaction_def.hpp"
#include "barretenberg/vm2/tracegen/lib/multi_permutation_builder.hpp"
#include "barretenberg/vm2/tracegen/trace_container.hpp"

// Permutations.
#include "barretenberg/vm2/generated/relations/perms_addressing.hpp"
#include "barretenberg/vm2/generated/relations/perms_keccak_memory.hpp"
#include "barretenberg/vm2/generated/relations/perms_sha256_mem.hpp"

namespace bb::avm2::tracegen {

class MemoryTraceBuilder final {
  public:
    void process(const simulation::EventEmitterInterface<simulation::MemoryEvent>::Container& events,
                 TraceContainer& trace);

    static const InteractionDefinition interactions;

    static std::vector<std::unique_ptr<InteractionBuilderInterface>> get_all_jobs()
    {
        auto definition_jobs = interactions.get_all_jobs();
        std::vector<std::unique_ptr<InteractionBuilderInterface>> multi_permutation_jobs;
        // Need to push back due to std::unique_ptr stuff.
        multi_permutation_jobs.push_back(std::make_unique<MultiPermutationBuilder<
                                             // Addressing.
                                             perm_addressing_base_address_from_memory_settings,
                                             perm_addressing_indirect_from_memory_0_settings,
                                             perm_addressing_indirect_from_memory_1_settings,
                                             perm_addressing_indirect_from_memory_2_settings,
                                             perm_addressing_indirect_from_memory_3_settings,
                                             perm_addressing_indirect_from_memory_4_settings,
                                             perm_addressing_indirect_from_memory_5_settings,
                                             perm_addressing_indirect_from_memory_6_settings,
                                             // Keccak.
                                             perm_keccak_memory_slice_to_mem_settings,
                                             // Sha256.
                                             perm_sha256_mem_mem_op_0_settings,
                                             perm_sha256_mem_mem_op_1_settings,
                                             perm_sha256_mem_mem_op_2_settings,
                                             perm_sha256_mem_mem_op_3_settings,
                                             perm_sha256_mem_mem_op_4_settings,
                                             perm_sha256_mem_mem_op_5_settings,
                                             perm_sha256_mem_mem_op_6_settings,
                                             perm_sha256_mem_mem_op_7_settings,
                                             perm_sha256_mem_mem_input_read_settings
                                             // Others.
                                             >>(Column::memory_sel));
        return concatenate_jobs(std::move(definition_jobs), std::move(multi_permutation_jobs));
    }
};

} // namespace bb::avm2::tracegen
