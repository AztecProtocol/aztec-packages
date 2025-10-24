#include "barretenberg/vm2/tracegen/merkle_check_trace.hpp"

#include <cstddef>
#include <cstdint>
#include <optional>

#include "barretenberg/crypto/poseidon2/poseidon2.hpp"
#include "barretenberg/vm2/common/field.hpp"
#include "barretenberg/vm2/generated/columns.hpp"
#include "barretenberg/vm2/generated/relations/lookups_merkle_check.hpp"

namespace bb::avm2::tracegen {

using Poseidon2 = crypto::Poseidon2<crypto::Poseidon2Bn254ScalarFieldParams>;

/**
 * @brief Trace generation for the MerkleCheck gadget. It handles both READ and WRITE MerkleCheck events.
 *        While MerkleCheckEvent does not explicitly state whether it is a READ or WRITE event, the distinction
 *        is inferred from the presence of the `new_leaf_value` field (std::optional<FF>).
 *
 * @note A precondition/invariant for each event is that `new_leaf_value` and `new_root` are either
 *       both present or both absent. Additionally, `root` and `new_root` must be correct according
 *       to the sibling path, the leaf value, the leaf index and the new leaf value. Any violation
 *       such as a sibling path being too short will cause a circuit completeness issue. Simulation
 *       gadgets must guarantee the above consistency.
 *
 * @param events The MerkleCheck events to process.
 * @param trace The trace to write to.
 */
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

        const bool write = event.new_leaf_value.has_value();
        assert(write == event.new_root.has_value());

        FF read_node = event.leaf_value;
        FF write_node = event.new_leaf_value.value_or(FF(0));
        uint64_t current_index_in_layer = event.leaf_index;

        const FF& root = event.root;
        const FF new_root = event.new_root.value_or(FF(0));

        for (size_t i = 0; i < full_path_len; ++i) {
            const FF& sibling = event.sibling_path[i];

            // path-length decrements by 1 for each level until it reaches 1
            const size_t path_len = full_path_len - i;

            // end == 1 at last iteration, i.e., i == full_path_len - 1 equivalently to path_len == 1
            const bool end = path_len == 1;
            const bool start = i == 0; // First row in the chain is a start row
            const bool index_is_even = current_index_in_layer % 2 == 0;
            const FF read_left_node = index_is_even ? read_node : sibling;
            const FF read_right_node = index_is_even ? sibling : read_node;
            const FF read_output_hash = Poseidon2::hash({ read_left_node, read_right_node });

            // Read and Write
            trace.set(row,
                      { { { C::merkle_check_sel, 1 },
                          { C::merkle_check_read_node, read_node },
                          { C::merkle_check_index, current_index_in_layer },
                          { C::merkle_check_path_len, path_len },
                          // Guarantees that path_len - 1 never underflows as path_len is always >= 1
                          { C::merkle_check_path_len_min_one_inv, path_len - 1 }, // Will be inverted in batch later
                          { C::merkle_check_read_root, root },
                          { C::merkle_check_sibling, sibling },
                          { C::merkle_check_start, start ? 1 : 0 },
                          { C::merkle_check_end, end ? 1 : 0 },
                          { C::merkle_check_index_is_even, index_is_even ? 1 : 0 },
                          { C::merkle_check_read_left_node, read_left_node },
                          { C::merkle_check_read_right_node, read_right_node },
                          { C::merkle_check_read_output_hash, read_output_hash } } });

            // Update the current/target node value for the next iteration
            read_node = read_output_hash;
            current_index_in_layer >>= 1;

            // Write only.
            if (write) {
                // Only active when write is on.
                const FF write_left_node = index_is_even ? write_node : sibling;
                const FF write_right_node = index_is_even ? sibling : write_node;
                const FF write_output_hash = Poseidon2::hash({ write_left_node, write_right_node });

                trace.set(row,
                          { { { C::merkle_check_write, 1 },
                              { C::merkle_check_write_root, new_root },
                              { C::merkle_check_write_node, write_node },
                              { C::merkle_check_write_left_node, write_left_node },
                              { C::merkle_check_write_right_node, write_right_node },
                              { C::merkle_check_write_output_hash, write_output_hash } } });

                // Update the current/target node value for the next iteration
                write_node = write_output_hash;
            }

            row++;
        }

        assert(current_index_in_layer == 0);
        assert(read_node == root);
        assert(write_node == new_root);
    }

    // Batch invert the columns.
    trace.invert_columns({ { C::merkle_check_path_len_min_one_inv } });
}

const InteractionDefinition MerkleCheckTraceBuilder::interactions =
    InteractionDefinition()
        .add<lookup_merkle_check_merkle_poseidon2_read_settings, InteractionType::LookupSequential>()
        .add<lookup_merkle_check_merkle_poseidon2_write_settings, InteractionType::LookupSequential>();

} // namespace bb::avm2::tracegen
