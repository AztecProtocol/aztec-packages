// === AUDIT STATUS ===
// internal:    { status: Complete, auditors: [Luke], commit: dd03c4a23ab067274b4964cacb36d1545f73fb14}
// external_1:  { status: not started, auditors: [], commit: }
// external_2:  { status: not started, auditors: [], commit: }
// =====================

#pragma once
#include "barretenberg/stdlib_circuit_builders/plookup_tables/plookup_tables.hpp"
#include <array>

#include "barretenberg/numeric/bitop/sparse_form.hpp"
#include "barretenberg/stdlib/hash/hash_utils.hpp"
#include "barretenberg/stdlib/primitives/circuit_builders/circuit_builders_fwd.hpp"

#include "../../primitives/field/field.hpp"

namespace bb::stdlib {

template <typename Builder> class SHA256 {

    using field_ct = field_t<Builder>;

    static constexpr fr base{ 16 };

    /**
     * @brief Multipliers for computing σ₀ during message schedule extension
     *
     * σ₀(x) = (x >>> 7) ⊕ (x >>> 18) ⊕ (x >> 3)
     *
     * These multipliers handle rotations that keep the limb within the 32-bit word boundary.
     * Rotations that split a limb across the wrap boundary (i.e., rot7 for limb 1) cannot be
     * represented as a simple scalar and are instead handled via rotated_limb_corrections from the lookup table.
     *
     * limb 0) bits [0..2]; pos_0 = 0
     *   - rotation by 7: 16^(-7 + pos_0 mod 32) = 16^(32 - 7 + 0)
     *   - rotation by 18: 16^(-18 + pos_0 mod 32) = 16^(32 - 18 + 0)
     *   - shift by 3: no contribution (all 3 bits shifted out)
     * limb 1) bits [3..9]; pos_1 = 3
     *   - rotation by 7: not representable as scalar; accounted for in rotated_limb_corrections[1]
     *   - rotation by 18: 16^(-18 + pos_1 mod 32) = 16^(32 - 18 + 3)
     *   - shift by 3: 16^(pos_1 - 3) = 16^0 = 1
     * limb 2) bits [10..17]; pos_2 = 10
     *   - rotation by 7: 16^(-7 + pos_2) = 16^(10 - 7)
     *   - rotation by 18: 16^(-18 + pos_2 mod 32) = 16^(32 - 18 + 10)
     *   - shift by 3: 16^(pos_2 - 3) = 16^(10 - 3)
     * limb 3) bits [18..31]; pos_3 = 18
     *  - rotation by 7: 16^(-7 + pos_3) = 16^(18 - 7)
     *  - rotation by 18: 16^(-18 + pos_3) = 16^(18 - 18) = 1
     *  - shift by 3: 16^(pos_3 - 3) = 16^(18 - 3)
     */
    static constexpr std::array<fr, 4> left_multipliers{
        base.pow(32 - 7) + base.pow(32 - 18),                         // limb 0: rot7 + rot18
        base.pow(32 - 18 + 3) + fr(1),                                // limb 1: rot18 + shift3
        base.pow(10 - 7) + base.pow(32 - 18 + 10) + base.pow(10 - 3), // limb 2: rot7 + rot18 + shift3
        base.pow(18 - 7) + fr(1) + base.pow(18 - 3),                  // limb 3: rot7 + rot18 + shift3
    };

    /**
     * @brief Multipliers for computing σ₁ during message schedule extension
     *
     * σ₁(x) = (x >>> 17) ⊕ (x >>> 19) ⊕ (x >> 10)
     *
     * These multipliers handle rotations that keep the limb within the 32-bit word boundary.
     * Rotations that split a limb across the wrap boundary (i.e., rot17 for limb 2, rot19 for limb 3)
     * cannot be represented as a simple scalar and are instead handled via rotated_limb_corrections from the lookup
     * table.
     *
     * limb 0) bits [0..2]; pos_0 = 0
     *   - rotation by 17: 16^(-17 + pos_0 mod 32) = 16^(32 - 17 + 0)
     *   - rotation by 19: 16^(-19 + pos_0 mod 32) = 16^(32 - 19 + 0)
     *   - shift by 10: no contribution (all 3 bits shifted out)
     * limb 1) bits [3..9]; pos_1 = 3
     *   - rotation by 17: 16^(-17 + pos_1 mod 32) = 16^(32 - 17 + 3)
     *   - rotation by 19: 16^(-19 + pos_1 mod 32) = 16^(32 - 19 + 3)
     *   - shift by 10: no contribution (all 7 bits shifted out)
     * limb 2) bits [10..17]; pos_2 = 10
     *   - rotation by 17: not representable as scalar; accounted for in rotated_limb_corrections[2]
     *   - rotation by 19: 16^(-19 + pos_2 mod 32) = 16^(32 - 19 + 10)
     *   - shift by 10: 16^(pos_2 - 10) = 16^0 = 1
     * limb 3) bits [18..31]; pos_3 = 18
     *   - rotation by 17: 16^(-17 + pos_3) = 16^(18 - 17)
     *   - rotation by 19: not representable as scalar; accounted for in rotated_limb_corrections[3]
     *   - shift by 10: 16^(pos_3 - 10) = 16^(18 - 10)
     */
    static constexpr std::array<fr, 4> right_multipliers{
        base.pow(32 - 17) + base.pow(32 - 19),         // limb 0: rot17 + rot19
        base.pow(32 - 17 + 3) + base.pow(32 - 19 + 3), // limb 1: rot17 + rot19
        base.pow(32 - 19 + 10) + fr(1),                // limb 2: rot19 + shift10
        base.pow(18 - 17) + base.pow(18 - 10),         // limb 3: rot17 + shift10
    };

    static constexpr std::array<uint64_t, 64> round_constants{
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
            : normal(in)
        {}
        sparse_witness_limbs(const sparse_witness_limbs& other) = default;
        sparse_witness_limbs(sparse_witness_limbs&& other) = default;
        sparse_witness_limbs& operator=(const sparse_witness_limbs& other) = default;
        sparse_witness_limbs& operator=(sparse_witness_limbs&& other) = default;
        ~sparse_witness_limbs() = default;

        field_ct normal;

        std::array<field_ct, 4> sparse_limbs;

        std::array<field_ct, 4> rotated_limb_corrections;

        bool has_sparse_limbs = false;
    };
    struct sparse_value {
        sparse_value(const field_ct& in = 0)
            : normal(in)
        {
            if (normal.is_constant()) {
                sparse = field_ct(in.get_context(),
                                  bb::fr(numeric::map_into_sparse_form<16>(uint256_t(in.get_value()).data[0])));
            }
        }

        sparse_value(const sparse_value& other) = default;
        sparse_value(sparse_value&& other) = default;
        sparse_value& operator=(const sparse_value& other) = default;
        sparse_value& operator=(sparse_value&& other) = default;
        ~sparse_value() = default;

        field_ct normal;
        field_ct sparse;
    };

    static sparse_witness_limbs convert_witness(const field_ct& input);

    static field_ct choose_with_sigma1(sparse_value& e, const sparse_value& f, const sparse_value& g);

    static field_ct majority_with_sigma0(sparse_value& a, const sparse_value& b, const sparse_value& c);
    static sparse_value map_into_choose_sparse_form(const field_ct& input);
    static sparse_value map_into_maj_sparse_form(const field_ct& input);

  public:
    static std::array<field_ct, 8> sha256_block(const std::array<field_ct, 8>& h_init,
                                                const std::array<field_ct, 16>& input);

    static std::array<field_ct, 64> extend_witness(const std::array<field_ct, 16>& w_in);
};
} // namespace bb::stdlib
