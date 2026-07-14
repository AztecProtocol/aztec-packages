// === AUDIT STATUS ===
// internal:    { status: Completed, auditors: [Federico], commit: 158dd845c99f8f702979c20f1625730d126c4b20}
// external_1:  { status: not started, auditors: [], commit: }
// external_2:  { status: not started, auditors: [], commit: }
// =====================

#pragma once

#include "../../groups/group.hpp"
#include "../bn254/fq.hpp"
#include "../bn254/fr.hpp"

namespace bb::grumpkin {

// Max num bits such that all numbers represented by that many bits are smaller than fr::modulus
constexpr size_t MAX_NO_WRAP_INTEGER_BIT_LENGTH = 252;
static_assert((uint256_t(1) << (MAX_NO_WRAP_INTEGER_BIT_LENGTH + 1)) - 1 < fr::modulus,
              "MAX_NO_WRAP_INTEGER_BIT_LENGTH is too large");

using fq = bb::fr;
using fr = bb::fq;

struct G1Params {
    static constexpr bool USE_ENDOMORPHISM = true;
    static constexpr bool can_hash_to_curve = true;
    static constexpr bool has_a = false;
    static constexpr bb::fr b{ 0xdd7056026000005a, 0x223fa97acb319311, 0xcc388229877910c0, 0x34394632b724eaa };
    static constexpr bb::fr a{ 0UL, 0UL, 0UL, 0UL };

    // generator point = (x, y) = (1, sqrt(-16)) = (1, -4i)
    static constexpr bb::fr one_x = bb::fr::one();
    static constexpr bb::fr one_y{
        0x11b2dff1448c41d8UL, 0x23d3446f21c77dc3UL, 0xaa7b8cf435dfafbbUL, 0x14b34cf69dc25d68UL
    };
};
using g1 = bb::group<bb::fr, bb::fq, G1Params>;

// specialize the name in msgpack schema generation
// consumed by the typescript schema compiler, helps disambiguate templates
inline std::string msgpack_schema_name(g1::affine_element const& /*unused*/)
{
    return "GrumpkinPoint";
}

}; // namespace bb::grumpkin

namespace bb::curve {
class Grumpkin {
  public:
    using ScalarField = bb::fq;
    using BaseField = bb::fr;
    using Group = typename grumpkin::g1;
    using Element = typename Group::element;
    using AffineElement = typename Group::affine_element;

    static constexpr const char* name = "Grumpkin";
    static constexpr bool is_stdlib_type = false;

    // Required by SmallSubgroupIPA argument. This constant needs to divide the size of the multiplicative subgroup of
    // the ScalarField and satisfy SUBGROUP_SIZE > CONST_PROOF_SIZE_LOG_N * 3, since in every round of Sumcheck, the
    // prover sends 3 elements to the verifier.
    static constexpr size_t SUBGROUP_SIZE = 87;
    // The generator below was derived by factoring r - 1 into primes, where r is the modulus of the Grumkin scalar
    // field. A random field element was sampled and raised to the power (r - 1) / (3 * 29). We verified that the
    // resulting element does not generate a smaller subgroup by further raising it to the powers of 3 and 29. To
    // optimize the recursive verifier and avoid costly inversions, we also precompute and store its inverse.
    static constexpr ScalarField subgroup_generator =
        ScalarField(uint256_t("0x147c647c09fb639514909e9f0513f31ec1a523bf8a0880bc7c24fbc962a9586b"));
    static constexpr ScalarField subgroup_generator_inverse =
        ScalarField("0x0c68e27477b5e78cfab790bd3b59806fa871771f71ec7452cde5384f6e3a1988");
    // The length of the polynomials used to mask the Sumcheck Round Univariates. In the ECCVM Sumcheck, the prover only
    // sends 3 elements in every round - a commitment to the round univariate and its evaluations at 0 and 1. Therefore,
    // length 3 is sufficient.
    static constexpr uint32_t LIBRA_UNIVARIATES_LENGTH = 3;
};
} // namespace bb::curve
