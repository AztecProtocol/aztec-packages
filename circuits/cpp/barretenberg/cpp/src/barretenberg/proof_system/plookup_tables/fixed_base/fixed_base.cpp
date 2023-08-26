
#include "./fixed_base.hpp"

#include "barretenberg/common/constexpr_utils.hpp"
#include "barretenberg/numeric/bitop/pow.hpp"
#include "barretenberg/numeric/bitop/rotate.hpp"
#include "barretenberg/numeric/bitop/sparse_form.hpp"

namespace plookup::fixed_base {

table::single_lookup_table table::generate_single_lookup_table(const affine_element& base_point,
                                                               const affine_element& offset_generator)
{
    std::vector<element> table_raw(MAX_TABLE_SIZE);

    element accumulator = offset_generator;
    for (size_t i = 0; i < MAX_TABLE_SIZE; ++i) {
        table_raw[i] = accumulator;
        accumulator += base_point;
    }
    element::batch_normalize(&table_raw[0], MAX_TABLE_SIZE);
    single_lookup_table table(MAX_TABLE_SIZE);
    for (size_t i = 0; i < table_raw.size(); ++i) {
        table[i] = affine_element{ table_raw[i].x, table_raw[i].y };
    }
    return table;
}

template <size_t num_bits> table::fixed_base_scalar_mul_tables table::generate_tables(const affine_element& input)
{
    constexpr size_t NUM_TABLES = get_num_tables_per_multi_table<num_bits>();

    fixed_base_scalar_mul_tables result;
    result.reserve(NUM_TABLES);

    std::vector<uint8_t> input_buf;
    serialize::write(input_buf, input);
    const auto offset_generators = grumpkin::g1::derive_generators_secure(input_buf, MAX_TABLE_SIZE);

    grumpkin::g1::element accumulator = input;
    for (size_t i = 0; i < NUM_TABLES; ++i) {
        result.emplace_back(generate_single_lookup_table(accumulator, offset_generators[i]));
        for (size_t j = 0; j < BITS_PER_TABLE; ++j) {
            accumulator = accumulator.dbl();
        }
    }
    return result;
}

template <size_t num_table_bits>
grumpkin::g1::affine_element table::generate_generator_offset(const grumpkin::g1::affine_element& input)
{
    constexpr size_t NUM_TABLES = get_num_tables_per_multi_table<num_table_bits>();

    std::vector<uint8_t> input_buf;
    serialize::write(input_buf, input);
    const auto offset_generators = grumpkin::g1::derive_generators_secure(input_buf, NUM_TABLES);
    grumpkin::g1::element acc = grumpkin::g1::point_at_infinity;
    for (const auto& gen : offset_generators) {
        acc += gen;
    }
    return acc;
}
bool table::lookup_table_exists_for_point(const grumpkin::g1::affine_element& input)
{
    return (input == crypto::pedersen_hash::generator_info::get_lhs_generator() ||
            input == crypto::pedersen_hash::generator_info::get_rhs_generator());
}

std::optional<std::array<MultiTableId, 2>> table::get_lookup_table_ids_for_point(
    const grumpkin::g1::affine_element& input)
{
    if (input == crypto::pedersen_hash::generator_info::get_lhs_generator()) {
        return { { FIXED_BASE_LEFT_LO, FIXED_BASE_LEFT_HI } };
    }
    if (input == crypto::pedersen_hash::generator_info::get_lhs_generator()) {
        return { { FIXED_BASE_RIGHT_LO, FIXED_BASE_RIGHT_HI } };
    }
    return {};
}

std::optional<grumpkin::g1::affine_element> table::get_generator_offset_for_table_id(const MultiTableId table_id)
{
    if (table_id == FIXED_BASE_LEFT_LO) {
        return fixed_base_table_offset_generators[0];
    }
    if (table_id == FIXED_BASE_LEFT_HI) {
        return fixed_base_table_offset_generators[1];
    }
    if (table_id == FIXED_BASE_RIGHT_LO) {
        return fixed_base_table_offset_generators[2];
    }
    if (table_id == FIXED_BASE_RIGHT_HI) {
        return fixed_base_table_offset_generators[3];
    }
    return {};
}
template <size_t multitable_index>
BasicTable table::generate_basic_fixed_base_table(BasicTableId id, size_t basic_table_index, size_t table_index)
{
    static_assert(multitable_index < NUM_FIXED_BASE_MULTI_TABLES);
    ASSERT(table_index < MAX_NUM_TABLES_IN_MULTITABLE);

    const size_t multitable_bits = get_num_bits_of_multi_table(multitable_index);
    const size_t bits_covered_by_previous_tables_in_multitable = BITS_PER_TABLE * table_index;
    const bool is_small_table = (multitable_bits - bits_covered_by_previous_tables_in_multitable) < BITS_PER_TABLE;
    const size_t table_bits =
        is_small_table ? multitable_bits - bits_covered_by_previous_tables_in_multitable : BITS_PER_TABLE;
    const size_t table_size = 1ULL << table_bits;
    BasicTable table;
    table.id = id;
    table.table_index = basic_table_index;
    table.size = table_size;
    table.use_twin_keys = false;

    const auto& basic_table = fixed_base_tables[multitable_index][table_index];

    for (size_t i = 0; i < table.size; ++i) {
        table.column_1.emplace_back(i);
        table.column_2.emplace_back(basic_table[i].x);
        table.column_3.emplace_back(basic_table[i].y);
    }
    table.get_values_from_key = nullptr;

    // this needs to be a compile-time loop so we can convert `table_index, multitable_index` into a template parameter.
    // prevents us having to make `table_index` a template parameter of this method, which simplifies upstream code
    barretenberg::constexpr_for<0, MAX_NUM_TABLES_IN_MULTITABLE, 1>([&]<size_t i>() {
        if (i == table_index) {
            table.get_values_from_key = &get_basic_fixed_base_table_values<multitable_index, i>;
        }
    });
    ASSERT(table.get_values_from_key != nullptr);
    table.column_1_step_size = table.size;
    table.column_2_step_size = 0;
    table.column_3_step_size = 0;

    return table;
}

template <size_t multitable_index, size_t num_bits> MultiTable table::get_fixed_base_table(const MultiTableId id)
{
    constexpr size_t NUM_TABLES = get_num_tables_per_multi_table<num_bits>();

    MultiTable table(MAX_TABLE_SIZE, 0, 0, NUM_TABLES);

    table.id = id;
    table.get_table_values.resize(NUM_TABLES);
    table.lookup_ids.resize(NUM_TABLES);

    barretenberg::constexpr_for<0, NUM_TABLES, 1>([&]<size_t i>() {
        table.slice_sizes.emplace_back(MAX_TABLE_SIZE);
        table.get_table_values[i] = &get_basic_fixed_base_table_values<multitable_index, i>;
        size_t idx = i;
        if constexpr (multitable_index == 0) {
            idx += static_cast<size_t>(FIXED_BASE_0_0);
        } else if constexpr (multitable_index == 1) {
            idx += static_cast<size_t>(FIXED_BASE_1_0);
        } else if constexpr (multitable_index == 2) {
            idx += static_cast<size_t>(FIXED_BASE_2_0);
        } else if constexpr (multitable_index == 3) {
            idx += static_cast<size_t>(FIXED_BASE_3_0);
        }
        static_assert(multitable_index < NUM_FIXED_BASE_MULTI_TABLES);
        table.lookup_ids[i] = static_cast<plookup::BasicTableId>(idx);
    });
    return table;
}

template grumpkin::g1::affine_element table::generate_generator_offset<table::BITS_PER_LO_SCALAR>(
    const grumpkin::g1::affine_element& input);
template grumpkin::g1::affine_element table::generate_generator_offset<table::BITS_PER_HI_SCALAR>(
    const grumpkin::g1::affine_element& input);
template table::fixed_base_scalar_mul_tables table::generate_tables<table::BITS_PER_LO_SCALAR>(
    const table::affine_element& input);
template table::fixed_base_scalar_mul_tables table::generate_tables<table::BITS_PER_HI_SCALAR>(
    const table::affine_element& input);

template BasicTable table::generate_basic_fixed_base_table<0>(BasicTableId, size_t, size_t);
template BasicTable table::generate_basic_fixed_base_table<1>(BasicTableId, size_t, size_t);
template BasicTable table::generate_basic_fixed_base_table<2>(BasicTableId, size_t, size_t);
template BasicTable table::generate_basic_fixed_base_table<3>(BasicTableId, size_t, size_t);
template MultiTable table::get_fixed_base_table<0, table::BITS_PER_LO_SCALAR>(MultiTableId);
template MultiTable table::get_fixed_base_table<1, table::BITS_PER_HI_SCALAR>(MultiTableId);
template MultiTable table::get_fixed_base_table<2, table::BITS_PER_LO_SCALAR>(MultiTableId);
template MultiTable table::get_fixed_base_table<3, table::BITS_PER_HI_SCALAR>(MultiTableId);

} // namespace plookup::fixed_base