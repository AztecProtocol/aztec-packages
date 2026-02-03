#pragma once

#ifdef DISABLE_ASM

#include "barretenberg/ecc/groups/group.hpp"
#include <cstdint>

namespace bb {

// // copies src into dest. n.b. both src and dest must be aligned on 32 byte boundaries
// template <typename Fq, typename Fr, typename Params>
// inline void group<Fq, Fr, Params>::copy(const affine_element* src, affine_element*
// dest)
// {
//     *dest = *src;
// }

// // copies src into dest. n.b. both src and dest must be aligned on 32 byte boundaries
// template <typename Fq, typename Fr, typename Params>
// inline void group<Fq, Fr, Params>::copy(const element* src, element* dest)
// {
//     *dest = *src;
// }

template <typename Fq, typename Fr, typename Params>
inline void group<Fq, Fr, Params>::conditional_negate_affine(const affine_element* src,
                                                             affine_element* dest,
                                                             uint64_t predicate)
{
    *dest = predicate ? -(*src) : (*src);
}
} // namespace bb

#endif
