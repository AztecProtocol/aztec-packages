#pragma once

#include "barretenberg/chonk/chonk_proof.hpp"
#include "barretenberg/common/assert.hpp"
#include "barretenberg/constants.hpp"
#include "barretenberg/ecc/curves/bn254/bn254.hpp"
#include "barretenberg/ecc/curves/grumpkin/grumpkin.hpp"
#include "barretenberg/eccvm/eccvm_flavor.hpp"
#include "barretenberg/flavor/mega_zk_flavor.hpp"
#include "barretenberg/honk/proof_length.hpp"
#include "barretenberg/honk/proof_system/types/proof.hpp"
#include "barretenberg/translator_vm/translator_flavor.hpp"
#include <cstddef>
#include <cstdint>
#include <vector>

namespace bb {

namespace proof_compression_detail {

// =========================================================================
// Walk functions — define proof layouts once for compress/decompress
// =========================================================================

/**
 * @brief Walk a MegaZK Oink-only proof (BN254).
 * @details In the batched protocol, the MegaZK proof contains only the Oink phase:
 * public inputs followed by witness commitments. Sumcheck and PCS are in the joint proof.
 */
template <typename ScalarFn, typename CommitmentFn>
static constexpr void walk_mega_zk_oink_proof(ScalarFn&& process_scalar,
                                              CommitmentFn&& process_commitment,
                                              size_t num_public_inputs)
{
    // Public inputs
    for (size_t i = 0; i < num_public_inputs; i++) {
        process_scalar();
    }
    // Witness commitments (NUM_WITNESS_ENTITIES)
    for (size_t i = 0; i < MegaZKFlavor::NUM_WITNESS_ENTITIES; i++) {
        process_commitment();
    }
}

/**
 * @brief Walk a Merge proof (42 Fr, all BN254).
 * @details Layout from MergeProver::construct_proof.
 */
template <typename ScalarFn, typename CommitmentFn>
static constexpr void walk_merge_proof(ScalarFn&& process_scalar, CommitmentFn&& process_commitment)
{
    // 4 merged table commitments
    for (size_t i = 0; i < 4; i++) {
        process_commitment();
    }
    // Reversed batched left tables commitment
    process_commitment();
    // 4 left + 4 right + 4 merged table evaluations + 1 reversed eval = 13 scalars
    for (size_t i = 0; i < 13; i++) {
        process_scalar();
    }
    // Shplonk Q + KZG W
    process_commitment();
    process_commitment();
}

/**
 * @brief Walk an ECCVM proof (all Grumpkin).
 * @details Layout from ECCVMFlavor::PROOF_LENGTH formula and ECCVM prover code.
 *          Grumpkin RoundUnivariateHandler commits to each round univariate and sends
 *          2 evaluations (at 0 and 1), interleaved per round.
 */
template <typename ScalarFn, typename CommitmentFn>
static constexpr void walk_eccvm_proof(ScalarFn&& process_scalar, CommitmentFn&& process_commitment)
{
    constexpr size_t log_n = CONST_ECCVM_LOG_N;
    constexpr size_t num_witness = ECCVMFlavor::NUM_WITNESS_ENTITIES + ECCVMFlavor::NUM_MASKING_POLYNOMIALS;

    // Witness commitments (wires + derived + masking poly)
    for (size_t i = 0; i < num_witness; i++) {
        process_commitment();
    }
    // Libra concatenation commitment
    process_commitment();
    // Libra sum
    process_scalar();
    // Sumcheck round univariates: per round, Grumpkin commits then sends 2 evaluations
    for (size_t i = 0; i < log_n; i++) {
        process_commitment(); // univariate commitment for round i
        process_scalar();     // eval at 0 for round i
        process_scalar();     // eval at 1 for round i
    }
    // Sumcheck evaluations
    for (size_t i = 0; i < ECCVMFlavor::NUM_ALL_ENTITIES; i++) {
        process_scalar();
    }
    // Libra claimed evaluation
    process_scalar();
    // Libra grand sum + quotient commitments
    process_commitment();
    process_commitment();
    // Small IPA evaluations (for sumcheck libra)
    for (size_t i = 0; i < NUM_SMALL_IPA_TRANSCRIPT_EVALS; i++) {
        process_scalar();
    }

    // --- Translation section ---
    // Translator concatenated masking commitment
    process_commitment();
    // 5 translation evaluations (op, Px, Py, z1, z2)
    for (size_t i = 0; i < NUM_TRANSLATION_EVALUATIONS; i++) {
        process_scalar();
    }
    // Translation masking term evaluation
    process_scalar();
    // Translation grand sum + quotient commitments
    process_commitment();
    process_commitment();
    // Translation SmallSubgroupIPA evaluations
    for (size_t i = 0; i < NUM_SMALL_IPA_TRANSCRIPT_EVALS; i++) {
        process_scalar();
    }
    // TripleIPA pow-tensor masking commitment + evaluation (sent by prove_pow_masking_opening_claim, just before
    // the single Shplonk that batches all univariate claims).
    process_commitment();
    process_scalar();
    // Shplonk Q
    process_commitment();
}

/**
 * @brief Walk a TripleIPA proof (ECCVMFlavor::TRIPLE_IPA_PROOF_LENGTH Fr, all Grumpkin).
 */
template <typename ScalarFn, typename CommitmentFn>
static constexpr void walk_ipa_proof(ScalarFn&& process_scalar, CommitmentFn&& process_commitment)
{
    // TripleIPA cross sums
    for (size_t i = 0; i < 3; i++) {
        process_scalar();
    }
    // L and R commitments per round
    for (size_t i = 0; i < CONST_ECCVM_LOG_N; i++) {
        process_commitment(); // L_i
        process_commitment(); // R_i
    }
    // G_0 commitment
    process_commitment();
    // a_0 scalar
    process_scalar();
}

/**
 * @brief Walk the joint proof (translator oink + joint sumcheck + joint PCS, all BN254).
 * @details Produced by BatchedHonkTranslatorProver::prove(). Contains the translator's
 * pre-sumcheck commitments, a joint 17-round sumcheck over MegaZK + translator, and a
 * joint Shplemini/KZG PCS reduction.
 */
template <typename ScalarFn, typename CommitmentFn>
static constexpr void walk_joint_proof(ScalarFn&& process_scalar, CommitmentFn&& process_commitment)
{
    constexpr size_t JOINT_LOG_N = TranslatorFlavor::CONST_TRANSLATOR_LOG_N; // 17
    // --- Translator Oink ---
    // Gemini masking poly commitment
    process_commitment();
    // Wire commitments: concatenated + ordered range constraints
    for (size_t i = 0; i < TranslatorFlavor::NUM_COMMITMENTS_IN_PROOF; i++) {
        process_commitment();
    }
    // Z_PERM commitment
    process_commitment();

    // --- Joint Sumcheck (Libra header) ---
    // Libra concatenation commitment
    process_commitment();
    // Libra sum
    process_scalar();

    // Committed sumcheck rounds 0..JOINT_LOG_N-1 (commitment + 2 evals per round)
    for (size_t round = 0; round < JOINT_LOG_N; round++) {
        // Minicircuit evaluations sent at round LOG_MINI_CIRCUIT_SIZE - 1
        if (round == TranslatorFlavor::LOG_MINI_CIRCUIT_SIZE) {
            for (size_t j = 0; j < TranslatorFlavor::NUM_MINICIRCUIT_EVALUATIONS; j++) {
                process_scalar();
            }
        }
        process_commitment(); // round univariate commitment
        process_scalar();     // eval at 0
        process_scalar();     // eval at 1
    }

    // MegaZK evaluations (sent after all sumcheck rounds)
    for (size_t i = 0; i < MegaZKFlavor::NUM_ALL_ENTITIES; i++) {
        process_scalar();
    }

    // Translator evaluations (sent after all rounds)
    for (size_t i = 0; i < TranslatorFlavor::NUM_FULL_CIRCUIT_EVALUATIONS; i++) {
        process_scalar();
    }

    // --- Joint Sumcheck (Libra footer) ---
    // Libra claimed evaluation
    process_scalar();
    // Libra grand sum + quotient commitments
    process_commitment();
    process_commitment();

    // --- Joint PCS ---
    // Gemini fold commitments
    for (size_t i = 0; i < JOINT_LOG_N - 1; i++) {
        process_commitment();
    }
    // Gemini fold evaluations
    for (size_t i = 0; i < JOINT_LOG_N; i++) {
        process_scalar();
    }
    // Small IPA evaluations
    for (size_t i = 0; i < NUM_SMALL_IPA_TRANSCRIPT_EVALS; i++) {
        process_scalar();
    }
    // Shplonk Q + KZG W
    process_commitment();
    process_commitment();
}

/**
 * @brief Walk a full Chonk proof (5 sub-proofs across two curves).
 * @details Layout: hiding_oink (BN254) | merge (BN254) | eccvm (Grumpkin) | ipa (Grumpkin) | joint (BN254)
 */
template <typename BN254ScalarFn, typename BN254CommFn, typename GrumpkinScalarFn, typename GrumpkinCommFn>
static constexpr void walk_chonk_proof(BN254ScalarFn&& bn254_scalar,
                                       BN254CommFn&& bn254_comm,
                                       GrumpkinScalarFn&& grumpkin_scalar,
                                       GrumpkinCommFn&& grumpkin_comm,
                                       size_t mega_num_public_inputs)
{
    walk_mega_zk_oink_proof(bn254_scalar, bn254_comm, mega_num_public_inputs);
    walk_merge_proof(bn254_scalar, bn254_comm);
    walk_eccvm_proof(grumpkin_scalar, grumpkin_comm);
    walk_ipa_proof(grumpkin_scalar, grumpkin_comm);
    walk_joint_proof(bn254_scalar, bn254_comm);
}

// =========================================================================
// Walk count validation — the walkers define the compression layout. These checks keep that layout in sync with
// the corresponding proof-length constants.
// =========================================================================

// Fr-elements per element type for each curve
static constexpr size_t BN254_FRS_PER_SCALAR = 1;
static constexpr size_t BN254_FRS_PER_COMM = 4;      // Fq x,y each as (lo,hi) Fr pair
static constexpr size_t GRUMPKIN_FRS_PER_SCALAR = 2; // Fq stored as (lo,hi) Fr pair
static constexpr size_t GRUMPKIN_FRS_PER_COMM = 2;   // Fr x,y coordinates

struct WalkCounts {
    size_t scalars = 0;
    size_t commitments = 0;

