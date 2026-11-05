// Device gate test for the GPU MSM core: reads vector files and compares msm_batch_cuda to the expected results.
#include <chrono>
#include <cstdio>
#include <cstdlib>
#include <fstream>
#include <iostream>
#include <sstream>
#include <string>
#include <vector>

#include "barretenberg/ecc/scalar_multiplication/gpu/msm_core.hpp"

using namespace bb::gpu_msm;

namespace {
U256 parse_u256(const std::string& s)
{
    U256 v{};
    for (int i = 0; i < 4; i++) {
        v.limb[3 - i] = std::stoull(s.substr(static_cast<size_t>(i) * 16, 16), nullptr, 16);
    }
    return v;
}
bool eq(const U256& a, const U256& b)
{
    return a.limb[0] == b.limb[0] && a.limb[1] == b.limb[1] && a.limb[2] == b.limb[2] && a.limb[3] == b.limb[3];
}
bool same(const AffinePoint& a, const AffinePoint& b)
{
    if (a.infinity || b.infinity) {
        return a.infinity == b.infinity;
    }
    return eq(a.x, b.x) && eq(a.y, b.y);
}

struct Vector {
    std::vector<AffinePoint> points;
    std::vector<std::vector<U256>> scalars;
    std::vector<Column> columns;
    std::vector<AffinePoint> expected;
};

bool load(const std::string& path, Vector& v)
{
    std::ifstream in(path);
    if (!in) {
        return false;
    }
    std::string tag;
    size_t n = 0;
    in >> tag >> n;
    v.points.resize(n);
    for (auto& p : v.points) {
        std::string a;
        in >> a;
        if (a == "inf") {
            p = AffinePoint{ {}, {}, true };
        } else {
            std::string b;
            in >> b;
            p = AffinePoint{ parse_u256(a), parse_u256(b), false };
        }
    }
    size_t c = 0;
    in >> tag >> c;
    v.scalars.resize(c);
    v.columns.resize(c);
    v.expected.resize(c);
    std::vector<uint64_t> starts(c);
    for (size_t i = 0; i < c; i++) {
        uint64_t start = 0, size = 0;
        in >> tag >> start >> size;
        v.scalars[i].resize(size);
        for (auto& s : v.scalars[i]) {
            std::string h;
            in >> h;
            s = parse_u256(h);
        }
        std::string e;
        in >> tag >> e;
        if (e == "inf") {
            v.expected[i] = AffinePoint{ {}, {}, true };
        } else {
            std::string y;
            in >> y;
            v.expected[i] = AffinePoint{ parse_u256(e), parse_u256(y), false };
        }
        starts[i] = start;
    }
    for (size_t i = 0; i < c; i++) {
        v.columns[i] = Column{ v.scalars[i].data(), starts[i], v.scalars[i].size() };
    }
    return static_cast<bool>(in) || in.eof();
}
} // namespace

