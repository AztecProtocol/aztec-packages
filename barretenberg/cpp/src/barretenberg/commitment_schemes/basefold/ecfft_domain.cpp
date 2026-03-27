#include "ecfft_domain.hpp"
#include "barretenberg/common/assert.hpp"
#include <fstream>
#include <stdexcept>

namespace bb::basefold {

namespace {

Fq fq_from_hex(const char* hex_str)
{
    // Parse 0x-prefixed 64-char hex string (big-endian) into Fq
    // Fq::serialize_from_buffer expects 32 bytes big-endian
    std::string s(hex_str);
    if (s.substr(0, 2) == "0x" || s.substr(0, 2) == "0X") {
        s = s.substr(2);
    }
    BB_ASSERT(s.size() == 64);

    uint8_t buf[32];
    for (size_t i = 0; i < 32; i++) {
        auto byte_str = s.substr(i * 2, 2);
        buf[i] = static_cast<uint8_t>(std::stoul(byte_str, nullptr, 16));
    }
    return Fq::serialize_from_buffer(buf);
}

} // anonymous namespace

EcfftDomain EcfftDomain::from_hex_arrays(size_t log_n,
                                         const std::vector<std::pair<const char* const*, size_t>>& layer_hex,
                                         const std::vector<std::pair<const char* const*, size_t>>& diff_inv_hex)
{
    EcfftDomain domain;
    domain.log_n = log_n;
    domain.num_rounds = log_n;
    domain.levels.resize(log_n + 1);

    for (size_t i = 0; i <= log_n; i++) {
        auto [hex_ptrs, sz] = layer_hex[i];
        domain.levels[i].domain.resize(sz);
        for (size_t j = 0; j < sz; j++) {
            domain.levels[i].domain[j] = fq_from_hex(hex_ptrs[j]);
        }
    }

    for (size_t i = 0; i < log_n; i++) {
        auto [hex_ptrs, sz] = diff_inv_hex[i];
        domain.levels[i].pair_diff_inv.resize(sz);
        for (size_t j = 0; j < sz; j++) {
            domain.levels[i].pair_diff_inv[j] = fq_from_hex(hex_ptrs[j]);
        }
    }

    return domain;
}

EcfftDomain EcfftDomain::load_binary(const std::string& path)
{
    std::ifstream file(path, std::ios::binary);
    if (!file.is_open()) {
        throw std::runtime_error("Failed to open ECFFT domain file: " + path);
    }

    auto read_u32 = [&]() -> uint32_t {
        uint32_t val;
        file.read(reinterpret_cast<char*>(&val), sizeof(val));
        return val;
    };

    auto read_fq = [&]() -> Fq {
        // Read 4 x uint64 little-endian (matching Python export format)
        uint64_t limbs[4];
        for (auto& limb : limbs) {
            file.read(reinterpret_cast<char*>(&limb), sizeof(limb));
        }
        // Construct from Montgomery form limbs
        return Fq(limbs[0], limbs[1], limbs[2], limbs[3]);
    };

    uint32_t log_n = read_u32();
    [[maybe_unused]] uint32_t n = read_u32();
    uint32_t num_rounds_val = read_u32();

    EcfftDomain domain;
    domain.log_n = log_n;
    domain.num_rounds = num_rounds_val;
    domain.levels.resize(num_rounds_val + 1);

    for (size_t i = 0; i <= num_rounds_val; i++) {
        uint32_t m = read_u32();
        domain.levels[i].domain.resize(m);
        for (size_t j = 0; j < m; j++) {
            domain.levels[i].domain[j] = read_fq();
        }
        if (i < num_rounds_val) {
            size_t half = m / 2;
            domain.levels[i].pair_diff_inv.resize(half);
            for (size_t j = 0; j < half; j++) {
                domain.levels[i].pair_diff_inv[j] = read_fq();
            }
        }
    }

    return domain;
}

} // namespace bb::basefold
