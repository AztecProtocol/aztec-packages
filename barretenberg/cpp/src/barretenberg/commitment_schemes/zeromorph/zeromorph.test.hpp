// #include "../commitment_key.test.hpp"
// #include "barretenberg/commitment_schemes/ipa/ipa.hpp"
// #include "barretenberg/commitment_schemes/kzg/kzg.hpp"
// #include "barretenberg/transcript/transcript.hpp"
// #include "zeromorph.hpp"

// namespace bb {

// template <class PCS> class ZeroMorphTest : public CommitmentTest<typename PCS::Curve::NativeCurve> {
//   public:
//     using Curve = typename PCS::Curve;
//     using Fr = typename Curve::ScalarField;
//     using Polynomial = bb::Polynomial<Fr>;
//     using Commitment = typename Curve::AffineElement;
//     using GroupElement = typename Curve::Element;
//     using VerifierAccumulator = typename PCS::VerifierAccumulator;
//     using NativeCurve = typename Curve::NativeCurve;
//     using NativePCS = std::conditional_t<std::same_as<NativeCurve, curve::BN254>, KZG<NativeCurve>,
//     IPA<NativeCurve>>; using ZeroMorphProver = ZeroMorphProver_<NativePCS>; using ZeroMorphVerifier =
//     ZeroMorphVerifier_<PCS>;

//     // Evaluate Phi_k(x) = \sum_{i=0}^k x^i using the direct inefficent formula
//     Fr Phi(Fr challenge, size_t subscript)
//     {
//         size_t length = 1 << subscript;
//         auto result = Fr(0);
//         for (size_t idx = 0; idx < length; ++idx) {
//             result += challenge.pow(idx);
//         }
//         return result;
//     }

//     /**
//      * @brief Construct and verify ZeroMorph proof of batched multilinear evaluation with shifts
//      * @details The goal is to construct and verify a single batched multilinear evaluation proof for m polynomials
//      f_i
//      * and l polynomials h_i. It is assumed that the h_i are shifts of polynomials g_i (the "to-be-shifted"
//      * polynomials), which are a subset of the f_i. This is what is encountered in practice. We accomplish this using
//      * evaluations of h_i but commitments to only their unshifted counterparts g_i (which we get for "free" since
//      * commitments [g_i] are contained in the set of commitments [f_i]).
//      *
//      */
//     bool execute_zeromorph_protocol(size_t NUM_UNSHIFTED, size_t NUM_SHIFTED)
//     {
//         constexpr size_t N = 2;
//         constexpr size_t log_N = numeric::get_msb(N);

//         std::vector<Fr> u_challenge = this->random_evaluation_point(log_N);

//         // Construct some random multilinear polynomials f_i and their evaluations v_i = f_i(u)
//         std::vector<Polynomial> f_polynomials; // unshifted polynomials
//         std::vector<Fr> v_evaluations;
//         for (size_t i = 0; i < NUM_UNSHIFTED; ++i) {
//             f_polynomials.emplace_back(this->random_polynomial(N));
//             f_polynomials[i][0] = Fr(0); // ensure f is "shiftable"
//             v_evaluations.emplace_back(f_polynomials[i].evaluate_mle(u_challenge));
//         }

//         // Construct some "shifted" multilinear polynomials h_i as the left-shift-by-1 of f_i
//         std::vector<Polynomial> g_polynomials; // to-be-shifted polynomials
//         std::vector<Polynomial> h_polynomials; // shifts of the to-be-shifted polynomials
//         std::vector<Fr> w_evaluations;
//         for (size_t i = 0; i < NUM_SHIFTED; ++i) {
//             g_polynomials.emplace_back(f_polynomials[i]);
//             h_polynomials.emplace_back(g_polynomials[i].shifted());
//             w_evaluations.emplace_back(h_polynomials[i].evaluate_mle(u_challenge));
//             // ASSERT_EQ(w_evaluations[i], g_polynomials[i].evaluate_mle(u_challenge, /* shift = */ true));
//         }

//         // Compute commitments [f_i]
//         std::vector<Commitment> f_commitments;
//         for (size_t i = 0; i < NUM_UNSHIFTED; ++i) {
//             f_commitments.emplace_back(this->commit(f_polynomials[i]));
//         }

//         // Construct container of commitments of the "to-be-shifted" polynomials [g_i] (= [f_i])
//         std::vector<Commitment> g_commitments;
//         for (size_t i = 0; i < NUM_SHIFTED; ++i) {
//             g_commitments.emplace_back(f_commitments[i]);
//         }

//         // Initialize an empty NativeTranscript
//         auto prover_transcript = NativeTranscript::prover_init_empty();

//         // Execute Prover protocol
//         // LONDONTODO: these tests need to be updated
//         ZeroMorphProver::prove(N,
//                                RefVector(f_polynomials),
//                                RefVector(g_polynomials),
//                                RefVector(v_evaluations),
//                                RefVector(w_evaluations),
//                                u_challenge,
//                                this->commitment_key,
//                                prover_transcript);

