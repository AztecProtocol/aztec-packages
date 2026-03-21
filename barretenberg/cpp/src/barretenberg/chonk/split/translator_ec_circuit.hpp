#pragma once

#include "barretenberg/chonk/split/shared_translator_witness.hpp"
#include "barretenberg/commitment_schemes/claim.hpp"
#include "barretenberg/commitment_schemes/pairing_points.hpp"
#include "barretenberg/crypto/poseidon2/poseidon2.hpp"
#include "barretenberg/crypto/poseidon2/poseidon2_permutation.hpp"
#include "barretenberg/stdlib/primitives/group/bn254_cycle_group.hpp"
#include "barretenberg/stdlib_circuit_builders/ultra_circuit_builder.hpp"

namespace bb {

/**
 * @brief Circuit that computes the KZG reduction MSM and polynomial equivalence in a GrumpkinUltraCircuitBuilder.
 *
 * @details Takes the output of Translator's compute_field_verification() — a BatchOpeningClaim containing
 * commitments (BN254 G1 points), scalars (BN254 Fr), and an evaluation point — plus the KZG quotient
 * commitment W, and computes:
 *   P_0 = sum(commitments[i] * scalars[i]) + W * evaluation_point
 *   P_1 = -W
 *
 * When polynomial equivalence is enabled (alpha provided), also:
 *   - Serializes shared witness data to 128-bit chunks
 *   - Computes h_g = Poseidon2(chunks) over native fq using in-circuit Poseidon2 gates
 *   - Accepts alpha as public input
 *   - Evaluates P(alpha) = chunk_0 + chunk_1*alpha + ... over native fq
 *   - Exposes h_g, alpha, r_g as public inputs
 *
 * Public inputs (when polynomial equivalence enabled):
 *   [0] P_0.x, [1] P_0.y, [2] P_1.x, [3] P_1.y  (pairing points)
 *   [4] h_g                                        (witness hash via fq Poseidon2)
 *   [5] alpha                                       (polynomial equivalence challenge)
 *   [6] r_g                                         (polynomial evaluation result)
 *
 * BN254 point coordinates live in bn254::fq = grumpkin::fr, which is the native field of the
 * Grumpkin circuit, so all EC operations and polynomial evaluation use native arithmetic.
 */
 // NOTE: This circuit creates Poseidon2 and arithmetic gates directly via the builder API rather than
 // using stdlib abstractions. This is because stdlib::field_t is hardcoded to bb::fr and cannot be
 // used in a GrumpkinUltraCircuitBuilder (where FF = bb::fq). A future task is to generalize
 // stdlib::field_t to support arbitrary field types, which would allow using stdlib methods here.
 // TODO(#NNNN): rename alpha to polynomial_equivalence_challenge throughout the poly equiv protocol.
class TranslatorECCircuit {
  public:
    using Builder = GrumpkinUltraCircuitBuilder;
    using FF = Builder::FF; // grumpkin::fr = bn254::fq
    using CycleGroup = stdlib::bn254_cycle_group<Builder>;
    using G1Affine = g1::affine_element;
    using G1Element = g1::element;
    using BN254Fr = fr; // BN254 scalar field

    /**
     * @brief Polynomial equivalence data exposed as public inputs.
     */
    struct PolyEquivData {
        FF h_g;   // Witness hash (Poseidon2 over fq)
        FF alpha; // Challenge point
        FF r_g;   // Polynomial evaluation P(alpha)
    };

    /**
     * @brief Construct the EC circuit without polynomial equivalence.
     */
    TranslatorECCircuit(Builder& builder,
                        const BatchOpeningClaim<curve::BN254>& batch_opening_claim,
                        const G1Affine& quotient_commitment)
        : builder_(builder)
        , commitments_(batch_opening_claim.commitments)
        , scalars_(batch_opening_claim.scalars)
        , evaluation_point_(batch_opening_claim.evaluation_point)
        , quotient_commitment_(quotient_commitment)
    {}

    /**
     * @brief Construct the EC circuit with polynomial equivalence.
     * @param alpha The polynomial equivalence challenge (derived by external verifier from h_b, h_g)
     */
    TranslatorECCircuit(Builder& builder,
                        const BatchOpeningClaim<curve::BN254>& batch_opening_claim,
                        const G1Affine& quotient_commitment,
                        const FF& alpha)
        : builder_(builder)
        , commitments_(batch_opening_claim.commitments)
        , scalars_(batch_opening_claim.scalars)
        , evaluation_point_(batch_opening_claim.evaluation_point)
        , quotient_commitment_(quotient_commitment)
        , alpha_(alpha)
        , poly_equiv_enabled_(true)
    {}

