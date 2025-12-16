// === AUDIT STATUS ===
// internal:    { status: not started, auditors: [], date: YYYY-MM-DD }
// external_1:  { status: not started, auditors: [], date: YYYY-MM-DD }
// external_2:  { status: not started, auditors: [], date: YYYY-MM-DD }
// =====================

#include "pedersen.hpp"
#include "barretenberg/crypto/pedersen_hash/pedersen.hpp"
#include "barretenberg/ecc/curves/grumpkin/grumpkin.hpp"
namespace bb::stdlib {

using namespace bb;

/**
 * @brief Computes a pedersen hash of the provided inputs
 * @details The pedersen hash is computed as the x-coordinate of the point: P = \sum_i inputs[i] * G_i + len * H, where
 * G_i and H are generator points of the Grumpkin curve and len is the number of inputs. The len * H term is included to
 * avoid the trivial collision that otherwise results from negating all inputs. See crypto::pedersen_hash for more
 * details.
 * @note: The inputs are elements of the bn254 scalar field but are interpreted as scalars in the Grumpkin scalar field
 * (represented by cycle_scalar).
 *
 * @tparam Builder
 * @param inputs The field elements to be hashed
 * @param context (optional) context for generator selection/construction
 * @return field_t<Builder> The x-coordinate of the resulting pedersen hash point
 */
template <typename Builder>
field_t<Builder> pedersen_hash<Builder>::hash(const std::vector<field_ct>& inputs, const GeneratorContext context)
{
    using cycle_scalar = typename cycle_group::cycle_scalar;
    using Curve = EmbeddedCurve;

    const auto base_points = context.generators->get(inputs.size(), context.offset, context.domain_separator);

    std::vector<cycle_scalar> scalars;
    std::vector<cycle_group> points;
    scalars.emplace_back(cycle_scalar::create_from_bn254_scalar(field_ct(inputs.size())));
    points.emplace_back(crypto::pedersen_hash_base<Curve>::length_generator);
    for (const auto [point, scalar] : zip_view(base_points, inputs)) {
        scalars.emplace_back(cycle_scalar::create_from_bn254_scalar(scalar));
        // Construct circuit-constant cycle_group objects (non-witness)
        points.emplace_back(point);
    }

    auto result = cycle_group::batch_mul(points, scalars);
    return result.x;
}

template class pedersen_hash<bb::UltraCircuitBuilder>;
template class pedersen_hash<bb::MegaCircuitBuilder>;

} // namespace bb::stdlib
