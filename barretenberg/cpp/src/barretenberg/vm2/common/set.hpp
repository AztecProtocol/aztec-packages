#pragma once

#include "barretenberg/vm2/common/ankerl_dense.hpp"

namespace bb::avm2 {

// We use an alternative single-header implementation that is faster and more memory efficient.
// https://github.com/martinus/unordered_dense
// https://martin.ankerl.com/2019/04/01/hashmap-benchmarks-01-overview/
// https://github.com/martinus/robin-hood-hashing is archived and recommends ankerl::unordered_dense.
template <class Key> using unordered_flat_set = ::ankerl::unordered_dense::set<Key>;

} // namespace bb::avm2
