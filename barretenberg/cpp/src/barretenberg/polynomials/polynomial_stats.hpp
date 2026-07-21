#pragma once

#include "barretenberg/common/log.hpp"
#include <cstddef>
#include <cstdint>
#include <cstdlib>
#include <iomanip>
#include <sstream>
#include <string>
#include <utility>

namespace bb {

/**
 * @brief Compute the minimum number of bytes needed to represent a field element's value.
 * @details The field element must already be in standard (non-Montgomery) form.
 * Returns 0 for zero elements, otherwise 1-32.
 */
template <typename Fr> size_t min_bytes_for_value(const Fr& val)
{
    // Check limbs from most significant to least significant
    for (int limb = 3; limb >= 0; --limb) {
        if (val.data[limb] != 0) {
            // Count bytes needed for this limb
            uint64_t v = val.data[limb];
            size_t bytes_in_limb = 0;
            while (v > 0) {
                bytes_in_limb++;
                v >>= 8;
            }
            return (static_cast<size_t>(limb) * 8) + bytes_in_limb;
        }
    }
    return 0; // all limbs are zero
}

/**
 * @brief Analyze prover polynomials and print per-polynomial statistics about value sizes.
 * @details For each polynomial, reports the number of zero elements and the distribution of
 * non-zero element sizes (in bytes, after converting from Montgomery form). This helps assess
 * the potential for memory compression via variable-length encoding.
 *
 * Gated behind the BB_POLY_STATS environment variable.
 */
template <typename ProverPolynomials> void analyze_prover_polynomials(ProverPolynomials& polynomials)
{
    using Polynomial = std::remove_reference_t<decltype(*polynomials.get_unshifted().begin())>;
    using Fr = typename Polynomial::FF;

    auto unshifted = polynomials.get_unshifted();
    auto all_labels = polynomials.get_labels();

    struct PolyStats {
        std::string name;
        size_t alloc_size = 0;     // number of allocated coefficients
        size_t virtual_size = 0;   // total virtual size including zero padding
        size_t num_zeros = 0;      // coefficients that are exactly 0
        size_t fit_4bytes = 0;     // non-zero coefficients fitting in <= 4 bytes
        size_t fit_8bytes = 0;     // non-zero coefficients fitting in <= 8 bytes
        size_t fit_16bytes = 0;    // non-zero coefficients fitting in <= 16 bytes
        size_t fit_32bytes = 0;    // non-zero coefficients needing > 16 bytes (up to 32)
        size_t actual_mem = 0;     // actual memory in bytes (alloc_size * 32)
        double compressed_mem = 0; // ideal compressed memory in bytes
    };

    std::vector<PolyStats> all_stats;
    PolyStats totals;
    totals.name = "TOTAL";

    size_t idx = 0;
    for (auto& poly : unshifted) {
        PolyStats stats;
        stats.name = (idx < all_labels.size()) ? all_labels[idx] : "unknown_" + std::to_string(idx);
        idx++;

        if (poly.is_empty()) {
            all_stats.push_back(std::move(stats));
            continue;
        }

        stats.alloc_size = poly.size();
        stats.virtual_size = poly.virtual_size();
        stats.actual_mem = stats.alloc_size * sizeof(Fr);

        const Fr* data = poly.data();
        for (size_t i = 0; i < stats.alloc_size; ++i) {
            const Fr& elem = data[i];
            // Zero in Montgomery form is still {0,0,0,0}
            if (elem.data[0] == 0 && elem.data[1] == 0 && elem.data[2] == 0 && elem.data[3] == 0) {
                stats.num_zeros++;
                continue;
            }

            Fr standard = elem.from_montgomery_form();
            size_t bytes_needed = min_bytes_for_value(standard);

            if (bytes_needed <= 4) {
                stats.fit_4bytes++;
                stats.compressed_mem += 4;
            } else if (bytes_needed <= 8) {
                stats.fit_8bytes++;
                stats.compressed_mem += 8;
            } else if (bytes_needed <= 16) {
                stats.fit_16bytes++;
                stats.compressed_mem += 16;
            } else {
                stats.fit_32bytes++;
                stats.compressed_mem += 32;
            }
        }

        // Accumulate totals
        totals.alloc_size += stats.alloc_size;
        totals.virtual_size += stats.virtual_size;
        totals.num_zeros += stats.num_zeros;
        totals.fit_4bytes += stats.fit_4bytes;
        totals.fit_8bytes += stats.fit_8bytes;
        totals.fit_16bytes += stats.fit_16bytes;
        totals.fit_32bytes += stats.fit_32bytes;
        totals.actual_mem += stats.actual_mem;
        totals.compressed_mem += stats.compressed_mem;

        all_stats.push_back(std::move(stats));
    }

    // Format and print the report
    auto mb = [](auto bytes) { return static_cast<double>(bytes) / (1024.0 * 1024.0); };

    std::ostringstream oss;
    oss << "\n=== Polynomial Memory Analysis ===\n";
    oss << std::left << std::setw(36) << "Polynomial"
        << " | " << std::right << std::setw(10) << "AllocSize"
        << " | " << std::setw(10) << "Zeros"
        << " | " << std::setw(10) << "<=4B"
        << " | " << std::setw(10) << "<=8B"
        << " | " << std::setw(10) << "<=16B"
        << " | " << std::setw(10) << "<=32B"
        << " | " << std::setw(10) << "Mem(MB)"
        << " | " << std::setw(10) << "Compr(MB)"
        << "\n";
    oss << std::string(140, '-') << "\n";

    auto print_row = [&](const PolyStats& s) {
        if (s.alloc_size == 0 && s.name != "TOTAL") {
            return; // skip empty polynomials
        }
        oss << std::left << std::setw(36) << s.name << " | " << std::right << std::setw(10) << s.alloc_size << " | "
            << std::setw(10) << s.num_zeros << " | " << std::setw(10) << s.fit_4bytes << " | " << std::setw(10)
            << s.fit_8bytes << " | " << std::setw(10) << s.fit_16bytes << " | " << std::setw(10) << s.fit_32bytes
            << " | " << std::setw(10) << std::fixed << std::setprecision(2) << mb(s.actual_mem) << " | "
            << std::setw(10) << std::fixed << std::setprecision(2) << mb(s.compressed_mem) << "\n";
    };

    for (const auto& s : all_stats) {
        print_row(s);
    }
    oss << std::string(140, '-') << "\n";
    print_row(totals);

    double savings_pct =
        totals.actual_mem > 0 ? 100.0 * (1.0 - totals.compressed_mem / static_cast<double>(totals.actual_mem)) : 0.0;
    oss << "\nTotal actual memory:     " << std::fixed << std::setprecision(2) << mb(totals.actual_mem) << " MB\n";
    oss << "Total compressed memory: " << std::fixed << std::setprecision(2) << mb(totals.compressed_mem) << " MB\n";
    oss << "Potential savings:       " << std::fixed << std::setprecision(1) << savings_pct << "%\n";

    info(oss.str());
}

} // namespace bb
