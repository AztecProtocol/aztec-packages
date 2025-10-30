// Unified transcript test infrastructure
// Templates on Codec and HashFn to match BaseTranscript structure

#pragma once
#include "barretenberg/circuit_checker/circuit_checker.hpp"
#include "barretenberg/ecc/fields/field_conversion.hpp"
#include "barretenberg/stdlib/primitives/biggroup/biggroup.hpp"
#include "barretenberg/stdlib/primitives/field/field_conversion.hpp"
#include "barretenberg/stdlib/proof/proof.hpp"
#include "barretenberg/stdlib_circuit_builders/mega_circuit_builder.hpp"
#include "barretenberg/stdlib_circuit_builders/ultra_circuit_builder.hpp"
#include "barretenberg/transcript/transcript.hpp"
#include <gtest/gtest.h>

namespace bb::test {

// ============================================================================
// Unified Test Fixture - Templates on Codec and HashFn like BaseTranscript
// ============================================================================

template <typename Codec, typename HashFn> class UnifiedTranscriptTest : public ::testing::Test {
  public:
    using Transcript = BaseTranscript<Codec, HashFn>;
    using FF = typename Codec::fr;
    using BF = typename Codec::fq;

    // FrCodec uses bn254_point/grumpkin_point, StdlibCodec uses bn254_element/grumpkin_element
    template <typename C, typename = void> struct GetBN254Type {
        using type = typename C::bn254_point;
    };
    template <typename C> struct GetBN254Type<C, std::void_t<typename C::bn254_element>> {
        using type = typename C::bn254_element;
    };

    template <typename C, typename = void> struct GetGrumpkinType {
        using type = typename C::grumpkin_point;
    };
    template <typename C> struct GetGrumpkinType<C, std::void_t<typename C::grumpkin_element>> {
        using type = typename C::grumpkin_element;
    };

    using BN254Commitment = typename GetBN254Type<Codec>::type;
    using GrumpkinCommitment = typename GetGrumpkinType<Codec>::type;

    static constexpr bool IsStdlib = Transcript::in_circuit;

    // Helper to get Builder type or int for native
    template <typename C, typename = void> struct GetBuilder {
        using type = int; // Dummy type for native
    };
    template <typename C> struct GetBuilder<C, std::void_t<typename C::Builder>> {
        using type = typename C::Builder;
    };

    // For stdlib transcripts, we need a builder
    using BuilderType = typename GetBuilder<Codec>::type;

    void SetUp() override
    {
        if constexpr (IsStdlib) {
            builder = std::make_unique<BuilderType>();
        }
    }

    void TearDown() override
    {
        if constexpr (IsStdlib) {
            builder.reset();
        }
    }

    // ========================================================================
    // Helper Methods
    // ========================================================================

    void skip_if_native(const char* reason)
    {
        if constexpr (!IsStdlib) {
            GTEST_SKIP() << reason;
        }
    }

    void skip_if_stdlib(const char* reason)
    {
        if constexpr (IsStdlib) {
            GTEST_SKIP() << reason;
        }
    }

    void check_circuit()
    {
        if constexpr (IsStdlib) {
            // Only check circuit for stdlib transcripts with valid builder
            if (builder) {
                EXPECT_TRUE(CircuitChecker::check(*builder));
            }
        }
    }

    auto export_proof(NativeTranscript& prover)
    {
        if constexpr (IsStdlib) {
            return stdlib::Proof<BuilderType>(*builder, prover.export_proof());
        } else {
            return prover.export_proof();
        }
    }

    template <typename T> auto to_native(const T& val) const
    {
        if constexpr (IsStdlib) {
            return val.get_value();
        } else {
            return val;
        }
    }

    // ========================================================================
    // Reusable Test Methods
    // ========================================================================

    void test_scalar_send_receive()
    {
        NativeTranscript prover;
        bb::fr scalar_value = bb::fr::random_element();
        prover.send_to_verifier("scalar", scalar_value);

        Transcript verifier;
        verifier.load_proof(export_proof(prover));
        auto received = verifier.template receive_from_prover<FF>("scalar");

        EXPECT_EQ(scalar_value, to_native(received));
        check_circuit();
    }

    void test_basefield_send_receive()
    {
        skip_if_stdlib("Native-only - stdlib bigfield tested via grumpkin arrays");

        NativeTranscript prover;
        bb::fq basefield_value = bb::fq::random_element();
        prover.send_to_verifier("basefield", basefield_value);

        NativeTranscript verifier;
        verifier.load_proof(prover.export_proof());
        auto received = verifier.template receive_from_prover<bb::fq>("basefield");

        EXPECT_EQ(basefield_value, received);
    }

    void test_bn254_commitment_send_receive()
    {
        NativeTranscript prover;
        auto commitment = curve::BN254::AffineElement::random_element();
        prover.send_to_verifier("commitment", commitment);

        Transcript verifier;
        verifier.load_proof(export_proof(prover));
        auto received = verifier.template receive_from_prover<BN254Commitment>("commitment");

        EXPECT_EQ(commitment, to_native(received));
        check_circuit();
    }

    void test_grumpkin_commitment_send_receive()
    {
        NativeTranscript prover;
        auto commitment = curve::Grumpkin::AffineElement::random_element();
        prover.send_to_verifier("commitment", commitment);

        Transcript verifier;
        verifier.load_proof(export_proof(prover));
        auto received = verifier.template receive_from_prover<GrumpkinCommitment>("commitment");

        EXPECT_EQ(commitment, to_native(received));
        check_circuit();
    }

    void test_uint32_send_receive() { GTEST_SKIP() << "uint32_t serialization not needed for transcript tests"; }

    template <size_t SIZE> void test_array_send_receive()
    {
        NativeTranscript prover;
        std::array<bb::fr, SIZE> array_value;
        for (auto& val : array_value) {
            val = bb::fr::random_element();
        }
        prover.send_to_verifier("array", array_value);

        Transcript verifier;
        verifier.load_proof(export_proof(prover));
        auto received = verifier.template receive_from_prover<std::array<FF, SIZE>>("array");

        for (size_t i = 0; i < SIZE; ++i) {
            EXPECT_EQ(array_value[i], to_native(received[i]));
        }
        check_circuit();
    }

    template <size_t SIZE> void test_grumpkin_field_array_send_receive()
    {
        NativeTranscript prover;
        std::array<grumpkin::fr, SIZE> array_value;
        for (auto& val : array_value) {
            val = grumpkin::fr::random_element();
        }
        prover.send_to_verifier("grumpkin_array", array_value);

        Transcript verifier;
        verifier.load_proof(export_proof(prover));

        if constexpr (IsStdlib) {
            // For stdlib, grumpkin::fr is serialized as bigfield
            auto received = verifier.template receive_from_prover<std::array<BF, SIZE>>("grumpkin_array");
            for (size_t i = 0; i < SIZE; ++i) {
                // Convert bigfield back to grumpkin::fr via uint256_t
                grumpkin::fr received_value(received[i].get_value());
                EXPECT_EQ(array_value[i], received_value);
            }
        } else {
            auto received = verifier.template receive_from_prover<std::array<grumpkin::fr, SIZE>>("grumpkin_array");
            for (size_t i = 0; i < SIZE; ++i) {
                EXPECT_EQ(array_value[i], received[i]);
            }
        }
        check_circuit();
    }

    template <size_t LENGTH> void test_univariate_send_receive()
    {
        NativeTranscript prover;
        std::array<bb::fr, LENGTH> evals;
        for (auto& eval : evals) {
            eval = bb::fr::random_element();
        }
        bb::Univariate<bb::fr, LENGTH> univariate(evals);
        prover.send_to_verifier("univariate", univariate);

        Transcript verifier;
        verifier.load_proof(export_proof(prover));
        auto received = verifier.template receive_from_prover<bb::Univariate<FF, LENGTH>>("univariate");

        for (size_t i = 0; i < LENGTH; ++i) {
            EXPECT_EQ(evals[i], to_native(received.evaluations[i]));
        }
        check_circuit();
    }

    template <size_t LENGTH> void test_grumpkin_univariate_send_receive()
    {
        NativeTranscript prover;
        std::array<grumpkin::fr, LENGTH> evals;
        for (auto& eval : evals) {
            eval = grumpkin::fr::random_element();
        }
        bb::Univariate<grumpkin::fr, LENGTH> univariate(evals);
        prover.send_to_verifier("grumpkin_univariate", univariate);

        Transcript verifier;
        verifier.load_proof(export_proof(prover));

        if constexpr (IsStdlib) {
            auto received = verifier.template receive_from_prover<bb::Univariate<BF, LENGTH>>("grumpkin_univariate");
            for (size_t i = 0; i < LENGTH; ++i) {
                grumpkin::fr received_value(received.evaluations[i].get_value());
                EXPECT_EQ(evals[i], received_value);
            }
        } else {
            auto received =
                verifier.template receive_from_prover<bb::Univariate<grumpkin::fr, LENGTH>>("grumpkin_univariate");
            for (size_t i = 0; i < LENGTH; ++i) {
                EXPECT_EQ(evals[i], received.evaluations[i]);
            }
        }
        check_circuit();
    }

    void test_bn254_infinity_handling()
    {
        NativeTranscript prover;
        auto infinity = curve::BN254::AffineElement::infinity();
        prover.send_to_verifier("infinity", infinity);

        Transcript verifier;
        verifier.load_proof(export_proof(prover));
        auto received = verifier.template receive_from_prover<BN254Commitment>("infinity");

        if constexpr (IsStdlib) {
            EXPECT_TRUE(received.is_point_at_infinity().get_value());
        } else {
            EXPECT_TRUE(received.is_point_at_infinity());
        }
        EXPECT_EQ(infinity, to_native(received));
        check_circuit();
    }

    void test_grumpkin_infinity_handling()
    {
        NativeTranscript prover;
        auto infinity = curve::Grumpkin::AffineElement::infinity();
        prover.send_to_verifier("infinity", infinity);

        Transcript verifier;
        verifier.load_proof(export_proof(prover));
        auto received = verifier.template receive_from_prover<GrumpkinCommitment>("infinity");

        if constexpr (IsStdlib) {
            EXPECT_TRUE(received.is_point_at_infinity().get_value());
        } else {
            EXPECT_TRUE(received.is_point_at_infinity());
        }
        EXPECT_EQ(infinity, to_native(received));
        check_circuit();
    }

    void test_multi_round_protocol()
    {
        NativeTranscript prover;

        // Round 0
        uint32_t data = 25;
        prover.send_to_verifier("data", data);
        auto prover_alpha = prover.template get_challenge<bb::fr>("alpha");

        // Round 1
        bb::fr scalar = bb::fr::random_element();
        auto commitment = curve::BN254::AffineElement::random_element();
        prover.send_to_verifier("scalar", scalar);
        prover.send_to_verifier("commitment", commitment);
        std::array<std::string, 2> challenge_labels = { "beta", "gamma" };
        auto [prover_beta, prover_gamma] = prover.template get_challenges<bb::fr>(challenge_labels);

        // Verifier side
        Transcript verifier;
        verifier.load_proof(export_proof(prover));

        // Round 0
        auto data_recv = verifier.template receive_from_prover<FF>("data");
        auto verifier_alpha = verifier.template get_challenge<FF>("alpha");

        // Round 1
        auto recv_scalar = verifier.template receive_from_prover<FF>("scalar");
        auto recv_commitment = verifier.template receive_from_prover<BN254Commitment>("commitment");
        auto [verifier_beta, verifier_gamma] = verifier.template get_challenges<FF>(challenge_labels);

        // Verify values match
        EXPECT_EQ(uint32_t(25), uint32_t(to_native(data_recv)));
        EXPECT_EQ(scalar, to_native(recv_scalar));
        EXPECT_EQ(commitment, to_native(recv_commitment));
        EXPECT_EQ(prover_alpha, to_native(verifier_alpha));
        EXPECT_EQ(prover_beta, to_native(verifier_beta));
        EXPECT_EQ(prover_gamma, to_native(verifier_gamma));

        check_circuit();
    }

    void test_manifest_consistency()
    {
        NativeTranscript prover;

        // Simulate a simple protocol
        prover.send_to_verifier("scalar", bb::fr::random_element());
        prover.template get_challenge<bb::fr>("alpha");
        prover.send_to_verifier("commitment", curve::BN254::AffineElement::random_element());
        std::array<std::string, 2> challenge_labels = { "beta", "gamma" };
        prover.template get_challenges<bb::fr>(challenge_labels);

        Transcript verifier;
        verifier.load_proof(export_proof(prover));
        verifier.template receive_from_prover<FF>("scalar");
        verifier.template get_challenge<FF>("alpha");
        verifier.template receive_from_prover<BN254Commitment>("commitment");
        verifier.template get_challenges<FF>(challenge_labels);

        EXPECT_EQ(prover.get_manifest(), verifier.get_manifest());

        check_circuit();
    }

    void test_challenges_are_nonzero()
    {
        NativeTranscript prover;
        prover.send_to_verifier("data", bb::fr::random_element());

        auto challenge1 = prover.template get_challenge<bb::fr>("alpha");
        auto challenge2 = prover.template get_challenge<bb::fr>("beta");
        auto challenge3 = prover.template get_challenge<bb::fr>("gamma");

        EXPECT_NE(challenge1, bb::fr::zero());
        EXPECT_NE(challenge2, bb::fr::zero());
        EXPECT_NE(challenge3, bb::fr::zero());
    }

    void test_challenges_after_data()
    {
        NativeTranscript prover;

        // Send data first
        prover.send_to_verifier("data1", bb::fr::random_element());
        auto challenge1 = prover.template get_challenge<bb::fr>("alpha");

        prover.send_to_verifier("data2", bb::fr::random_element());
        auto challenge2 = prover.template get_challenge<bb::fr>("beta");

        // Challenges should be different
        EXPECT_NE(challenge1, challenge2);
    }

    void test_hash_buffer_consistency()
    {
        NativeTranscript prover, verifier;
        prover.add_to_hash_buffer("a", bb::fr(1));
        verifier.add_to_hash_buffer("a", bb::fr(1));
        auto prover_chal = prover.template get_challenge<bb::fr>("alpha");
        auto verifier_chal = verifier.template get_challenge<bb::fr>("alpha");
        EXPECT_EQ(prover_chal, verifier_chal);
    }

    void test_circuit_creates_constraints()
    {
        if constexpr (!IsStdlib) {
            GTEST_SKIP() << "Stdlib-only - verifies circuit constraints are created";
            return;
        }

        NativeTranscript prover;
        prover.send_to_verifier("scalar", bb::fr::random_element());
        prover.send_to_verifier("commitment", curve::BN254::AffineElement::random_element());
        prover.template get_challenge<bb::fr>("alpha");

        Transcript verifier;
        verifier.load_proof(export_proof(prover));
        verifier.template receive_from_prover<FF>("scalar");
        verifier.template receive_from_prover<BN254Commitment>("commitment");
        verifier.template get_challenge<FF>("alpha");

        check_circuit();
        // Circuit creates gates for Fiat-Shamir hashing
    }

    void test_circuit_size_bounded()
    {
        if constexpr (!IsStdlib) {
            GTEST_SKIP() << "Stdlib-only - tracks circuit size";
            return;
        }

        NativeTranscript prover;
        for (size_t i = 0; i < 5; ++i) {
            prover.send_to_verifier("scalar" + std::to_string(i), bb::fr::random_element());
            prover.template get_challenge<bb::fr>("challenge" + std::to_string(i));
        }

        Transcript verifier;
        verifier.load_proof(export_proof(prover));
        for (size_t i = 0; i < 5; ++i) {
            verifier.template receive_from_prover<FF>("scalar" + std::to_string(i));
            verifier.template get_challenge<FF>("challenge" + std::to_string(i));
        }

        // Circuit created successfully
        check_circuit();
    }

    void test_state_tracking()
    {
        skip_if_stdlib("Native-only - tests internal state management");

        NativeTranscript transcript;
        EXPECT_EQ(transcript.proof_start, 0);
        EXPECT_EQ(transcript.num_frs_written, 0UL);

        bb::fr elt_a = 1377;
        transcript.send_to_verifier("a", elt_a);
        EXPECT_EQ(transcript.proof_start, 0);
        EXPECT_EQ(transcript.num_frs_written, 1UL);

        transcript.export_proof();
        EXPECT_EQ(transcript.proof_start, 1);
        EXPECT_EQ(transcript.num_frs_written, 0UL);
    }

    void test_prover_to_verifier_conversion()
    {
        skip_if_stdlib("Native-only - tests transcript conversion");

        auto prover_transcript = std::make_shared<NativeTranscript>();

        bb::fr elt_a = 100;
        prover_transcript->send_to_verifier("a", elt_a);
        [[maybe_unused]] auto proof1 = prover_transcript->export_proof();

        bb::fr elt_b = 200;
        prover_transcript->send_to_verifier("b", elt_b);
        [[maybe_unused]] auto proof2 = prover_transcript->export_proof();

        auto verifier_transcript =
            NativeTranscript::convert_prover_transcript_to_verifier_transcript(prover_transcript);

        EXPECT_EQ(verifier_transcript->proof_start, 0);
        EXPECT_EQ(prover_transcript->template get_challenge<bb::fr>("test_challenge"),
                  verifier_transcript->template get_challenge<bb::fr>("test_challenge"));
    }

    void test_tampering_detection()
    {
        skip_if_stdlib("Native-only - tests tampering detection");

        class TamperableTranscript : public NativeTranscript {
          public:
            void tamper_proof_data() { proof_data[0] += 1; }
        };

        constexpr size_t NUM_ROUNDS = 3;
        for (size_t round = 0; round < NUM_ROUNDS; ++round) {
            TamperableTranscript prover;
            TamperableTranscript verifier;

            prover.add_to_hash_buffer("vk_field", bb::fr(1));

            prover.send_to_verifier("random_field", bb::fr::random_element());
            prover.send_to_verifier("random_grumpkin", curve::Grumpkin::AffineElement::random_element());
            prover.send_to_verifier("random_bn254", curve::BN254::AffineElement::random_element());

            auto prover_challenge = prover.template get_challenge<bb::fr>("alpha");

            prover.tamper_proof_data();

            verifier.load_proof(prover.export_proof());
            verifier.add_to_hash_buffer("vk_field", bb::fr(1));
            verifier.template receive_from_prover<bb::fr>("random_field");
            auto verifier_challenge = verifier.template get_challenge<bb::fr>("alpha");

            EXPECT_NE(prover_challenge, verifier_challenge)
                << "Tampering should cause challenge mismatch in round " << round;
        }
    }

    std::unique_ptr<BuilderType> builder;
};

// ============================================================================
// Test Type Lists
// ============================================================================

using NativeCodec = FrCodec;
using NativeHash = bb::crypto::Poseidon2<bb::crypto::Poseidon2Bn254ScalarFieldParams>;

using UltraCodec = stdlib::StdlibCodec<stdlib::field_t<UltraCircuitBuilder>>;
using UltraHash = stdlib::poseidon2<UltraCircuitBuilder>;

using MegaCodec = stdlib::StdlibCodec<stdlib::field_t<MegaCircuitBuilder>>;
using MegaHash = stdlib::poseidon2<MegaCircuitBuilder>;

using TranscriptTypes = ::testing::
    Types<std::pair<NativeCodec, NativeHash>, std::pair<UltraCodec, UltraHash>, std::pair<MegaCodec, MegaHash>>;

} // namespace bb::test
