// === AUDIT STATUS ===
// internal:    { status: Complete, auditors: [Nishat], commit: 8c1bc925461f1ed6f3f53824646c6e971b8c6af6 }
// external_1:  { status: not started, auditors: [], commit: }
// external_2:  { status: not started, auditors: [], commit: }
// =====================

#include "./pedersen.hpp"
#include "../pedersen_commitment/pedersen.hpp"

namespace bb::crypto {

/**
 * @brief Given a vector of fields, generate a pedersen hash using generators from `context`.
 *
 * @details `context.offset` is used to access offset elements of `context.generators` if required.
 *          e.g. if one desires to compute
 *          `inputs[0] * [generators[hash_index]] + `inputs[1] * [generators[hash_index + 1]]` + ... etc
 *          Potentially useful to ensure multiple hashes with the same domain separator cannot collide.
 *
 * @note Length inclusion for collision resistance:
 *       For a given commitment C = a*G1 + b*G2 + c*G3 we take an x-coordinate of C.x and use it as the hash.
 *       However, due to elliptic curve symmetry about the x-axis, for any x-coordinate,
 *       there are two points with that x-coordinate. This means -C has the same hash (x-coord) as C,
 *       and the tuple [-a, -b, -c] produces the same hash as [a, b, c].
 *
 *       This property makes the hash trivially not collision resistant without including the length.
 *       By including the length l, the commitment becomes:
 *       C = a*G1 + b*G2 + c*G3 + l*G_len
 *
 *       Since -l would be -3 (an extraordinarily large number that cannot be a valid preimage length),
 *       including the length protects against these collisions.
 *
 *       For more background, see: https://hackmd.io/@aztec-network/ryzn3JIu3#PedersenHash
 *
 * @param inputs what are we hashing?
 * @param context Stores generator metadata + context pointer to the generators we are using for this hash
 * @return Fq (i.e. SNARK circuit scalar field, when hashing using a curve defined over the SNARK circuit scalar field)
 */
template <typename Curve>
typename Curve::BaseField pedersen_hash_base<Curve>::hash(const std::vector<Fq>& inputs,
                                                          const GeneratorContext& context)
{
    if (inputs.empty()) {
        throw_or_abort("pedersen hash: empty input");
    }

    Element result = length_generator * Fr(inputs.size());
    return (result + pedersen_commitment_base<Curve>::commit_native(inputs, context)).normalize().x;
}

template class pedersen_hash_base<curve::Grumpkin>;
} // namespace bb::crypto