    constexpr size_t field_elements(size_t scalar_frs, size_t commitment_frs) const
    {
        return scalars * scalar_frs + commitments * commitment_frs;
    }
};

template <typename WalkFn> static constexpr WalkCounts count_walk(WalkFn walk)
{
    WalkCounts counts;
    walk([&] { ++counts.scalars; }, [&] { ++counts.commitments; });
    return counts;
}

template <typename WalkFn> static constexpr size_t count_bn254_frs(WalkFn walk)
{
    return count_walk(walk).field_elements(BN254_FRS_PER_SCALAR, BN254_FRS_PER_COMM);
}

template <typename WalkFn> static constexpr size_t count_grumpkin_frs(WalkFn walk)
{
    return count_walk(walk).field_elements(GRUMPKIN_FRS_PER_SCALAR, GRUMPKIN_FRS_PER_COMM);
}

static constexpr size_t EXPECTED_HIDING_OINK_FRS =
    count_bn254_frs([](auto&& scalar, auto&& commitment) { walk_mega_zk_oink_proof(scalar, commitment, 0); });
static_assert(EXPECTED_HIDING_OINK_FRS == ProofLength::Oink<MegaZKFlavor>::LENGTH_WITHOUT_PUB_INPUTS);

static constexpr size_t EXPECTED_MERGE_FRS =
    count_bn254_frs([](auto&& scalar, auto&& commitment) { walk_merge_proof(scalar, commitment); });
static_assert(EXPECTED_MERGE_FRS == MERGE_PROOF_SIZE);

static constexpr size_t EXPECTED_ECCVM_FRS =
    count_grumpkin_frs([](auto&& scalar, auto&& commitment) { walk_eccvm_proof(scalar, commitment); });
static_assert(EXPECTED_ECCVM_FRS == ECCVMFlavor::PROOF_LENGTH);

static constexpr size_t EXPECTED_IPA_FRS =
    count_grumpkin_frs([](auto&& scalar, auto&& commitment) { walk_ipa_proof(scalar, commitment); });
static_assert(EXPECTED_IPA_FRS == ECCVMFlavor::TRIPLE_IPA_PROOF_LENGTH);

static constexpr size_t EXPECTED_JOINT_FRS =
    count_bn254_frs([](auto&& scalar, auto&& commitment) { walk_joint_proof(scalar, commitment); });

// Cross-check: walk-based count must match ChonkProof's structural constants
static_assert(EXPECTED_HIDING_OINK_FRS + EXPECTED_MERGE_FRS + EXPECTED_ECCVM_FRS + EXPECTED_IPA_FRS +
                  EXPECTED_JOINT_FRS ==
              ChonkProof::PROOF_LENGTH_WITHOUT_PUB_INPUTS);

} // namespace proof_compression_detail

/**
 * @brief Compresses Chonk proofs from vector<fr> to compact byte representations.
 *
 * Compression techniques:
 *   1. Point compression: store only x-coordinate + sign bit (instead of x and y)
 *   2. Fq-as-u256: store each Fq coordinate as 32 bytes (instead of 2 Fr for lo/hi split)
 *   3. Fr-as-u256: store each Fr scalar as 32 bytes (uniform encoding)
 *
 * Every element compresses to exactly 32 bytes regardless of type:
 *   - BN254 commitment (4 Fr → 32 bytes): point compression on Fq coordinates
 *   - BN254 scalar (1 Fr → 32 bytes): direct u256 encoding
 *   - Grumpkin commitment (2 Fr → 32 bytes): point compression on Fr coordinates
 *   - Grumpkin scalar (2 Fr → 32 bytes): reconstruct Fq, write as u256
 */
class ProofCompressor {
    using Fr = curve::BN254::ScalarField;
    using Fq = curve::BN254::BaseField;

