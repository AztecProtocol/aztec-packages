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

/**
 * @brief Alias for the result of recursively verifying a proof
 */
template <typename Builder>
using HonkRecursionConstraintOutput = bb::stdlib::recursion::honk::UltraRecursiveVerifierOutput<Builder>;

/**
 * @brief Container for the output of multiple recursive verifications
 */
template <typename Builder> struct HonkRecursionConstraintsOutput {
    stdlib::recursion::PairingPoints<stdlib::bn254<Builder>> points_accumulator;
    std::vector<OpeningClaim<stdlib::grumpkin<Builder>>> nested_ipa_claims;
    std::vector<stdlib::Proof<Builder>> nested_ipa_proofs;
    bool is_root_rollup = false;

    /**
     * @brief Update the current output with another recursion constraint output
     */
    void update(const HonkRecursionConstraintOutput<Builder>& other, bool update_ipa_data);

    /**
     * @brief Update the current output with the results of a series of recursive verifications
     */
    void update(const HonkRecursionConstraintsOutput<Builder>& other, bool update_ipa_data);

    /**
     * @brief Finalize the output by accumulating IPA claims/proofs, performing full IPA verification, and propagating
     * public inputs as needed
     */
    void finalize(Builder& builder,
                  [[maybe_unused]] bool is_hn_recursion_constraints = false,
                  [[maybe_unused]] bool has_ipa_claim = false);

  private:
    /**
     * @brief Accumulate the IPA claims and proofs held in this output
     */
    [[nodiscard("IPA claim should be accumulated, IPA proof should be propagated")]] std::
        pair<OpeningClaim<stdlib::grumpkin<Builder>>, HonkProof>
        perform_IPA_accumulation(Builder& builder) const;

    /**
     * @brief Perform full IPA recursive verification of the IPA claims and proofs contained in this output
     */
    void perform_full_IPA_verification(Builder& builder) const;
};

} // namespace acir_format