int main(int argc, char** argv)
{
    int failures = 0;
    for (int a = 1; a < argc; a++) {
        Vector v;
        if (!load(argv[a], v)) {
            std::cerr << "FAIL cannot load " << argv[a] << "\n";
            failures++;
            continue;
        }
        // Vector files named grumpkin_*.txt are Grumpkin vectors; every other file is BN254.
        const std::string path = argv[a];
        const std::string base = path.substr(path.find_last_of('/') + 1);
        CoreConfig config;
        config.curve = base.rfind("grumpkin_", 0) == 0 ? Curve::Grumpkin : Curve::Bn254;
        const auto t0 = std::chrono::steady_clock::now();
        const auto got = msm_batch_cuda(v.points, v.columns, config);
        const double ms = std::chrono::duration<double, std::milli>(std::chrono::steady_clock::now() - t0).count();
        bool ok = got.size() == v.columns.size();
        for (size_t i = 0; ok && i < got.size(); i++) {
            if (!same(got[i], v.expected[i])) {
                std::cerr << "FAIL " << argv[a] << " column " << i << " (start " << v.columns[i].start << ", size "
                          << v.columns[i].size << ")\n";
                ok = false;
            }
        }
        // Running windows together must not change any result, including when the last group is partial.
        for (const uint32_t group : { 1u, 2u, 3u, 1000u }) {
            CoreConfig grouped = config;
            grouped.window_group = group;
            const auto again = msm_batch_cuda(v.points, v.columns, grouped);
            for (size_t i = 0; ok && i < again.size(); i++) {
                if (!same(again[i], v.expected[i])) {
                    std::cerr << "FAIL " << argv[a] << " column " << i << " with window_group=" << group << "\n";
                    ok = false;
                }
            }
        }
        // Splitting the columns into pipelined groups must not change any result.
        for (const uint32_t pipeline : { 1u, 2u, 3u, 1000u }) {
            CoreConfig piped = config;
            piped.host_pipeline = pipeline;
            const auto again = msm_batch_cuda(v.points, v.columns, piped);
            for (size_t i = 0; ok && i < again.size(); i++) {
                if (!same(again[i], v.expected[i])) {
                    std::cerr << "FAIL " << argv[a] << " column " << i << " with host_pipeline=" << pipeline << "\n";
                    ok = false;
                }
            }
            ok = ok && again.size() == v.expected.size();
        }
        // Repeated wide scalars (long and short runs, two values per column) must merge without changing any result.
        if (ok) {
            std::vector<std::vector<U256>> repeated = v.scalars;
            const U256 wide_a{
                { 0x0123456789abcdefULL, 0x13579bdf2468ace0ULL, 0x1111222233334444ULL, 0x0a5a5a5a5a5a5a5aULL }
            };
            const U256 wide_b{
                { 0xfedcba9876543210ULL, 0x0f0f0f0f0f0f0f0fULL, 0x0000000000000001ULL, 0x0123456789abcdefULL }
            };
            std::vector<Column> repeated_columns = v.columns;
            for (size_t i = 0; i < repeated.size(); i++) {
                for (size_t j = 0; j < repeated[i].size(); j++) {
                    if (j % 3 == 0) {
                        repeated[i][j] = wide_a;
                    } else if (j % 7 == 1) {
                        repeated[i][j] = wide_b;
                    }
                }
                repeated_columns[i].scalars = repeated[i].data();
            }
            const auto want = msm_batch_emul(v.points, repeated_columns, config);
            for (const bool merge : { false, true }) {
                CoreConfig merged = config;
                merged.dedup_scalars = merge;
                const auto have = msm_batch_cuda(v.points, repeated_columns, merged);
                for (size_t i = 0; ok && i < have.size(); i++) {
                    if (!same(have[i], want[i])) {
                        std::cerr << "FAIL " << argv[a] << " column " << i
                                  << " with repeated scalars, dedup_scalars=" << merge << "\n";
                        ok = false;
                    }
                }
            }
        }
        // A batch must equal the same columns computed one at a time.
        for (size_t i = 0; ok && i < v.columns.size() && i < 6; i++) {
            const auto one = msm_batch_cuda(v.points, std::span<const Column>(&v.columns[i], 1), config);
            if (one.size() != 1 || !same(one[0], v.expected[i])) {
                std::cerr << "FAIL " << argv[a] << " column " << i << " differs when run alone\n";
                ok = false;
            }
        }
        // Empty batch.
        if (ok && !msm_batch_cuda(v.points, std::span<const Column>{}, config).empty()) {
            std::cerr << "FAIL " << argv[a] << " empty batch must return no results\n";
            ok = false;
        }
        std::cout << (ok ? "ok   " : "FAIL ") << argv[a] << " (" << v.columns.size() << " columns, " << ms << " ms)\n";
        failures += ok ? 0 : 1;
    }
    return failures == 0 ? 0 : 1;
}
