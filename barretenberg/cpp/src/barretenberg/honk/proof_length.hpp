// === AUDIT STATUS ===
// internal:    { status: Planned, auditors: [], commit: }
// external_1:  { status: not started, auditors: [], commit: }
// external_2:  { status: not started, auditors: [], commit: }
// =====================

#pragma once

#include "barretenberg/constants.hpp"
#include "barretenberg/ecc/fields/field_conversion.hpp"
#include "barretenberg/flavor/flavor.hpp"
#include "barretenberg/flavor/multi_mega_flavor.hpp"
#include "barretenberg/flavor/multi_mega_recursive_flavor.hpp"
#include "barretenberg/flavor/multi_mega_zk_flavor.hpp"
#include "barretenberg/flavor/multi_mega_zk_recursive_flavor.hpp"
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
 * @brief Specialization for MultiMegaFlavor which uses interleaved commitments.
 * @details MultiMegaFlavor batches polynomials into 9 interleaved commitments instead of 24 individual ones.
 */
template <> struct Oink<MultiMegaFlavor> : CodecConstants<MultiMegaFlavor> {
    using CodecConstants<MultiMegaFlavor>::num_frs_in_comm;

    // MultiMega uses 9 interleaved witness commitments instead of NUM_WITNESS_ENTITIES
    static constexpr size_t LENGTH_WITHOUT_PUB_INPUTS =
        MultiMegaFlavor::NUM_INTERLEAVED_WITNESS_COMMITMENTS * num_frs_in_comm;
};

/**
 * @brief Specialization for MultiMegaZKFlavor: 10 interleaved witness commitments (9 base + masking).
 */
template <> struct Oink<MultiMegaZKFlavor> : CodecConstants<MultiMegaZKFlavor> {
    using CodecConstants<MultiMegaZKFlavor>::num_frs_in_comm;

    // 10 interleaved witness commitments (includes masking group W₁₀)
    static constexpr size_t LENGTH_WITHOUT_PUB_INPUTS =
        MultiMegaZKFlavor::NUM_INTERLEAVED_WITNESS_COMMITMENTS * num_frs_in_comm;
};

/**
 * @brief Partial specialization for recursive MultiMegaFlavor (any builder type).
 */
template <typename BuilderType>
struct Oink<MultiMegaRecursiveFlavor_<BuilderType>> : CodecConstants<MultiMegaRecursiveFlavor_<BuilderType>> {
    using Flavor = MultiMegaRecursiveFlavor_<BuilderType>;
    static constexpr size_t num_frs_in_comm = CodecConstants<Flavor>::num_frs_in_comm;
    static constexpr size_t LENGTH_WITHOUT_PUB_INPUTS = Flavor::NUM_INTERLEAVED_WITNESS_COMMITMENTS * num_frs_in_comm;
};

/**
 * @brief Partial specialization for recursive MultiMegaZKFlavor (any builder type).
 */
