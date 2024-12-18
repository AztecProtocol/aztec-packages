#pragma once
#include "../bn254/fq.hpp"
#include "../bn254/fq12.hpp"
#include "../bn254/fq2.hpp"
#include "../bn254/fr.hpp"
#include "../bn254/g1.hpp"
#include "../bn254/g2.hpp"

namespace bb::curve {
class BN254 {
  public:
    using ScalarField = bb::fr;
    using BaseField = bb::fq;
    using Group = typename bb::g1;
    using Element = typename Group::element;
    using AffineElement = typename Group::affine_element;
    using G2AffineElement = typename bb::g2::affine_element;
    using G2BaseField = typename bb::fq2;
    using TargetField = bb::fq12;

    static constexpr const char* name = "BN254";
    // TODO(#673): This flag is temporary. It is needed in the verifier classes (GeminiVerifier, etc.) while these
    // classes are instantiated with "native" curve types. Eventually, the verifier classes will be instantiated only
    // with stdlib types, and "native" verification will be acheived via a simulated builder.
    static constexpr bool is_stdlib_type = false;

    static constexpr size_t SUBGROUP_SIZE = 377;
    static constexpr ScalarField SUBGROUP_GENERATOR =
        ScalarField(uint256_t("0e4061303ba140794a3a2d8659909fd6ffb3dfdc290e4d9ca93bccd950f16404"));
};
} // namespace bb::curve