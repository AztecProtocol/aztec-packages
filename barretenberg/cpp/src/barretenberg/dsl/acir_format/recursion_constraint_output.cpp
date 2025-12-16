// === AUDIT STATUS ===
// internal:    { status: not started, auditors: [], date: YYYY-MM-DD }
// external_1:  { status: not started, auditors: [], date: YYYY-MM-DD }
// external_2:  { status: not started, auditors: [], date: YYYY-MM-DD }
// =====================

#include "barretenberg/dsl/acir_format/recursion_constraint_output.hpp"

namespace acir_format {

template <typename Builder>
void HonkRecursionConstraintsOutput<Builder>::update(const HonkRecursionConstraintOutput<Builder>& other,
                                                     bool update_ipa_data)
{
    // Update points accumulator
    if (this->points_accumulator.has_data) {
        this->points_accumulator.aggregate(other.points_accumulator);
    } else {
        this->points_accumulator = other.points_accumulator;
    }

    if (update_ipa_data) {
        // Update ipa proofs and claims
        this->nested_ipa_proofs.push_back(other.ipa_proof);
        this->nested_ipa_claims.push_back(other.ipa_claim);
    }
}

template <typename Builder>
void HonkRecursionConstraintsOutput<Builder>::update(const HonkRecursionConstraintsOutput<Builder>& other,
                                                     bool update_ipa_data)
{
    // Update points accumulator
    if (this->points_accumulator.has_data) {
        this->points_accumulator.aggregate(other.points_accumulator);
    } else {
        this->points_accumulator = other.points_accumulator;
    }

    if (update_ipa_data) {
        // Update ipa proofs and claims (if other has no proofs/claims, we are not appending anything)
        this->nested_ipa_proofs.insert(
            this->nested_ipa_proofs.end(), other.nested_ipa_proofs.begin(), other.nested_ipa_proofs.end());
        this->nested_ipa_claims.insert(
            this->nested_ipa_claims.end(), other.nested_ipa_claims.begin(), other.nested_ipa_claims.end());
    }
}

template <>
std::pair<OpeningClaim<stdlib::grumpkin<UltraCircuitBuilder>>, HonkProof> HonkRecursionConstraintsOutput<
    UltraCircuitBuilder>::perform_IPA_accumulation(UltraCircuitBuilder& builder) const
{
    BB_ASSERT_EQ(
        nested_ipa_claims.size(), nested_ipa_proofs.size(), "Mismatched number of nested IPA claims and proofs.");

    OpeningClaim<stdlib::grumpkin<UltraCircuitBuilder>> final_ipa_claim;
    HonkProof final_ipa_proof;

    if (nested_ipa_claims.size() == 2) {
        // If we have two claims, accumulate.
        CommitmentKey<curve::Grumpkin> commitment_key(1 << CONST_ECCVM_LOG_N);
        using StdlibTranscript = UltraStdlibTranscript;

        auto ipa_transcript_1 = std::make_shared<StdlibTranscript>(nested_ipa_proofs[0]);
        auto ipa_transcript_2 = std::make_shared<StdlibTranscript>(nested_ipa_proofs[1]);
        auto [ipa_claim, ipa_proof] = IPA<stdlib::grumpkin<UltraCircuitBuilder>>::accumulate(
            commitment_key, ipa_transcript_1, nested_ipa_claims[0], ipa_transcript_2, nested_ipa_claims[1]);

        final_ipa_claim = ipa_claim;
        final_ipa_proof = ipa_proof;
    } else if (nested_ipa_claims.size() == 1) {
        // If we have one claim, just forward it along.
        final_ipa_claim = nested_ipa_claims[0];
        // This conversion looks suspicious but there's no need to make this an output of the circuit since
        // its a proof that will be checked anyway.
        final_ipa_proof = nested_ipa_proofs[0].get_value();
    } else if (nested_ipa_claims.empty()) {
        // If we don't have any claims, we may need to inject a fake one if we're proving with
        // UltraRollupHonk, indicated by the manual setting of the honk_recursion metadata to 2.
        info("Proving with UltraRollupHonk but no IPA claims exist.");
        auto [stdlib_opening_claim, ipa_proof] =
            IPA<stdlib::grumpkin<UltraCircuitBuilder>>::create_random_valid_ipa_claim_and_proof(builder);

        final_ipa_claim = stdlib_opening_claim;
        final_ipa_proof = ipa_proof;
    } else {
        // We don't support and shouldn't expect to support circuits with 3+ IPA recursive verifiers.
        throw_or_abort("Too many nested IPA claims to accumulate");
    }

    BB_ASSERT_EQ(final_ipa_proof.size(), IPA_PROOF_LENGTH);

    // Return the IPA claim and proof
    return { final_ipa_claim, final_ipa_proof };
}

template <>
void HonkRecursionConstraintsOutput<UltraCircuitBuilder>::perform_full_IPA_verification(
    UltraCircuitBuilder& builder) const
{
    using StdlibTranscript = UltraStdlibTranscript;

    BB_ASSERT_EQ(
        nested_ipa_claims.size(), nested_ipa_proofs.size(), "Mismatched number of nested IPA claims and proofs.");
    BB_ASSERT_EQ(nested_ipa_claims.size(), 2U, "Root rollup must have two nested IPA claims.");

    auto [ipa_claim, ipa_proof] = perform_IPA_accumulation(builder);

    // IPA verification
    VerifierCommitmentKey<stdlib::grumpkin<UltraCircuitBuilder>> verifier_commitment_key(
        &builder, 1 << CONST_ECCVM_LOG_N, VerifierCommitmentKey<curve::Grumpkin>(1 << CONST_ECCVM_LOG_N));

    auto accumulated_ipa_transcript =
        std::make_shared<StdlibTranscript>(stdlib::Proof<UltraCircuitBuilder>(builder, ipa_proof));
    IPA<stdlib::grumpkin<UltraCircuitBuilder>>::full_verify_recursive(
        verifier_commitment_key, ipa_claim, accumulated_ipa_transcript);
}

template <>
void HonkRecursionConstraintsOutput<UltraCircuitBuilder>::finalize(UltraCircuitBuilder& builder,
                                                                   [[maybe_unused]] bool is_hn_recursion_constraints,
                                                                   [[maybe_unused]] bool has_ipa_claim)
{
    if (has_ipa_claim) {
        using IO = stdlib::recursion::honk::RollupIO;

        // We have multiple IPA claims, we need to accumulate them
        auto [ipa_claim, ipa_proof] = perform_IPA_accumulation(builder);

        // Set proof
        builder.ipa_proof = ipa_proof;

        // Propagate pairing points and ipa claim
        IO inputs;
        inputs.pairing_inputs =
            points_accumulator.has_data
                ? points_accumulator
                : stdlib::recursion::PairingPoints<stdlib::bn254<UltraCircuitBuilder>>::construct_default();
        inputs.ipa_claim = ipa_claim;
        inputs.set_public();
    } else {
        using IO = stdlib::recursion::honk::DefaultIO<UltraCircuitBuilder>;

        if (is_root_rollup) {
            // The root rollup performs full IPA verification
            perform_full_IPA_verification(builder);
        } else {
            // We shouldn't accidentally have IPA proofs.
            BB_ASSERT_EQ(nested_ipa_proofs.size(), static_cast<size_t>(0), "IPA proofs present when not expected.");
        }

        // Propagate public inputs
        if (points_accumulator.has_data) {
            IO inputs;
            inputs.pairing_inputs = points_accumulator;
            inputs.set_public();
        } else {
            IO::add_default(builder);
        }
    }
}

template <>
void HonkRecursionConstraintsOutput<MegaCircuitBuilder>::finalize(MegaCircuitBuilder& builder,
                                                                  [[maybe_unused]] bool is_hn_recursion_constraints,
                                                                  [[maybe_unused]] bool has_ipa_claim)
{
    using IO = stdlib::recursion::honk::AppIO;

    BB_ASSERT_EQ(
        nested_ipa_claims.size(), static_cast<size_t>(0), "IPA claims present when not expected in MegaBuilder.");

    // If the recursion constraints from HN, the public inputs have already been set. Otherwise, we need to propagate
    // the pairing points
    if (!is_hn_recursion_constraints) {
        if (points_accumulator.has_data) {
            IO inputs;
            inputs.pairing_inputs = points_accumulator;
            inputs.set_public();
        } else {
            IO::add_default(builder);
        }
    }
}

template void HonkRecursionConstraintsOutput<UltraCircuitBuilder>::update(
    const HonkRecursionConstraintOutput<UltraCircuitBuilder>&, bool);

template void HonkRecursionConstraintsOutput<MegaCircuitBuilder>::update(
    const HonkRecursionConstraintOutput<MegaCircuitBuilder>&, bool);

template void HonkRecursionConstraintsOutput<UltraCircuitBuilder>::update(
    const HonkRecursionConstraintsOutput<UltraCircuitBuilder>&, bool);

template void HonkRecursionConstraintsOutput<MegaCircuitBuilder>::update(
    const HonkRecursionConstraintsOutput<MegaCircuitBuilder>&, bool);

} // namespace acir_format
