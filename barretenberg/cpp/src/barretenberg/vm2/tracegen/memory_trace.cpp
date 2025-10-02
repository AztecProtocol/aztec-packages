#include "barretenberg/vm2/tracegen/memory_trace.hpp"

#include <cstdint>
#include <memory>
#include <vector>

#include "barretenberg/vm2/common/field.hpp"
#include "barretenberg/vm2/common/memory_types.hpp"
#include "barretenberg/vm2/common/tagged_value.hpp"
#include "barretenberg/vm2/generated/columns.hpp"
#include "barretenberg/vm2/generated/relations/lookups_memory.hpp"
#include "barretenberg/vm2/simulation/events/memory_event.hpp"
#include "barretenberg/vm2/tracegen/lib/interaction_def.hpp"

// Permutations.
#include "barretenberg/vm2/generated/relations/perms_addressing.hpp"
#include "barretenberg/vm2/generated/relations/perms_data_copy.hpp"
#include "barretenberg/vm2/generated/relations/perms_ecc_mem.hpp"
#include "barretenberg/vm2/generated/relations/perms_emit_unencrypted_log.hpp"
#include "barretenberg/vm2/generated/relations/perms_get_contract_instance.hpp"
#include "barretenberg/vm2/generated/relations/perms_keccak_memory.hpp"
#include "barretenberg/vm2/generated/relations/perms_poseidon2_mem.hpp"
#include "barretenberg/vm2/generated/relations/perms_registers.hpp"
#include "barretenberg/vm2/generated/relations/perms_sha256_mem.hpp"
#include "barretenberg/vm2/generated/relations/perms_to_radix_mem.hpp"

