#include <cstdint>

#include "barretenberg/crypto/poseidon2/poseidon2.hpp"
#include "barretenberg/vm2/simulation/events/event_emitter.hpp"
#include "barretenberg/vm2/simulation/events/merkle_check_event.hpp"
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
        FF current_node = event.leaf_value;
        uint64_t current_index_in_layer = event.leaf_index;
        for (size_t i = 0; i < full_path_len; ++i) {
            const FF sibling = event.sibling_path[i];

            // path-length decrements by 1 for each level until it reaches 0
            const FF remaining_path_len = FF(full_path_len - i - 1);
            const FF remaining_path_len_inv = remaining_path_len == 0 ? FF(0) : remaining_path_len.invert();

            // end == 1 when the remaining_path_len == 0
            const bool end = remaining_path_len == 0;
            const bool start = i == 0; // First row in the chain is a start row
            const bool index_is_even = current_index_in_layer % 2 == 0;
            const FF left_node = index_is_even ? current_node : sibling;
            const FF right_node = index_is_even ? sibling : current_node;
            const FF output_hash = Poseidon2::hash({ left_node, right_node });

            trace.set(row,
                      { {
                          { C::merkle_check_sel, 1 },
                          { C::merkle_check_leaf, event.leaf_value },
                          { C::merkle_check_leaf_index, event.leaf_index },
                          { C::merkle_check_tree_height, full_path_len },
                          { C::merkle_check_current_node, current_node },
                          { C::merkle_check_current_index_in_layer, current_index_in_layer },
                          { C::merkle_check_remaining_path_len, remaining_path_len },
                          { C::merkle_check_remaining_path_len_inv, remaining_path_len_inv },
                          { C::merkle_check_sibling, sibling },
                          { C::merkle_check_start, start },
                          { C::merkle_check_end, end },
                          { C::merkle_check_index_is_even, index_is_even },
                          { C::merkle_check_left_node, left_node },
                          { C::merkle_check_right_node, right_node },
                          { C::merkle_check_constant_2, 2 },
                          { C::merkle_check_output_hash, output_hash },
                      } });

            // Update the current/target node value for the next iteration
            current_node = output_hash;
            current_index_in_layer >>= 1;

            row++;
        }
    }
}

} // namespace bb::avm2::tracegen
