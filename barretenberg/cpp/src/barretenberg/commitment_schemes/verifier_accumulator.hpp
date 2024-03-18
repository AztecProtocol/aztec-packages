#pragma once
#include <utility>

#include "barretenberg/commitment_schemes/verification_key.hpp"
namespace bb {
template <typename Curve> class VerifierAccumulator {
  public:
    virtual bool check() const = 0;
};

template <> class VerifierAccumulator<curve::BN254> {
    using Curve = curve::BN254;
    using GroupElement = typename Curve::Element;
    std::array<GroupElement, 2> pairing_points;
    std::shared_ptr<VerifierCommitmentKey<Curve>> vk;

  public:
    VerifierAccumulator(std::array<GroupElement, 2> pairing_points, std::shared_ptr<VerifierCommitmentKey<Curve>>& vk)
        : pairing_points(std::move(pairing_points))
        , vk(vk){};
    bool check() { return vk->pairing_check(pairing_points[0], pairing_points[1]); }
};

template <> class VerifierAccumulator<curve::Grumpkin> {
    using Curve = curve::Grumpkin;
    // TODO(https://github.com/AztecProtocol/barretenberg/issues/912): change the content of this class and the check
    // method to be actual IPA accumulators once implemented
    bool verified;
    std::shared_ptr<VerifierCommitmentKey<Curve>> vk;

  public:
    VerifierAccumulator(bool verified, std::shared_ptr<VerifierCommitmentKey<Curve>>& vk)
        : verified(verified)
        , vk(vk){};
    bool check() const { return verified; }
};
}; // namespace bb