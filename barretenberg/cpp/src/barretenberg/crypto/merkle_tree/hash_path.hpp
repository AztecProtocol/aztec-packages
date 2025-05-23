// === AUDIT STATUS ===
// internal:    { status: not started, auditors: [], date: YYYY-MM-DD }
// external_1:  { status: not started, auditors: [], date: YYYY-MM-DD }
// external_2:  { status: not started, auditors: [], date: YYYY-MM-DD }
// =====================

#pragma once
#include "barretenberg/stdlib/primitives/field/field.hpp"
#include "hash.hpp"
#include <algorithm>
#include <vector>

namespace bb::crypto::merkle_tree {

using fr_hash_path = std::vector<std::pair<fr, fr>>;
using fr_sibling_path = std::vector<fr>;
template <typename Ctx> using hash_path = std::vector<std::pair<bb::stdlib::field_t<Ctx>, bb::stdlib::field_t<Ctx>>>;

inline fr_hash_path get_new_hash_path(fr_hash_path const& old_path, uint128_t index, fr const& value)
{
    fr_hash_path path = old_path;
    fr current = value;
    for (size_t i = 0; i < old_path.size(); ++i) {
        bool path_bit = static_cast<bool>(index & 0x1);
        if (path_bit) {
            path[i].second = current;
        } else {
            path[i].first = current;
        }
        current = hash_pair_native(path[i].first, path[i].second);
        index /= 2;
    }
    return path;
}

inline fr_hash_path get_random_hash_path(size_t const& tree_depth)
{
    fr_hash_path path;
    for (size_t i = 0; i < tree_depth; ++i) {
        path.push_back(std::make_pair(fr::random_element(), fr::random_element()));
    }
    return path;
}

template <typename Ctx> inline hash_path<Ctx> create_witness_hash_path(Ctx& ctx, fr_hash_path const& input)
{
    hash_path<Ctx> result;
    std::transform(input.begin(), input.end(), std::back_inserter(result), [&](auto const& v) {
        return std::make_pair(bb::stdlib::field_t(bb::stdlib::witness_t(&ctx, v.first)),
                              bb::stdlib::field_t(bb::stdlib::witness_t(&ctx, v.second)));
    });
    return result;
}

inline fr get_hash_path_root(fr_hash_path const& input)
{
    return hash_pair_native(input[input.size() - 1].first, input[input.size() - 1].second);
}

inline fr zero_hash_at_height(size_t height)
{
    auto current = fr(0);
    for (size_t i = 0; i < height; ++i) {
        current = hash_pair_native(current, current);
    }
    return current;
}

} // namespace bb::crypto::merkle_tree

// We add to std namespace as fr_hash_path is actually a std::vector, and this is the only way
// to achieve effective ADL.
namespace std {
template <typename Ctx>
inline std::ostream& operator<<(std::ostream& os, bb::crypto::merkle_tree::hash_path<Ctx> const& path)
{
    os << "[\n";
    for (size_t i = 0; i < path.size(); ++i) {
        os << "  (" << i << ": " << path[i].first << ", " << path[i].second << ")\n";
    }
    os << "]\n";
    return os;
}

inline std::ostream& operator<<(std::ostream& os, bb::crypto::merkle_tree::fr_hash_path const& path)
{
    os << "[\n";
    for (size_t i = 0; i < path.size(); ++i) {
        os << "  (" << i << ": " << path[i].first << ", " << path[i].second << ")\n";
    }
    os << "]\n";
    return os;
}
} // namespace std
