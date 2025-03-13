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

    uint32_t row = 0;
    for (const auto& event : events) {
        const size_t full_path_len = event.sibling_path.size();
        // Iterate over the path starting at the leaf.
        // Root is not included in the path.
        // For the current level, gather info about the current pair of nodes
        // being hashed along with the path-length remaining after this level
        // to complete the merkle check. Note that path-length includes the current level.
        FF current_node_value = event.leaf_value;
        uint64_t current_node_index_in_layer = event.leaf_index;
        for (size_t i = 0; i < full_path_len; ++i) {
            const FF sibling_value = event.sibling_path[i];

            // path-length decrements by 1 for each level until it reaches 0
            const FF remaining_path_len = FF(full_path_len - i - 1);
            const FF remaining_path_len_inv = remaining_path_len == 0 ? FF(0) : remaining_path_len.invert();

            // latch == 1 when the remaining_path_len == 0
            const bool latch = remaining_path_len == 0;
            // TODO(dbanks12): rename leaf_index in PIL to current_index_in_layer?
            // rename leaf_index_is_even to current_index_is_even?
            const bool index_is_even = current_node_index_in_layer % 2 == 0;
            // TODO(dbanks12): rename to left_node, right_node
            const FF left_hash = index_is_even ? current_node_value : sibling_value;
            const FF right_hash = index_is_even ? sibling_value : current_node_value;
            // TODO(dbanks12): should the hash results be coming from the Poseidon2 subtrace instead of recomputed here?
            const FF output_hash = Poseidon2::hash({ left_hash, right_hash });

            trace.set(row,
                      { {
                          { C::merkle_check_sel, 1 },
                          { C::merkle_check_leaf_value, current_node_value },
                          { C::merkle_check_leaf_index, current_node_index_in_layer },
                          { C::merkle_check_path_len, remaining_path_len },
                          { C::merkle_check_path_len_inv, remaining_path_len_inv },
                          { C::merkle_check_sibling_value, sibling_value },
                          { C::merkle_check_latch, latch },
                          { C::merkle_check_leaf_index_is_even, index_is_even },
                          { C::merkle_check_left_hash, left_hash },
                          { C::merkle_check_right_hash, right_hash },
                          { C::merkle_check_output_hash, output_hash },
                      } });

            // Update the current/target node value for the next iteration
            current_node_value = output_hash;
            current_node_index_in_layer >>= 1;

            row++;
        }
    }
}

} // namespace bb::avm2::tracegen