template <typename BuilderType>
struct Oink<MultiMegaZKRecursiveFlavor_<BuilderType>> : CodecConstants<MultiMegaZKRecursiveFlavor_<BuilderType>> {
    using Flavor = MultiMegaZKRecursiveFlavor_<BuilderType>;
    static constexpr size_t num_frs_in_comm = CodecConstants<Flavor>::num_frs_in_comm;
    static constexpr size_t LENGTH_WITHOUT_PUB_INPUTS = Flavor::NUM_INTERLEAVED_WITNESS_COMMITMENTS * num_frs_in_comm;
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
            // ZK adds: Libra evaluations (concatenation, shifted_grand_sum, grand_sum, quotient)
            return base_length + (NUM_SMALL_IPA_EVALUATIONS * num_frs_in_scalar);
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
    static constexpr size_t derive_num_public_inputs(size_t proof_size, size_t log_n)
    {
        return proof_size - LENGTH_WITHOUT_PUB_INPUTS(log_n);
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
 * @brief Specialization for MultiMegaFlavor: sumcheck uses log_n, PCS uses log_n + INTERLEAVING_LOG_K.
 */
template <> struct Honk<MultiMegaFlavor> {
    static constexpr size_t INTERLEAVING_LOG_K = MultiMegaFlavor::INTERLEAVING_LOG_K;

    static constexpr size_t LENGTH_WITHOUT_PUB_INPUTS(size_t log_n)
    {
        const size_t pcs_log_n = log_n + INTERLEAVING_LOG_K;
        return Oink<MultiMegaFlavor>::LENGTH_WITHOUT_PUB_INPUTS + Sumcheck<MultiMegaFlavor>::LENGTH(log_n) +
               Shplemini<MultiMegaFlavor>::LENGTH(pcs_log_n);
    }

    static constexpr size_t derive_num_public_inputs(size_t proof_size, size_t log_n)
    {
        return proof_size - LENGTH_WITHOUT_PUB_INPUTS(log_n);
    }

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
 * @brief Specialization for MultiMegaZKFlavor: sumcheck uses log_n, PCS uses log_n + INTERLEAVING_LOG_K.
 * @details Masking chunk evaluations are part of sumcheck claimed_evaluations (NUM_ALL_ENTITIES includes them).
 */
template <> struct Honk<MultiMegaZKFlavor> {
    static constexpr size_t INTERLEAVING_LOG_K = MultiMegaZKFlavor::INTERLEAVING_LOG_K;

    static constexpr size_t LENGTH_WITHOUT_PUB_INPUTS(size_t log_n)
    {
        const size_t pcs_log_n = log_n + INTERLEAVING_LOG_K;
        return Oink<MultiMegaZKFlavor>::LENGTH_WITHOUT_PUB_INPUTS + Sumcheck<MultiMegaZKFlavor>::LENGTH(log_n) +
               Shplemini<MultiMegaZKFlavor>::LENGTH(pcs_log_n);
    }

    static constexpr size_t derive_num_public_inputs(size_t proof_size, size_t log_n)
    {
        return proof_size - LENGTH_WITHOUT_PUB_INPUTS(log_n);
    }

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
 * @brief Partial specialization for recursive MultiMegaFlavor (any builder type).
 */
template <typename BuilderType> struct Honk<MultiMegaRecursiveFlavor_<BuilderType>> {
    using Flavor = MultiMegaRecursiveFlavor_<BuilderType>;
    static constexpr size_t INTERLEAVING_LOG_K = Flavor::INTERLEAVING_LOG_K;

    static constexpr size_t LENGTH_WITHOUT_PUB_INPUTS(size_t log_n)
    {
        const size_t pcs_log_n = log_n + INTERLEAVING_LOG_K;
        return Oink<Flavor>::LENGTH_WITHOUT_PUB_INPUTS + Sumcheck<Flavor>::LENGTH(log_n) +
               Shplemini<Flavor>::LENGTH(pcs_log_n);
    }

    static constexpr size_t derive_num_public_inputs(size_t proof_size, size_t log_n)
    {
        return proof_size - LENGTH_WITHOUT_PUB_INPUTS(log_n);
    }

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
 * @brief Partial specialization for recursive MultiMegaZKFlavor (any builder type).
 */
template <typename BuilderType> struct Honk<MultiMegaZKRecursiveFlavor_<BuilderType>> {
    using Flavor = MultiMegaZKRecursiveFlavor_<BuilderType>;
    static constexpr size_t INTERLEAVING_LOG_K = Flavor::INTERLEAVING_LOG_K;

    static constexpr size_t LENGTH_WITHOUT_PUB_INPUTS(size_t log_n)
    {
        const size_t pcs_log_n = log_n + INTERLEAVING_LOG_K;
        return Oink<Flavor>::LENGTH_WITHOUT_PUB_INPUTS + Sumcheck<Flavor>::LENGTH(log_n) +
               Shplemini<Flavor>::LENGTH(pcs_log_n);
    }

    static constexpr size_t derive_num_public_inputs(size_t proof_size, size_t log_n)
    {
        return proof_size - LENGTH_WITHOUT_PUB_INPUTS(log_n);
    }

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

    static constexpr size_t derive_num_public_inputs(size_t proof_size, size_t log_n)
    {
        return proof_size - LENGTH_WITHOUT_PUB_INPUTS(log_n);
    }
};

/**
 * @brief MultilinearBatching proof layout (used by HyperNova folding).
 * @details Batches two accumulators (from previous fold + incoming instance) into one.
 *          Contains: accumulator commitments, multivariate challenges, evaluations, and sumcheck.
 *          Note: This protocol has no public inputs.
 */
template <typename Flavor> struct MultilinearBatching : CodecConstants<Flavor> {
    using CodecConstants<Flavor>::num_frs_in_scalar;
    using CodecConstants<Flavor>::num_frs_in_comm;

    static constexpr size_t LENGTH =
        /* accumulator commitments (non_shifted + shifted) */ (Flavor::NUM_ACCUMULATOR_COMMITMENTS * num_frs_in_comm) +
        /* multivariate challenges */ (Flavor::VIRTUAL_LOG_N * num_frs_in_scalar) +
        /* accumulator evaluations (non_shifted + shifted) */
        (Flavor::NUM_ACCUMULATOR_EVALUATIONS * num_frs_in_scalar) + Sumcheck<Flavor>::LENGTH(Flavor::VIRTUAL_LOG_N);
};

/**
 * @brief Hypernova folding proof layout.
 * @details Used when folding an incoming instance with an existing accumulator.
 *          Contains: instance-to-accumulator proof (Oink + Sumcheck) + MultilinearBatching proof.
 *          Note: gate challenges are derived, not sent in the proof.
 * @tparam Flavor The outer flavor (e.g., MegaFlavor)
 * @tparam BatchingFlavor The batching flavor (e.g., MultilinearBatchingFlavor)
 */
template <typename Flavor, typename BatchingFlavor> struct HypernovaFolding {
    static constexpr size_t LENGTH_WITHOUT_PUB_INPUTS(size_t log_n)
    {
        return HypernovaInstanceToAccum<Flavor>::LENGTH_WITHOUT_PUB_INPUTS(log_n) +
               MultilinearBatching<BatchingFlavor>::LENGTH;
    }

    static constexpr size_t derive_num_public_inputs(size_t proof_size, size_t log_n)
    {
        return proof_size - LENGTH_WITHOUT_PUB_INPUTS(log_n);
    }
};

} // namespace bb::ProofLength
