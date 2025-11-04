// === AUDIT STATUS ===
// internal:    { status: not started, auditors: [], date: YYYY-MM-DD }
// external_1:  { status: not started, auditors: [], date: YYYY-MM-DD }
// external_2:  { status: not started, auditors: [], date: YYYY-MM-DD }
// =====================

#include "pedersen.hpp"
#include "../../hash/pedersen/pedersen.hpp"
#include "barretenberg/ecc/curves/grumpkin/grumpkin.hpp"

namespace bb::stdlib {

/**
 * @brief Compute a Pedersen commitment to the provided inputs
 * @details Computes `commit(inputs) = sum_i inputs[i] * G_i` where `G_i` are Grumpkin curve generators derived from the
 * provided GeneratorContext. The inputs are converted from `field_t` (circuit representation of BN254 scalars) to
 * `cycle_scalar` (circuit representation of Grumpkin scalars) in order to perform the batch multiplication.
 *
 *
 * @tparam Builder
 * @param inputs Vector of BN254 scalar field elements to commit to
 * @param context Generator configuration specifying offset and domain separator for deterministic generator selection
 * @return cycle_group The resulting Pedersen commitment as a Grumpkin curve point
 */
template <typename Builder>
cycle_group<Builder> pedersen_commitment<Builder>::commit(const std::vector<field_t>& inputs,
                                                          const GeneratorContext context)
{
    const auto base_points = context.generators->get(inputs.size(), context.offset, context.domain_separator);

    std::vector<cycle_scalar> scalars;
    std::vector<cycle_group> points;
    for (const auto [scalar, point] : zip_view(inputs, base_points)) {
        scalars.emplace_back(cycle_scalar::create_from_bn254_scalar(scalar));
        // Construct circuit-constant cycle_group objects representing the generators
        points.emplace_back(point);
    }

    return cycle_group::batch_mul(points, scalars);
}

template class pedersen_commitment<bb::UltraCircuitBuilder>;
template class pedersen_commitment<bb::MegaCircuitBuilder>;

} // namespace bb::stdlib
