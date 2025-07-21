// === AUDIT STATUS ===
// internal:    { status: not started, auditors: [], date: YYYY-MM-DD }
// external_1:  { status: not started, auditors: [], date: YYYY-MM-DD }
// external_2:  { status: not started, auditors: [], date: YYYY-MM-DD }
// =====================

#pragma once
#include "barretenberg/stdlib_circuit_builders/plookup_tables/plookup_tables.hpp"
#include <array>

#include "barretenberg/numeric/bitop/sparse_form.hpp"
#include "barretenberg/stdlib/primitives/circuit_builders/circuit_builders_fwd.hpp"

#include "../../primitives/field/field.hpp"
#include "../../primitives/packed_byte_array/packed_byte_array.hpp"

namespace bb::stdlib {

template <typename Builder> class SHA256 {
    struct sparse_ch_value {
        field_t<Builder> normal;
        field_t<Builder> sparse;
        field_t<Builder> rot6;
        field_t<Builder> rot11;
        field_t<Builder> rot25;
    };
    struct sparse_maj_value {
        field_t<Builder> normal;
        field_t<Builder> sparse;
        field_t<Builder> rot2;
        field_t<Builder> rot13;
        field_t<Builder> rot22;
    };

    struct sparse_witness_limbs {
        sparse_witness_limbs(const field_t<Builder>& in = 0)
        {
            normal = in;
            has_sparse_limbs = false;
        }
        sparse_witness_limbs(const sparse_witness_limbs& other) = default;
        sparse_witness_limbs(sparse_witness_limbs&& other) = default;

        sparse_witness_limbs& operator=(const sparse_witness_limbs& other) = default;
        sparse_witness_limbs& operator=(sparse_witness_limbs&& other) = default;

        field_t<Builder> normal;

        std::array<field_t<Builder>, 4> sparse_limbs;

        std::array<field_t<Builder>, 4> rotated_limbs;

        bool has_sparse_limbs = false;
    };
    struct sparse_value {
        sparse_value(const field_t<Builder>& in = 0)
        {
            normal = in;
            if (normal.witness_index == IS_CONSTANT) {
                sparse = field_t<Builder>(in.get_context(),
                                          bb::fr(numeric::map_into_sparse_form<16>(uint256_t(in.get_value()).data[0])));
            }
        }

        sparse_value(const sparse_value& other) = default;
        sparse_value(sparse_value&& other) = default;

        sparse_value& operator=(const sparse_value& other) = default;
        sparse_value& operator=(sparse_value&& other) = default;

        field_t<Builder> normal;
        field_t<Builder> sparse;
    };

    static void prepare_constants(std::array<field_t<Builder>, 8>& input);
    static sparse_witness_limbs convert_witness(const field_t<Builder>& w);

    static field_t<Builder> choose(sparse_value& e, const sparse_value& f, const sparse_value& g);

    static field_t<Builder> majority(sparse_value& a, const sparse_value& b, const sparse_value& c);
    static sparse_value map_into_choose_sparse_form(const field_t<Builder>& e);
    static sparse_value map_into_maj_sparse_form(const field_t<Builder>& e);

    static field_t<Builder> add_normalize(const field_t<Builder>& a, const field_t<Builder>& b);

  public:
    static std::array<field_t<Builder>, 8> sha256_block(const std::array<field_t<Builder>, 8>& h_init,
                                                        const std::array<field_t<Builder>, 16>& input);

    static std::array<field_t<Builder>, 64> extend_witness(const std::array<field_t<Builder>, 16>& w_in);

    static packed_byte_array<Builder> hash(const packed_byte_array<Builder>& input);
};
} // namespace bb::stdlib
