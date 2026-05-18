#pragma once

#include "barretenberg/commitment_schemes/claim.hpp"
#include "barretenberg/ecc/fields/field_conversion.hpp"
#include "barretenberg/stdlib/primitives/field/field_conversion.hpp"

namespace bb {

template <typename Curve>
OpeningClaim<Curve> OpeningClaim<Curve>::reconstruct_from_public(
    const std::span<const stdlib::field_t<typename OpeningClaim<Curve>::Builder>,
                    OpeningClaim<Curve>::PUBLIC_INPUTS_SIZE>& limbs)
    requires(std::is_same_v<Curve, stdlib::grumpkin<UltraCircuitBuilder>>)
{
    using Commitment = typename Curve::AffineElement;
    using Fr = typename Curve::ScalarField;
    using field_ct = stdlib::field_t<typename OpeningClaim<Curve>::Builder>;
    using Codec = stdlib::StdlibCodec<field_ct>;
    const size_t FIELD_SIZE = Fr::PUBLIC_INPUTS_SIZE;
    const size_t COMMITMENT_SIZE = Commitment::PUBLIC_INPUTS_SIZE;
    std::span<const field_ct, FIELD_SIZE> challenge_limbs{ limbs.data(), FIELD_SIZE };
    std::span<const field_ct, FIELD_SIZE> evaluation_limbs{ limbs.data() + FIELD_SIZE, FIELD_SIZE };
    std::span<const field_ct, COMMITMENT_SIZE> commitment_limbs{ limbs.data() + 2 * FIELD_SIZE, COMMITMENT_SIZE };
    auto challenge = Codec::template deserialize_from_fields<Fr>(challenge_limbs);
    auto evaluation = Codec::template deserialize_from_fields<Fr>(evaluation_limbs);
    auto commitment = Codec::template deserialize_from_fields<Commitment>(commitment_limbs);

    return OpeningClaim<Curve>{ { challenge, evaluation }, commitment };
}

template <typename Curve>
OpeningClaim<Curve> OpeningClaim<Curve>::reconstruct_from_public(
    const std::span<const bb::fr, OpeningClaim<Curve>::PUBLIC_INPUTS_SIZE>& limbs)
    requires(std::is_same_v<Curve, curve::Grumpkin>)
{
    using Commitment = typename Curve::AffineElement;
    using Fr = typename Curve::ScalarField;
    using Codec = FrCodec;
    const size_t FIELD_SIZE = Fr::PUBLIC_INPUTS_SIZE;
    const size_t COMMITMENT_SIZE = Commitment::PUBLIC_INPUTS_SIZE;
    std::span<const bb::fr, FIELD_SIZE> challenge_limbs{ limbs.data(), FIELD_SIZE };
    std::span<const bb::fr, FIELD_SIZE> evaluation_limbs{ limbs.data() + FIELD_SIZE, FIELD_SIZE };
    std::span<const bb::fr, COMMITMENT_SIZE> commitment_limbs{ limbs.data() + 2 * FIELD_SIZE, COMMITMENT_SIZE };

    Fr challenge = Codec::deserialize_from_fields<Fr>(challenge_limbs);
    Fr evaluation = Codec::deserialize_from_fields<Fr>(evaluation_limbs);
    Commitment commitment = Codec::deserialize_from_fields<Commitment>(commitment_limbs);

    return OpeningClaim<Curve>{ { challenge, evaluation }, commitment };
}

} // namespace bb
