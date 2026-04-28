// === AUDIT STATUS ===
// internal:    { status: Planned, auditors: [], commit: }
// external_1:  { status: not started, auditors: [], commit: }
// external_2:  { status: not started, auditors: [], commit: }
// =====================

#include "barretenberg/ecc/curves/bn254/bn254.hpp"
#include "barretenberg/ecc/curves/grumpkin/grumpkin.hpp"
#include "barretenberg/ecc/scalar_multiplication/scalar_multiplication.hpp"
#include "barretenberg/polynomials/polynomial.hpp"

namespace bb::group_elements {

// Type trait to map element template parameters to the corresponding Curve type
template <class Fq, class Fr, class Params> struct curve_for_element;

template <> struct curve_for_element<fq, fr, Bn254G1Params> {
    using type = curve::BN254;
};

template <> struct curve_for_element<fr, fq, grumpkin::G1Params> {
    using type = curve::Grumpkin;
};

template <class Fq, class Fr, class Params>
affine_element<Fq, Fr, Params> affine_element<Fq, Fr, Params>::batch_mul(
    std::span<const affine_element<Fq, Fr, Params>> points,
    std::span<Fr> scalars,
    [[maybe_unused]] size_t max_num_bits,
    bool with_edgecases,
    [[maybe_unused]] const Fr& masking_scalar) noexcept
{
    if (scalars.empty()) {
        return affine_element<Fq, Fr, Params>::infinity();
    }

    using Curve = typename curve_for_element<Fq, Fr, Params>::type;

    return scalar_multiplication::pippenger<Curve>(PolynomialSpan<const Fr>(0, scalars), points, with_edgecases);
}

// Explicit instantiations for supported curves
template affine_element<fq, fr, Bn254G1Params> affine_element<fq, fr, Bn254G1Params>::batch_mul(
    std::span<const affine_element<fq, fr, Bn254G1Params>> points,
    std::span<fr> scalars,
    size_t max_num_bits,
    bool with_edgecases,
    const fr& masking_scalar) noexcept;

template affine_element<fr, fq, grumpkin::G1Params> affine_element<fr, fq, grumpkin::G1Params>::batch_mul(
    std::span<const affine_element<fr, fq, grumpkin::G1Params>> points,
    std::span<fq> scalars,
    size_t max_num_bits,
    bool with_edgecases,
    const fq& masking_scalar) noexcept;

} // namespace bb::group_elements
