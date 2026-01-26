// === AUDIT STATUS ===
// internal:    { status: Planned, auditors: [], commit: }
// external_1:  { status: not started, auditors: [], commit: }
// external_2:  { status: not started, auditors: [], commit: }
// =====================

#pragma once

#include "barretenberg/constants.hpp"
#include "barretenberg/ecc/fields/field_conversion.hpp"
#include "barretenberg/flavor/flavor.hpp"
#include "barretenberg/flavor/multilinear_batching_flavor.hpp"
#include <cstddef>

namespace bb::ProofLayout {

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
 * @details Oink sends witness commitments. For ZK flavors, NUM_WITNESS_ENTITIES already
 *          includes the gemini masking polynomial commitment.
 */
template <typename Flavor> struct Oink {
    static constexpr size_t num_frs_in_comm = CodecConstants<Flavor>::num_frs_in_comm;

    static constexpr size_t LENGTH_WITHOUT_PUB_INPUTS = Flavor::NUM_WITNESS_ENTITIES * num_frs_in_comm;
};

/**
 * @brief Computes Sumcheck proof length from flavor traits.
 * @details Sumcheck sends univariates and evaluations (+ Libra data for ZK flavors).
 */
template <typename Flavor> struct Sumcheck {
    static constexpr size_t num_frs_in_scalar = CodecConstants<Flavor>::num_frs_in_scalar;
    static constexpr size_t num_frs_in_comm = CodecConstants<Flavor>::num_frs_in_comm;

    static constexpr size_t LENGTH(size_t log_n)
    {
        size_t base_length =
            /* univariates */ (log_n * Flavor::BATCHED_RELATION_PARTIAL_LENGTH * num_frs_in_scalar) +
            /* evaluations */ (Flavor::NUM_ALL_ENTITIES * num_frs_in_scalar);

        if constexpr (Flavor::HasZK) {
            // ZK adds: Libra concatenation commitment, Libra sum, Libra claimed evaluation,
            // Libra grand sum commitment, Libra quotient commitment
            return base_length + (3 * num_frs_in_comm) + (2 * num_frs_in_scalar);
        } else {
            return base_length;
        }
    }
};

/**
 * @brief Computes Shplemini/PCS proof length from flavor traits.
 * @details Shplemini sends Gemini fold commitments, Gemini evaluations, Shplonk Q, KZG W.
 */
template <typename Flavor> struct Shplemini {
    static constexpr size_t num_frs_in_scalar = CodecConstants<Flavor>::num_frs_in_scalar;
    static constexpr size_t num_frs_in_comm = CodecConstants<Flavor>::num_frs_in_comm;

    static constexpr size_t LENGTH(size_t log_n)
    {
        size_t base_length =
            /* Gemini fold commitments */ ((log_n - 1) * num_frs_in_comm) +
            /* Gemini evaluations */ (log_n * num_frs_in_scalar) +
            /* Shplonk Q */ num_frs_in_comm +
            /* KZG W */ num_frs_in_comm;

        if constexpr (Flavor::HasZK) {
            // ZK adds: Small IPA evaluations
            return base_length + (NUM_SMALL_IPA_EVALUATIONS * num_frs_in_scalar);
        } else {
            return base_length;
        }
    }
};

/**
 * @brief Full Honk proof layout (used by UltraVerifier).
 * @details Honk proof = Oink + Sumcheck + Shplemini.
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
    static constexpr size_t derive_num_public_inputs(size_t proof_size, size_t log_n)
    {
        return proof_size - LENGTH_WITHOUT_PUB_INPUTS(log_n);
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

    static constexpr size_t derive_num_public_inputs(size_t proof_size, size_t log_n)
    {
        return proof_size - LENGTH_WITHOUT_PUB_INPUTS(log_n);
    }
};

/**
 * @brief MultilinearBatching proof layout (used by HyperNova folding).
 * @details Contains: accumulator commitments, challenges, evaluations, and batching sumcheck.
 *          Reuses Sumcheck<Flavor>::LENGTH for the sumcheck portion.
 */
template <typename Flavor> struct MultilinearBatching {
    static constexpr size_t num_frs_in_scalar = CodecConstants<Flavor>::num_frs_in_scalar;
    static constexpr size_t num_frs_in_comm = CodecConstants<Flavor>::num_frs_in_comm;

    static constexpr size_t LENGTH_WITHOUT_PUB_INPUTS(size_t log_n)
    {
        return /* accumulator commitments */ (Flavor::NUM_WITNESS_ENTITIES / 2 * num_frs_in_comm) +
               /* multivariate challenges */ (log_n * num_frs_in_scalar) +
               /* witness evaluations */ (Flavor::NUM_WITNESS_ENTITIES / 2 * num_frs_in_scalar) +
               Sumcheck<Flavor>::LENGTH(log_n);
    }
};

/**
 * @brief Hypernova folding proof layout.
 * @details Used when folding an incoming instance with an existing accumulator.
 *          Contains: Oink + gate challenge + Sumcheck + MultilinearBatching proof.
 * @tparam Flavor The outer flavor (e.g., MegaFlavor)
 * @tparam BatchingFlavor The batching flavor (e.g., MultilinearBatchingFlavor)
 */
template <typename Flavor, typename BatchingFlavor> struct HypernovaFolding {
    static constexpr size_t LENGTH_WITHOUT_PUB_INPUTS(size_t log_n)
    {
        return HypernovaInstanceToAccum<Flavor>::LENGTH_WITHOUT_PUB_INPUTS(log_n) +
               MultilinearBatching<BatchingFlavor>::LENGTH_WITHOUT_PUB_INPUTS(log_n);
    }

    static constexpr size_t derive_num_public_inputs(size_t proof_size, size_t log_n)
    {
        return proof_size - LENGTH_WITHOUT_PUB_INPUTS(log_n);
    }
};

} // namespace bb::ProofLayout
