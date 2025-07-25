// === AUDIT STATUS ===
// internal:    { status: not started, auditors: [], date: YYYY-MM-DD }
// external_1:  { status: not started, auditors: [], date: YYYY-MM-DD }
// external_2:  { status: not started, auditors: [], date: YYYY-MM-DD }
// =====================

#pragma once

#include <span>
namespace bb {

/**
 * @brief Compute the correction term for the permutation argument.
 *
 * @tparam Field
 * @param public_inputs x₀, ..., xₘ₋₁ public inputs to the circuit
 * @param beta random linear-combination term to combine both (wʲ, IDʲ) and (wʲ, σʲ)
 * @param gamma Schwartz-Zippel random evaluation to ensure ∏ᵢ (γ + Sᵢ) = ∏ᵢ (γ + Tᵢ)
 * @param domain_size Total number of rows required for the circuit (power of 2)
 * @param offset Extent to which PI are offset from the 0th index in the wire polynomials, for example, due to inclusion
 * of a leading zero row or Goblin style ECC op gates at the top of the execution trace.
 * @return Field Public input Δ
 */
template <typename Flavor>
typename Flavor::FF compute_public_input_delta(std::span<const typename Flavor::FF> public_inputs,
                                               const typename Flavor::FF& beta,
                                               const typename Flavor::FF& gamma,
                                               const typename Flavor::FF& log_domain_size,
                                               const typename Flavor::FF& offset = 0)
{
    using Field = typename Flavor::FF;
    Field numerator = Field(1);
    Field denominator = Field(1);

    // Let m be the number of public inputs x₀,…, xₘ₋₁.
    // Recall that we broke the permutation σ⁰ by changing the mapping
    //  (i) -> (n+i)   to   (i) -> (-(i+1))   i.e. σ⁰ᵢ = −(i+1)
    //
    // Therefore, the term in the numerator with ID¹ᵢ = n+i does not cancel out with any term in the denominator.
    // Similarly, the denominator contains an extra σ⁰ᵢ = −(i+1) term that does not appear in the numerator.
    // We expect the values of W⁰ᵢ and W¹ᵢ to be equal to xᵢ.
    // The expected accumulated product would therefore be equal to

    //   ∏ᵢ (γ + W¹ᵢ + β⋅ID¹ᵢ)        ∏ᵢ (γ + xᵢ + β⋅(n+i) )
    //  -----------------------  =  ------------------------
    //   ∏ᵢ (γ + W⁰ᵢ + β⋅σ⁰ᵢ )        ∏ᵢ (γ + xᵢ - β⋅(i+1) )

    // At the start of the loop for each xᵢ where i = 0, 1, …, m-1,
    // we have
    //      numerator_acc   = γ + β⋅(n+i) = γ + β⋅n + β⋅i
    //      denominator_acc = γ - β⋅(1+i) = γ - β   - β⋅i
    // at the end of the loop, add and subtract β to each term respectively to
    // set the expected value for the start of iteration i+1.
    // Note: The public inputs may be offset from the 0th index of the wires, for example due to the inclusion of an
    // initial zero row or Goblin-stlye ECC op gates. Accordingly, the indices i in the above formulas are given by i =
    // [0, m-1] + offset, i.e. i = offset, 1 + offset, …, m - 1 + offset.

    // TODO(https://github.com/AztecProtocol/barretenberg/issues/1158): Ensure correct construction of public input
    // delta in the face of increases to virtual size caused by execution trace overflow
    Field domain_size = Field(2).pow(log_domain_size);
    Field numerator_acc = gamma + (beta * (domain_size + offset));
    Field denominator_acc = gamma - beta * (offset + 1);

    for (size_t i = 0; i < public_inputs.size(); i++) {
        numerator *= (numerator_acc + public_inputs[i]);     // γ + xᵢ + β(n+i)
        denominator *= (denominator_acc + public_inputs[i]); // γ + xᵢ - β(1+i)

        // To avoid introducing extra variables in the circuit, we skip numerator_acc and denominator_acc in the final
        // loop iteration, since their values won't be used
        if (i < public_inputs.size() - 1) {
            numerator_acc += beta;
            denominator_acc -= beta;
        }
    }
    return numerator / denominator;
}

} // namespace bb
