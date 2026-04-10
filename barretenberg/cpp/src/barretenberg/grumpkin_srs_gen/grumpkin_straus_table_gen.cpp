/**
 * @brief Pre-compute and cache Straus plookup tables for the Grumpkin IPA SRS.
 *
 * Usage:
 *   grumpkin_straus_table_gen [num_points] [table_bits] [cache_dir]
 *
 * Defaults:
 *   num_points = 32768  (2^15, the standard IPA SRS size)
 *   table_bits = 8      (valid values given LO_BITS=128: 1, 2, 4, 8, 16, 32, 64, 128)
 *   cache_dir  = ~/.bb-crs  (or $CRS_PATH if set)
 *
 * Writes {cache_dir}/straus_tables/num_points_{N}_bitsize_{B}.dat, which
 * straus_plookup_table::load_cached_base_multiples reads at proof verification time. The file layout:
 *   32-byte header (4 × uint64_t: num_points, table_bits, table_size, reserved)
 *   num_points × table_size AffineElement entries
 */

#include "barretenberg/common/log.hpp"
#include "barretenberg/common/serialize.hpp"
#include "barretenberg/common/thread.hpp"
#include "barretenberg/ecc/curves/grumpkin/grumpkin.hpp"
#include "barretenberg/srs/factories/get_grumpkin_crs.hpp"
#include "barretenberg/srs/global_crs.hpp"
#include <cstdlib>
#include <filesystem>
#include <fstream>
#include <iostream>

using namespace bb;

static constexpr size_t DEFAULT_NUM_POINTS = 32768;
static constexpr size_t DEFAULT_TABLE_BITS = 8;
static constexpr size_t HEADER_SIZE = 4 * sizeof(uint64_t);

using AffineElement = grumpkin::g1::affine_element;

namespace {

// Compute { j * points[i] } for all i in [0, num_points) and j in [0, 2^table_bits).
std::vector<std::vector<AffineElement>> compute_tables(const std::vector<AffineElement>& points, size_t table_bits)
{
    const size_t num_points = points.size();
    const size_t table_size = static_cast<size_t>(1) << table_bits;
    std::vector<std::vector<AffineElement>> tables(num_points, std::vector<AffineElement>(table_size));

    parallel_for_range(num_points, [&](size_t start, size_t end) {
        using Element = grumpkin::g1::element;
        for (size_t i = start; i < end; ++i) {
            std::vector<Element> proj(table_size);
            proj[0] = grumpkin::g1::point_at_infinity;
            Element base_proj(points[i]);
            for (size_t j = 1; j < table_size; ++j) {
                proj[j] = proj[j - 1] + base_proj;
            }
            Element::batch_normalize(proj.data(), table_size);
            for (size_t j = 0; j < table_size; ++j) {
                tables[i][j] = AffineElement(proj[j].x, proj[j].y);
            }
        }
    });
    return tables;
}

void write_cache(const std::filesystem::path& path,
                 const std::vector<std::vector<AffineElement>>& tables,
                 size_t table_bits)
{
    const size_t num_points = tables.size();
    const size_t table_size = static_cast<size_t>(1) << table_bits;

    std::vector<uint8_t> buf;
    buf.reserve(HEADER_SIZE + (num_points * table_size * sizeof(AffineElement)));

    auto write_u64 = [&](uint64_t v) {
        for (size_t k = 0; k < sizeof(uint64_t); ++k) {
            buf.push_back(static_cast<uint8_t>((v >> (8 * k)) & 0xff));
        }
    };
    write_u64(static_cast<uint64_t>(num_points));
    write_u64(static_cast<uint64_t>(table_bits));
    write_u64(static_cast<uint64_t>(table_size));
    write_u64(0); // reserved

    for (size_t i = 0; i < num_points; ++i) {
        for (size_t j = 0; j < table_size; ++j) {
            auto entry_bytes = to_buffer(tables[i][j]);
            buf.insert(buf.end(), entry_bytes.begin(), entry_bytes.end());
        }
    }

    std::filesystem::create_directories(path.parent_path());
    std::ofstream out(path, std::ios::binary | std::ios::trunc);
    out.write(reinterpret_cast<const char*>(buf.data()), static_cast<std::streamsize>(buf.size()));
}

} // namespace

int main(int argc, char** argv)
{
    const size_t num_points = argc > 1 ? static_cast<size_t>(std::atoi(argv[1])) : DEFAULT_NUM_POINTS; // NOLINT
    const size_t table_bits = argc > 2 ? static_cast<size_t>(std::atoi(argv[2])) : DEFAULT_TABLE_BITS; // NOLINT
    std::filesystem::path cache_dir =
        argc > 3 ? std::filesystem::path(argv[3]) : bb::srs::bb_crs_path();

    if (num_points == 0) {
        std::cerr << "error: num_points must be > 0\n";
        return 1;
    }
    if (table_bits == 0 || (128 % table_bits != 0)) {
        std::cerr << "error: table_bits must evenly divide 128 (LO_BITS). "
                     "Valid values: 1, 2, 4, 8, 16, 32, 64, 128\n";
        return 1;
    }

    info("straus_table_gen: num_points=", num_points, " table_bits=", table_bits, " cache_dir=", cache_dir.string());

    auto srs_points = bb::get_grumpkin_g1_data(cache_dir, num_points, /*allow_download=*/true);
    auto cache_path = cache_dir / "straus_tables" /
                      ("num_points_" + std::to_string(num_points) + "_bitsize_" + std::to_string(table_bits) + ".dat");

    info("computing ", num_points, " tables with ", table_bits, "-bit entries...");
    auto tables = compute_tables(srs_points, table_bits);

    info("writing cache to: ", cache_path.string());
    write_cache(cache_path, tables, table_bits);
    info("done.");
    return 0;
}
