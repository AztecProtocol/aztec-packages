// === AUDIT STATUS ===
// internal:    { status: Complete, auditors: [Nishat], commit: 22d6fc368da0fbe5412f4f7b2890a052aa48d803 }
// external_1:  { status: not started, auditors: [], commit: }
// external_2:  { status: not started, auditors: [], commit: }
// =====================

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
