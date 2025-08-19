// === AUDIT STATUS ===
// internal:    { status: not started, auditors: [], date: YYYY-MM-DD }
// external_1:  { status: not started, auditors: [], date: YYYY-MM-DD }
// external_2:  { status: not started, auditors: [], date: YYYY-MM-DD }
// =====================

#pragma once
#include "barretenberg/stdlib/primitives/byte_array/byte_array.hpp"
#include "barretenberg/stdlib_circuit_builders/plookup_tables/plookup_tables.hpp"
#include <array>

#include "barretenberg/numeric/bitop/sparse_form.hpp"
#include "barretenberg/stdlib/primitives/circuit_builders/circuit_builders_fwd.hpp"

#include "../../primitives/field/field.hpp"

namespace bb::stdlib {

template <typename Builder> class SHA256 {

    using field_ct = field_t<Builder>;
    using byte_array_ct = byte_array<Builder>;
    struct sparse_ch_value {
        field_ct normal;
        field_ct sparse;
        field_ct rot6;
        field_ct rot11;
        field_ct rot25;
    };
    struct sparse_maj_value {
        field_ct normal;
        field_ct sparse;
        field_ct rot2;
        field_ct rot13;
        field_ct rot22;
    };

    static constexpr uint64_t init_constants[8]{ 0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a,
                                                 0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19 };

    static constexpr fr base{ 16 };

    static constexpr std::array<fr, 4> left_multipliers{
        (base.pow(32 - 7) + base.pow(32 - 18)),
        (base.pow(32 - 18 + 3) + 1),
        (base.pow(32 - 18 + 10) + base.pow(10 - 7) + base.pow(10 - 3)),
        (base.pow(18 - 7) + base.pow(18 - 3) + 1),
    };

    static constexpr std::array<fr, 4> right_multipliers{
        base.pow(32 - 17) + base.pow(32 - 19),
        base.pow(32 - 17 + 3) + base.pow(32 - 19 + 3),
        base.pow(32 - 19 + 10) + fr(1),
        base.pow(18 - 17) + base.pow(18 - 10),
    };

    static constexpr uint64_t round_constants[64]{
        0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
        0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
        0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
        0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
        0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
        0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
        0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
        0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2
    };
    struct sparse_witness_limbs {
        sparse_witness_limbs(const field_ct& in = 0)
        {
            normal = in;
            has_sparse_limbs = false;
        }
        sparse_witness_limbs(const sparse_witness_limbs& other) = default;
        sparse_witness_limbs(sparse_witness_limbs&& other) = default;

        sparse_witness_limbs& operator=(const sparse_witness_limbs& other) = default;
        sparse_witness_limbs& operator=(sparse_witness_limbs&& other) = default;

        field_ct normal;

        std::array<field_ct, 4> sparse_limbs;

        std::array<field_ct, 4> rotated_limbs;

        bool has_sparse_limbs = false;
    };
    struct sparse_value {
        sparse_value(const field_ct& in = 0)
        {
            normal = in;
            if (normal.witness_index == IS_CONSTANT) {
                sparse = field_ct(in.get_context(),
                                  bb::fr(numeric::map_into_sparse_form<16>(uint256_t(in.get_value()).data[0])));
            }
        }

        sparse_value(const sparse_value& other) = default;
        sparse_value(sparse_value&& other) = default;

        sparse_value& operator=(const sparse_value& other) = default;
        sparse_value& operator=(sparse_value&& other) = default;

        field_ct normal;
        field_ct sparse;
    };

    static void prepare_constants(std::array<field_ct, 8>& input);
    static sparse_witness_limbs convert_witness(const field_ct& w);

    static field_ct choose(sparse_value& e, const sparse_value& f, const sparse_value& g);

    static field_ct majority(sparse_value& a, const sparse_value& b, const sparse_value& c);
    static sparse_value map_into_choose_sparse_form(const field_ct& e);
    static sparse_value map_into_maj_sparse_form(const field_ct& e);

    static field_ct add_normalize(const field_ct& a, const field_ct& b);

  public:
    static std::array<field_ct, 8> sha256_block(const std::array<field_ct, 8>& h_init,
                                                const std::array<field_ct, 16>& input);

    static std::array<field_ct, 64> extend_witness(const std::array<field_ct, 16>& w_in);

    static byte_array<Builder> hash(const byte_array_ct& input);
};
} // namespace bb::stdlib
