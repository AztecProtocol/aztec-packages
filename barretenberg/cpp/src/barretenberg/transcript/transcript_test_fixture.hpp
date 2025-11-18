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

template <typename Codec, typename HashFunction> class TranscriptTest : public ::testing::Test {
  public:
    using Transcript = BaseTranscript<Codec, HashFunction>;
    using FF = typename Codec::fr;
    using BF = typename Codec::fq;
    using bn254_commitment = typename Codec::bn254_commitment;
    using grumpkin_commitment = typename Codec::grumpkin_commitment;

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
            builder = BuilderType();
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
            EXPECT_TRUE(CircuitChecker::check(builder));
        }
    }

    auto export_proof(NativeTranscript& prover)
    {
        if constexpr (IsStdlib) {
            return stdlib::Proof<BuilderType>(builder, prover.export_proof());
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

    void test_scalar_send_receive()
    {
        NativeTranscript prover;
        bb::fr scalar_value = bb::fr::random_element();
        prover.send_to_verifier("scalar", scalar_value);

        Transcript verifier;
        verifier.load_proof(export_proof(prover));
        auto received = verifier.template receive_from_prover<FF>("scalar");

        BB_ASSERT_EQ(scalar_value, to_native(received));
        check_circuit();
    }

    void test_basefield_send_receive()
    {
        NativeTranscript prover;
        bb::fq basefield_value = bb::fq::random_element();
        prover.send_to_verifier("basefield", basefield_value);

        Transcript verifier;
        verifier.load_proof(export_proof(prover));
        auto received = verifier.template receive_from_prover<BF>("basefield");

        BB_ASSERT_EQ(basefield_value, bb::fq(to_native(received)));
        check_circuit();
    }

    void test_bn254_commitment_send_receive()
    {
        NativeTranscript prover;
        auto commitment = curve::BN254::AffineElement::random_element();
        prover.send_to_verifier("commitment", commitment);

        Transcript verifier;
        verifier.load_proof(export_proof(prover));
        auto received = verifier.template receive_from_prover<bn254_commitment>("commitment");

        BB_ASSERT_EQ(commitment, to_native(received));
        check_circuit();
    }

    void test_grumpkin_commitment_send_receive()
    {
        NativeTranscript prover;
        auto commitment = curve::Grumpkin::AffineElement::random_element();
        prover.send_to_verifier("commitment", commitment);

        Transcript verifier;
        verifier.load_proof(export_proof(prover));
        auto received = verifier.template receive_from_prover<grumpkin_commitment>("commitment");

        BB_ASSERT_EQ(commitment, to_native(received));
        check_circuit();
    }

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
            BB_ASSERT_EQ(array_value[i], to_native(received[i]));
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

        // For stdlib, grumpkin::fr is serialized as bigfield
        auto received = verifier.template receive_from_prover<std::array<BF, SIZE>>("grumpkin_array");
        for (size_t i = 0; i < SIZE; ++i) {
            // Convert bigfield back to grumpkin::fr via uint256_t
            grumpkin::fr received_value(to_native(received[i]));
            BB_ASSERT_EQ(array_value[i], received_value);
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
            BB_ASSERT_EQ(evals[i], to_native(received.evaluations[i]));
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
                BB_ASSERT_EQ(evals[i], received_value);
            }
        } else {
            auto received =
                verifier.template receive_from_prover<bb::Univariate<grumpkin::fr, LENGTH>>("grumpkin_univariate");
            for (size_t i = 0; i < LENGTH; ++i) {
                BB_ASSERT_EQ(evals[i], received.evaluations[i]);
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
        auto received = verifier.template receive_from_prover<bn254_commitment>("infinity");

        if constexpr (IsStdlib) {
            EXPECT_TRUE(received.is_point_at_infinity().get_value());
        } else {
            EXPECT_TRUE(received.is_point_at_infinity());
        }
        BB_ASSERT_EQ(infinity, to_native(received));
        check_circuit();
    }

    void test_grumpkin_infinity_handling()
    {
        NativeTranscript prover;
        auto infinity = curve::Grumpkin::AffineElement::infinity();
        prover.send_to_verifier("infinity", infinity);

        Transcript verifier;
        verifier.load_proof(export_proof(prover));
        auto received = verifier.template receive_from_prover<grumpkin_commitment>("infinity");

        if constexpr (IsStdlib) {
            EXPECT_TRUE(received.is_point_at_infinity().get_value());
        } else {
            EXPECT_TRUE(received.is_point_at_infinity());
        }
        BB_ASSERT_EQ(infinity, to_native(received));
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
        [[maybe_unused]] auto data_recv = verifier.template receive_from_prover<FF>("data");
        auto verifier_alpha = verifier.template get_challenge<FF>("alpha");

        // Round 1
        auto recv_scalar = verifier.template receive_from_prover<FF>("scalar");
        auto recv_commitment = verifier.template receive_from_prover<bn254_commitment>("commitment");
        auto [verifier_beta, verifier_gamma] = verifier.template get_challenges<FF>(challenge_labels);

        // Verify values match
        BB_ASSERT_EQ(scalar, to_native(recv_scalar));
        BB_ASSERT_EQ(commitment, to_native(recv_commitment));
        BB_ASSERT_EQ(prover_alpha, to_native(verifier_alpha));
        BB_ASSERT_EQ(prover_beta, to_native(verifier_beta));
        BB_ASSERT_EQ(prover_gamma, to_native(verifier_gamma));

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
        verifier.template receive_from_prover<bn254_commitment>("commitment");
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

        BB_ASSERT_NEQ(challenge1, bb::fr::zero());
        BB_ASSERT_NEQ(challenge2, bb::fr::zero());
        BB_ASSERT_NEQ(challenge3, bb::fr::zero());
    }

    void test_hash_buffer_consistency()
    {
        NativeTranscript prover;
        Transcript verifier;
        prover.add_to_hash_buffer("a", bb::fr(1));

        FF one(1);
        if constexpr (IsStdlib) {
            one.convert_constant_to_fixed_witness(&builder);
        }
        verifier.add_to_hash_buffer("a", one);
        auto prover_chal = prover.template get_challenge<bb::fr>("alpha");
        auto verifier_chal = verifier.template get_challenge<FF>("alpha");
        BB_ASSERT_EQ(prover_chal, to_native(verifier_chal));
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

        BB_ASSERT_EQ(verifier_transcript->test_get_proof_start(), 0);
        BB_ASSERT_EQ(prover_transcript->template get_challenge<bb::fr>("test_challenge"),
                     verifier_transcript->template get_challenge<bb::fr>("test_challenge"));
    }

    void test_tampering_detection()
    {
        class TamperableTranscript : public NativeTranscript {
          public:
            void tamper_proof_data() { proof_data[0] += 1; }
        };

        TamperableTranscript prover;
        Transcript verifier;

        prover.enable_manifest();
        verifier.enable_manifest();

        prover.add_to_hash_buffer("vk_field", bb::fr(1));

        prover.send_to_verifier("random_field", bb::fr::random_element());
        prover.send_to_verifier("random_grumpkin", curve::Grumpkin::AffineElement::random_element());
        prover.send_to_verifier("random_bn254", curve::BN254::AffineElement::random_element());

        auto prover_challenge = prover.template get_challenge<bb::fr>("alpha");

        prover.tamper_proof_data();

        FF one(1);
        if constexpr (IsStdlib) {
            one.convert_constant_to_fixed_witness(&builder);
        }
        verifier.load_proof(export_proof(prover));
        verifier.add_to_hash_buffer("vk_field", one);
        verifier.template receive_from_prover<FF>("random_field");
        verifier.template receive_from_prover<grumpkin_commitment>("random_grumpkin");
        verifier.template receive_from_prover<bn254_commitment>("random_bn254");
        auto verifier_challenge = verifier.template get_challenge<FF>("alpha");

        EXPECT_EQ(prover.get_manifest(), verifier.get_manifest());
        BB_ASSERT_NEQ(prover_challenge, to_native(verifier_challenge));
    }

    BuilderType builder;
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

// NOTE: Keccak transcripts use U256Codec and are tested separately via flavor-specific tests
// (e.g., UltraKeccakFlavor tests) because they require different data representation (uint256_t vs fr)
using TranscriptTypes = ::testing::
    Types<std::pair<NativeCodec, NativeHash>, std::pair<UltraCodec, UltraHash>, std::pair<MegaCodec, MegaHash>>;

} // namespace bb::test
