#include "memory_tree.hpp"
#include "hash.hpp"

namespace proof_system::plonk {
namespace stdlib {
namespace merkle_tree {

MemoryTree::MemoryTree(size_t depth)
    : depth_(depth)
{
    ASSERT(depth_ >= 1 && depth <= 20);
    total_size_ = 1UL << depth_;
    hashes_.resize(total_size_ * 2 - 2);

    // Build the entire tree.
    auto current = fr(0);
    size_t layer_size = total_size_;
    for (size_t offset = 0; offset < hashes_.size(); offset += layer_size, layer_size /= 2) {
        for (size_t i = 0; i < layer_size; ++i) {
            hashes_[offset + i] = current;
        }
        current = hash_pair_native(current, current);
    }

    root_ = current;
}

fr_hash_path MemoryTree::get_hash_path(size_t index)
{
    fr_hash_path path(depth_);
    size_t offset = 0;
    size_t layer_size = total_size_;
    for (size_t i = 0; i < depth_; ++i) {
        index -= index & 0x1;
        path[i] = std::make_pair(hashes_[offset + index], hashes_[offset + index + 1]);
        offset += layer_size;
        layer_size >>= 1;
        index >>= 1;
    }
    return path;
}

fr_sibling_path MemoryTree::get_sibling_path(size_t index)
{
    fr_sibling_path path(depth_);
    size_t offset = 0;
    size_t layer_size = total_size_;
    for (size_t i = 0; i < depth_; i++) {
        if (index % 2 == 0) {
            path[i] = hashes_[offset + index + 1];
        } else {
            path[i] = hashes_[offset + index - 1];
        }
        offset += layer_size;
        layer_size >>= 1;
        index >>= 1;
    }
    return path;
}

fr MemoryTree::update_element(size_t index, fr const& value)
{
    size_t offset = 0;
    size_t layer_size = total_size_;
    fr current = value;
    for (size_t i = 0; i < depth_; ++i) {
        hashes_[offset + index] = current;
        index &= (~0ULL) - 1;
        current = hash_pair_native(hashes_[offset + index], hashes_[offset + index + 1]);
        offset += layer_size;
        layer_size >>= 1;
        index >>= 1;
    }
    root_ = current;
    return root_;
}

} // namespace merkle_tree
} // namespace stdlib
} // namespace proof_system::plonk