    static constexpr uint256_t SIGN_BIT_MASK = uint256_t(1) << 255;

    // Fq values are stored as (lo, hi) Fr pairs split at 2*NUM_LIMB_BITS = 136 bits.
    static constexpr uint64_t NUM_LIMB_BITS = 68;
    static constexpr uint64_t FQ_SPLIT_BITS = NUM_LIMB_BITS * 2; // 136

    /** @brief True if y is in the "upper half" of its field, used for point compression sign bit. */
    template <typename Field> static bool y_is_negative(const Field& y)
    {
        return uint256_t(y) > (uint256_t(Field::modulus) - 1) / 2;
    }

    // =========================================================================
    // Serialization helpers
    // =========================================================================

    static void write_u256(std::vector<uint8_t>& out, const uint256_t& val)
    {
        for (int i = 31; i >= 0; --i) {
            out.push_back(static_cast<uint8_t>(val.data[i / 8] >> (8 * (i % 8))));
        }
    }

    static uint256_t read_u256(const std::vector<uint8_t>& data, size_t& pos)
    {
        if (pos + 32 > data.size()) {
            throw_or_abort("proof_compression: read_u256 out of bounds");
        }
        uint256_t val{ 0, 0, 0, 0 };
        for (int i = 31; i >= 0; --i) {
            val.data[i / 8] |= static_cast<uint64_t>(data[pos++]) << (8 * (i % 8));
        }
        return val;
    }

