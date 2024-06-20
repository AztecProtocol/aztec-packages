
#pragma once

#include "barretenberg/relations/generic_copy_relation/generic_copy_relation.hpp"

#include <cstddef>
#include <tuple>

namespace bb {

class copy_main_copy_settings {
  public:
    constexpr static size_t COLUMNS_PER_SET = 3;

    // For copy constraints the inverse will always be calculated
    template <typename AllEntities>
    static inline auto inverse_polynomial_is_computed_at_row([[maybe_unused]] const AllEntities& in)
    {
        return 1;
    }

    template <typename AllEntities> static inline auto get_const_entities(const AllEntities& in)
    {

        return std::forward_as_tuple(in.copy_main_inverse,
                                     in.copy_x,
                                     in.copy_y,
                                     in.copy_z,
                                     in.copy_sigma_x,
                                     in.copy_sigma_y,
                                     in.copy_sigma_z,
                                     in.id_0,
                                     in.id_1,
                                     in.id_2);
    }

    template <typename AllEntities> static inline auto get_nonconst_entities(AllEntities& in)
    {

        return std::forward_as_tuple(in.copy_main_inverse,
                                     in.copy_x,
                                     in.copy_y,
                                     in.copy_z,
                                     in.copy_sigma_x,
                                     in.copy_sigma_y,
                                     in.copy_sigma_z,
                                     in.id_0,
                                     in.id_1,
                                     in.id_2);
    }
};

template <typename FF_> using copy_main_relation = GenericCopyRelation<copy_main_copy_settings, FF_>;
template <typename FF_> using copy_main = GenericCopy<copy_main_copy_settings, FF_>;

} // namespace bb
