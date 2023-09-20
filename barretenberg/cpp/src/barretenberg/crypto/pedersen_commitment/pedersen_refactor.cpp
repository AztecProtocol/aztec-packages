// TODO(@zac-wiliamson #2341 rename to pedersen.cpp once we migrate to new hash standard)

#include "./pedersen_refactor.hpp"
#include "./convert_buffer_to_field.hpp"
#include "barretenberg/common/serialize.hpp"
#include "barretenberg/common/throw_or_abort.hpp"
#include <iostream>
#ifndef NO_OMP_MULTITHREADING
#include <omp.h>
#endif

namespace crypto {

/**
 * @brief Given a vector of fields, generate a pedersen commitment using the indexed generators.
 *
 * @details This method uses `Curve::BaseField` members as inputs. This aligns with what we expect when creating
 * grumpkin commitments to field elements inside a BN254 SNARK circuit.
 * @param inputs
 * @param hash_index
 * @param generator_context
 * @return Curve::AffineElement
 */
template <typename Curve>
typename Curve::AffineElement pedersen_commitment_refactor<Curve>::commit_native(
    const std::vector<Fq>& inputs, const size_t hash_index, const generator_data<Curve>* const generator_context)
{
    const auto generators = generator_context->conditional_extend(inputs.size() + hash_index);
    Element result = Group::point_at_infinity;

    for (size_t i = 0; i < inputs.size(); ++i) {
        result += Element(generators.get(i, hash_index)) * static_cast<uint256_t>(inputs[i]);
    }
    return result;
}

/**
 * @brief Given a vector of fields, generate a pedersen commitment using the indexed generators.
 *
 * @details This method uses `ScalarField` members as inputs. This aligns with what we expect for a "canonical"
 * elliptic curve commitment function. However, when creating grumpkin commitments inside a BN254 SNARK crcuit it is not
 * efficient to pack data into grumpkin::fr elements, as grumpkin::fq is the native field of BN254 circuits.
 *
 * @note This method is used currently for tests. If we find no downstream use for it by Jan 2024, delete!
 * @param inputs
 * @param hash_index
 * @param generator_context
 * @return Curve::AffineElement
 */
template <typename Curve>
typename Curve::AffineElement pedersen_commitment_refactor<Curve>::commit_native(
    const std::vector<Fr>& inputs, const size_t hash_index, const generator_data<Curve>* const generator_context)
{
    const auto generators = generator_context->conditional_extend(inputs.size() + hash_index);
    Element result = Group::point_at_infinity;

    for (size_t i = 0; i < inputs.size(); ++i) {
        result += Element(generators.get(i, hash_index)) * (inputs[i]);
    }
    return result;
}
template class pedersen_commitment_refactor<curve::Grumpkin>;
} // namespace crypto
