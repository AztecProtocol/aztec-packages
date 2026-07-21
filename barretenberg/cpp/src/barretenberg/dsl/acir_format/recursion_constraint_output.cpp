// === AUDIT STATUS ===
// internal:    { status: Completed, auditors: [Federico], commit: }
// external_1:  { status: not started, auditors: [], commit: }
// external_2:  { status: not started, auditors: [], commit: }
// =====================

#include "barretenberg/dsl/acir_format/recursion_constraint_output.hpp"

namespace acir_format {

template <typename Builder>
void HonkRecursionConstraintsOutput<Builder>::update(const HonkRecursionConstraintOutput<Builder>& other,
                                                     bool update_ipa_data)
{
    // Update points accumulator
    if (this->points_accumulator.is_populated()) {
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
    if (this->points_accumulator.is_populated()) {
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
        this->nested_triple_ipa_openings.insert(this->nested_triple_ipa_openings.end(),
                                                other.nested_triple_ipa_openings.begin(),
                                                other.nested_triple_ipa_openings.end());
    }
}

template <typename Builder>
void HonkRecursionConstraintsOutput<Builder>::update_triple_ipa_opening(
    const stdlib::recursion::PairingPoints<stdlib::bn254<Builder>>& pairing_points, TripleIpaOpening triple_ipa_opening)
{
    if (this->points_accumulator.is_populated()) {
        this->points_accumulator.aggregate(pairing_points);
    } else {
        this->points_accumulator = pairing_points;
    }
    this->nested_triple_ipa_openings.push_back(std::move(triple_ipa_opening));
}

template <>
std::pair<OpeningClaim<stdlib::grumpkin<UltraCircuitBuilder>>, HonkProof> HonkRecursionConstraintsOutput<
    UltraCircuitBuilder>::perform_IPA_accumulation(UltraCircuitBuilder& builder) const
{
    using RecursiveCurve = stdlib::grumpkin<UltraCircuitBuilder>;
    using StdlibTranscript = UltraStdlibTranscript;
    using RecursiveIPA = IPA<RecursiveCurve>;
    BB_ASSERT_EQ(
        nested_ipa_claims.size(), nested_ipa_proofs.size(), "Mismatched number of nested IPA claims and proofs.");

    std::vector<IPAAccumulator> accumulators;
    accumulators.reserve(nested_ipa_claims.size() + nested_triple_ipa_openings.size());
    for (size_t idx = 0; idx < nested_ipa_claims.size(); ++idx) {
        auto ipa_transcript = std::make_shared<StdlibTranscript>(nested_ipa_proofs[idx]);
        accumulators.emplace_back(RecursiveIPA::reduce_verify(nested_ipa_claims[idx], ipa_transcript));
    }
    for (const auto& opening : nested_triple_ipa_openings) {
        accumulators.emplace_back(opening.reduce_verify());
    }

    CommitmentKey<curve::Grumpkin> commitment_key(1 << CONST_ECCVM_LOG_N);
    if (accumulators.size() == 2) {
        return RecursiveIPA::accumulate(commitment_key, std::move(accumulators[0]), std::move(accumulators[1]));
    }
    if (accumulators.size() == 1) {
        return RecursiveIPA::prove_accumulator_claim(commitment_key, std::move(accumulators[0]));
    }
    if (accumulators.empty()) {
        info("Proving with UltraRollupHonk but no IPA claims exist.");
        return RecursiveIPA::create_random_valid_ipa_claim_and_proof(builder);
    }
    throw_or_abort("Too many nested IPA accumulators to accumulate");
}

template <>
void HonkRecursionConstraintsOutput<UltraCircuitBuilder>::perform_full_IPA_verification(
    UltraCircuitBuilder& builder) const
{
    using StdlibTranscript = UltraStdlibTranscript;

    BB_ASSERT_EQ(
        nested_ipa_claims.size(), nested_ipa_proofs.size(), "Mismatched number of nested IPA claims and proofs.");
    BB_ASSERT_EQ(nested_ipa_claims.size() + nested_triple_ipa_openings.size(),
                 2U,
                 "Root rollup must accumulate two IPA proofs.");

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
            points_accumulator.is_populated()
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
            BB_ASSERT_EQ(nested_triple_ipa_openings.size(),
                         static_cast<size_t>(0),
                         "TripleIPA openings present when not expected.");
        }

        // Propagate public inputs
        if (points_accumulator.is_populated()) {
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
    BB_ASSERT_EQ(nested_triple_ipa_openings.size(),
                 static_cast<size_t>(0),
                 "TripleIPA openings present when not expected in MegaBuilder.");

    // If the recursion constraints from HN, the public inputs have already been set. Otherwise, we need to propagate
    // the pairing points
    if (!is_hn_recursion_constraints) {
        if (points_accumulator.is_populated()) {
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

template void HonkRecursionConstraintsOutput<UltraCircuitBuilder>::update_triple_ipa_opening(
    const stdlib::recursion::PairingPoints<stdlib::bn254<UltraCircuitBuilder>>&,
    HonkRecursionConstraintsOutput<UltraCircuitBuilder>::TripleIpaOpening);

} // namespace acir_format
