#include "barretenberg/vm/avm/trace/gadgets/merkle_tree.hpp"
#include "barretenberg/crypto/poseidon2/poseidon2.hpp"
#include "barretenberg/vm/aztec_constants.hpp"

namespace bb::avm_trace {

using Poseidon2 = crypto::Poseidon2<crypto::Poseidon2Bn254ScalarFieldParams>;

/**************************************************************************************************
 *                          UNCONSTRAINED TREE OPERATIONS
 **************************************************************************************************/

void AvmMerkleTreeTraceBuilder::checkpoint_non_revertible_state()
{
    non_revertible_tree_snapshots = tree_snapshots.copy();
}
void AvmMerkleTreeTraceBuilder::rollback_to_non_revertible_checkpoint()
{
    tree_snapshots = non_revertible_tree_snapshots;
}

FF AvmMerkleTreeTraceBuilder::unconstrained_hash_nullifier_preimage(const NullifierLeafPreimage& preimage)
{
    return Poseidon2::hash({ preimage.nullifier, preimage.next_nullifier, preimage.next_index });
}

FF AvmMerkleTreeTraceBuilder::unconstrained_hash_public_data_preimage(const PublicDataTreeLeafPreimage& preimage)
{
    return Poseidon2::hash({ preimage.slot, preimage.value, preimage.next_index, preimage.next_slot });
}

FF AvmMerkleTreeTraceBuilder::unconstrained_silo_note_hash(FF contract_address, FF note_hash)
{
    return Poseidon2::hash({ GENERATOR_INDEX__SILOED_NOTE_HASH, contract_address, note_hash });
}

FF AvmMerkleTreeTraceBuilder::unconstrained_silo_nullifier(FF contract_address, FF nullifier)
{
    return Poseidon2::hash({ GENERATOR_INDEX__OUTER_NULLIFIER, contract_address, nullifier });
}

FF AvmMerkleTreeTraceBuilder::unconstrained_compute_public_tree_leaf_slot(FF contract_address, FF leaf_index)
{
    return Poseidon2::hash({ GENERATOR_INDEX__PUBLIC_LEAF_INDEX, contract_address, leaf_index });
}

FF unconstrained_compute_root_from_path(const FF& leaf_value, const uint64_t leaf_index, const std::vector<FF>& path)
{
    FF curr_value = leaf_value;
    uint64_t curr_index = leaf_index;
    std::vector<FF> path_values;
    for (const auto& i : path) {
        // Is true if the current index is even
        bool path_parity = (curr_index % 2 == 0);

        curr_value = path_parity ? Poseidon2::hash({ curr_value, i }) : Poseidon2::hash({ i, curr_value });
        path_values.push_back(curr_value);
        // Halve the index (to get the parent index) as we move up the tree
        curr_index >>= 1;
    }
    return curr_value;
}

bool AvmMerkleTreeTraceBuilder::unconstrained_check_membership(const FF& leaf_value,
                                                               const uint64_t leaf_index,
                                                               const std::vector<FF>& path,
                                                               const FF& root)
{
    FF computed_root = unconstrained_compute_root_from_path(leaf_value, leaf_index, path);
    // If the computed root is the same as the expected then the leaf is a member
    return computed_root == root;
}

FF AvmMerkleTreeTraceBuilder::unconstrained_update_leaf_index(const FF& leaf_value,
                                                              const uint64_t leaf_index,
                                                              const std::vector<FF>& path)
{
    return unconstrained_compute_root_from_path(leaf_value, leaf_index, path);
}

bool AvmMerkleTreeTraceBuilder::assert_public_data_non_membership_check(
    const PublicDataTreeLeafPreimage& low_leaf_preimage, const FF& leaf_slot)
{
    auto low_leaf_slot = uint256_t(low_leaf_preimage.slot);
    auto low_leaf_next_index = uint256_t(low_leaf_preimage.next_index);
    auto low_leaf_next_slot = uint256_t(low_leaf_preimage.next_slot);

    auto leaf_slot_value = uint256_t(leaf_slot);

    return low_leaf_slot < leaf_slot_value && (low_leaf_next_index == 0 || low_leaf_next_slot > leaf_slot_value);
}

bool AvmMerkleTreeTraceBuilder::assert_nullifier_non_membership_check(const NullifierLeafPreimage& low_leaf_preimage,
                                                                      const FF& siloed_nullifier)
{
    auto low_leaf_nullifier = uint256_t(low_leaf_preimage.nullifier);
    auto low_leaf_next_index = uint256_t(low_leaf_preimage.next_index);
    auto low_leaf_next_nullifier = uint256_t(low_leaf_preimage.next_nullifier);

    auto siloed_leaf_nullifier = uint256_t(siloed_nullifier);

    return low_leaf_nullifier < siloed_leaf_nullifier &&
           (low_leaf_next_index == 0 || low_leaf_next_nullifier > siloed_leaf_nullifier);
}

/**************************************************************************************************
 *                          STORAGE TREE OPERATIONS
 **************************************************************************************************/
bool AvmMerkleTreeTraceBuilder::perform_storage_read([[maybe_unused]] uint32_t clk,
                                                     const PublicDataTreeLeafPreimage& preimage,
                                                     const FF& leaf_index,
                                                     const std::vector<FF>& path) const
{
    // Hash the preimage
    FF preimage_hash = unconstrained_hash_public_data_preimage(preimage);
    auto index = static_cast<uint64_t>(leaf_index);
    // Check if the leaf is a member of the tree
    return unconstrained_check_membership(preimage_hash, index, path, tree_snapshots.public_data_tree.root);
}

FF AvmMerkleTreeTraceBuilder::perform_storage_write([[maybe_unused]] uint32_t clk,
                                                    PublicDataTreeLeafPreimage& low_preimage,
                                                    const FF& low_index,
                                                    const std::vector<FF>& low_path,
                                                    const FF& slot,
                                                    const FF& value,
                                                    const std::vector<FF>& insertion_path)
{
    // Check membership of the low leaf
    bool low_leaf_member = perform_storage_read(clk, low_preimage, low_index, low_path);
    ASSERT(low_leaf_member);
    if (slot == low_preimage.slot) {
        //  We update the low value
        low_preimage.value = value;
        FF low_preimage_hash = unconstrained_hash_public_data_preimage(low_preimage);
        // Update the low leaf
        tree_snapshots.public_data_tree.root =
            unconstrained_update_leaf_index(low_preimage_hash, static_cast<uint64_t>(low_index), low_path);
        return tree_snapshots.public_data_tree.root;
    }
    // Check the low leaf conditions (i.e. the slot is sandwiched by the low nullifier, or the new slot is a max
    // value)
    bool low_leaf_conditions = assert_public_data_non_membership_check(low_preimage, slot);
    ASSERT(low_leaf_conditions);
    // The new leaf for an insertion is
    PublicDataTreeLeafPreimage new_preimage{
        .slot = slot, .value = value, .next_index = low_preimage.next_index, .next_slot = low_preimage.next_slot
    };
    // Update the low preimage with the new leaf preimage
    low_preimage.next_slot = slot;
    low_preimage.next_index = tree_snapshots.public_data_tree.size;
    // Hash the low preimage
    FF low_preimage_hash = unconstrained_hash_public_data_preimage(low_preimage);
    // Compute the new root
    FF new_root = unconstrained_update_leaf_index(low_preimage_hash, static_cast<uint64_t>(low_index), low_path);
    // Check membership of the zero leaf at the insertion index against the new root
    auto index = static_cast<uint64_t>(tree_snapshots.public_data_tree.size);
    bool zero_leaf_member = unconstrained_check_membership(FF::zero(), index, insertion_path, new_root);
    ASSERT(zero_leaf_member);
    // Hash the new preimage
    FF leaf_preimage_hash = unconstrained_hash_public_data_preimage(new_preimage);
    // Insert the new leaf into the tree
    tree_snapshots.public_data_tree.root = unconstrained_update_leaf_index(leaf_preimage_hash, index, insertion_path);
    tree_snapshots.public_data_tree.size++;
    return tree_snapshots.public_data_tree.root;
}

bool AvmMerkleTreeTraceBuilder::perform_nullifier_read([[maybe_unused]] uint32_t clk,
                                                       const NullifierLeafPreimage& preimage,
                                                       const FF& leaf_index,
                                                       const std::vector<FF>& path) const

{
    // Hash the preimage
    FF preimage_hash = unconstrained_hash_nullifier_preimage(preimage);
    auto index = static_cast<uint64_t>(leaf_index);
    // Check if the leaf is a member of the tree
    return unconstrained_check_membership(preimage_hash, index, path, tree_snapshots.nullifier_tree.root);
}

FF AvmMerkleTreeTraceBuilder::perform_nullifier_append([[maybe_unused]] uint32_t clk,
                                                       NullifierLeafPreimage& low_preimage,
                                                       const FF& low_index,
                                                       const std::vector<FF>& low_path,
                                                       const FF& nullifier,
                                                       const std::vector<FF>& insertion_path)
{
    bool is_update = low_preimage.nullifier == nullifier;
    FF low_preimage_hash = unconstrained_hash_nullifier_preimage(low_preimage);
    if (is_update) {
        // We need to raise an error here, since updates arent allowed in the nullifier tree
        bool is_member = unconstrained_check_membership(
            low_preimage_hash, static_cast<uint64_t>(low_index), low_path, tree_snapshots.nullifier_tree.root);
        ASSERT(is_member);
        return tree_snapshots.nullifier_tree.root;
    }
    // Check the low leaf conditions (i.e. the slot is sandwiched by the low nullifier, or the new slot is a max
    // value)
    bool low_leaf_conditions = assert_nullifier_non_membership_check(low_preimage, nullifier);
    ASSERT(low_leaf_conditions);
    // Check membership of the low leaf
    bool low_leaf_member = unconstrained_check_membership(
        low_preimage_hash, static_cast<uint64_t>(low_index), low_path, tree_snapshots.nullifier_tree.root);
    ASSERT(low_leaf_member);
    // The new leaf for an insertion is
    NullifierLeafPreimage new_preimage{ .nullifier = nullifier,
                                        .next_nullifier = low_preimage.next_nullifier,
                                        .next_index = low_preimage.next_index };
    // Update the low preimage
    low_preimage.next_nullifier = nullifier;
    low_preimage.next_index = tree_snapshots.nullifier_tree.size;
    // Update hash of the low preimage
    low_preimage_hash = unconstrained_hash_nullifier_preimage(low_preimage);
    // Update the root with new low preimage
    FF updated_root = unconstrained_update_leaf_index(low_preimage_hash, static_cast<uint64_t>(low_index), low_path);
    // Check membership of the zero leaf at the insertion index against the new root
    auto index = static_cast<uint64_t>(tree_snapshots.nullifier_tree.size);
    bool zero_leaf_member = unconstrained_check_membership(FF::zero(), index, insertion_path, updated_root);
    ASSERT(zero_leaf_member);
    // Hash the new preimage
    FF leaf_preimage_hash = unconstrained_hash_nullifier_preimage(new_preimage);
    // Insert the new leaf into the tree
    tree_snapshots.nullifier_tree.root = unconstrained_update_leaf_index(leaf_preimage_hash, index, insertion_path);
    tree_snapshots.nullifier_tree.size++;
    return tree_snapshots.nullifier_tree.root;
}

bool AvmMerkleTreeTraceBuilder::perform_note_hash_read([[maybe_unused]] uint32_t clk,
                                                       const FF& note_hash,
                                                       const FF& leaf_index,
                                                       const std::vector<FF>& path) const
{
    auto index = static_cast<uint64_t>(leaf_index);
    return unconstrained_check_membership(note_hash, index, path, tree_snapshots.note_hash_tree.root);
}

FF AvmMerkleTreeTraceBuilder::perform_note_hash_append([[maybe_unused]] uint32_t clk,
                                                       const FF& note_hash,
                                                       const std::vector<FF>& insertion_path)
{
    auto index = static_cast<uint64_t>(tree_snapshots.note_hash_tree.size);
    bool zero_leaf_member =
        unconstrained_check_membership(FF::zero(), index, insertion_path, tree_snapshots.note_hash_tree.root);
    ASSERT(zero_leaf_member);
    tree_snapshots.note_hash_tree.root = unconstrained_update_leaf_index(note_hash, index, insertion_path);
    tree_snapshots.note_hash_tree.size++;
    return tree_snapshots.note_hash_tree.root;
}

bool AvmMerkleTreeTraceBuilder::perform_l1_to_l2_message_read([[maybe_unused]] uint32_t clk,
                                                              const FF& leaf_value,
                                                              const FF leaf_index,
                                                              const std::vector<FF>& path) const
{
    auto index = static_cast<uint64_t>(leaf_index);
    return unconstrained_check_membership(leaf_value, index, path, tree_snapshots.l1_to_l2_message_tree.root);
}

/**************************************************************************************************
 *                          CONSTRAINED TREE OPERATIONS
 **************************************************************************************************/
AvmMerkleTreeTraceBuilder::MerkleEntry AvmMerkleTreeTraceBuilder::compute_root_from_path(uint32_t clk,
                                                                                         const FF& leaf_value,
                                                                                         const uint64_t leaf_index,
                                                                                         const std::vector<FF>& path)
{
    uint32_t path_length = static_cast<uint32_t>(path.size());
    FF curr_value = leaf_value;
    uint64_t curr_index = leaf_index;
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

FF AvmMerkleTreeTraceBuilder::silo_note_hash(uint32_t clk, FF contract_address, FF note_hash)
{
    return poseidon2_builder.poseidon2_hash(
        { GENERATOR_INDEX__SILOED_NOTE_HASH, contract_address, note_hash }, clk, Poseidon2Caller::SILO);
}

FF AvmMerkleTreeTraceBuilder::silo_nullifier(uint32_t clk, FF contract_address, FF nullifier)
{
    return poseidon2_builder.poseidon2_hash(
        { GENERATOR_INDEX__OUTER_NULLIFIER, contract_address, nullifier }, clk, Poseidon2Caller::SILO);
}

FF AvmMerkleTreeTraceBuilder::compute_public_tree_leaf_slot(uint32_t clk, FF contract_address, FF leaf_index)
{
    return poseidon2_builder.poseidon2_hash(
        { GENERATOR_INDEX__PUBLIC_LEAF_INDEX, contract_address, leaf_index }, clk, Poseidon2Caller::SILO);
}

bool AvmMerkleTreeTraceBuilder::check_membership(
    uint32_t clk, const FF& leaf_value, const uint64_t leaf_index, const std::vector<FF>& path, const FF& root)
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
                                                const uint64_t leaf_index,
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
        uint64_t leaf_index = src.leaf_index;
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
