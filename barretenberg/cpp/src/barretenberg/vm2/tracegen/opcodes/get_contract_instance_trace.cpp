#include "barretenberg/vm2/tracegen/opcodes/get_contract_instance_trace.hpp"

#include <cstddef>
#include <cstdint>

#include "barretenberg/vm2/common/aztec_constants.hpp"
#include "barretenberg/vm2/common/aztec_types.hpp"
#include "barretenberg/vm2/common/constants.hpp"
#include "barretenberg/vm2/common/memory_types.hpp"
#include "barretenberg/vm2/common/tagged_value.hpp"
#include "barretenberg/vm2/generated/columns.hpp"
#include "barretenberg/vm2/generated/relations/lookups_get_contract_instance.hpp"
#include "barretenberg/vm2/simulation/events/event_emitter.hpp"
#include "barretenberg/vm2/simulation/events/get_contract_instance_event.hpp"
#include "barretenberg/vm2/tracegen/lib/get_contract_instance_spec.hpp"
#include "barretenberg/vm2/tracegen/lib/interaction_def.hpp"

namespace bb::avm2::tracegen {

using C = Column;

void GetContractInstanceTraceBuilder::process(
    const simulation::EventEmitterInterface<simulation::GetContractInstanceEvent>::Container& events,
    TraceContainer& trace)
{
    // Set the selector to 0 at row 0 to enable skippable gadget
    trace.set(C::get_contract_instance_sel, 0, 0);

    uint32_t row = 1;
    for (const auto& event : events) {

        // Bounds checking logic for new constraint
        bool writes_are_in_bounds = event.dst_offset != AVM_HIGHEST_MEM_ADDRESS;
        FF dst_offset_diff_max = FF(AVM_HIGHEST_MEM_ADDRESS) - FF(event.dst_offset);
        // dstOffset+1 out of bounds <==> `DST_OFFSET_DIFF_MAX = 0`
        // Generate `dst_offset_diff_max_inv` as `inverse(DST_OFFSET_DIFF_MAX)`
        FF dst_offset_diff_max_inv;
        if (dst_offset_diff_max.is_zero()) {
            dst_offset_diff_max_inv = FF(0);
        } else {
            dst_offset_diff_max_inv = dst_offset_diff_max.invert();
        }

        bool is_valid_member_enum = false;
        bool is_deployer = false;
        bool is_class_id = false;
        bool is_init_hash = false;

        if (writes_are_in_bounds) {
            // Get precomputed table values for this member enum
            const auto spec = GetContractInstanceSpec::get_table(event.member_enum);

            is_valid_member_enum = spec.is_valid_member_enum;
            is_deployer = spec.is_deployer;
            is_class_id = spec.is_class_id;
            is_init_hash = spec.is_init_hash;
        }

        bool has_error = !(writes_are_in_bounds && is_valid_member_enum);

        FF selected_member = is_deployer    ? event.retrieved_deployer_addr
                             : is_class_id  ? event.retrieved_class_id
                             : is_init_hash ? event.retrieved_init_hash
                                            : FF(0);

        trace.set(
            row,
            { {
                // Interface columns
                { C::get_contract_instance_sel, 1 },
                { C::get_contract_instance_clk, event.execution_clk },
                { C::get_contract_instance_contract_address, event.contract_address },
                { C::get_contract_instance_dst_offset, event.dst_offset },
                { C::get_contract_instance_member_enum, event.member_enum },
                { C::get_contract_instance_space_id, event.space_id },
                { C::get_contract_instance_public_data_tree_root, event.public_data_tree_root },
                { C::get_contract_instance_nullifier_tree_root, event.nullifier_tree_root },
                { C::get_contract_instance_sel_error, has_error ? 1 : 0 },
                // Intermediate selectors and error flags
                { C::get_contract_instance_is_valid_writes_in_bounds, writes_are_in_bounds ? 1 : 0 },
                { C::get_contract_instance_dst_offset_diff_max_inv, dst_offset_diff_max_inv },
                // Columns from precomputed table
                { C::get_contract_instance_is_valid_member_enum, is_valid_member_enum ? 1 : 0 },
                { C::get_contract_instance_is_deployer, is_deployer ? 1 : 0 },
                { C::get_contract_instance_is_class_id, is_class_id ? 1 : 0 },
                { C::get_contract_instance_is_init_hash, is_init_hash ? 1 : 0 },
                // Retrieval results
                { C::get_contract_instance_instance_exists, event.instance_exists ? 1 : 0 },
                { C::get_contract_instance_retrieved_deployer_addr, event.retrieved_deployer_addr },
                { C::get_contract_instance_retrieved_class_id, event.retrieved_class_id },
                { C::get_contract_instance_retrieved_init_hash, event.retrieved_init_hash },
                { C::get_contract_instance_selected_member, selected_member },
                // Memory writing
                { C::get_contract_instance_member_write_offset, event.dst_offset + 1 },
                { C::get_contract_instance_exists_tag, writes_are_in_bounds ? static_cast<uint8_t>(ValueTag::U1) : 0 },
                { C::get_contract_instance_member_tag, writes_are_in_bounds ? static_cast<uint8_t>(ValueTag::FF) : 0 },
            } });

        row++;
    }
}

const InteractionDefinition GetContractInstanceTraceBuilder::interactions =
    InteractionDefinition()
        .add<lookup_get_contract_instance_precomputed_info_settings, InteractionType::LookupIntoIndexedByClk>()
        .add<lookup_get_contract_instance_contract_instance_retrieval_settings, InteractionType::LookupSequential>()
        .add<lookup_get_contract_instance_mem_write_contract_instance_exists_settings,
             InteractionType::LookupSequential>()
        .add<lookup_get_contract_instance_mem_write_contract_instance_member_settings,
             InteractionType::LookupSequential>();

} // namespace bb::avm2::tracegen