namespace bb::avm2::tracegen {

void MemoryTraceBuilder::process(const simulation::EventEmitterInterface<simulation::MemoryEvent>::Container& events,
                                 TraceContainer& trace)
{
    using simulation::MemoryEvent;
    using simulation::MemoryMode;

    // Create a vector of pointers to avoid copying the events.
    std::vector<const simulation::MemoryEvent*> event_ptrs;
    const size_t trace_size = events.size();
    event_ptrs.reserve(trace_size);

    for (const auto& event : events) {
        event_ptrs.push_back(&event);
    }

    std::ranges::sort(event_ptrs, [](const auto* lhs, const auto* rhs) { return lhs->operator<(*rhs); });

    using C = Column;

    // We rely on the following assert in computing C::memory_tag_ff_diff_inv value
    // below. Namely: (tag - MemoryTag::FF).invert() == tag.invert().
    static_assert(static_cast<uint8_t>(MemoryTag::FF) == 0);

    // We pre-compute the inverses for the tag values.
    // It serves to speed up trace generation of column C::memory_tag_ff_diff_inv values.
    // TODO: Introduce a global cache for these values to speed up generation of other sub-traces.
    constexpr size_t NUM_TAGS = static_cast<size_t>(MemoryTag::MAX) + 1;
    std::array<FF, NUM_TAGS> tag_inverts{};
    tag_inverts.at(0) = FF(0);
    tag_inverts.at(1) = FF(1);
    for (size_t i = 2; i < NUM_TAGS; i++) {
        tag_inverts.at(i) = FF(i).invert();
    }

    // We use shift in this trace and keep the first row empty.
    uint32_t row = 1;

    for (uint32_t i = 0; i < trace_size; i++) {
        const auto& event = *event_ptrs[i];
        const bool is_last = i + 1 == trace_size;
        const bool sel_tag_is_ff = event.value.get_tag() == MemoryTag::FF;
        const uint64_t global_addr = (static_cast<uint64_t>(event.space_id) << 32) + event.addr;
        const uint64_t timestamp =
            (static_cast<uint64_t>(event.execution_clk) << 1) + static_cast<uint64_t>(event.mode);

        uint64_t diff = 0;       // keep it 0 for the last row.
        bool last_access = true; // keep it true for the last row.
        uint64_t global_addr_diff = 0;

        if (!is_last) {
            const auto& next_event = *event_ptrs[i + 1];
            const uint64_t next_global_addr = (static_cast<uint64_t>(next_event.space_id) << 32) + next_event.addr;
            const uint64_t next_timestamp =
                (static_cast<uint64_t>(next_event.execution_clk) << 1) + static_cast<uint64_t>(next_event.mode);
            const uint64_t two_consecutive_writes =
                static_cast<uint64_t>(event.mode) * static_cast<uint64_t>(next_event.mode);
            global_addr_diff = next_global_addr - global_addr;
            last_access = global_addr != next_global_addr;
            diff = last_access ? global_addr_diff : (next_timestamp - timestamp - two_consecutive_writes);
        }

        trace.set(row,
                  { {
                      { C::memory_sel, 1 },
                      { C::memory_value, event.value },
                      { C::memory_tag, static_cast<uint8_t>(event.value.get_tag()) },
                      { C::memory_space_id, event.space_id },
                      { C::memory_address, event.addr },
                      { C::memory_clk, event.execution_clk },
                      { C::memory_rw, event.mode == MemoryMode::WRITE ? 1 : 0 },
                      { C::memory_sel_rng_chk, is_last ? 0 : 1 },
                      { C::memory_global_addr, global_addr },
                      { C::memory_timestamp, timestamp },
                      { C::memory_last_access, last_access },
                      { C::memory_glob_addr_diff_inv, global_addr_diff != 0 ? FF(global_addr_diff).invert() : FF(0) },
                      { C::memory_diff, diff },
                      { C::memory_limb_0_, diff & 0xFFFF },
                      { C::memory_limb_1_, (diff >> 16) & 0xFFFF },
                      { C::memory_limb_2_, (diff >> 32) },
                      { C::memory_sel_tag_is_ff, sel_tag_is_ff ? 1 : 0 },
                      { C::memory_tag_ff_diff_inv, tag_inverts.at(static_cast<uint8_t>(event.value.get_tag())) },
                      { C::memory_sel_rng_write, (event.mode == MemoryMode::WRITE && !sel_tag_is_ff) ? 1 : 0 },
                      { C::memory_max_bits, get_tag_bits(event.value.get_tag()) },
                  } });
        row++;
    }
}

const InteractionDefinition MemoryTraceBuilder::interactions =
    InteractionDefinition()
        .add<InteractionType::MultiPermutation,
             // Addressing.
             perm_addressing_base_address_from_memory_settings,
             perm_addressing_indirect_from_memory_0_settings,
             perm_addressing_indirect_from_memory_1_settings,
             perm_addressing_indirect_from_memory_2_settings,
             perm_addressing_indirect_from_memory_3_settings,
             perm_addressing_indirect_from_memory_4_settings,
             perm_addressing_indirect_from_memory_5_settings,
             perm_addressing_indirect_from_memory_6_settings,
             // Registers.
             perm_registers_mem_op_0_settings,
             perm_registers_mem_op_1_settings,
             perm_registers_mem_op_2_settings,
             perm_registers_mem_op_3_settings,
             perm_registers_mem_op_4_settings,
             perm_registers_mem_op_5_settings,
             perm_registers_mem_op_6_settings,
             // Data Copy.
             perm_data_copy_mem_read_settings,
             perm_data_copy_mem_write_settings,
             // Get Contract Instance.
             perm_get_contract_instance_mem_write_contract_instance_exists_settings,
             perm_get_contract_instance_mem_write_contract_instance_member_settings,
             // Unencrypted Log.
             perm_emit_unencrypted_log_read_mem_settings,
             // Poseidon2.
             perm_poseidon2_mem_pos_read_mem_0_settings,
             perm_poseidon2_mem_pos_read_mem_1_settings,
             perm_poseidon2_mem_pos_read_mem_2_settings,
             perm_poseidon2_mem_pos_read_mem_3_settings,
             perm_poseidon2_mem_pos_write_mem_0_settings,
             perm_poseidon2_mem_pos_write_mem_1_settings,
             perm_poseidon2_mem_pos_write_mem_2_settings,
             perm_poseidon2_mem_pos_write_mem_3_settings,
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
             perm_sha256_mem_mem_input_read_settings,
             // ECADD
             perm_ecc_mem_write_mem_0_settings,
             perm_ecc_mem_write_mem_1_settings,
             perm_ecc_mem_write_mem_2_settings,
             // To Radix.
             perm_to_radix_mem_write_mem_settings
             // Others.
             >(Column::memory_sel)
        .add<lookup_memory_range_check_limb_0_settings, InteractionType::LookupIntoIndexedByClk>()
        .add<lookup_memory_range_check_limb_1_settings, InteractionType::LookupIntoIndexedByClk>()
        .add<lookup_memory_range_check_limb_2_settings, InteractionType::LookupIntoIndexedByClk>()
        .add<lookup_memory_tag_max_bits_settings, InteractionType::LookupIntoIndexedByClk>()
        .add<lookup_memory_range_check_write_tagged_value_settings, InteractionType::LookupGeneric>(
            Column::range_check_sel);

} // namespace bb::avm2::tracegen