//         auto verifier_transcript = NativeTranscript::verifier_init_empty(prover_transcript);

//         VerifierAccumulator result;
//         bool verified = false;
//         if constexpr (std::same_as<PCS, KZG<curve::BN254>>) {
//             // Execute Verifier protocol without the need for vk prior the final check
//             result = ZeroMorphVerifier::verify(N,
//                                                RefVector(f_commitments), // unshifted
//                                                RefVector(g_commitments), // to-be-shifted
//                                                RefVector(v_evaluations), // unshifted
//                                                RefVector(w_evaluations), // shifted
//                                                u_challenge,
//                                                verifier_transcript);
//             verified = this->vk()->pairing_check(result[0], result[1]);
//         } else {
//             // Execute Verifier protocol with vk
//             result = ZeroMorphVerifier::verify(N,
//                                                RefVector(f_commitments), // unshifted
//                                                RefVector(g_commitments), // to-be-shifted
//                                                RefVector(v_evaluations), // unshifted
//                                                RefVector(w_evaluations), // shifted
//                                                u_challenge,
//                                                this->vk(),
//                                                verifier_transcript);
//             verified = result;
//         }

//         // The prover and verifier manifests should agree
//         EXPECT_EQ(prover_transcript->get_manifest(), verifier_transcript->get_manifest());

//         return verified;
//     }
// };

// template <class PCS> class ZeroMorphWithConcatenationTest : public CommitmentTest<typename PCS::Curve> {
//   public:
//     using Curve = typename PCS::Curve;
//     using Fr = typename Curve::ScalarField;
//     using Polynomial = bb::Polynomial<Fr>;
//     using Commitment = typename Curve::AffineElement;
//     using GroupElement = typename Curve::Element;
//     using VerifierAccumulator = typename PCS::VerifierAccumulator;
//     using ZeroMorphProver = ZeroMorphProver_<PCS>;
//     using ZeroMorphVerifier = ZeroMorphVerifier_<PCS>;

//     // Evaluate Phi_k(x) = \sum_{i=0}^k x^i using the direct inefficent formula
//     Fr Phi(Fr challenge, size_t subscript)
//     {
//         size_t length = 1 << subscript;
//         auto result = Fr(0);
//         for (size_t idx = 0; idx < length; ++idx) {
//             result += challenge.pow(idx);
//         }
//         return result;
//     }

//     /**
//      * @brief Construct and verify ZeroMorph proof of batched multilinear evaluation with shifts and concatenation
//      * @details The goal is to construct and verify a single batched multilinear evaluation proof for m polynomials
//      f_i,
//      * l polynomials h_i and o groups of polynomials where each polynomial is concatenated from several shorter
//      * polynomials. It is assumed that the h_i are shifts of polynomials g_i (the "to-be-shifted" polynomials), which
//      * are a subset of the f_i. This is what is encountered in practice. We accomplish this using evaluations of h_i
//      but
//      * commitments to only their unshifted counterparts g_i (which we get for "free" since commitments [g_i] are
//      * contained in the set of commitments [f_i]).
//      *
//      */
//     bool execute_zeromorph_protocol(size_t NUM_UNSHIFTED, size_t NUM_SHIFTED, size_t NUM_CONCATENATED)
//     {
//         bool verified = false;
//         size_t concatenation_index = 2;
//         size_t N = 64;
//         size_t MINI_CIRCUIT_N = N / concatenation_index;
//         size_t log_N = numeric::get_msb(N);

//         auto u_challenge = this->random_evaluation_point(log_N);

//         // Construct some random multilinear polynomials f_i and their evaluations v_i = f_i(u)
//         std::vector<Polynomial> f_polynomials; // unshifted polynomials
//         std::vector<Fr> v_evaluations;
//         for (size_t i = 0; i < NUM_UNSHIFTED; ++i) {
//             f_polynomials.emplace_back(this->random_polynomial(N));
//             f_polynomials[i][0] = Fr(0); // ensure f is "shiftable"
//             v_evaluations.emplace_back(f_polynomials[i].evaluate_mle(u_challenge));
//         }

//         // Construct some "shifted" multilinear polynomials h_i as the left-shift-by-1 of f_i
//         std::vector<Polynomial> g_polynomials; // to-be-shifted polynomials
//         std::vector<Polynomial> h_polynomials; // shifts of the to-be-shifted polynomials
//         std::vector<Fr> w_evaluations;
//         for (size_t i = 0; i < NUM_SHIFTED; ++i) {
//             g_polynomials.emplace_back(f_polynomials[i]);
//             h_polynomials.emplace_back(g_polynomials[i].shifted());
//             w_evaluations.emplace_back(h_polynomials[i].evaluate_mle(u_challenge));
//             // ASSERT_EQ(w_evaluations[i], g_polynomials[i].evaluate_mle(u_challenge, /* shift = */ true));
//         }