    static Fq reconstruct_fq(const Fr& lo, const Fr& hi)
    {
        return Fq(uint256_t(lo) + (uint256_t(hi) << FQ_SPLIT_BITS));
    }

    static std::pair<Fr, Fr> split_fq(const Fq& val)
    {
        constexpr uint256_t LOWER_MASK = (uint256_t(1) << FQ_SPLIT_BITS) - 1;
        const uint256_t v = uint256_t(val);
        return { Fr(v & LOWER_MASK), Fr(v >> FQ_SPLIT_BITS) };
    }

  public:
    static constexpr size_t BYTES_PER_COMPRESSED_ELEMENT = 32;
    static constexpr size_t BN254_SCALAR_FIELD_ELEMENTS = proof_compression_detail::BN254_FRS_PER_SCALAR;
    static constexpr size_t BN254_COMMITMENT_FIELD_ELEMENTS = proof_compression_detail::BN254_FRS_PER_COMM;
    static constexpr size_t GRUMPKIN_SCALAR_FIELD_ELEMENTS = proof_compression_detail::GRUMPKIN_FRS_PER_SCALAR;
    static constexpr size_t GRUMPKIN_COMMITMENT_FIELD_ELEMENTS = proof_compression_detail::GRUMPKIN_FRS_PER_COMM;
    static constexpr size_t ECCVM_PROOF_FIELD_ELEMENTS = proof_compression_detail::EXPECTED_ECCVM_FRS;

