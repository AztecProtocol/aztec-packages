#include "barretenberg/vm/avm/trace/gadgets/merkle_tree.hpp"

namespace bb::avm_trace {

AvmMerkleTreeTraceBuilder::MerkleEntry AvmMerkleTreeTraceBuilder::compute_root_from_path(uint32_t clk,
                                                                                         const FF& leaf_value,
                                                                                         const uint32_t leaf_index,
                                                                                         const std::vector<FF>& path)
{
    uint32_t path_length = static_cast<uint32_t>(path.size());
    FF curr_value = leaf_value;
    uint32_t curr_index = leaf_index;
    std::vector<FF> path_values;
    // These will be eventually stored somewhere as a "clock speed"
    // TODO: This will need to be better defined when we have a better idea of what the sub clocks will look like across
    // gadgets
    auto entry_id = clk << 6;
    for (uint32_t i = 0; i < path_length; i++) {
        // Is true if the current index is even
        bool path_parity = (curr_index % 2 == 0);

        curr_value =
            path_parity
                ? poseidon2_builder.poseidon2_hash({ curr_value, path[i] }, entry_id + i, Poseidon2Caller::MERKLE_TREE)
                : poseidon2_builder.poseidon2_hash({ path[i], curr_value }, entry_id + i, Poseidon2Caller::MERKLE_TREE);
        path_values.push_back(curr_value);
        // Halve the index (to get the parent index) as we move up the tree
        curr_index >>= 1;
    }
    return MerkleEntry{ .clk = clk,
                        .leaf_value = leaf_value,
                        .leaf_index = leaf_index,
                        .path = path,
                        .path_values = path_values,
                        .root = curr_value };
}

bool AvmMerkleTreeTraceBuilder::check_membership(
    uint32_t clk, const FF& leaf_value, const uint32_t leaf_index, const std::vector<FF>& path, const FF& root)
{
    MerkleEntry entry = compute_root_from_path(clk, leaf_value, leaf_index, path);
    // If the computed root is the same as the expected then the leaf is a member
    bool is_member = entry.root == root;
    // If the leaf is not a member then we should replace the computed root with the expected root
    entry.root = is_member ? entry.root : root;
    merkle_check_trace.push_back(entry);
    return is_member;
}

FF AvmMerkleTreeTraceBuilder::update_leaf_index(uint32_t clk,
                                                const FF& leaf_value,
                                                const uint32_t leaf_index,
                                                const std::vector<FF>& path)
{
    MerkleEntry entry = compute_root_from_path(clk, leaf_value, leaf_index, path);
    merkle_check_trace.push_back(entry);
    return entry.root;
}

void AvmMerkleTreeTraceBuilder::finalize(std::vector<AvmFullRow<FF>>& main_trace)
{
    size_t main_trace_counter = 0;

    for (const auto& src : merkle_check_trace) {
        uint32_t path_length = static_cast<uint32_t>(src.path.size());
        uint32_t leaf_index = src.leaf_index;
        auto curr_value = src.leaf_value;
        for (size_t i = 0; i < path_length; i++) {
            auto sibling_value = src.path[i];
            auto& dest = main_trace.at(main_trace_counter++);

            dest.merkle_tree_clk = (src.clk << 6) + i;
            dest.merkle_tree_leaf_index = leaf_index;
            dest.merkle_tree_leaf_value = curr_value;
            dest.merkle_tree_expected_tree_root = src.root;

            dest.merkle_tree_leaf_index_is_even = (leaf_index % 2 == 0) ? FF::one() : FF::zero();
            dest.merkle_tree_left_hash = leaf_index % 2 == 0 ? curr_value : sibling_value;
            dest.merkle_tree_right_hash = leaf_index % 2 == 0 ? sibling_value : curr_value;
            dest.merkle_tree_output_hash = src.path_values[i];
            dest.merkle_tree_sibling_value = sibling_value;

            dest.merkle_tree_path_len = path_length - i - 1;
            dest.merkle_tree_path_len_inv = (path_length - i - 1) == 0 ? 0 : FF(path_length - i - 1).invert();
            dest.merkle_tree_sel_merkle_tree = FF::one();

            if (i == (path_length - 1)) {
                dest.merkle_tree_latch = FF::one();
            }

            curr_value = src.path_values[i];
            leaf_index >>= 1;
        }
    }
}

} // namespace bb::avm_trace
