#define IPA_FUZZ_TEST
#include "ipa.hpp"
#include "./mock_transcript.hpp"
#include "barretenberg/commitment_schemes/commitment_key.hpp"
#include "barretenberg/commitment_schemes/verification_key.hpp"
#include "barretenberg/polynomials/polynomial.hpp"
#include "barretenberg/srs/factories/file_crs_factory.hpp"

namespace bb {

constexpr size_t COMMITMENT_TEST_NUM_POINTS = 32;
using Curve = curve::Grumpkin;
std::shared_ptr<CommitmentKey<Curve>> ck;
std::shared_ptr<VerifierCommitmentKey<Curve>> vk;
class ProxyCaller {
  public:
    template <typename Transcript>
    static void compute_opening_proof_internal(const std::shared_ptr<CommitmentKey<Curve>>& ck,
                                               const OpeningPair<Curve>& opening_pair,
                                               const Polynomial<Curve::ScalarField>& polynomial,
                                               const std::shared_ptr<Transcript>& transcript)
    {
        IPA<Curve>::compute_opening_proof_internal(ck, opening_pair, polynomial, transcript);
    }
    template <typename Transcript>
    static bool verify_internal(const std::shared_ptr<VerifierCommitmentKey<Curve>>& vk,
                                const OpeningClaim<Curve>& opening_claim,
                                const std::shared_ptr<Transcript>& transcript)
    {
        return IPA<Curve>::verify_internal(vk, opening_claim, transcript);
    }
};
} // namespace bb
extern "C" void LLVMFuzzerInitialize(int*, char***)
{
    srs::init_grumpkin_crs_factory("../srs_db/ignition");
    ck = std::make_shared<CommitmentKey<Curve>>(COMMITMENT_TEST_NUM_POINTS);
    auto crs_factory = std::make_shared<srs::factories::FileCrsFactory<curve::Grumpkin>>("../srs_db/grumpkin",
                                                                                         COMMITMENT_TEST_NUM_POINTS);
    vk = std::make_shared<VerifierCommitmentKey<curve::Grumpkin>>(COMMITMENT_TEST_NUM_POINTS, crs_factory);
}

#define IPA_FUZZ_TEST
#include "ipa.hpp"

/**
 * @brief A very primitive fuzzer for the composer
 *
 * @details Super-slow. Shouldn't be run on its own. First you need to run the circuit builder fuzzer, then minimize the
 * corpus and then just use that corpus
 *
 */
extern "C" int LLVMFuzzerTestOneInput(const unsigned char* data, size_t size)
{
    using Fr = grumpkin::fr;
    using Polynomial = Polynomial<Fr>;
    // We need data
    if (size == 0) {
        return 0;
    }
    const auto log_size = static_cast<size_t>(data[0]);
    if (log_size == 0 || log_size > 2) {
        return 0;
    }
    auto offset = data + 1;
    const auto num_challenges = log_size + 1;
    // How much data do we need?
    // Challenges: sizeof(uint256_t) * num_challenges + 1 for montgomery switch
    // Polynomial: sizeof(uint256_t) * size + 1 per size/8
    // Eval x: sizeof(uint256_t) + 1
    const size_t polynomial_size = (1 << log_size);

    const size_t expected_size = sizeof(uint256_t) * (num_challenges + polynomial_size + 1) + 3 +
                                 (polynomial_size < 8 ? 1 : polynomial_size / 8);
    if (size < expected_size) {
        return 0;
    }

    auto transcript = std::make_shared<MockTranscript>();

    std::vector<uint256_t> challenges(num_challenges);
    const auto control_byte = offset[0];
    offset++;
    for (size_t i = 0; i < num_challenges; i++) {
        auto challenge = *(uint256_t*)(offset);

        if ((control_byte >> i) & 1) {
            auto field_challenge = Fr(challenge);

            challenge = field_challenge.from_montgomery_form();
        }
        if (Fr(challenge).is_zero()) {
            return 0;
        }
        challenges[i] = challenge;
        offset += sizeof(uint256_t);
    }
    transcript->reset(challenges);
    std::vector<uint256_t> polynomial_coefficients(polynomial_size);
    for (size_t i = 0; i < polynomial_size; i++) {
        polynomial_coefficients[i] = *(uint256_t*)(offset);
        offset += sizeof(uint256_t);
    }
    Polynomial poly(polynomial_size);
    for (size_t i = 0; i < polynomial_size; i++) {
        auto b = offset[i / 8];

        poly[i] = polynomial_coefficients[i];
        if ((b >> (i % 8)) & 1) {
            poly[i].self_from_montgomery_form();
        }
    }
    offset += (polynomial_size < 8 ? 1 : polynomial_size / 8);
    auto x = Fr(*(uint256_t*)offset);
    offset += sizeof(uint256_t);
    if (offset[0] & 1) {
        x.self_from_montgomery_form();
    }
    auto const opening_pair = OpeningPair<Curve>{ x, poly.evaluate(x) };
    auto const opening_claim = OpeningClaim<Curve>{ opening_pair, ck->commit(poly) };
    ProxyCaller::compute_opening_proof_internal(ck, opening_pair, poly, transcript);
    transcript->reset_for_verifier();

    if (!ProxyCaller::verify_internal(vk, opening_claim, transcript)) {
        return 1;
    }
    return 0;
}