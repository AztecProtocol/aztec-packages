#pragma once

#include "./types.hpp"

#include "barretenberg/common/constexpr_utils.hpp"
#include "barretenberg/crypto/pedersen_hash/pedersen.hpp"
#include "barretenberg/ecc/curves/grumpkin/grumpkin.hpp"
#include "barretenberg/numeric/bitop/pow.hpp"
#include "barretenberg/numeric/bitop/rotate.hpp"
#include "barretenberg/numeric/bitop/sparse_form.hpp"

namespace plookup::new_pedersen {

class table {
  public:
    // static constexpr size_t BITS_PER_HASH = 512;
    static constexpr size_t BITS_PER_TABLE = 9;
    // static constexpr size_t BITS_OF_BETA = 192;
    static constexpr size_t BITS_ON_CURVE = 254;
    static constexpr size_t BITS_PER_LAST_TABLE = 2;
    static constexpr size_t PEDERSEN_TABLE_SIZE = (1UL) << BITS_PER_TABLE;
    static constexpr size_t PEDERSEN_SMALL_TABLE_SIZE = (1UL) << BITS_PER_LAST_TABLE;
    static constexpr size_t NUM_PEDERSEN_TABLES =
        (BITS_ON_CURVE / BITS_PER_TABLE) + (BITS_ON_CURVE % BITS_PER_TABLE == 0 ? 0 : 1);
    static constexpr size_t NUM_PEDERSEN_POINTS = 2;
    static constexpr size_t NUM_PEDERSEN_MULTI_TABLES = 4;
    using affine_element = grumpkin::g1::affine_element;
    using element = grumpkin::g1::element;

    using single_lookup_table = std::vector<grumpkin::g1::affine_element>;
    using fixed_base_scalar_mul_tables = std::vector<single_lookup_table>;
    using all_multi_tables = std::array<fixed_base_scalar_mul_tables, NUM_PEDERSEN_MULTI_TABLES>;

    static single_lookup_table generate_single_lookup_table(const affine_element& base_point,
                                                            const affine_element& offset_generator)
    {
        std::vector<element> table_raw(PEDERSEN_TABLE_SIZE);

        element accumulator = offset_generator;
        for (size_t i = 0; i < PEDERSEN_TABLE_SIZE; ++i) {
            table_raw[i] = accumulator;
            accumulator += base_point;
        }
        element::batch_normalize(&table_raw[0], PEDERSEN_TABLE_SIZE);
        single_lookup_table table(PEDERSEN_TABLE_SIZE);
        for (size_t i = 0; i < table_raw.size(); ++i) {
            if (i < 16) {
                std::cout << "IUWAHRGIAWERUGH " << table_raw[i].x << std::endl;
            }
            table[i] = affine_element{ table_raw[i].x, table_raw[i].y };
        }
        return table;
    }

