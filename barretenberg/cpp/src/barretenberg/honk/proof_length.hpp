// === AUDIT STATUS ===
// internal:    { status: Planned, auditors: [], commit: }
// external_1:  { status: not started, auditors: [], commit: }
// external_2:  { status: not started, auditors: [], commit: }
// =====================

#pragma once

#include "barretenberg/commitment_schemes/small_subgroup_ipa/small_subgroup_ipa_utils.hpp"
#include "barretenberg/constants.hpp"
#include "barretenberg/ecc/fields/field_conversion.hpp"
#include "barretenberg/flavor/flavor.hpp"
#include <cstddef>

namespace bb::ProofLength {

/**
 * @brief Codec constants computed from Flavor types.
 * @details Uses Flavor::Codec to compute serialization sizes. All flavors define Codec:
 *          - Native flavors: FrCodec (or U256Codec for Keccak)
 *          - Recursive flavors: StdlibCodec<FF>
 *          Both codecs return the same values for calc_num_fields since proof serialization is identical.
 */
template <typename Flavor> struct CodecConstants {
    using Codec = typename Flavor::Codec;
    using Commitment = typename Flavor::Commitment;
    using FF = typename Flavor::FF;

    static constexpr size_t num_frs_in_comm = Codec::template calc_num_fields<Commitment>();
    static constexpr size_t num_frs_in_scalar = Codec::template calc_num_fields<FF>();
};

/**
 * @brief Computes Oink proof length from flavor traits.
 * @details Oink sends witness commitments (W_L, W_R, W_O, etc.).
 *          For ZK flavors, NUM_WITNESS_ENTITIES includes the Gemini masking polynomial commitment.
 */
template <typename Flavor> struct Oink : CodecConstants<Flavor> {
    using CodecConstants<Flavor>::num_frs_in_comm;

    static constexpr size_t LENGTH_WITHOUT_PUB_INPUTS = Flavor::NUM_WITNESS_ENTITIES * num_frs_in_comm;
};

/**
 * @brief Computes Sumcheck proof length from flavor traits.
 * @details Sumcheck sends univariates (one per round) and final evaluations.
 *          ZK flavors add Libra masking data.
 */
template <typename Flavor> struct Sumcheck : CodecConstants<Flavor> {
    using CodecConstants<Flavor>::num_frs_in_scalar;
    using CodecConstants<Flavor>::num_frs_in_comm;

    static constexpr size_t LENGTH(size_t log_n)
    {
        size_t base_length =
            /* univariates */ (log_n * Flavor::BATCHED_RELATION_PARTIAL_LENGTH * num_frs_in_scalar) +
            /* evaluations */ (Flavor::NUM_ALL_ENTITIES * num_frs_in_scalar);

        if constexpr (Flavor::HasZK) {
            // Libra adds: concatenation_commitment, grand_sum_commitment, quotient_commitment (3 comms)
            //           + Sum, claimed_evaluation (2 scalars)
            return base_length + (3 * num_frs_in_comm) + (2 * num_frs_in_scalar);
        } else {
            return base_length;
        }
    }
};

/**
 * @brief Computes Shplemini/PCS proof length from flavor traits.
 * @details Shplemini reduces multivariate opening claims to a single KZG check.
 *          Contains: Gemini fold commitments, Gemini evaluations, Shplonk Q, KZG W.
 *          ZK flavors add small IPA evaluations for masking.
 */
template <typename Flavor> struct Shplemini : CodecConstants<Flavor> {
    using CodecConstants<Flavor>::num_frs_in_scalar;
    using CodecConstants<Flavor>::num_frs_in_comm;

    static constexpr size_t LENGTH(size_t log_n)
    {
        size_t base_length =
            /* Gemini:FOLD_1..FOLD_{log_n-1} */ ((log_n - 1) * num_frs_in_comm) +
            /* Gemini:a_1..a_{log_n} */ (log_n * num_frs_in_scalar) +
            /* Shplonk:Q */ num_frs_in_comm +
            /* KZG:W */ num_frs_in_comm;

        if constexpr (Flavor::HasZK) {
            // ZK adds: Libra evaluations (concatenation, shifted_grand_sum, grand_sum, quotient).
            return base_length + (NUM_SMALL_IPA_TRANSCRIPT_EVALS * num_frs_in_scalar);
        } else {
            return base_length;
        }
    }
};

/**
 * @brief Full Honk proof layout (used by UltraVerifier).
 * @details Honk proof = Oink + Sumcheck + Shplemini.
 *          Note: IPA proof is handled separately for rollup flavors (appended by prover, split by verifier).
 */
template <typename Flavor> struct Honk {
    static constexpr size_t LENGTH_WITHOUT_PUB_INPUTS(size_t log_n)
    {
        return Oink<Flavor>::LENGTH_WITHOUT_PUB_INPUTS + Sumcheck<Flavor>::LENGTH(log_n) +
               Shplemini<Flavor>::LENGTH(log_n);
    }

    /**
     * @brief Derive num_public_inputs from proof size.
     * @param proof_size Total proof size in field elements
     * @param log_n Log of circuit size (VIRTUAL_LOG_N for padded, vk->log_circuit_size for non-padded)
     */
    static size_t derive_num_public_inputs(size_t proof_size, size_t log_n)
    {
        const size_t overhead = LENGTH_WITHOUT_PUB_INPUTS(log_n);
        BB_ASSERT_GTE(proof_size, overhead, "Honk proof too short to derive num_public_inputs");
        return proof_size - overhead;
    }

    /**
     * @brief Expected proof size for API-level validation (excludes user public inputs).
     * @details Computes: IO::PUBLIC_INPUTS_SIZE + Honk proof + IPA proof (if IO::HasIPA)
     * @tparam IO The IO type (DefaultIO, RollupIO, etc.)
     */
    template <typename IO> static constexpr size_t expected_proof_size(size_t log_n)
    {
        size_t size = IO::PUBLIC_INPUTS_SIZE + LENGTH_WITHOUT_PUB_INPUTS(log_n);
        if constexpr (IO::HasIPA) {
            size += IPA_PROOF_LENGTH;
        }
        return size;
    }
};

/**
 * @brief Hypernova instance-to-accumulator proof layout.
 * @details Used when converting a single instance to an accumulator (first circuit in folding).
 *          Contains: Oink + Sumcheck (no Shplemini - PCS is deferred).
 *          Note: gate challenge is derived via get_dyadic_powers_of_challenge, not sent.
 */
template <typename Flavor> struct HypernovaInstanceToAccum {
    static constexpr size_t LENGTH_WITHOUT_PUB_INPUTS(size_t log_n)
    {
        return Oink<Flavor>::LENGTH_WITHOUT_PUB_INPUTS + Sumcheck<Flavor>::LENGTH(log_n);
    }

    static size_t derive_num_public_inputs(size_t proof_size, size_t log_n)
    {
        const size_t overhead = LENGTH_WITHOUT_PUB_INPUTS(log_n);
        BB_ASSERT_GTE(proof_size, overhead, "HypernovaInstanceToAccum proof too short to derive num_public_inputs");
        return proof_size - overhead;
    }
};

/**
 * @brief MultilinearBatching proof layout (used by HyperNova folding).
 * @details Batches two accumulators (from previous fold + incoming instance) into one.
 *          It only contains the sumcheck proof as the accumulator data is received as inputs by the verifier's methods.
 */
template <typename Flavor> struct MultilinearBatching : CodecConstants<Flavor> {
    using CodecConstants<Flavor>::num_frs_in_scalar;
    using CodecConstants<Flavor>::num_frs_in_comm;

    static constexpr size_t LENGTH = Sumcheck<Flavor>::LENGTH(Flavor::VIRTUAL_LOG_N);
};

/**
 * @brief Hypernova folding proof layout.
 * @details Used when folding an incoming instance with an existing accumulator.
 *          Contains: instance-to-accumulator proof (Oink + Sumcheck) + MultilinearBatching proof.
 *          Note: gate challenges are derived, not sent in the proof.
 * @tparam Flavor The outer flavor (e.g., MegaFlavor)
 * @tparam BatchingFlavor The batching flavor (MultilinearBatchingFlavor_<NumClaims>)
 */
template <typename Flavor, typename BatchingFlavor> struct HypernovaFolding {
    static constexpr size_t LENGTH_WITHOUT_PUB_INPUTS(size_t log_n)
    {
        return HypernovaInstanceToAccum<Flavor>::LENGTH_WITHOUT_PUB_INPUTS(log_n) +
               MultilinearBatching<BatchingFlavor>::LENGTH;
    }

    static size_t derive_num_public_inputs(size_t proof_size, size_t log_n)
    {
        const size_t overhead = LENGTH_WITHOUT_PUB_INPUTS(log_n);
        BB_ASSERT_GTE(proof_size, overhead, "HypernovaFolding proof too short to derive num_public_inputs");
        return proof_size - overhead;
    }
};

} // namespace bb::ProofLength
