

#pragma once

#include "barretenberg/relations/generic_copy_relation/generic_copy_relation.hpp"

#include <cstddef>
#include <tuple>

namespace bb {

class copy_second_copy_settings {
  public:
    constexpr static size_t COLUMNS_PER_SET = 4;

    template <typename AllEntities> static inline auto get_const_entities(const AllEntities& in)
    {

        return std::forward_as_tuple(in.copy_second,
                                     in.copy_second_shift,
                                     in.lagrange_first,
                                     in.lagrange_last,
                                     in.copy_a,
                                     in.copy_b,
                                     in.copy_c,
                                     in.copy_d,
                                     in.copy_sigma_a,
                                     in.copy_sigma_b,
                                     in.copy_sigma_c,
                                     in.copy_sigma_d,
                                     in.id_0,
                                     in.id_1,
                                     in.id_2,
                                     in.id_3);
    }

    template <typename AllEntities> static inline auto get_nonconst_entities(AllEntities& in)
    {

        return std::forward_as_tuple(in.copy_second,
                                     in.copy_second_shift,
                                     in.lagrange_first,
                                     in.lagrange_last,
                                     in.copy_a,
                                     in.copy_b,
                                     in.copy_c,
                                     in.copy_d,
                                     in.copy_sigma_a,
                                     in.copy_sigma_b,
                                     in.copy_sigma_c,
                                     in.copy_sigma_d,
                                     in.id_0,
                                     in.id_1,
                                     in.id_2,
                                     in.id_3);
    }
};

template <typename FF_> using copy_second_relation = GenericCopyRelation<copy_second_copy_settings, FF_>;
template <typename FF_> using copy_second = GenericCopy<copy_second_copy_settings, FF_>;

} // namespace bb
