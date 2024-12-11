#pragma once

#include <memory>

namespace bb::world_state {

template <typename Tree> struct TreeWithStore {
    using TreeType = Tree;
    std::unique_ptr<Tree> tree;

    TreeWithStore(std::unique_ptr<Tree> t)
        : tree(std::move(t))
    {}

    TreeWithStore(TreeWithStore&& other) noexcept
        : tree(std::move(other.tree))
    {}

    TreeWithStore(const TreeWithStore& other) = delete;
    ~TreeWithStore() = default;

    TreeWithStore& operator=(TreeWithStore&& other) = delete;
    TreeWithStore& operator=(const TreeWithStore& other) = delete;
};

} // namespace bb::world_state
