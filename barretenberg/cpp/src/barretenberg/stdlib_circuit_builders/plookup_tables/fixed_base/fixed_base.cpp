// === AUDIT STATUS ===
// internal:    { status: not started, auditors: [], date: YYYY-MM-DD }
// external_1:  { status: not started, auditors: [], date: YYYY-MM-DD }
// external_2:  { status: not started, auditors: [], date: YYYY-MM-DD }
// =====================

#include "./fixed_base.hpp"

#include "barretenberg/common/assert.hpp"
#include "barretenberg/common/constexpr_utils.hpp"
#include "barretenberg/common/throw_or_abort.hpp"
#include "barretenberg/crypto/pedersen_hash/pedersen.hpp"
#include "barretenberg/numeric/bitop/pow.hpp"
namespace bb::plookup::fixed_base {

/**
 * @brief Given a base_point [P] and an offset_generator [G], compute a lookup table of MAX_TABLE_SIZE that contains the
 * terms: { [G] + 0.[P] , [G] + 1.[P], ..., [G] + (MAX_TABLE_SIZE - 1).[P] }
 *
 * @param base_point
 * @param offset_generator
 * @return table::single_lookup_table
 */
table::single_lookup_table table::generate_single_lookup_table(const affine_element& base_point,
                                                               const affine_element& offset_generator)
{

    // Construct the table in projective coordinates, then batch normalize
    std::vector<element> table_raw(MAX_TABLE_SIZE);
    element accumulator = offset_generator;
    for (element& raw_entry : table_raw) {
        raw_entry = accumulator;
        accumulator += base_point;
    }
    element::batch_normalize(&table_raw[0], MAX_TABLE_SIZE);

    // Construct the final table in affine coordinates
    single_lookup_table table;
    table.reserve(MAX_TABLE_SIZE);
    for (const element& raw_entry : table_raw) {
        table.emplace_back(raw_entry.x, raw_entry.y);
    }
    return table;
}

/**
 * @brief For a given base point [P], compute the set of basic tables required to traverse a `num_bits` sized lookup
 * @details Generates NUM_TABLES-many basic tables, one for each of the points:
 *          { [P] * 2^(BITS_PER_TABLE * i) : i = 0, 1, ..., NUM_TABLES - 1 }
 *
 * @tparam num_bits
 * @param input
 * @return table::fixed_base_scalar_mul_tables
 */
template <size_t num_bits> table::fixed_base_scalar_mul_tables table::generate_tables(const affine_element& input)
{
    constexpr size_t NUM_TABLES = numeric::ceil_div(num_bits, BITS_PER_TABLE);

    fixed_base_scalar_mul_tables tables;
    tables.reserve(NUM_TABLES);

    std::vector<uint8_t> input_buf;
    write(input_buf, input);
    const auto offset_generators = grumpkin::g1::derive_generators(input_buf, NUM_TABLES);

    grumpkin::g1::element accumulator = input;
    for (size_t i = 0; i < NUM_TABLES; ++i) {
        tables.push_back(generate_single_lookup_table(accumulator, offset_generators[i]));
        for (size_t j = 0; j < BITS_PER_TABLE; ++j) {
            accumulator = accumulator.dbl();
        }
    }
    return tables;
}

/**
 * @brief For a fixed-base lookup of size `num_table_bits` and an input base point `input`, return the total
 * contribution from the offset generators in the scalar multiplication output.
 * @details Each lookup table i contains entries of the form: G_i + j*[2^(iw)*P] for j in [0, 2^w) where G_i is a unique
 * offset generator that prevents point-at-infinity edge cases. The scalar multiplication result k*P is computed as:
 *          k*P = sum_i(table_lookup(k_i)) - sum_i(G_i)
 * This method returns the correction term sum_i(G_i) that must be subtracted.
 *
 * @note We need the base point as an input parameter because we derive the offset generators using our hash-to-curve
 * algorithm, where the base point is used as the domain separator. This ensures generator points cannot collide with
 * base points without solving the discrete logarithm problem.
 * @tparam num_table_bits The total number of bits in the scalar multiplication
 * @param input The base point being multiplied
 * @return grumpkin::g1::affine_element The sum of all offset generators: sum_i(G_i)
 */
template <size_t num_table_bits>
grumpkin::g1::affine_element table::compute_generator_offset(const grumpkin::g1::affine_element& input)
{
    constexpr size_t NUM_TABLES = numeric::ceil_div(num_table_bits, BITS_PER_TABLE);

    // Serialize the base point to use as domain separator for generator derivation
    std::vector<uint8_t> input_buf;
    write(input_buf, input);

    // Derive NUM_TABLES unique offset generators deterministically from the base point
    const auto offset_generators = grumpkin::g1::derive_generators(input_buf, NUM_TABLES);

    // Sum all offset generators
    grumpkin::g1::element total_offset = grumpkin::g1::point_at_infinity;
    for (const auto& generator : offset_generators) {
        total_offset += generator;
    }

    return total_offset;
}

/**
 * @brief Returns true iff provided point is one of the two for which we have a precomputed lookup table
 *
 * @param input
 * @return true
 * @return false
 */
bool table::lookup_table_exists_for_point(const affine_element& input)
{
    return (input == lhs_generator_point() || input == rhs_generator_point());
}

/**
 * @brief Given a point that is one of the two for which we have a precomputed lookup table, return the IDs
 * corresponding to the LO_SCALAR, HI_SCALAR MultiTables used to compute a fixed-base scalar mul with this point.
 *
 * @param input
 * @return std::array<MultiTableId, 2>
 */
std::array<MultiTableId, 2> table::get_lookup_table_ids_for_point(const grumpkin::g1::affine_element& input)
{
    BB_ASSERT_EQ(lookup_table_exists_for_point(input), true, "No fixed-base table exists for input point");
    if (input == lhs_generator_point()) {
        return { { FIXED_BASE_LEFT_LO, FIXED_BASE_LEFT_HI } };
    }
    if (input == rhs_generator_point()) {
        return { { FIXED_BASE_RIGHT_LO, FIXED_BASE_RIGHT_HI } };
    }
    return {};
}

/**
 * @brief Given a table id, return the offset generator term that will be present in the final scalar mul output.
 *
 * @param table_id
 * @return affine_element
 */
grumpkin::g1::affine_element table::get_generator_offset_for_table_id(const MultiTableId table_id)
{
    BB_ASSERT_EQ(table_id == FIXED_BASE_LEFT_LO || table_id == FIXED_BASE_LEFT_HI || table_id == FIXED_BASE_RIGHT_LO ||
                     table_id == FIXED_BASE_RIGHT_HI,
                 true);
    if (table_id == FIXED_BASE_LEFT_LO) {
        return fixed_base_table_offset_generators()[0];
    }
    if (table_id == FIXED_BASE_LEFT_HI) {
        return fixed_base_table_offset_generators()[1];
    }
    if (table_id == FIXED_BASE_RIGHT_LO) {
        return fixed_base_table_offset_generators()[2];
    }
    if (table_id == FIXED_BASE_RIGHT_HI) {
        return fixed_base_table_offset_generators()[3];
    }
    return {};
}

using function_ptr = std::array<bb::fr, 2> (*)(const std::array<uint64_t, 2>);
using function_ptr_table =
    std::array<std::array<function_ptr, table::MAX_NUM_TABLES_IN_MULTITABLE>, table::NUM_FIXED_BASE_MULTI_TABLES>;
/**
 * @brief create a compile-time static 2D array of all our required `get_basic_fixed_base_table_values` function
 * pointers, so that we can specify the function pointer required for this method call using runtime variables
 * `multitable_index`, `table_index`. (downstream code becomes a lot simpler if `table_index` is not compile time,
 * particularly the init code in `plookup_tables.cpp`)
 * @return constexpr function_ptr_table
 */
constexpr function_ptr_table make_function_pointer_table()
{
    function_ptr_table table;
    bb::constexpr_for<0, table::NUM_FIXED_BASE_MULTI_TABLES, 1>([&]<size_t i>() {
        bb::constexpr_for<0, table::MAX_NUM_TABLES_IN_MULTITABLE, 1>(
            [&]<size_t j>() { table[i][j] = &table::get_basic_fixed_base_table_values<i, j>; });
    });
    return table;
};

/**
 * @brief Generate a single fixed-base-scalar-mul plookup table
 * @details Creates a BasicTable for a specific bit-slice of the scalar multiplication. Each table covers w =
 * BITS_PER_TABLE bits of the scalar at position table_index*w. The table stores precomputed points: (index, x-coord,
 * y-coord) for index in [0, 2^w). For the last table in a multitable, the size may be smaller if remaining bits < w.
 *
 * @tparam multitable_index Which of our 4 multitables (LEFT_LO/HI, RIGHT_LO/HI) this table belongs to
 * @param id The unique and fixed BasicTableId for this table
 * @param basic_table_index The circuit table index (e.g. idx = i means this is the i'th table used in the circuit)
 * @param table_index The bit-slice position (0 = least significant slice) (0 <= table_index < NUM_TABLES_IN_MULTITABLE)
 * @return BasicTable containing the precomputed points and lookup function
 */
template <size_t multitable_index>
BasicTable table::generate_basic_fixed_base_table(BasicTableId id, size_t basic_table_index, size_t table_index)
{
    static_assert(multitable_index < NUM_FIXED_BASE_MULTI_TABLES);
    BB_ASSERT_LT(table_index, MAX_NUM_TABLES_IN_MULTITABLE);

    const size_t multitable_bits = get_num_bits_of_multi_table<multitable_index>();
    const size_t bits_covered_by_previous_tables_in_multitable = BITS_PER_TABLE * table_index;
    const bool is_small_table = (multitable_bits - bits_covered_by_previous_tables_in_multitable) < BITS_PER_TABLE;
    const size_t table_bits =
        is_small_table ? multitable_bits - bits_covered_by_previous_tables_in_multitable : BITS_PER_TABLE;
    const auto table_size = static_cast<size_t>(1ULL << table_bits);

    BasicTable table{ .id = id, .table_index = basic_table_index, .use_twin_keys = false };

    const auto& basic_table = fixed_base_tables()[multitable_index][table_index];

    for (size_t i = 0; i < table_size; ++i) {
        table.column_1.emplace_back(i);
        table.column_2.emplace_back(basic_table[i].x);
        table.column_3.emplace_back(basic_table[i].y);
    }

    constexpr function_ptr_table get_values_from_key_table = make_function_pointer_table();
    table.get_values_from_key = get_values_from_key_table[multitable_index][table_index];
    ASSERT(table.get_values_from_key != nullptr);

    table.column_1_step_size = table_size;
    table.column_2_step_size = COLUMN_2_STEP_SIZE;
    table.column_3_step_size = COLUMN_3_STEP_SIZE;

    return table;
}

/**
 * @brief Generate a multi-table that describes the lookups required to cover a fixed-base-scalar-mul of `num_bits`
 * @details Creates a MultiTable that manages multiple BasicTables to perform scalar multiplication. The scalar is split
 * into ceil(num_bits/BITS_PER_TABLE) slices, each handled by a BasicTable. This function sets up the metadata and
 * function pointers for combining the basic table lookups.
 *
 * @tparam multitable_index Which of our 4 multitables (0=LEFT_LO, 1=LEFT_HI, 2=RIGHT_LO, 3=RIGHT_HI)
 * @tparam num_bits Total bits in the scalar (either BITS_PER_LO_SCALAR=128 or BITS_PER_HI_SCALAR=126)
 * @param id The MultiTableId identifying this multi-table
 * @return MultiTable containing metadata for combining basic table outputs
 */
template <size_t multitable_index, size_t num_bits> MultiTable table::get_fixed_base_table(const MultiTableId id)
{
    static_assert(num_bits == BITS_PER_LO_SCALAR || num_bits == BITS_PER_HI_SCALAR);
    constexpr size_t NUM_TABLES = numeric::ceil_div(num_bits, BITS_PER_TABLE);
    constexpr std::array<BasicTableId, NUM_FIXED_BASE_MULTI_TABLES> basic_table_ids{
        FIXED_BASE_0_0,
        FIXED_BASE_1_0,
        FIXED_BASE_2_0,
        FIXED_BASE_3_0,
    };
    constexpr function_ptr_table get_values_from_key_table = make_function_pointer_table();

    // For fixed base scalar mul lookup tables, the special "accumulator" structure of our lookup tables (see add ref
    // bb::plookup::get_lookup_accumulators()) is used for the scalar (first column), but not for the (x,y) coordinates
    // (columns 2 & 3). Each table entry contains a distinct point, not an accumulated point. This is so that we can use
    // custom ECC addition gates to perform the accumulation efficiently, e.g. in
    // cycle_group::_fixed_base_batch_mul_internal.
    //
    // To achieve this, we set the step sizes of each column as follows:
    // - Column 1 coefficient: MAX_TABLE_SIZE (512) - creates accumulator structure for scalar slices
    // - Column 2 coefficient: 0 - results in NO accumulation for x-coordinates
    // - Column 3 coefficient: 0 - results in NO accumulation for y-coordinates
    MultiTable table(MAX_TABLE_SIZE, COLUMN_2_STEP_SIZE, COLUMN_3_STEP_SIZE, NUM_TABLES);
    table.id = id;
    table.get_table_values.resize(NUM_TABLES);
    table.basic_table_ids.resize(NUM_TABLES);
    for (size_t i = 0; i < NUM_TABLES; ++i) {
        table.slice_sizes.emplace_back(MAX_TABLE_SIZE);
        table.get_table_values[i] = get_values_from_key_table[multitable_index][i];
        static_assert(multitable_index < NUM_FIXED_BASE_MULTI_TABLES);
        size_t idx = i + static_cast<size_t>(basic_table_ids[multitable_index]);
        table.basic_table_ids[i] = static_cast<plookup::BasicTableId>(idx);
    }
    return table;
}

template grumpkin::g1::affine_element table::compute_generator_offset<table::BITS_PER_LO_SCALAR>(
    const grumpkin::g1::affine_element& input);
template grumpkin::g1::affine_element table::compute_generator_offset<table::BITS_PER_HI_SCALAR>(
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

/**
 * @note: Without putting these computed lookup tables behind statics there is a timing issue
 * when compiling for the WASM target.
 * hypothesis: because it's 32-bit it has different static init order and this helps?
 */
const table::all_multi_tables& table::fixed_base_tables()
{
    static const table::all_multi_tables tables = {
        table::generate_tables<BITS_PER_LO_SCALAR>(lhs_base_point_lo()),
        table::generate_tables<BITS_PER_HI_SCALAR>(lhs_base_point_hi()),
        table::generate_tables<BITS_PER_LO_SCALAR>(rhs_base_point_lo()),
        table::generate_tables<BITS_PER_HI_SCALAR>(rhs_base_point_hi()),
    };
    return tables;
}

/**
 * @note: Without putting these computed lookup tables behind statics there is a timing issue
 * when compiling for the WASM target.
 * hypothesis: because it's 32-bit it has different static init order and this helps?
 */
const std::array<table::affine_element, table::NUM_FIXED_BASE_MULTI_TABLES>& table::fixed_base_table_offset_generators()
{
    static const std::array<table::affine_element, table::NUM_FIXED_BASE_MULTI_TABLES> tables = {
        table::compute_generator_offset<BITS_PER_LO_SCALAR>(lhs_base_point_lo()),
        table::compute_generator_offset<BITS_PER_HI_SCALAR>(lhs_base_point_hi()),
        table::compute_generator_offset<BITS_PER_LO_SCALAR>(rhs_base_point_lo()),
        table::compute_generator_offset<BITS_PER_HI_SCALAR>(rhs_base_point_hi()),
    };
    return tables;
}

} // namespace bb::plookup::fixed_base
