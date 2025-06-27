#include "barretenberg/vm2/tracegen/public_data_tree_trace.hpp"

#include "barretenberg/vm2/common/aztec_constants.hpp"
#include "barretenberg/vm2/generated/relations/lookups_public_data_check.hpp"
#include "barretenberg/vm2/simulation/events/public_data_tree_check_event.hpp"
#include "barretenberg/vm2/tracegen/lib/discard_reconstruction.hpp"
#include "barretenberg/vm2/tracegen/lib/interaction_def.hpp"

namespace bb::avm2::tracegen {

using simulation::PublicDataTreeLeafPreimage;

namespace {

struct EventWithMetadata {
    simulation::PublicDataTreeReadWriteEvent event;
    bool discard;
};

void process_public_data_tree_check_trace(const std::vector<EventWithMetadata>& events_with_metadata,
                                          const std::unordered_map<FF, uint32_t>& last_nondiscarded_writes,
                                          TraceContainer& trace)
{
    using C = Column;
    // This is a shifted trace, so we start at 1
    uint32_t row = 1;

    uint32_t write_idx = AVM_PUBLIC_INPUTS_AVM_ACCUMULATED_DATA_PUBLIC_DATA_WRITES_ROW_IDX;

    for (size_t i = 0; i < events_with_metadata.size(); i++) {
        bool end = i == events_with_metadata.size() - 1;
        const auto& event = events_with_metadata[i].event;
        const bool discard = events_with_metadata[i].discard;

        bool exists = event.low_leaf_preimage.leaf.slot == event.slot;
        FF slot_low_leaf_slot_diff_inv = exists ? 0 : (event.slot - event.low_leaf_preimage.leaf.slot).invert();

        bool next_slot_is_nonzero = false;
        FF next_slot_inv = 0;
        if (!exists) {
            next_slot_is_nonzero = event.low_leaf_preimage.nextKey != 0;
            next_slot_inv = next_slot_is_nonzero ? event.low_leaf_preimage.nextKey.invert() : 0;
        }

        bool write = event.write_data.has_value();
        bool should_insert = !exists && write;
        bool nondiscarded_write = write && !discard;
        bool should_write_to_public_inputs =
            nondiscarded_write && last_nondiscarded_writes.at(event.leaf_slot) == event.clk;

        FF intermediate_root = 0;
        FF write_root = 0;
        PublicDataTreeLeafPreimage updated_low_leaf = PublicDataTreeLeafPreimage::empty();
        FF updated_low_leaf_hash = 0;
        FF new_leaf_hash = 0;
        uint32_t clk = 0;
        if (write) {
            write_root = event.write_data->next_snapshot.root;
            intermediate_root = event.write_data->intermediate_root;
            updated_low_leaf = event.write_data->updated_low_leaf_preimage;
            updated_low_leaf_hash = event.write_data->updated_low_leaf_hash;
            new_leaf_hash = event.write_data->new_leaf_hash;
            clk = event.clk;
        }

        trace.set(row,
                  { {
                      { C::public_data_check_sel, 1 },
                      { C::public_data_check_not_end, !end },
                      { C::public_data_check_value, event.value },
                      { C::public_data_check_slot, event.slot },
                      { C::public_data_check_root, event.prev_snapshot.root },
                      { C::public_data_check_address, event.contract_address },
                      { C::public_data_check_write_root, write_root },
                      { C::public_data_check_tree_size_before_write, event.prev_snapshot.nextAvailableLeafIndex },
                      { C::public_data_check_write, write },
                      { C::public_data_check_clk, clk },
                      { C::public_data_check_discard, discard },
                      { C::public_data_check_low_leaf_slot, event.low_leaf_preimage.leaf.slot },
                      { C::public_data_check_low_leaf_value, event.low_leaf_preimage.leaf.value },
                      { C::public_data_check_low_leaf_next_index, event.low_leaf_preimage.nextIndex },
                      { C::public_data_check_low_leaf_next_slot, event.low_leaf_preimage.nextKey },
                      { C::public_data_check_updated_low_leaf_value, updated_low_leaf.leaf.value },
                      { C::public_data_check_updated_low_leaf_next_index, updated_low_leaf.nextIndex },
                      { C::public_data_check_updated_low_leaf_next_slot, updated_low_leaf.nextKey },
                      { C::public_data_check_low_leaf_index, event.low_leaf_index },
                      { C::public_data_check_clk_diff, end ? 0 : events_with_metadata[i + 1].event.clk - event.clk },
                      { C::public_data_check_constant_32, 32 },
                      { C::public_data_check_leaf_slot, event.leaf_slot },
                      { C::public_data_check_siloing_separator, GENERATOR_INDEX__PUBLIC_LEAF_INDEX },
                      { C::public_data_check_leaf_not_exists, !exists },
                      { C::public_data_check_slot_low_leaf_slot_diff_inv, slot_low_leaf_slot_diff_inv },
                      { C::public_data_check_next_slot_is_nonzero, next_slot_is_nonzero },
                      { C::public_data_check_next_slot_inv, next_slot_inv },
                      { C::public_data_check_low_leaf_hash, event.low_leaf_hash },
                      { C::public_data_check_intermediate_root, intermediate_root },
                      { C::public_data_check_tree_height, PUBLIC_DATA_TREE_HEIGHT },
                      { C::public_data_check_updated_low_leaf_hash, updated_low_leaf_hash },
                      { C::public_data_check_should_insert, should_insert },
                      { C::public_data_check_new_leaf_hash, new_leaf_hash },
                      { C::public_data_check_write_idx, write_idx },
                      { C::public_data_check_nondiscaded_write, nondiscarded_write },
                      { C::public_data_check_should_write_to_public_inputs, should_write_to_public_inputs },
                  } });
        row++;
    }
}

void process_squashing_trace(const std::vector<EventWithMetadata>& nondiscarded_writes,
                             const std::unordered_map<FF, uint32_t>& last_nondiscarded_writes,
                             TraceContainer& trace)
{
    using C = Column;

    // This is a shifted trace, so we start at 1
    uint32_t row = 1;

    for (size_t i = 0; i < nondiscarded_writes.size(); i++) {
        bool end = i == nondiscarded_writes.size() - 1;
        const auto& event = nondiscarded_writes[i].event;
        bool should_write_to_public_inputs = last_nondiscarded_writes.at(event.leaf_slot) == event.clk;

        uint32_t clk = event.clk;

        bool leaf_slot_increase = false;
        bool check_clock = false;
        uint32_t clk_diff = 0;

        if (!end) {
            const auto& next_event = nondiscarded_writes[i + 1].event;
            leaf_slot_increase = event.leaf_slot != next_event.leaf_slot;
            check_clock = !leaf_slot_increase;
            clk_diff = check_clock ? next_event.clk - clk : 0;
        }

        trace.set(row,
                  { {
                      { C::public_data_squash_sel, 1 },
                      { C::public_data_squash_leaf_slot, event.leaf_slot },
                      { C::public_data_squash_clk, clk },
                      { C::public_data_squash_write_to_public_inputs, should_write_to_public_inputs },
                      { C::public_data_squash_leaf_slot_increase, leaf_slot_increase },
                      { C::public_data_squash_check_clock, check_clock },
                      { C::public_data_squash_clk_diff, clk_diff },
                      { C::public_data_squash_constant_32, 32 },
                  } });
        row++;
    }
}

} // namespace

void PublicDataTreeCheckTraceBuilder::process(
    const simulation::EventEmitterInterface<simulation::PublicDataTreeCheckEvent>::Container& events,
    TraceContainer& trace)
{

    std::vector<EventWithMetadata> events_with_metadata;
    std::unordered_map<FF, uint32_t> last_nondiscarded_writes;

    events_with_metadata.reserve(events.size());
    process_with_discard(events, [&](const simulation::PublicDataTreeReadWriteEvent& event, bool discard) {
        events_with_metadata.push_back({ event, discard });
        if (!discard && event.write_data.has_value()) {
            last_nondiscarded_writes[event.leaf_slot] = event.clk;
        }
    });

    // Put reads first
    std::sort(events_with_metadata.begin(),
              events_with_metadata.end(),
              [](const EventWithMetadata& a, const EventWithMetadata& b) {
                  if (a.event.write_data.has_value() == b.event.write_data.has_value()) {
                      return a.event.clk < b.event.clk;
                  }
                  return !a.event.write_data.has_value();
              });

    process_public_data_tree_check_trace(events_with_metadata, last_nondiscarded_writes, trace);

    // Retain only nondiscarded writes
    std::erase_if(events_with_metadata, [](const EventWithMetadata& event_with_metadata) {
        return !event_with_metadata.event.write_data.has_value() || event_with_metadata.discard;
    });

    // Sort by slot, and then by clk
    std::sort(events_with_metadata.begin(),
              events_with_metadata.end(),
              [](const EventWithMetadata& a, const EventWithMetadata& b) {
                  if (a.event.leaf_slot == b.event.leaf_slot) {
                      return a.event.clk < b.event.clk;
                  }
                  return static_cast<uint256_t>(a.event.leaf_slot) < static_cast<uint256_t>(b.event.leaf_slot);
              });
    process_squashing_trace(events_with_metadata, last_nondiscarded_writes, trace);
}

const InteractionDefinition PublicDataTreeCheckTraceBuilder::interactions =
    InteractionDefinition()
        // Public data read/write
        .add<lookup_public_data_check_low_leaf_slot_validation_settings, InteractionType::LookupSequential>()
        .add<lookup_public_data_check_low_leaf_next_slot_validation_settings, InteractionType::LookupSequential>()
        .add<lookup_public_data_check_low_leaf_poseidon2_0_settings, InteractionType::LookupSequential>()
        .add<lookup_public_data_check_low_leaf_poseidon2_1_settings, InteractionType::LookupSequential>()
        .add<lookup_public_data_check_updated_low_leaf_poseidon2_0_settings, InteractionType::LookupSequential>()
        .add<lookup_public_data_check_updated_low_leaf_poseidon2_1_settings, InteractionType::LookupSequential>()
        .add<lookup_public_data_check_low_leaf_merkle_check_settings, InteractionType::LookupSequential>()
        .add<lookup_public_data_check_new_leaf_poseidon2_0_settings, InteractionType::LookupSequential>()
        .add<lookup_public_data_check_new_leaf_poseidon2_1_settings, InteractionType::LookupSequential>()
        .add<lookup_public_data_check_new_leaf_merkle_check_settings, InteractionType::LookupSequential>();

} // namespace bb::avm2::tracegen
