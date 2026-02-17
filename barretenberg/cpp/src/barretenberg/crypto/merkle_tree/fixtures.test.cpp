#include "fixtures.hpp"

namespace bb::crypto::merkle_tree {

const fr& get_value(size_t index)
{
    static std::vector<fr> VALUES = create_values();
    return VALUES[index];
}

} // namespace bb::crypto::merkle_tree
