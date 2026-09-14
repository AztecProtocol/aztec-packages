#pragma once
#include "transcript_loader.hpp"
#include <filesystem>
#include <functional>
#include <vector>

namespace bb::ignition {

/**
 * @brief Verify power-of-tau structure across all 20 sealed transcripts using chunked batch verification.
 *
 * Each consecutive pair of G1 points (g1[i], g1[i+1]) must satisfy:
 *   e(g1[i+1], G2_gen) == e(g1[i], g2_tau)
 *
 * All N-1 pair checks are batched into a single multi-pairing via Fiat-Shamir random
 * linear combination: derive scalars r_i, compute L = Σ r_i·g1[i+1] and R = Σ r_i·g1[i],
 * then verify e(L, G2_gen) · e(-R, g2_tau) == 1.
 *
 * @param transcript_paths Ordered paths to transcript00.dat through transcript19.dat
 * @param g2_tau The G2 point τ·G2_gen from the ceremony (first G2 in sealed transcript 0)
 * @param progress_callback Optional callback invoked after each transcript chunk: (chunk_index, total_chunks)
 * @return true if the SRS has valid power-of-tau structure
 */
bool verify_power_of_tau(const std::vector<std::filesystem::path>& transcript_paths,
                         const G2& g2_tau,
                         std::function<void(size_t, size_t)> progress_callback = nullptr);

} // namespace bb::ignition