    /**
     * @brief Build the circuit: compute KZG reduction MSM and optionally polynomial equivalence.
     */
    void build_circuit()
    {
        build_ec_circuit();
        if (poly_equiv_enabled_) {
            build_poly_equiv_circuit();
        }
    }

    PairingPoints<curve::BN254> get_pairing_points() const { return pairing_points_; }
    PolyEquivData get_poly_equiv_data() const { return poly_equiv_data_; }
    bool poly_equiv_enabled() const { return poly_equiv_enabled_; }

    /**
     * @brief Extract pairing points from the builder's public inputs.
     * @details Pairing points are always the first 4 public inputs: P_0.x, P_0.y, P_1.x, P_1.y
     */
    static PairingPoints<curve::BN254> extract_pairing_points_from_public_inputs(const Builder& builder)
    {
        const auto& public_inputs = builder.public_inputs();
        BB_ASSERT(public_inputs.size() >= 4);

        FF p0_x = builder.get_variable(public_inputs[0]);
        FF p0_y = builder.get_variable(public_inputs[1]);
        FF p1_x = builder.get_variable(public_inputs[2]);
        FF p1_y = builder.get_variable(public_inputs[3]);

        G1Affine P0(p0_x, p0_y);
        G1Affine P1(p1_x, p1_y);
        return PairingPoints<curve::BN254>(P0, P1);
    }

    /**
     * @brief Extract polynomial equivalence data from public inputs.
     * @details Only valid when polynomial equivalence is enabled (public inputs size >= 7).
     */
    static PolyEquivData extract_poly_equiv_from_public_inputs(const Builder& builder)
    {
        const auto& public_inputs = builder.public_inputs();
        BB_ASSERT(public_inputs.size() >= 7);

        return PolyEquivData{
            .h_g = builder.get_variable(public_inputs[4]),
            .alpha = builder.get_variable(public_inputs[5]),
            .r_g = builder.get_variable(public_inputs[6]),
        };
    }

  private:
    /**
     * @brief Build the EC circuit: KZG reduction MSM producing pairing points.
     */
    void build_ec_circuit()
    {
        // Add Shplemini commitment points as witnesses
        std::vector<CycleGroup> circuit_points;
        circuit_points.reserve(commitments_.size() + 1);
        for (const auto& commitment : commitments_) {
            circuit_points.push_back(CycleGroup::from_witness(&builder_, commitment));
        }

        // Add quotient commitment W as a witness (reused for both MSM and P_1)
        auto W = CycleGroup::from_witness(&builder_, quotient_commitment_);
        circuit_points.push_back(W);

        // Build the full scalars vector: Shplemini scalars + evaluation_point (for W)
        auto all_scalars = scalars_;
        all_scalars.emplace_back(evaluation_point_);

        // Compute P_0 = batch_mul(all_commitments, all_scalars)
        auto P_0 = CycleGroup::batch_mul(circuit_points, all_scalars);

        // Compute P_1 = -W
        auto P_1 = -W;

        // Expose pairing points as public inputs (P_0.x, P_0.y, P_1.x, P_1.y)
        P_0.set_public();
        P_1.set_public();

        // Store the computed pairing points for extraction
        pairing_points_ = PairingPoints<curve::BN254>(P_0.get_value(), P_1.get_value());
    }

