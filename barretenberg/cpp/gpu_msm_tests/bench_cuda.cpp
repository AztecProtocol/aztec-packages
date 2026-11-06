// Timing harness for msm_batch_cuda. It needs a GPU, so it is a standalone program: CMake does not build it and CI
// does not run it. It exists so the performance numbers in the GPU MSM README can be reproduced and tuning changes
// (window_bits, the repeated-scalar merge, field arithmetic) can be measured in seconds, without proving a whole AVM
// circuit.
//
// It is not a correctness test. Points are a pool of real curve points tiled to the requested size, and scalars follow
// an AVM-like shape. With --check each result is also compared to a second run with the repeated-scalar merge off and
// one window at a time, which catches window-group and merge bugs on large shapes. test_cuda is the check against
// independently computed results.
//
// build: nvcc -O3 -std=c++20 -arch=sm_89 -I barretenberg/cpp/src \
//            barretenberg/cpp/src/barretenberg/ecc/scalar_multiplication/gpu/msm_cuda.cu bench_cuda.cpp -o bench_cuda
// usage: bench_cuda <pool_vector.txt> <log2_rows> <columns> [window_bits] [repeats] [--grumpkin] [--check]
//        bench_cuda <pool_vector.txt> --dump-dir <dir> [window_bits] [repeats]   (columns recorded from a real proof)
#include <algorithm>
#include <chrono>
#include <cstdio>
#include <cstdlib>
#include <cstring>
#include <dirent.h>
#include <fstream>
#include <iostream>
#include <random>
#include <string>
#include <vector>

#include "barretenberg/ecc/scalar_multiplication/gpu/msm_core.hpp"
#include "barretenberg/ecc/scalar_multiplication/gpu/msm_kernels_impl.hpp"

using namespace bb::gpu_msm;

