#include "barretenberg/vm/avm/trace/gadgets/merkle_tree.hpp"

namespace bb::avm_trace {

bool AvmMerkleTreeTraceBuilder::check_membership(
    uint32_t clk, const FF leaf_value, const uint32_t leaf_index, const std::vector<FF>& path, const FF& root)
{

    uint32_t path_length = static_cast<uint32_t>(path.size());
    FF curr_value = leaf_value;
    uint32_t curr_index = leaf_index;
    std::vector<bool> path_bits;
    std::vector<FF> path_values;
    // Up to 32 hashes per clk?
    auto entry_id = clk << 5;
    for (uint32_t i = 0; i < path_length; i++) {
        bool path_parity = (curr_index % 2 == 0);

        curr_value =
            path_parity
                ? poseidon2_builder.poseidon2_hash({ curr_value, path[i] }, entry_id + i, Poseidon2Caller::MERKLE_TREE)
                : poseidon2_builder.poseidon2_hash({ path[i], curr_value }, entry_id + i, Poseidon2Caller::MERKLE_TREE);
        path_values.push_back(curr_value);
        curr_index >>= 1;
    }
    bool is_member = curr_value == root;
    merkle_check_trace.push_back({ clk, leaf_value, leaf_index, path, path_bits, path_values, root, is_member });
    return is_member;
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

            dest.merkle_tree_clk = (src.clk << 5) + i;
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
            dest.merkle_tree_diff_inv =
                (src.path_values[i] - src.root) == FF::zero() ? FF::zero() : (src.path_values[i] - src.root).invert();

            if (i == (path_length - 1)) {
                dest.merkle_tree_latch = FF::one();
                dest.merkle_tree_is_member = src.is_member ? FF::one() : FF::zero();
            }

            curr_value = src.path_values[i];
            leaf_index >>= 1;
        }
    }
}

} // namespace bb::avm_trace