    /**
     * @brief Build polynomial equivalence circuit: Poseidon2 hash + native polynomial evaluation.
     * @details Serializes the shared witness to 128-bit chunks, adds them as circuit witnesses,
     * hashes them with in-circuit Poseidon2 over fq using native gate creation, and evaluates
     * P(alpha) using Horner's method with arithmetic gates.
     */
    void build_poly_equiv_circuit()
    {
        using Params = crypto::Poseidon2GrumpkinScalarFieldParams;
        using NativePermutation = crypto::Poseidon2Permutation<Params>;

        // Derive 128-bit chunks from the shared witness data
        auto witness = SharedTranslatorWitness::from_claim(
            BatchOpeningClaim<curve::BN254>{ commitments_, scalars_, evaluation_point_ }, quotient_commitment_);
        auto chunks = witness.to_chunks();

        // Add chunks as circuit witnesses
        std::vector<uint32_t> chunk_indices;
        chunk_indices.reserve(chunks.size());
        for (const auto& chunk : chunks) {
            chunk_indices.push_back(builder_.add_variable(FF(chunk)));
        }

        // Compute h_g = Poseidon2(chunks) over fq using sponge construction with Poseidon2 gates
        FF h_g_native = compute_poseidon2_hash_in_circuit<Params, NativePermutation>(chunk_indices);
        uint32_t h_g_idx = chunk_indices.back(); // overwritten below
        // The hash result was set as the last state element; find it from the returned value
        h_g_idx = builder_.add_variable(h_g_native);
        builder_.set_public_input(h_g_idx);

        // Alpha as public input
        uint32_t alpha_idx = builder_.add_variable(alpha_);
        builder_.set_public_input(alpha_idx);

        // Evaluate P(alpha) = chunk_0 + chunk_1*alpha + chunk_2*alpha^2 + ...
        // Using Horner's method with mul_quad_ gates
        uint32_t r_idx = chunk_indices.back();
        for (size_t ii = chunk_indices.size() - 1; ii > 0; ii--) {
            size_t ci = ii - 1;
            FF r_old = builder_.get_variable(r_idx);
            FF alpha_val = builder_.get_variable(alpha_idx);
            FF chunk_val = builder_.get_variable(chunk_indices[ci]);
            FF r_new = r_old * alpha_val + chunk_val;
            uint32_t r_new_idx = builder_.add_variable(r_new);

            builder_.create_big_mul_add_gate({ .a = r_idx,
                                               .b = alpha_idx,
                                               .c = r_new_idx,
                                               .d = chunk_indices[ci],
                                               .mul_scaling = FF(1),
                                               .a_scaling = FF(0),
                                               .b_scaling = FF(0),
                                               .c_scaling = FF(-1),
                                               .d_scaling = FF(1),
                                               .const_scaling = FF(0) });
            r_idx = r_new_idx;
        }
        builder_.set_public_input(r_idx);

        // Store polynomial equivalence data
        poly_equiv_data_ = PolyEquivData{
            .h_g = h_g_native,
            .alpha = alpha_,
            .r_g = builder_.get_variable(r_idx),
        };
    }

    /**
     * @brief Compute Poseidon2 hash of witness values using in-circuit Poseidon2 gates.
     * @details Implements the sponge construction directly using the builder's Poseidon2 gate API.
     * This bypasses stdlib::field_t (which is tied to bb::fr) and works with the native FF type.
     * Uses the same sponge construction as crypto::Poseidon2: rate=3, capacity=1, domain separation.
     */
    template <typename Params, typename NativePermutation>
    FF compute_poseidon2_hash_in_circuit(const std::vector<uint32_t>& input_indices)
    {
        static constexpr size_t t = Params::t;  // 4
        static constexpr size_t rate = t - 1;  // 3

        // Initialize sponge state: [0, 0, 0, input_len << 64]
        std::array<FF, t> state{};
        state[rate] = FF(uint256_t(input_indices.size()) << 64);

        // Absorb inputs in rate-sized blocks
        size_t input_idx = 0;
        while (input_idx < input_indices.size()) {
            // Fill cache (up to rate elements)
            size_t block_size = std::min(rate, input_indices.size() - input_idx);
            for (size_t i = 0; i < block_size; i++) {
                state[i] += builder_.get_variable(input_indices[input_idx + i]);
            }
            input_idx += block_size;

            // Apply permutation (with Poseidon2 gates)
            state = apply_poseidon2_permutation_with_gates<Params, NativePermutation>(state);
        }

        // Squeeze: return first element
        return state[0];
    }