namespace {
// The pool holds canonical coordinates; the core takes Montgomery residues (R = 2^256).
std::vector<AffinePoint> to_montgomery_points(const std::vector<AffinePoint>& points, Curve curve)
{
    std::vector<AffinePoint> out(points.size());
    for (size_t i = 0; i < points.size(); i++) {
        const AffinePoint& p = points[i];
        if (p.infinity) {
            out[i] = p;
        } else if (curve == Curve::Grumpkin) {
            out[i] = AffinePoint{ kernels::to_mont<kernels::GrumpkinBaseField>(p.x),
                                  kernels::to_mont<kernels::GrumpkinBaseField>(p.y),
                                  false };
        } else {
            out[i] = AffinePoint{ kernels::to_mont<kernels::Bn254BaseField>(p.x),
                                  kernels::to_mont<kernels::Bn254BaseField>(p.y),
                                  false };
        }
    }
    return out;
}

U256 parse_u256(const std::string& s)
{
    U256 v{};
    for (int i = 0; i < 4; i++) {
        v.limb[3 - i] = std::stoull(s.substr(static_cast<size_t>(i) * 16, 16), nullptr, 16);
    }
    return v;
}

std::vector<AffinePoint> load_points(const std::string& path)
{
    std::ifstream in(path);
    std::string tag;
    size_t n = 0;
    in >> tag >> n;
    std::vector<AffinePoint> pts;
    pts.reserve(n);
    for (size_t i = 0; i < n; i++) {
        std::string a;
        in >> a;
        if (a == "inf") {
            continue;
        }
        std::string b;
        in >> b;
        pts.push_back(AffinePoint{ parse_u256(a), parse_u256(b), false });
    }
    return pts;
}

bool eq(const AffinePoint& a, const AffinePoint& b)
{
    if (a.infinity || b.infinity) {
        return a.infinity == b.infinity;
    }
    return std::memcmp(&a.x, &b.x, sizeof(U256)) == 0 && std::memcmp(&a.y, &b.y, sizeof(U256)) == 0;
}

// Roughly the AVM column shape: ~35% zeros, ~55% of the rest at most 8 bits, remainder 253-bit.
U256 shaped_scalar(std::mt19937_64& rng)
{
    U256 s{};
    const uint64_t r = rng() % 100;
    if (r < 35) {
        return s;
    }
    if (rng() % 100 < 55) {
        s.limb[0] = 1 + rng() % 255;
        return s;
    }
    s.limb[0] = rng();
    s.limb[1] = rng();
    s.limb[2] = rng();
    s.limb[3] = rng() >> 3; // 253 bits: below both curve orders
    return s;
}
// A committed column: its span in the SRS and a histogram of canonical scalar bit widths
// (zero, <=8, <=16, <=32, <=64, <=128, >128). `default_shape` ignores the histogram and uses shaped_scalar.
struct ColumnStats {
    uint64_t start;
    uint64_t size;
    std::array<uint64_t, 7> hist;
    bool default_shape;
};

std::vector<ColumnStats> load_column_stats(const std::string& path)
{
    std::ifstream in(path);
    std::string line;
    std::getline(in, line); // header
    std::vector<ColumnStats> out;
    while (std::getline(in, line)) {
        std::stringstream ss(line);
        std::string field;
        std::vector<std::string> f;
        while (std::getline(ss, field, ',')) {
            f.push_back(field);
        }
        if (f.size() < 11) {
            continue;
        }
        ColumnStats cs{ std::stoull(f[2]), std::stoull(f[3]), {}, false };
        for (size_t b = 0; b < 7; b++) {
            cs.hist[b] = std::stoull(f[4 + b]);
        }
        if (cs.size > 0) {
            out.push_back(cs);
        }
    }
    return out;
}

U256 scalar_in_bucket(size_t bucket, std::mt19937_64& rng)
{
    U256 s{};
    switch (bucket) {
    case 0:
        break;
    case 1:
        s.limb[0] = 1 + rng() % 255;
        break;
    case 2:
        s.limb[0] = 256 + rng() % (65536 - 256);
        break;
    case 3:
        s.limb[0] = 65536 + rng() % (0xffffffffULL - 65536);
        break;
    case 4:
        s.limb[0] = 0x100000000ULL + (rng() >> 1);
        break;
    case 5:
        s.limb[0] = rng();
        s.limb[1] = 1 + (rng() >> 2);
        break;
    default:
        s.limb[0] = rng();
        s.limb[1] = rng();
        s.limb[2] = 1 + (rng() >> 3);
        s.limb[3] = rng() >> 3; // 253 bits: below both curve orders
        break;
    }
    return s;
}

std::vector<U256> generate_column(const ColumnStats& cs, std::mt19937_64& rng)
{
    std::vector<U256> out;
    out.reserve(cs.size);
    if (cs.default_shape) {
        for (uint64_t i = 0; i < cs.size; i++) {
            out.push_back(shaped_scalar(rng));
        }
        return out;
    }
    for (size_t b = 0; b < 7; b++) {
        for (uint64_t i = 0; i < cs.hist[b] && out.size() < cs.size; i++) {
            out.push_back(scalar_in_bucket(b, rng));
        }
    }
    while (out.size() < cs.size) {
        out.push_back(U256{});
    }
    std::shuffle(out.begin(), out.end(), rng);
    return out;
}

// A recorded column: header (start, size) then `size` canonical little-endian 256-bit scalars.
struct DumpedColumn {
    uint64_t start;
    std::vector<U256> scalars;
};

std::vector<DumpedColumn> load_dump_dir(const std::string& dir)
{
    std::vector<std::string> names;
    if (DIR* d = opendir(dir.c_str())) {
        while (const dirent* e = readdir(d)) {
            const std::string n = e->d_name;
            if (n.rfind("column_", 0) == 0 && n.size() > 4 && n.substr(n.size() - 4) == ".bin") {
                names.push_back(n);
            }
        }
        closedir(d);
    }
    std::sort(names.begin(), names.end());
    std::vector<DumpedColumn> out;
    for (const auto& n : names) {
        std::ifstream in(dir + "/" + n, std::ios::binary);
        uint64_t header[2];
        in.read(reinterpret_cast<char*>(header), sizeof(header));
        DumpedColumn col{ header[0], std::vector<U256>(header[1]) };
        in.read(reinterpret_cast<char*>(col.scalars.data()), static_cast<std::streamsize>(header[1] * sizeof(U256)));
        out.push_back(std::move(col));
    }
    return out;
}
} // namespace

