// === AUDIT STATUS ===
// internal:    { status: not started, auditors: [], date: YYYY-MM-DD }
// external_1:  { status: not started, auditors: [], date: YYYY-MM-DD }
// external_2:  { status: not started, auditors: [], date: YYYY-MM-DD }
// =====================

#include "barretenberg/srs/global_crs.hpp"
#define IPA_FUZZ_TEST
#include "./mock_transcript.hpp"
#include "barretenberg/commitment_schemes/commitment_key.hpp"
#include "barretenberg/commitment_schemes/verification_key.hpp"
#include "ipa.hpp"

namespace bb {

// We actually only use 4, because fuzzing is very slow
constexpr size_t COMMITMENT_TEST_NUM_POINTS = 32;
using Curve = curve::Grumpkin;
CommitmentKey<Curve> ck;
VerifierCommitmentKey<Curve> vk;
/**
 * @brief Class that allows us to call internal IPA methods, because it's friendly
 *
 */
class ProxyCaller {
  public:
    template <typename Transcript>
    static void compute_opening_proof_internal(const CommitmentKey<Curve>& ck,
                                               const ProverOpeningClaim<Curve>& opening_claim,
                                               const std::shared_ptr<Transcript>& transcript,
                                               size_t poly_log_size)
    {
        if (poly_log_size == 1) {
            IPA<Curve, 1>::compute_opening_proof_internal(ck, opening_claim, transcript);
        }
        if (poly_log_size == 2) {
            IPA<Curve, 2>::compute_opening_proof_internal(ck, opening_claim, transcript);
        }
    }
    template <typename Transcript>
    static bool verify_internal(const VerifierCommitmentKey<Curve>& vk,
                                const OpeningClaim<Curve>& opening_claim,
                                const std::shared_ptr<Transcript>& transcript,
                                size_t poly_log_size)
    {
        if (poly_log_size == 1) {
            return IPA<Curve, 1>::reduce_verify_internal_native(vk, opening_claim, transcript);
        }
        if (poly_log_size == 2) {
            return IPA<Curve, 2>::reduce_verify_internal_native(vk, opening_claim, transcript);
        }
        return false;
    }
};
} // namespace bb

using namespace bb;

/**
 * @brief Initialize SRS, commitment key, verification key
 *
 */
extern "C" void LLVMFuzzerInitialize(int*, char***)
{
    srs::init_file_crs_factory(srs::bb_crs_path());
    ck = CommitmentKey<Curve>(COMMITMENT_TEST_NUM_POINTS);
    vk = VerifierCommitmentKey<curve::Grumpkin>(COMMITMENT_TEST_NUM_POINTS);
}

// This define is needed to make ProxyClass a friend of IPA
#define IPA_FUZZ_TEST
#include "ipa.hpp"

// Read uint256_t from raw bytes.
// Don't use dereference casts, since the data may be not aligned and it causes segfault
uint256_t read_uint256(const uint8_t* data, size_t buffer_size = 32)
{
    ASSERT(buffer_size <= 32);

    uint64_t parts[4] = { 0, 0, 0, 0 };

    for (size_t i = 0; i < (buffer_size + 7) / 8; i++) {
        size_t to_read = (buffer_size - i * 8) < 8 ? buffer_size - i * 8 : 8;
        std::memcpy(&parts[i], data + i * 8, to_read);
    }
    return uint256_t(parts[0], parts[1], parts[2], parts[3]);
}

/**
 * @brief A fuzzer for the IPA primitive
 *
 * @details Parses the given data as a polynomial, a sequence of challenges for the transcript and the evaluation point,
 * then opens the polynomial with IPA and verifies that the opening was correct
 */
extern "C" int LLVMFuzzerTestOneInput(const unsigned char* data, size_t size)
{
    using Fr = grumpkin::fr;
    using Polynomial = Polynomial<Fr>;
    // We need data
    if (size == 0) {
        return 0;
    }
    // Get the logarighmic size of polynomial
    const auto log_size = static_cast<size_t>(data[0]);
    // More than 4 is so bad
    if (log_size == 0 || log_size > 2) {
        return 0;
    }
    const auto* offset = data + 1;
    const auto num_challenges = log_size + 1;
    // How much data do we need?
    // Challenges: sizeof(uint256_t) * num_challenges + 1 for montgomery switch
    // Polynomial: sizeof(uint256_t) * size + 1 per size/8
    // Eval x: sizeof(uint256_t) + 1
    const size_t polynomial_size = (1 << log_size);
    // Bytes controlling montgomery switching for polynomial coefficients
    const size_t polynomial_control_bytes = (polynomial_size < 8 ? 1 : polynomial_size / 8);
    const size_t expected_size =
        1 /* log_size */ + 1 /* control_byte */ + num_challenges * sizeof(uint256_t) /* challenges */
        + polynomial_size * sizeof(uint256_t) /* polynomial coefficients */ + sizeof(uint256_t) /* evaluation */ +
        1 /* eval montgomery switch */ + polynomial_control_bytes;
    if (size < expected_size) {
        return 0;
    }

    // Initialize transcript
    auto transcript = std::make_shared<MockTranscript>();

    std::vector<uint256_t> challenges(num_challenges);
    // Get the byte, where bits control if we parse challenges in montgomery form or not
    const auto control_byte = offset[0];
    offset++;
    // Get challenges one by one
    for (size_t i = 0; i < num_challenges; i++) {
        auto challenge = read_uint256(offset);

        if (((control_byte >> i) & 1) == 1) {
            // If control byte says so, parse the value from input as if it's internal state of the field (already
            // converted to montgomery). This allows modifying the state directly
            auto field_challenge = Fr(challenge);

            challenge = field_challenge.from_montgomery_form();
        }
        // Challenges can't be zero
        if (Fr(challenge).is_zero()) {
            return 0;
        }
        challenges[i] = challenge;
        offset += sizeof(uint256_t);
    }

    // Put challenges into the transcript
    transcript->initialize(challenges);

    // Parse polynomial
    std::vector<uint256_t> polynomial_coefficients(polynomial_size);
    for (size_t i = 0; i < polynomial_size; i++) {
        polynomial_coefficients[i] = read_uint256(offset);
        offset += sizeof(uint256_t);
    }
    Polynomial poly(polynomial_size);

    // Convert from montgomery if the appropriate bit is set
    for (size_t i = 0; i < polynomial_size; i++) {
        auto b = offset[i / 8];

        poly.at(i) = polynomial_coefficients[i];
        if (((b >> (i % 8)) & 1) == 1) {
            poly.at(i).self_from_montgomery_form();
        }
    }

    offset += polynomial_control_bytes;
    // Parse the x we are evaluating on
    auto x = Fr(read_uint256(offset));
    offset += sizeof(uint256_t);
    if ((offset[0] & 1) != 0) {
        x.self_from_montgomery_form();
    }
    auto const opening_pair = OpeningPair<Curve>{ x, poly.evaluate(x) };
    auto const opening_claim = OpeningClaim<Curve>{ opening_pair, ck.commit(poly) };
    ProxyCaller::compute_opening_proof_internal(ck, { poly, opening_pair }, transcript, log_size);

    // Reset challenge indices
    transcript->reset_indices();

    // Should verify
    if (!ProxyCaller::verify_internal(vk, opening_claim, transcript, log_size)) {
        return 1;
    }
    return 0;
}
