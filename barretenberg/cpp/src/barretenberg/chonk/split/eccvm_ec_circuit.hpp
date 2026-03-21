#pragma once

#include "barretenberg/chonk/split/shared_translator_witness.hpp"
#include "barretenberg/eccvm/eccvm_verifier.hpp"
#include "barretenberg/stdlib/hash/poseidon2/poseidon2.hpp"
#include "barretenberg/stdlib/primitives/group/cycle_group.hpp"
#include "barretenberg/transcript/origin_tag.hpp"

namespace bb {

/**
 * @brief BN254 circuit that performs the ECCVM EC verification (Grumpkin MSMs via cycle_group).
 *
 * @details Takes the flat BatchOpeningClaim<Grumpkin> from ECCVMVerifier::compute_ec_verification_flat()
 * and performs a single cycle_group::batch_mul to compute the IPA commitment. The result, combined
 * with the z_challenge and batched_evaluation, forms the IPA OpeningClaim<Grumpkin>.
 *
 * Part A: Grumpkin MSM via cycle_group::batch_mul
 * Part B: Polynomial equivalence sub-protocol (same pattern as other field/EC circuits)
 *
 * The Grumpkin commitments have native coordinates (grumpkin::fq = bn254::fr) in UltraCircuitBuilder.
 * The Grumpkin scalars (grumpkin::fr = bn254::fq) are non-native, represented as cycle_scalar (bigfield).
 */
class ECCVMECCircuit {
  public:
    using Builder = UltraCircuitBuilder;
    using CycleGroup = stdlib::cycle_group<Builder>;
    using CycleScalar = stdlib::cycle_scalar<Builder>;
    using FF = stdlib::field_t<Builder>;
    using BF = stdlib::bigfield<Builder, bb::Bn254FqParams>;
    using GrumpkinAffine = grumpkin::g1::affine_element;
    using GrumpkinFr = grumpkin::fr; // = bn254::fq

    static constexpr size_t NUM_LIMB_BITS = 68;
    static constexpr size_t POLY_EQUIV_PUBLIC_INPUTS = 9; // 1 (h_b) + 4 (alpha) + 4 (r_b)

    /**
     * @brief Polynomial equivalence data (native values) produced by the circuit.
     */
    struct PolyEquivData {
        bb::fr h_b;   // Witness hash (native fr, from Poseidon2)
        bb::fq alpha; // Challenge (native fq)
        bb::fq r_b;   // Polynomial evaluation P(alpha) (native fq)
    };

    /**
     * @brief The native IPA OpeningClaim produced by the EC circuit.
     */
    struct IPAClaimData {
        GrumpkinAffine commitment;
        GrumpkinFr z_challenge;
        GrumpkinFr evaluation;
    };

    ECCVMECCircuit(Builder& builder,
                   const typename ECCVMVerifier::FlatECResult& flat_ec_result,
                   const bb::fq& alpha = bb::fq(0))
        : builder_(builder)
        , flat_ec_result_(flat_ec_result)
        , alpha_(alpha)
        , poly_equiv_enabled_(alpha != bb::fq(0))
    {}

    void build_circuit()
    {
        ipa_claim_ = build_ec_circuit();

        if (poly_equiv_enabled_) {
            build_poly_equiv();
        }
    }

    IPAClaimData get_ipa_claim() const { return ipa_claim_; }
    PolyEquivData get_poly_equiv_data() const { return poly_equiv_data_; }

  private:
    /**
     * @brief Perform the Grumpkin MSM via cycle_group::batch_mul.
     */
    IPAClaimData build_ec_circuit()
    {
        const auto& commitments = flat_ec_result_.batch_claim.commitments;
        const auto& scalars = flat_ec_result_.batch_claim.scalars;
        BB_ASSERT(commitments.size() == scalars.size());

        // Add Grumpkin commitments as cycle_group witnesses
        std::vector<CycleGroup> circuit_points;
        circuit_points.reserve(commitments.size());
        for (const auto& commitment : commitments) {
            circuit_points.push_back(CycleGroup::from_witness(&builder_, commitment));
        }

        // Add Grumpkin scalars as cycle_scalar witnesses
        // grumpkin::fr = bn254::fq, so these are bigfield values in UltraCircuitBuilder
        std::vector<CycleScalar> circuit_scalars;
        circuit_scalars.reserve(scalars.size());
        for (const auto& scalar : scalars) {
            circuit_scalars.emplace_back(CycleScalar::from_witness(&builder_, scalar));
        }

        // Compute MSM: result = sum(commitments[i] * scalars[i])
        auto result = CycleGroup::batch_mul(circuit_points, circuit_scalars);

        // Expose result commitment as public inputs (2 field elements: x, y)
        result.set_public();

        return IPAClaimData{
            .commitment = result.get_value(),
            .z_challenge = flat_ec_result_.batch_claim.evaluation_point,
            .evaluation = flat_ec_result_.batched_evaluation,
        };
    }

    /**
     * @brief Add polynomial equivalence constraints.
     * @details Serializes the flat BatchOpeningClaim to 128-bit chunks and adds Poseidon2 hash +
     * Horner evaluation, same pattern as other split circuits.
     */
    void build_poly_equiv()
    {
        // Serialize the flat claim to chunks using SharedWitness<Grumpkin>
        // The flat claim has Grumpkin commitments (coordinates in grumpkin::fq = bn254::fr)
        // and Grumpkin scalars (grumpkin::fr = bn254::fq)
        auto witness = SharedECCVMWitness::from_claim(flat_ec_result_.batch_claim,
                                                       GrumpkinAffine::one()); // W placeholder for IPA
        auto chunks = witness.to_chunks();

        // Add chunks as bigfield witnesses and extract prime_basis_limb as fr representation
        std::vector<BF> chunks_bf;
        std::vector<FF> chunks_fr;
        chunks_bf.reserve(chunks.size());
        chunks_fr.reserve(chunks.size());

        for (const auto& chunk : chunks) {
            auto chunk_bf = BF::from_witness(&builder_, bb::fq(chunk));
            chunk_bf.set_origin_tag(OriginTag());
            chunks_fr.push_back(FF(chunk_bf.prime_basis_limb));
            chunks_bf.push_back(std::move(chunk_bf));
        }

        // Compute h_b = Poseidon2 hash of all chunks (native fr Poseidon2)
        auto h_b = stdlib::poseidon2<Builder>::hash(chunks_fr);
        h_b.set_public();

        // Alpha as bigfield public input
        auto alpha_bf = BF::from_witness(&builder_, alpha_);
        alpha_bf.set_origin_tag(OriginTag());
        alpha_bf.set_public();

        // Evaluate P(alpha) using Horner's method
        BF r_b = chunks_bf.back();
        for (size_t ii = chunks_bf.size() - 1; ii > 0; ii--) {
            r_b = r_b * alpha_bf + chunks_bf[ii - 1];
        }
        r_b.set_public();

        poly_equiv_data_ = PolyEquivData{
            .h_b = h_b.get_value(),
            .alpha = alpha_,
            .r_b = bb::fq(r_b.get_value()),
        };
    }

    Builder& builder_;
    typename ECCVMVerifier::FlatECResult flat_ec_result_;
    bb::fq alpha_;
    bool poly_equiv_enabled_;

    IPAClaimData ipa_claim_;
    PolyEquivData poly_equiv_data_;
};

} // namespace bb