//         // Polynomials "chunks" that are concatenated in the PCS
//         std::vector<std::vector<Polynomial>> concatenation_groups;

//         // Concatenated polynomials
//         std::vector<Polynomial> concatenated_polynomials;

//         // Evaluations of concatenated polynomials
//         std::vector<Fr> c_evaluations;

//         // For each polynomial to be concatenated
//         for (size_t i = 0; i < NUM_CONCATENATED; ++i) {
//             std::vector<Polynomial> concatenation_group;
//             Polynomial concatenated_polynomial(N);
//             // For each chunk
//             for (size_t j = 0; j < concatenation_index; j++) {
//                 Polynomial chunk_polynomial(N);
//                 // Fill the chunk polynomial with random values and appropriately fill the space in
//                 // concatenated_polynomial
//                 for (size_t k = 0; k < MINI_CIRCUIT_N; k++) {
//                     // Chunks should be shiftable
//                     auto tmp = Fr(0);
//                     if (k > 0) {
//                         tmp = Fr::random_element(this->engine);
//                     }
//                     chunk_polynomial[k] = tmp;
//                     concatenated_polynomial[j * MINI_CIRCUIT_N + k] = tmp;
//                 }
//                 concatenation_group.emplace_back(chunk_polynomial);
//             }
//             // Store chunks
//             concatenation_groups.emplace_back(concatenation_group);
//             // Store concatenated polynomial
//             concatenated_polynomials.emplace_back(concatenated_polynomial);
//             // Get evaluation
//             c_evaluations.emplace_back(concatenated_polynomial.evaluate_mle(u_challenge));
//         }

//         // Compute commitments [f_i]
//         std::vector<Commitment> f_commitments;
//         for (size_t i = 0; i < NUM_UNSHIFTED; ++i) {
//             f_commitments.emplace_back(this->commit(f_polynomials[i]));
//         }

//         // Construct container of commitments of the "to-be-shifted" polynomials [g_i] (= [f_i])
//         std::vector<Commitment> g_commitments;
//         for (size_t i = 0; i < NUM_SHIFTED; ++i) {
//             g_commitments.emplace_back(f_commitments[i]);
//         }

//         // Compute commitments of all polynomial chunks
//         std::vector<std::vector<Commitment>> concatenation_groups_commitments;
//         for (size_t i = 0; i < NUM_CONCATENATED; ++i) {
//             std::vector<Commitment> concatenation_group_commitment;
//             for (size_t j = 0; j < concatenation_index; j++) {
//                 concatenation_group_commitment.emplace_back(this->commit(concatenation_groups[i][j]));
//             }
//             concatenation_groups_commitments.emplace_back(concatenation_group_commitment);
//         }

//         // Initialize an empty NativeTranscript
//         auto prover_transcript = NativeTranscript::prover_init_empty();

//         // Execute Prover protocol
//         ZeroMorphProver::prove(N,
//                                RefVector(f_polynomials), // unshifted
//                                RefVector(g_polynomials), // to-be-shifted
//                                RefVector(v_evaluations), // unshifted
//                                RefVector(w_evaluations), // shifted
//                                u_challenge,
//                                this->commitment_key,
//                                prover_transcript,
//                                RefVector(concatenated_polynomials),
//                                RefVector(c_evaluations),
//                                to_vector_of_ref_vectors(concatenation_groups));

//         auto verifier_transcript = NativeTranscript::verifier_init_empty(prover_transcript);
//         VerifierAccumulator result;
//         if constexpr (std::same_as<PCS, KZG<curve::BN254>>) {
//             // Execute Verifier protocol without the need for vk prior the final check
//             result = ZeroMorphVerifier::verify(N,
//                                                RefVector(f_commitments), // unshifted
//                                                RefVector(g_commitments), // to-be-shifted
//                                                RefVector(v_evaluations), // unshifted
//                                                RefVector(w_evaluations), // shifted
//                                                u_challenge,
//                                                verifier_transcript,
//                                                to_vector_of_ref_vectors(concatenation_groups_commitments),
//                                                RefVector(c_evaluations));
//             verified = this->vk()->pairing_check(result[0], result[1]);

//         } else {
//             // Execute Verifier protocol with vk
//             result = ZeroMorphVerifier::verify(N,
//                                                RefVector(f_commitments), // unshifted
//                                                RefVector(g_commitments), // to-be-shifted
//                                                RefVector(v_evaluations), // unshifted
//                                                RefVector(w_evaluations), // shifted
//                                                u_challenge,
//                                                this->vk(),
//                                                verifier_transcript,
//                                                to_vector_of_ref_vectors(concatenation_groups_commitments),
//                                                RefVector(c_evaluations));
//             verified = result;
//         }

//         // The prover and verifier manifests should agree
//         EXPECT_EQ(prover_transcript->get_manifest(), verifier_transcript->get_manifest());
//         return verified;
//     }
// };

// } // namespace bb