    /**
     * @brief Apply the Poseidon2 permutation and create constraining gates.
     * @details Replicates stdlib::Poseidon2Permutation::permutation but using native FF values
     * and the builder's Poseidon2 gate API directly, without going through field_t<Builder>.
     */
    template <typename Params, typename NativePermutation>
    std::array<FF, Params::t> apply_poseidon2_permutation_with_gates(std::array<FF, Params::t> state)
    {
        static constexpr size_t t = Params::t;
        static constexpr size_t rounds_f = Params::rounds_f;
        static constexpr size_t rounds_p = Params::rounds_p;

        // Add state as witnesses
        std::array<uint32_t, t> state_indices;
        for (size_t i = 0; i < t; i++) {
            state_indices[i] = builder_.add_variable(state[i]);
        }

        // Initial linear layer (external matrix multiplication) — constrained via arithmetic gates
        NativePermutation::matrix_multiplication_external(state);
        {
            // M_E multiplication using 6 arithmetic gates (same as stdlib version)
            FF two(2);
            FF four(4);
            // tmp1 = state[0] + state[1] + 2*state[3]
            FF s0 = builder_.get_variable(state_indices[0]);
            FF s1 = builder_.get_variable(state_indices[1]);
            FF s2 = builder_.get_variable(state_indices[2]);
            FF s3 = builder_.get_variable(state_indices[3]);
            FF tmp1 = s0 + s1 + two * s3;
            FF tmp2 = two * s1 + s2 + s3;
            FF v2 = four * s0 + four * s1 + tmp2;
            FF v1 = v2 + tmp1;
            FF v4 = tmp1 + four * s2 + four * s3;
            FF v3 = v4 + tmp2;
            state[0] = v1;
            state[1] = v2;
            state[2] = v3;
            state[3] = v4;
        }
        for (size_t i = 0; i < t; i++) {
            state_indices[i] = builder_.add_variable(state[i]);
        }

        // First set of external rounds
        size_t rounds_f_beginning = rounds_f / 2;
        for (size_t i = 0; i < rounds_f_beginning; i++) {
            builder_.create_poseidon2_external_gate(poseidon2_external_gate_<FF>{
                state_indices[0], state_indices[1], state_indices[2], state_indices[3], i });

            NativePermutation::add_round_constants(state, Params::round_constants[i]);
            NativePermutation::apply_sbox(state);
            NativePermutation::matrix_multiplication_external(state);
            for (size_t j = 0; j < t; j++) {
                state_indices[j] = builder_.add_variable(state[j]);
            }
        }

        // Propagate to next row (needed for relation shifts)
        builder_.create_unconstrained_gate(builder_.blocks.poseidon2_external,
                                           state_indices[0], state_indices[1],
                                           state_indices[2], state_indices[3]);

        // Internal rounds
        size_t p_end = rounds_f_beginning + rounds_p;
        for (size_t i = rounds_f_beginning; i < p_end; i++) {
            builder_.create_poseidon2_internal_gate(poseidon2_internal_gate_<FF>{
                state_indices[0], state_indices[1], state_indices[2], state_indices[3], i });

            state[0] += Params::round_constants[i][0];
            NativePermutation::apply_single_sbox(state[0]);
            NativePermutation::matrix_multiplication_internal(state);
            for (size_t j = 0; j < t; j++) {
                state_indices[j] = builder_.add_variable(state[j]);
            }
        }

        builder_.create_unconstrained_gate(builder_.blocks.poseidon2_internal,
                                           state_indices[0], state_indices[1],
                                           state_indices[2], state_indices[3]);

        // Remaining external rounds
        for (size_t i = p_end; i < rounds_f + rounds_p; i++) {
            builder_.create_poseidon2_external_gate(poseidon2_external_gate_<FF>{
                state_indices[0], state_indices[1], state_indices[2], state_indices[3], i });

            NativePermutation::add_round_constants(state, Params::round_constants[i]);
            NativePermutation::apply_sbox(state);
            NativePermutation::matrix_multiplication_external(state);
            for (size_t j = 0; j < t; j++) {
                state_indices[j] = builder_.add_variable(state[j]);
            }
        }

        builder_.create_unconstrained_gate(builder_.blocks.poseidon2_external,
                                           state_indices[0], state_indices[1],
                                           state_indices[2], state_indices[3]);

        return state;
    }

    Builder& builder_;
    std::vector<G1Affine> commitments_;
    std::vector<BN254Fr> scalars_;
    BN254Fr evaluation_point_;
    G1Affine quotient_commitment_;
    FF alpha_ = FF(0);
    bool poly_equiv_enabled_ = false;

    PairingPoints<curve::BN254> pairing_points_;
    PolyEquivData poly_equiv_data_;
};

} // namespace bb
