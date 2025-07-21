#include <cstdint>
#include <memory>

#include "barretenberg/crypto/poseidon2/poseidon2.hpp"
#include "barretenberg/vm2/generated/relations/lookups_merkle_check.hpp"
#include "barretenberg/vm2/simulation/events/event_emitter.hpp"
#include "barretenberg/vm2/simulation/events/merkle_check_event.hpp"
#include "barretenberg/vm2/tracegen/lib/interaction_def.hpp"
#include "barretenberg/vm2/tracegen/merkle_check_trace.hpp"

namespace bb::avm2::tracegen {

using Poseidon2 = crypto::Poseidon2<crypto::Poseidon2Bn254ScalarFieldParams>;

void MerkleCheckTraceBuilder::process(
    const simulation::EventEmitterInterface<simulation::MerkleCheckEvent>::Container& events, TraceContainer& trace)
{
    using C = Column;

    // Skip 0th row since this gadget has shifts
    uint32_t row = 1;

    for (const auto& event : events) {
        const size_t full_path_len = event.sibling_path.size();
        // Iterate over the path starting at the leaf.
        // Root is not included in the path.
        // For the current level, gather info about the current pair of nodes
        // being hashed along with the path-length remaining after this level
        // to complete the merkle check.

        bool write = event.new_leaf_value.has_value();
        assert(write == event.new_root.has_value());

        FF read_node = event.leaf_value;
        FF write_node = event.new_leaf_value.value_or(FF(0));

        FF root = event.root;
        FF new_root = event.new_root.value_or(FF(0));

        uint64_t current_index_in_layer = event.leaf_index;
        for (size_t i = 0; i < full_path_len; ++i) {
            const FF sibling = event.sibling_path[i];

            // path-length decrements by 1 for each level until it reaches 1
            const FF path_len = FF(full_path_len - i);
            const FF remaining_path_len = path_len - 1;
            const FF remaining_path_len_inv = remaining_path_len == 0 ? FF(0) : remaining_path_len.invert();

            // end == 1 when the remaining_path_len == 0
            const bool end = remaining_path_len == 0;
            const bool start = i == 0; // First row in the chain is a start row
            const bool index_is_even = current_index_in_layer % 2 == 0;
            const FF read_left_node = index_is_even ? read_node : sibling;
            const FF read_right_node = index_is_even ? sibling : read_node;
            const FF read_output_hash = Poseidon2::hash({ read_left_node, read_right_node });

            const FF write_left_node = write ? index_is_even ? write_node : sibling : FF(0);
            const FF write_right_node = write ? index_is_even ? sibling : write_node : FF(0);
            const FF write_output_hash = write ? Poseidon2::hash({ write_left_node, write_right_node }) : FF(0);

            trace.set(row,
                      { { { C::merkle_check_sel, 1 },
                          { C::merkle_check_read_node, read_node },
                          { C::merkle_check_write, write },
                          { C::merkle_check_write_node, write_node },
                          { C::merkle_check_index, current_index_in_layer },
                          { C::merkle_check_path_len, path_len },
                          { C::merkle_check_remaining_path_len_inv, remaining_path_len_inv },
                          { C::merkle_check_read_root, root },
                          { C::merkle_check_write_root, new_root },
                          { C::merkle_check_sibling, sibling },
                          { C::merkle_check_start, start },
                          { C::merkle_check_end, end },
                          { C::merkle_check_index_is_even, index_is_even },
                          { C::merkle_check_read_left_node, read_left_node },
                          { C::merkle_check_read_right_node, read_right_node },
                          { C::merkle_check_write_left_node, write_left_node },
                          { C::merkle_check_write_right_node, write_right_node },
                          { C::merkle_check_constant_2, 2 },
                          { C::merkle_check_read_output_hash, read_output_hash },
                          { C::merkle_check_write_output_hash, write_output_hash } } });

            // Update the current/target node value for the next iteration
            read_node = read_output_hash;
            write_node = write_output_hash;
            current_index_in_layer >>= 1;

            row++;
        }
        assert(read_node == root);
        assert(write_node == new_root);
    }
}

const InteractionDefinition MerkleCheckTraceBuilder::interactions =
    InteractionDefinition()
        .add<lookup_merkle_check_merkle_poseidon2_read_settings, InteractionType::LookupSequential>()
        .add<lookup_merkle_check_merkle_poseidon2_write_settings, InteractionType::LookupSequential>();

} // namespace bb::avm2::tracegen
