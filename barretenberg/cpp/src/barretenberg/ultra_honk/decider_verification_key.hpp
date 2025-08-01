// === AUDIT STATUS ===
// internal:    { status: not started, auditors: [], date: YYYY-MM-DD }
// external_1:  { status: not started, auditors: [], date: YYYY-MM-DD }
// external_2:  { status: not started, auditors: [], date: YYYY-MM-DD }
// =====================

#pragma once
#include "barretenberg/ecc/fields/field_conversion.hpp"
#include "barretenberg/flavor/flavor.hpp"
#include "barretenberg/relations/relation_parameters.hpp"

namespace bb {
/**
 * @brief The DeciderVerificationKey encapsulates all the necessary information for a Mega Honk Verifier to verify a
 * proof (sumcheck + Shplemini). In the context of folding, this is returned by the Protogalaxy verifier with non-zero
 * target sum and gate challenges.
 *
 * @details This is ϕ in the paper.
 */
template <IsUltraOrMegaHonk Flavor> class DeciderVerificationKey_ {
  public:
    using FF = typename Flavor::FF;
    using VerificationKey = typename Flavor::VerificationKey;
    using VerifierCommitmentKey = typename Flavor::VerifierCommitmentKey;
    using WitnessCommitments = typename Flavor::WitnessCommitments;
    using CommitmentLabels = typename Flavor::CommitmentLabels;
    using SubrelationSeparators = typename Flavor::SubrelationSeparators;

    std::shared_ptr<VerificationKey> vk;

    bool is_accumulator = false;

    SubrelationSeparators alphas; // a challenge for each subrelation
    RelationParameters<FF> relation_parameters;
    std::vector<FF> gate_challenges;
    // The target sum, which is typically nonzero for a ProtogalaxyProver's accmumulator
    FF target_sum{ 0 };

    WitnessCommitments witness_commitments;
    CommitmentLabels commitment_labels;

    DeciderVerificationKey_() = default;
    DeciderVerificationKey_(std::shared_ptr<VerificationKey> vk)
        : vk(vk)
    {}
};

// Serialization methods for DeciderVerificationKey_
template <IsUltraOrMegaHonk Flavor> inline void read(uint8_t const*& it, DeciderVerificationKey_<Flavor>& dvk)
{
    using serialize::read;

    // Read the underlying verification key
    dvk.vk = std::make_shared<typename Flavor::VerificationKey>();
    read(it, *dvk.vk);

    // Read other members
    read(it, dvk.is_accumulator);
    read(it, dvk.alphas);
    read(it, dvk.relation_parameters);
    read(it, dvk.gate_challenges);
    read(it, dvk.target_sum);
    read(it, dvk.witness_commitments);
}

template <IsUltraOrMegaHonk Flavor>
inline void write(std::vector<uint8_t>& buf, DeciderVerificationKey_<Flavor> const& dvk)
{
    using serialize::write;

    // Write the underlying verification key
    write(buf, *dvk.vk);

    // Write other members
    write(buf, dvk.is_accumulator);
    write(buf, dvk.alphas);
    write(buf, dvk.relation_parameters);
    write(buf, dvk.gate_challenges);
    write(buf, dvk.target_sum);
    write(buf, dvk.witness_commitments);
}

} // namespace bb
