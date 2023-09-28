#include "./pedersen.hpp"

namespace crypto {

/**
 * Given a vector of fields, generate a pedersen hash using the indexed generators.
 */

/**
 * @brief Given a vector of fields, generate a pedersen hash using generators from `context`.
 *
 * @details `context.offset` is used to access offset elements of `context.generators` if required.
 *          e.g. if one desires to compute
 *          `inputs[0] * [generators[hash_index]] + `inputs[1] * [generators[hash_index + 1]]` + ... etc
 *          Potentially useful to ensure multiple hashes with the same domain separator cannot collide.
 *
 * @param inputs what are we hashing?
 * @param context Stores generator metadata + context pointer to the generators we are using for this hash
 * @return Fq (i.e. SNARK circuit scalar field, when hashing using a curve defined over the SNARK circuit scalar field)
 */
template <typename Curve>
typename Curve::BaseField pedersen_hash_base<Curve>::hash(const std::vector<Fq>& inputs,
                                                          const GeneratorContext<Curve> context)
{
    const auto generators = context.generators->get(inputs.size(), context.offset, context.domain_separator);

    Element result = length_generator * Fr(inputs.size());
    for (size_t i = 0; i < inputs.size(); ++i) {
        result += generators[i] * Fr(static_cast<uint256_t>(inputs[i]));
    }
    return result.normalize().x;
}

template class pedersen_hash_base<curve::Grumpkin>;
} // namespace crypto