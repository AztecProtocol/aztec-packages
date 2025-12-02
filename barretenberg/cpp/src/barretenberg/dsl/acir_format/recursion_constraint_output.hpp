// === AUDIT STATUS ===
// internal:    { status: not started, auditors: [], date: YYYY-MM-DD }
// external_1:  { status: not started, auditors: [], date: YYYY-MM-DD }
// external_2:  { status: not started, auditors: [], date: YYYY-MM-DD }
// =====================

#pragma once
#include "barretenberg/commitment_schemes/claim.hpp"
#include "barretenberg/stdlib/eccvm_verifier/verifier_commitment_key.hpp"
#include "barretenberg/stdlib/honk_verifier/ultra_recursive_verifier.hpp"
#include "barretenberg/stdlib/primitives/pairing_points.hpp"
#include "barretenberg/stdlib/proof/proof.hpp"
#include <cstdint>
#include <vector>

namespace acir_format {

using namespace bb;
using namespace stdlib;

template <typename Builder>
using HonkRecursionConstraintOutput = bb::stdlib::recursion::honk::UltraRecursiveVerifierOutput<Builder>;

template <typename Builder> struct HonkRecursionConstraintsOutput {
    stdlib::recursion::PairingPoints<stdlib::bn254<Builder>> points_accumulator;
    std::vector<OpeningClaim<stdlib::grumpkin<Builder>>> nested_ipa_claims;
    std::vector<stdlib::Proof<Builder>> nested_ipa_proofs;
    bool is_root_rollup = false;

    void update(const HonkRecursionConstraintOutput<Builder>& other, bool update_ipa_data);

    void update(const HonkRecursionConstraintsOutput<Builder>& other, bool update_ipa_data);

    [[nodiscard("IPA claim should be accumulated, IPA proof should be propagated")]] std::
        pair<OpeningClaim<stdlib::grumpkin<Builder>>, HonkProof>
        perform_IPA_accumulation(Builder& builder) const;

    void perform_full_IPA_verification(Builder& builder) const;

    void finalize(Builder& builder,
                  [[maybe_unused]] bool is_hn_recursion_constraints = false,
                  [[maybe_unused]] bool has_ipa_claim = false);
};

} // namespace acir_format
