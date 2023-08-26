#pragma once

#include "../types.hpp"
#include "./fixed_base_params.hpp"
#include "barretenberg/crypto/pedersen_hash/pedersen.hpp"
#include "barretenberg/ecc/curves/grumpkin/grumpkin.hpp"

namespace plookup::fixed_base {

class table : public FixedBaseParams {
  public:
    using affine_element = grumpkin::g1::affine_element;
    using element = grumpkin::g1::element;

    using single_lookup_table = std::vector<affine_element>;
    using fixed_base_scalar_mul_tables = std::vector<single_lookup_table>;
    using all_multi_tables = std::array<fixed_base_scalar_mul_tables, NUM_FIXED_BASE_MULTI_TABLES>;

    static inline single_lookup_table generate_single_lookup_table(const affine_element& base_point,
                                                                   const affine_element& offset_generator);
    template <size_t num_bits> static fixed_base_scalar_mul_tables generate_tables(const affine_element& input);

    template <size_t num_table_bits> static affine_element generate_generator_offset(const affine_element& input);

    static constexpr uint256_t MAX_LO_SCALAR = uint256_t(1) << BITS_PER_LO_SCALAR;
    inline static const affine_element lhs_base_point_lo = crypto::pedersen_hash::generator_info::get_lhs_generator();
    inline static const affine_element lhs_base_point_hi = element(lhs_base_point_lo) * MAX_LO_SCALAR;
    inline static const affine_element rhs_base_point_lo = crypto::pedersen_hash::generator_info::get_rhs_generator();
    inline static const affine_element rhs_base_point_hi = element(rhs_base_point_lo) * MAX_LO_SCALAR;
    inline static const all_multi_tables fixed_base_tables = {
        table::generate_tables<BITS_PER_LO_SCALAR>(lhs_base_point_lo),
        table::generate_tables<BITS_PER_HI_SCALAR>(lhs_base_point_hi),
        table::generate_tables<BITS_PER_LO_SCALAR>(rhs_base_point_lo),
        table::generate_tables<BITS_PER_HI_SCALAR>(rhs_base_point_hi),
    };

    inline static const std::array<affine_element, table::NUM_FIXED_BASE_MULTI_TABLES>
        fixed_base_table_offset_generators = {
            table::generate_generator_offset<BITS_PER_LO_SCALAR>(lhs_base_point_lo),
            table::generate_generator_offset<BITS_PER_HI_SCALAR>(lhs_base_point_hi),
            table::generate_generator_offset<BITS_PER_LO_SCALAR>(rhs_base_point_lo),
            table::generate_generator_offset<BITS_PER_HI_SCALAR>(rhs_base_point_hi),
        };

    static bool lookup_table_exists_for_point(const affine_element& input);
    static std::optional<std::array<MultiTableId, 2>> get_lookup_table_ids_for_point(const affine_element& input);
    static std::optional<affine_element> get_generator_offset_for_table_id(MultiTableId table_id);

    template <size_t multitable_index>
    static BasicTable generate_basic_fixed_base_table(BasicTableId id, size_t basic_table_index, size_t table_index);
    template <size_t multitable_index, size_t num_bits> static MultiTable get_fixed_base_table(MultiTableId id);

    template <size_t multitable_index, size_t table_index>
    static std::array<barretenberg::fr, 2> get_basic_fixed_base_table_values(const std::array<uint64_t, 2> key)
    {
        static_assert(multitable_index < NUM_FIXED_BASE_MULTI_TABLES);
        static_assert(table_index < get_num_bits_of_multi_table(multitable_index));
        const auto& basic_table = fixed_base_tables[multitable_index][table_index];
        const auto index = static_cast<size_t>(key[0]);
        return { basic_table[index].x, basic_table[index].y };
    }
};

extern template table::affine_element table::generate_generator_offset<table::BITS_PER_LO_SCALAR>(
    const table::affine_element&);
extern template table::affine_element table::generate_generator_offset<table::BITS_PER_HI_SCALAR>(
    const table::affine_element&);
extern template table::fixed_base_scalar_mul_tables table::generate_tables<table::BITS_PER_LO_SCALAR>(
    const table::affine_element&);
extern template table::fixed_base_scalar_mul_tables table::generate_tables<table::BITS_PER_HI_SCALAR>(
    const table::affine_element&);

extern template BasicTable table::generate_basic_fixed_base_table<0>(BasicTableId, size_t, size_t);
extern template BasicTable table::generate_basic_fixed_base_table<1>(BasicTableId, size_t, size_t);
extern template BasicTable table::generate_basic_fixed_base_table<2>(BasicTableId, size_t, size_t);
extern template BasicTable table::generate_basic_fixed_base_table<3>(BasicTableId, size_t, size_t);
extern template MultiTable table::get_fixed_base_table<0, table::BITS_PER_LO_SCALAR>(MultiTableId);
extern template MultiTable table::get_fixed_base_table<1, table::BITS_PER_HI_SCALAR>(MultiTableId);
extern template MultiTable table::get_fixed_base_table<2, table::BITS_PER_LO_SCALAR>(MultiTableId);
extern template MultiTable table::get_fixed_base_table<3, table::BITS_PER_HI_SCALAR>(MultiTableId);

} // namespace plookup::fixed_base