    static constexpr size_t compressed_size_bytes_for_elements(size_t compressed_elements)
    {
        return compressed_elements * BYTES_PER_COMPRESSED_ELEMENT;
    }

    static size_t eccvm_compressed_element_count()
    {
        size_t count = 0;
        auto counter = [&]() { count++; };
        proof_compression_detail::walk_eccvm_proof(counter, counter);
        return count;
    }

    static size_t eccvm_compressed_size_bytes()
    {
        return compressed_size_bytes_for_elements(eccvm_compressed_element_count());
    }

    /**
     * @brief Count the total compressed elements for a Chonk proof.
     * Each element (scalar or commitment, either curve) compresses to exactly 32 bytes.
     */
    static size_t compressed_element_count(size_t mega_num_public_inputs = 0)
    {
        size_t count = 0;
        auto counter = [&]() { count++; };
        proof_compression_detail::walk_chonk_proof(counter, counter, counter, counter, mega_num_public_inputs);
        return count;
    }

    /**
     * @brief Derive mega_num_public_inputs from compressed proof size.
     * @param compressed_bytes Total size of the compressed proof in bytes.
     */
    static size_t compressed_mega_num_public_inputs(size_t compressed_bytes)
    {
        if (compressed_bytes % 32 != 0) {
            throw_or_abort("proof_compression: compressed size not aligned to 32 bytes");
        }
        size_t total_elements = compressed_bytes / 32;
        size_t fixed_elements = compressed_element_count(0);
        if (total_elements < fixed_elements) {
            throw_or_abort("proof_compression: compressed proof too short");
        }
        return total_elements - fixed_elements;
    }

    // =========================================================================
    // Chonk proof compression
    // =========================================================================

    static std::vector<uint8_t> compress_chonk_proof(const ChonkProof& proof)
    {
        auto flat = proof.to_field_elements();
        std::vector<uint8_t> out;
        out.reserve(flat.size() * 32); // upper bound: every element compresses to 32 bytes
        size_t offset = 0;

        // BN254 callbacks
        auto bn254_scalar = [&]() { write_u256(out, uint256_t(flat[offset++])); };

        auto bn254_comm = [&]() {
            bool is_infinity = flat[offset].is_zero() && flat[offset + 1].is_zero() && flat[offset + 2].is_zero() &&
                               flat[offset + 3].is_zero();
            if (is_infinity) {
                write_u256(out, uint256_t(0));
                offset += 4;
                return;
            }

            Fq x = reconstruct_fq(flat[offset], flat[offset + 1]);
            Fq y = reconstruct_fq(flat[offset + 2], flat[offset + 3]);
            offset += 4;

            uint256_t x_val = uint256_t(x);
            if (y_is_negative(y)) {
                x_val |= SIGN_BIT_MASK;
            }
            write_u256(out, x_val);
        };

        // Grumpkin callbacks
        // Grumpkin commitments have coordinates in BN254::ScalarField (Fr), so x and y are each 1 Fr.
        auto grumpkin_comm = [&]() {
            Fr x = flat[offset];
            Fr y = flat[offset + 1];
            offset += 2;

            if (x.is_zero() && y.is_zero()) {
                write_u256(out, uint256_t(0));
                return;
            }

            uint256_t x_val = uint256_t(x);
            if (y_is_negative(y)) {
                x_val |= SIGN_BIT_MASK;
            }
            write_u256(out, x_val);
        };

        // Grumpkin scalars are Fq values stored as (lo, hi) Fr pairs
        auto grumpkin_scalar = [&]() {
            Fq fq_val = reconstruct_fq(flat[offset], flat[offset + 1]);
            offset += 2;
            write_u256(out, uint256_t(fq_val));
        };

        size_t mega_num_pub_inputs =
            proof.hiding_oink_proof.size() - ProofLength::Oink<MegaZKFlavor>::LENGTH_WITHOUT_PUB_INPUTS;
        proof_compression_detail::walk_chonk_proof(
            bn254_scalar, bn254_comm, grumpkin_scalar, grumpkin_comm, mega_num_pub_inputs);
        if (offset != flat.size()) {
            throw_or_abort("proof_compression: compress did not consume all proof elements");
        }
        return out;
    }

