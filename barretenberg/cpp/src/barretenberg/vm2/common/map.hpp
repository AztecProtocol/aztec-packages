#pragma once

#include "barretenberg/vm2/common/ankerl_map.hpp"

namespace bb::avm2 {

// Who would've guessed that std::unordered_map is slow?
// https://news.ycombinator.com/item?id=36521291
//
// We use an alternative single-header implementation that is faster and more memory efficient.
// https://github.com/martinus/unordered_dense
// https://martin.ankerl.com/2019/04/01/hashmap-benchmarks-01-overview/
// https://github.com/martinus/robin-hood-hashing is archived and recommends ankerl::unordered_dense.
// In our benchmarks this map is at least 25% faster for insertion and 2x faster for visits.
template <class Key, class T> using unordered_flat_map = ::ankerl::unordered_dense::map<Key, T>;
// Note: if we eventually want to have lower memory usage at the cost of some speed,
// we can use ::ankerl::unordered_dense::segmented_map instead.

} // namespace bb::avm2