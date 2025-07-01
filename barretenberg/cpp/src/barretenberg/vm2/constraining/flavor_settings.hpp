// This file exists so that we can have access to these definitions without including the whole flavor.
#pragma once

#include "barretenberg/commitment_schemes/kzg/kzg.hpp"
#include "barretenberg/ecc/curves/bn254/g1.hpp"
#include "barretenberg/flavor/relation_definitions.hpp"
#include "barretenberg/polynomials/barycentric.hpp"
#include "barretenberg/polynomials/univariate.hpp"

namespace bb::avm2 {

class AvmFlavorSettings {
  public:
    using Curve = curve::BN254;
    using EmbeddedCurve = curve::Grumpkin;
    using G1 = Curve::Group;
    using PCS = KZG<Curve>;

    using FF = G1::Fr;
    using Polynomial = bb::Polynomial<FF>;
    using PolynomialHandle = std::span<FF>;
    using GroupElement = G1::element;
    using Commitment = G1::affine_element;
    using CommitmentHandle = G1::affine_element;
    using CommitmentKey = bb::CommitmentKey<Curve>;
    using VerifierCommitmentKey = bb::VerifierCommitmentKey<Curve>;
    using RelationSeparator = FF;
};

} // namespace bb::avm2