    static ChonkProof decompress_chonk_proof(const std::vector<uint8_t>& compressed, size_t mega_num_public_inputs)
    {
        HonkProof flat;
        size_t pos = 0;

        // BN254 callbacks
        auto bn254_scalar = [&]() {
            uint256_t raw = read_u256(compressed, pos);
            if (raw >= Fr::modulus) {
                throw_or_abort("proof_compression: BN254 scalar out of range");
            }
            flat.emplace_back(raw);
        };

        auto bn254_comm = [&]() {
            uint256_t raw = read_u256(compressed, pos);
            bool sign = (raw & SIGN_BIT_MASK) != 0;
            uint256_t x_val = raw & ~SIGN_BIT_MASK;

            // Point-at-infinity is encoded as all zeros (x=0, sign=false).
            // Unambiguous because x=0 is not on BN254
            if (x_val == uint256_t(0) && !sign) {
                for (int j = 0; j < 4; j++) {
                    flat.emplace_back(Fr::zero());
                }
                return;
            }

            if (x_val >= Fq::modulus) {
                throw_or_abort("proof_compression: BN254 x-coordinate out of range");
            }
            Fq x(x_val);
            Fq y_squared = x * x * x + Bn254G1Params::b;
            auto [is_square, y] = y_squared.sqrt();
            if (!is_square) {
                throw_or_abort("proof_compression: BN254 point not on curve");
            }

            if (y_is_negative(y) != sign) {
                y = -y;
            }

            auto [x_lo, x_hi] = split_fq(x);
            auto [y_lo, y_hi] = split_fq(y);
            flat.emplace_back(x_lo);
            flat.emplace_back(x_hi);
            flat.emplace_back(y_lo);
            flat.emplace_back(y_hi);
        };

        // Grumpkin callbacks
        auto grumpkin_comm = [&]() {
            uint256_t raw = read_u256(compressed, pos);
            bool sign = (raw & SIGN_BIT_MASK) != 0;
            uint256_t x_val = raw & ~SIGN_BIT_MASK;

            // Point-at-infinity is encoded as all zeros (x=0, sign=false).
            // Unambiguous because x=0 is not on Grumpkin
            if (x_val == uint256_t(0) && !sign) {
                flat.emplace_back(Fr::zero());
                flat.emplace_back(Fr::zero());
                return;
            }

            if (x_val >= Fr::modulus) {
                throw_or_abort("proof_compression: Grumpkin x-coordinate out of range");
            }
            Fr x(x_val);
            Fr y_squared = x * x * x + grumpkin::G1Params::b;
            auto [is_square, y] = y_squared.sqrt();
            if (!is_square) {
                throw_or_abort("proof_compression: Grumpkin point not on curve");
            }

            if (y_is_negative(y) != sign) {
                y = -y;
            }

            flat.emplace_back(x);
            flat.emplace_back(y);
        };

        auto grumpkin_scalar = [&]() {
            uint256_t raw = read_u256(compressed, pos);
            if (raw >= Fq::modulus) {
                throw_or_abort("proof_compression: Grumpkin scalar out of range");
            }
            Fq fq_val(raw);
            auto [lo, hi] = split_fq(fq_val);
            flat.emplace_back(lo);
            flat.emplace_back(hi);
        };

        proof_compression_detail::walk_chonk_proof(
            bn254_scalar, bn254_comm, grumpkin_scalar, grumpkin_comm, mega_num_public_inputs);
        if (pos != compressed.size()) {
            throw_or_abort("proof_compression: decompression did not consume all bytes");
        }
        return ChonkProof::from_field_elements(flat);
    }
};

} // namespace bb
