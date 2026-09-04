#include "fixtures.hpp"

namespace azteclabs::wsdb::merkle_tree {

const fr& get_value(size_t index)
{
    static std::vector<fr> VALUES = create_values();
    return VALUES[index];
}

} // namespace azteclabs::wsdb::merkle_tree
