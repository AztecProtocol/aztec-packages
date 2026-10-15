#pragma once
#include "field/field_element.hpp"
#include <vector>

namespace azteclabs::wsdb::merkle_tree {

using fr_hash_path = std::vector<std::pair<fr, fr>>;
using fr_sibling_path = std::vector<fr>;

} // namespace azteclabs::wsdb::merkle_tree

// We add to std namespace as fr_hash_path is actually a std::vector, and this is the only way
// to achieve effective ADL.
namespace std {
inline std::ostream& operator<<(std::ostream& os, azteclabs::wsdb::merkle_tree::fr_hash_path const& path)
{
    os << "[\n";
    for (size_t i = 0; i < path.size(); ++i) {
        os << "  (" << i << ": " << path[i].first << ", " << path[i].second << ")\n";
    }
    os << "]\n";
    return os;
}
} // namespace std