int main(int argc, char** argv)
{
    if (argc < 3) {
        std::cerr
            << "usage: bench_cuda <pool.txt> <log2_rows> <columns> [window_bits] [repeats] [--grumpkin] [--check]\n"
               "       bench_cuda <pool.txt> --stats <columns.csv> [window_bits] [repeats] [--grumpkin]\n"
               "       options: --window-group N (windows run together, 1 = one at a time), --window-memory-mb M,\n"
               "                --pipeline N (host/device overlap groups, 1 = off), --no-dedup (skip the "
               "repeated-scalar merge)\n";
        return 2;
    }
    bool check = false;
    bool degenerate = false;
    std::string stats_path;
    std::string dump_dir;
    CoreConfig config;
    std::vector<std::string> pos;
    for (int a = 1; a < argc; a++) {
        const std::string s = argv[a];
        if (s == "--check") {
            check = true;
        } else if (s == "--degenerate") {
            degenerate = true;
        } else if (s == "--grumpkin") {
            config.curve = Curve::Grumpkin;
        } else if (s == "--window-group" && a + 1 < argc) {
            config.window_group = static_cast<uint32_t>(std::stoul(argv[++a]));
        } else if (s == "--no-dedup") {
            config.dedup_scalars = false;
        } else if (s == "--pipeline" && a + 1 < argc) {
            config.host_pipeline = static_cast<uint32_t>(std::stoul(argv[++a]));
        } else if (s == "--window-memory-mb" && a + 1 < argc) {
            config.window_memory_bytes = std::stoull(argv[++a]) << 20;
        } else if (s == "--dump-dir" && a + 1 < argc) {
            dump_dir = argv[++a];
        } else if (s == "--stats" && a + 1 < argc) {
            stats_path = argv[++a];
        } else {
            pos.push_back(s);
        }
    }
    const auto pool = load_points(pos[0]);
    const size_t first_opt = (stats_path.empty() && dump_dir.empty()) ? 3 : 1;
    config.window_bits = pos.size() > first_opt ? static_cast<uint32_t>(std::stoul(pos[first_opt])) : 0;
    const int repeats = pos.size() > first_opt + 1 ? std::stoi(pos[first_opt + 1]) : 3;

    std::mt19937_64 rng(12345);
    std::vector<ColumnStats> column_stats;
    std::vector<DumpedColumn> dumped;
    if (!dump_dir.empty()) {
        dumped = load_dump_dir(dump_dir);
        for (const auto& d : dumped) {
            column_stats.push_back(ColumnStats{ d.start, d.scalars.size(), { 0, 0, 0, 0, 0, 0, 0 }, true });
        }
    } else if (stats_path.empty()) {
        const uint64_t rows = 1ULL << std::stoul(pos[1]);
        const uint64_t cols = std::stoull(pos[2]);
        column_stats.assign(cols, ColumnStats{ 0, rows, { 0, 0, 0, 0, 0, 0, 0 }, true });
    } else {
        column_stats = load_column_stats(stats_path);
    }
    if (degenerate) {
        std::vector<ColumnStats> mixed;
        for (size_t i = 0; i < column_stats.size(); i++) {
            mixed.push_back(column_stats[i]);
            if (i % 3 == 0) {
                mixed.push_back(ColumnStats{ 0, 0, { 0, 0, 0, 0, 0, 0, 0 }, true });
            }
            if (i % 3 == 1) {
                mixed.push_back(ColumnStats{ 5, 700, { 700, 0, 0, 0, 0, 0, 0 }, false });
            }
        }
        column_stats = mixed;
    }
    const uint64_t cols = column_stats.size();
    uint64_t points_needed = 0;
    for (const auto& cs : column_stats) {
        points_needed = std::max(points_needed, cs.start + cs.size);
    }
    std::vector<AffinePoint> points(points_needed);
    for (uint64_t i = 0; i < points_needed; i++) {
        points[i] = pool[i % pool.size()];
    }
    points = to_montgomery_points(points, config.curve);
    std::vector<std::vector<U256>> scalars(cols);
    std::vector<Column> columns(cols);
    uint64_t nonzero = 0;
    uint64_t total_scalars = 0;
    for (uint64_t c = 0; c < cols; c++) {
        scalars[c] = dumped.empty() ? generate_column(column_stats[c], rng) : dumped[c].scalars;
        for (const auto& s : scalars[c]) {
            nonzero += (s.limb[0] | s.limb[1] | s.limb[2] | s.limb[3]) != 0;
        }
        total_scalars += scalars[c].size();
        columns[c] = Column{ scalars[c].data(), column_stats[c].start, scalars[c].size() };
    }
    std::printf("pool=%zu points=%llu cols=%llu scalars=%llu nonzero=%llu window_bits=%u\n",
                pool.size(),
                (unsigned long long)points_needed,
                (unsigned long long)cols,
                (unsigned long long)total_scalars,
                (unsigned long long)nonzero,
                config.window_bits);

    std::vector<double> ms;
    std::vector<AffinePoint> got;
    for (int r = 0; r < repeats; r++) {
        const auto t0 = std::chrono::steady_clock::now();
        got = msm_batch_cuda(points, columns, config);
        const auto t1 = std::chrono::steady_clock::now();
        ms.push_back(std::chrono::duration<double, std::milli>(t1 - t0).count());
        std::printf("  call %d: %.2f ms\n", r, ms.back());
        std::fflush(stdout);
    }
    std::vector<double> sorted = ms;
    std::sort(sorted.begin(), sorted.end());
    std::printf("first=%.2f ms median=%.2f ms min=%.2f ms\n", ms.front(), sorted[sorted.size() / 2], sorted.front());

    if (check) {
        CoreConfig reference_config = config;
        reference_config.dedup_scalars = false;
        reference_config.window_group = 1;
        const auto want = msm_batch_cuda(points, columns, reference_config);
        bool ok = want.size() == got.size();
        for (size_t i = 0; ok && i < want.size(); i++) {
            ok = eq(want[i], got[i]);
        }
        std::printf("check vs merge-off, single-window run: %s\n", ok ? "OK" : "MISMATCH");
        return ok ? 0 : 1;
    }
    return 0;
}