    template <size_t num_bits>
    static fixed_base_scalar_mul_tables generate_tables(const grumpkin::g1::affine_element& input)
    {
        constexpr size_t NUM_TABLES = (num_bits / BITS_PER_TABLE) + ((num_bits % BITS_PER_TABLE) ? 1 : 0);

        fixed_base_scalar_mul_tables result;
        result.resize(NUM_TABLES);

        std::vector<uint8_t> input_buf;
        serialize::write(input_buf, input);
        const auto offset_generators = grumpkin::g1::derive_generators_secure(input_buf, PEDERSEN_TABLE_SIZE);

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
    static grumpkin::g1::affine_element generate_generator_offset(const grumpkin::g1::affine_element& input)
    {
        constexpr size_t NUM_TABLES = (num_table_bits / BITS_PER_TABLE) + ((num_table_bits % BITS_PER_TABLE) ? 1 : 0);

        std::vector<uint8_t> input_buf;
        serialize::write(input_buf, input);
        const auto offset_generators = grumpkin::g1::derive_generators_secure(input_buf, NUM_TABLES);
        grumpkin::g1::element acc = grumpkin::g1::point_at_infinity;
        for (const auto& gen : offset_generators) {
            acc += gen;
        }
        return acc;
    }

    inline static const all_multi_tables pedersen_tables = {
        table::generate_tables<128>(crypto::pedersen_hash::generator_info::get_lhs_generator()),
        table::generate_tables<126>(grumpkin::g1::element(crypto::pedersen_hash::generator_info::get_lhs_generator()) *
                                    (uint256_t(1) << 128)),
        table::generate_tables<128>(crypto::pedersen_hash::generator_info::get_rhs_generator()),
        table::generate_tables<126>(grumpkin::g1::element(crypto::pedersen_hash::generator_info::get_rhs_generator()) *
                                    (uint256_t(1) << 128)),
    };

    inline static const std::array<grumpkin::g1::affine_element, table::NUM_PEDERSEN_MULTI_TABLES>
        pedersen_table_offset_generators = {
            table::generate_generator_offset<128>(crypto::pedersen_hash::generator_info::get_lhs_generator()),
            table::generate_generator_offset<126>(
                grumpkin::g1::element(crypto::pedersen_hash::generator_info::get_lhs_generator()) *
                (uint256_t(1) << 128)),
            table::generate_generator_offset<128>(crypto::pedersen_hash::generator_info::get_rhs_generator()),
            table::generate_generator_offset<126>(
                grumpkin::g1::element(crypto::pedersen_hash::generator_info::get_rhs_generator()) *
                (uint256_t(1) << 128)),
        };
    template <size_t multitable_index, size_t table_index>
    inline static std::array<barretenberg::fr, 2> get_basic_pedersen_table_values(const std::array<uint64_t, 2> key)
    {
        static_assert(multitable_index < NUM_PEDERSEN_MULTI_TABLES);
        static_assert(table_index < NUM_PEDERSEN_TABLES);
        const auto& basic_table = pedersen_tables[multitable_index][table_index];

        //   const auto& basic_table = pedersen_tables[generator_index][table_index];
        const auto index = static_cast<size_t>(key[0]);
        std::cout << "get basic table values. index = " << index << " x = " << basic_table[index].x << std::endl;
        return { basic_table[index].x, basic_table[index].y };
    }

    template <size_t multitable_index, size_t table_bits = BITS_PER_TABLE>
    static inline BasicTable generate_basic_pedersen_table(BasicTableId id,
                                                           size_t basic_table_index,
                                                           size_t table_index)
    {
        ASSERT(multitable_index < NUM_PEDERSEN_MULTI_TABLES);
        ASSERT(table_index < NUM_PEDERSEN_TABLES);

        BasicTable table;
        table.id = id;
        table.table_index = basic_table_index;
        table.size = PEDERSEN_TABLE_SIZE;
        table.use_twin_keys = false;

        const auto& basic_table = pedersen_tables[multitable_index][table_index];
        // table::generate_tables<BITS_PER_TABLE>(
        //     crypto::pedersen_hash::generator_info::get_lhs_generator())[table_index];

        //    const auto& basic_table = pedersen_tables[generator_index][table_index];

        for (size_t i = 0; i < table.size; ++i) {
            table.column_1.emplace_back(i);
            table.column_2.emplace_back(basic_table[i].x);
            table.column_3.emplace_back(basic_table[i].y);
        }
        table.get_values_from_key = nullptr;
        barretenberg::constexpr_for<0, NUM_PEDERSEN_TABLES, 1>([&]<size_t i>() {
            if (i == table_index) {
                table.get_values_from_key = &get_basic_pedersen_table_values<multitable_index, i>;
            }
        });
        ASSERT(table.get_values_from_key != nullptr);
        table.column_1_step_size = table.size;
        table.column_2_step_size = 0;
        table.column_3_step_size = 0;

        return table;
    }

    template <size_t multitable_index, size_t num_bits>
    static inline MultiTable get_pedersen_table(const MultiTableId id = NEW_PEDERSEN_LEFT_LO)
    {
        constexpr size_t NUM_TABLES = (num_bits / BITS_PER_TABLE) + ((num_bits % BITS_PER_TABLE) ? 1 : 0);

        std::cout << "get pedersen table mtidx = " << multitable_index << " num bits " << num_bits << std::endl;

        // todo. split explicitly into 126 / 128 bit chunks.
        // Construct 126 bit chunk out of 14 9-bit tables
        // Construct 128 bit chunk out of 12 9-bit tables and 2 10-bit tables
        MultiTable table(PEDERSEN_TABLE_SIZE, 0, 0, NUM_TABLES);

        std::cout << "q0" << std::endl;
        std::cout << "NUM TABLES = " << NUM_TABLES << std::endl;
        table.id = id;
        for (size_t i = 0; i < NUM_TABLES; ++i) {
            std::cout << "beep" << std::endl;
            table.slice_sizes.emplace_back(PEDERSEN_TABLE_SIZE);
        }
        std::cout << "q1" << std::endl;

        table.get_table_values.resize(NUM_TABLES);
        table.lookup_ids.resize(NUM_TABLES);

        std::cout << "q2" << std::endl;

        barretenberg::constexpr_for<0, NUM_TABLES, 1>([&]<size_t i>() {
            table.get_table_values[i] = &get_basic_pedersen_table_values<multitable_index, i>;
            size_t idx = i;
            if (multitable_index == 0) {
                idx += static_cast<size_t>(PEDERSEN_0_0);
            } else if (multitable_index == 1) {
                idx += static_cast<size_t>(PEDERSEN_1_0);
            } else if (multitable_index == 2) {
                idx += static_cast<size_t>(PEDERSEN_2_0);
            } else {
                idx += static_cast<size_t>(PEDERSEN_3_0);
            }
            std::cout << "q3" << std::endl;
            table.lookup_ids[i] = static_cast<plookup::BasicTableId>(idx);
            std::cout << "q4" << std::endl;
        });
        std::cout << "q5" << std::endl;
        std::cout << "RETURNING TABLE W. SLICE SIZES SIZE = " << table.slice_sizes.size() << std::endl;
        return table;
    }

    static bool lookup_table_exists_for_point(const grumpkin::g1::affine_element& input);
    static std::optional<std::array<MultiTableId, 2>> get_lookup_table_ids_for_point(
        const grumpkin::g1::affine_element& input);

    static std::optional<grumpkin::g1::affine_element> get_generator_offset_for_table_id(MultiTableId table_id);
};

} // namespace plookup::new_pedersen