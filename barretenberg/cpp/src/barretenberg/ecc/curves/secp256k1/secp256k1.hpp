#pragma once

#include "../../fields/field.hpp"
#include "../../groups/group.hpp"
#include "../types.hpp"

// NOLINTBEGIN(cppcoreguidelines-avoid-c-arrays)

namespace bb::secp256k1 {
struct FqParams {
    static constexpr uint64_t modulus_0 = 0xFFFFFFFEFFFFFC2FULL;
    static constexpr uint64_t modulus_1 = 0xFFFFFFFFFFFFFFFFULL;
    static constexpr uint64_t modulus_2 = 0xFFFFFFFFFFFFFFFFULL;
    static constexpr uint64_t modulus_3 = 0xFFFFFFFFFFFFFFFFULL;

    static constexpr uint64_t r_squared_0 = 8392367050913ULL;
    static constexpr uint64_t r_squared_1 = 1;
    static constexpr uint64_t r_squared_2 = 0;
    static constexpr uint64_t r_squared_3 = 0;

    static constexpr uint64_t coset_generators_0[8]{
        0x300000b73ULL, 0x400000f44ULL, 0x500001315ULL, 0x6000016e6ULL,
        0x700001ab7ULL, 0x800001e88ULL, 0x900002259ULL, 0xa0000262aULL,
    };
    static constexpr uint64_t coset_generators_1[8]{
        0, 0, 0, 0, 0, 0, 0, 0,
    };
    static constexpr uint64_t coset_generators_2[8]{
        0, 0, 0, 0, 0, 0, 0, 0,
    };
    static constexpr uint64_t coset_generators_3[8]{
        0, 0, 0, 0, 0, 0, 0, 0,
    };

    static constexpr uint64_t r_inv = 15580212934572586289ULL;

    static constexpr uint64_t cube_root_0 = 0x58a4361c8e81894eULL;
    static constexpr uint64_t cube_root_1 = 0x03fde1631c4b80afULL;
    static constexpr uint64_t cube_root_2 = 0xf8e98978d02e3905ULL;
    static constexpr uint64_t cube_root_3 = 0x7a4a36aebcbb3d53ULL;

    static constexpr uint64_t primitive_root_0 = 0UL;
    static constexpr uint64_t primitive_root_1 = 0UL;
    static constexpr uint64_t primitive_root_2 = 0UL;
    static constexpr uint64_t primitive_root_3 = 0UL;
};
using fq = field<FqParams>;

struct FrParams {
    static constexpr uint64_t modulus_0 = 0xBFD25E8CD0364141ULL;
    static constexpr uint64_t modulus_1 = 0xBAAEDCE6AF48A03BULL;
    static constexpr uint64_t modulus_2 = 0xFFFFFFFFFFFFFFFEULL;
    static constexpr uint64_t modulus_3 = 0xFFFFFFFFFFFFFFFFULL;

    static constexpr uint64_t r_squared_0 = 9902555850136342848ULL;
    static constexpr uint64_t r_squared_1 = 8364476168144746616ULL;
    static constexpr uint64_t r_squared_2 = 16616019711348246470ULL;
    static constexpr uint64_t r_squared_3 = 11342065889886772165ULL;

    static constexpr uint64_t r_inv = 5408259542528602431ULL;

    static constexpr uint64_t coset_generators_0[8]{
        0x40e4273feef0b9bbULL, 0x8111c8b31eba787aULL, 0xc13f6a264e843739ULL, 0x16d0b997e4df5f8ULL,
        0x419aad0cae17b4b7ULL, 0x81c84e7fdde17376ULL, 0xc1f5eff30dab3235ULL, 0x22391663d74f0f4ULL,
    };
    static constexpr uint64_t coset_generators_1[8]{
        0x5a95af7e9394ded5ULL, 0x9fe6d297e44c3e99ULL, 0xe537f5b135039e5dULL, 0x2a8918ca85bafe22ULL,
        0x6fda3be3d6725de6ULL, 0xb52b5efd2729bdaaULL, 0xfa7c821677e11d6eULL, 0x3fcda52fc8987d33ULL,
    };
    static constexpr uint64_t coset_generators_2[8]{
        0x6ULL, 0x7ULL, 0x8ULL, 0xaULL, 0xbULL, 0xcULL, 0xdULL, 0xfULL,
    };
    static constexpr uint64_t coset_generators_3[8]{
        0, 0, 0, 0, 0, 0, 0, 0,
    };

    static constexpr uint64_t cube_root_0 = 0xf07deb3dc9926c9eULL;
    static constexpr uint64_t cube_root_1 = 0x2c93e7ad83c6944cULL;
    static constexpr uint64_t cube_root_2 = 0x73a9660652697d91ULL;
    static constexpr uint64_t cube_root_3 = 0x532840178558d639ULL;

    static constexpr uint64_t endo_minus_b1_lo = 0x6F547FA90ABFE4C3ULL;
    static constexpr uint64_t endo_minus_b1_mid = 0xE4437ED6010E8828ULL;

    static constexpr uint64_t endo_b2_lo = 0xe86c90e49284eb15ULL;
    static constexpr uint64_t endo_b2_mid = 0x3086d221a7d46bcdULL;

    static constexpr uint64_t endo_g1_lo = 0xE893209A45DBB031ULL;
    static constexpr uint64_t endo_g1_mid = 0x3DAA8A1471E8CA7FULL;
    static constexpr uint64_t endo_g1_hi = 0xE86C90E49284EB15ULL;
    static constexpr uint64_t endo_g1_hihi = 0x3086D221A7D46BCDULL;

    static constexpr uint64_t endo_g2_lo = 0x1571B4AE8AC47F71ULL;
    static constexpr uint64_t endo_g2_mid = 0x221208AC9DF506C6ULL;
    static constexpr uint64_t endo_g2_hi = 0x6F547FA90ABFE4C4ULL;
    static constexpr uint64_t endo_g2_hihi = 0xE4437ED6010E8828ULL;

    static constexpr uint64_t primitive_root_0 = 0UL;
    static constexpr uint64_t primitive_root_1 = 0UL;
    static constexpr uint64_t primitive_root_2 = 0UL;
    static constexpr uint64_t primitive_root_3 = 0UL;
};
using fr = field<FrParams>;

struct G1Params {
    static constexpr bool USE_ENDOMORPHISM = false;
    static constexpr bool can_hash_to_curve = true;
    static constexpr bool small_elements = true;
    static constexpr bool has_a = false;

    static constexpr fq b = fq(7);
    static constexpr fq a = fq(0);

    static constexpr fq one_x =
        fq(0x59F2815B16F81798UL, 0x029BFCDB2DCE28D9UL, 0x55A06295CE870B07UL, 0x79BE667EF9DCBBACUL).to_montgomery_form();
    static constexpr fq one_y =
        fq(0x9C47D08FFB10D4B8UL, 0xFD17B448A6855419UL, 0x5DA4FBFC0E1108A8UL, 0x483ADA7726A3C465UL).to_montgomery_form();
};
using g1 = group<fq, fr, G1Params>;
} // namespace bb::secp256k1

namespace bb::curve {
class SECP256K1 {
  public:
    using ScalarField = secp256k1::fr;
    using BaseField = secp256k1::fq;
    using Group = secp256k1::g1;
    using Element = typename Group::element;
    using AffineElement = typename Group::affine_element;
};
} // namespace bb::curve

// NOLINTEND(cppcoreguidelines-avoid-c-arrays)
