// === AUDIT STATUS ===
// internal:    { status: not started, auditors: [], date: YYYY-MM-DD }
// external_1:  { status: not started, auditors: [], date: YYYY-MM-DD }
// external_2:  { status: not started, auditors: [], date: YYYY-MM-DD }
// =====================

#include "engine.hpp"
#include "barretenberg/common/assert.hpp"
#include <array>
#include <cstring>
#include <functional>
#include <random>
#include <sys/random.h>

namespace bb::numeric {

namespace {

#if defined(__wasm__) || defined(__APPLE__)

// In wasm and on mac os the API we are using can only give 256 bytes per call, so there is no point in creating a
// larger buffer
constexpr size_t RANDOM_BUFFER_SIZE = 256;
constexpr size_t BYTES_PER_GETENTROPY_READ = 256;

#else

// When working on native we allocate 1M of memory to sample randomness from urandom
constexpr size_t RANDOM_BUFFER_SIZE = 1UL << 20;

#endif
struct RandomBufferWrapper {
    // Buffer with randomness sampled from a CSPRNG
    uint8_t buffer[RANDOM_BUFFER_SIZE];
    // Offset into the unused part of the buffer
    ssize_t offset = -1;
};
thread_local RandomBufferWrapper random_buffer_wrapper;
/**
 * @brief Generate an array of random unsigned ints sampled from a CSPRNG
 *
 * @tparam size_in_unsigned_ints Size of the array
 * @return std::array<unsigned int, size_in_unsigned_ints>
 */
template <size_t size_in_unsigned_ints> std::array<unsigned int, size_in_unsigned_ints> generate_random_data()
{
    static_assert(size_in_unsigned_ints > 0);
    static_assert(size_in_unsigned_ints <= 32);
    std::array<unsigned int, size_in_unsigned_ints> random_data;
    constexpr size_t random_data_buffer_size = sizeof(random_data);

    // if the buffer is not initialized or doesn't contain enough bytes, sample randomness
    // We could preserve the leftover bytes, but it's a bit messy
    if (random_buffer_wrapper.offset == -1 ||
        (static_cast<size_t>(random_buffer_wrapper.offset) + random_data_buffer_size) > RANDOM_BUFFER_SIZE) {
        size_t bytes_left = RANDOM_BUFFER_SIZE;
        uint8_t* current_offset = random_buffer_wrapper.buffer;
        // Sample until we fill the buffer
        while (bytes_left != 0) {
#if defined(__wasm__) || defined(__APPLE__)
            // Sample through a "syscall" on wasm. We can't request more than 256, it fails and results in an infinite
            // loop
            ssize_t read_bytes =
                getentropy(current_offset, BYTES_PER_GETENTROPY_READ) == -1 ? -1 : BYTES_PER_GETENTROPY_READ;
#else
            // Sample from urandom on native
            auto read_bytes = getrandom(current_offset, bytes_left, 0);
#endif
            // If we read something, update the leftover
            if (read_bytes != -1) {
                current_offset += read_bytes;
                bytes_left -= static_cast<size_t>(read_bytes);
            }
        }
        random_buffer_wrapper.offset = 0;
    }

    memcpy(&random_data, random_buffer_wrapper.buffer + random_buffer_wrapper.offset, random_data_buffer_size);
    random_buffer_wrapper.offset += static_cast<ssize_t>(random_data_buffer_size);
    return random_data;
}
} // namespace

class RandomEngine : public RNG {
  public:
    uint8_t get_random_uint8() override
    {
        auto buf = generate_random_data<1>();
        uint32_t out = buf[0];
        return static_cast<uint8_t>(out);
    }

    uint16_t get_random_uint16() override
    {
        auto buf = generate_random_data<1>();
        uint32_t out = buf[0];
        return static_cast<uint16_t>(out);
    }

    uint32_t get_random_uint32() override
    {
        auto buf = generate_random_data<1>();
        uint32_t out = buf[0];
        return static_cast<uint32_t>(out);
    }

    uint64_t get_random_uint64() override
    {
        auto buf = generate_random_data<2>();
        auto lo = static_cast<uint64_t>(buf[0]);
        auto hi = static_cast<uint64_t>(buf[1]);
        return (lo + (hi << 32ULL));
    }

    uint128_t get_random_uint128() override
    {
        const auto get64 = [](const std::array<uint32_t, 4>& buffer, const size_t offset) {
            auto lo = static_cast<uint64_t>(buffer[0 + offset]);
            auto hi = static_cast<uint64_t>(buffer[1 + offset]);
            return (lo + (hi << 32ULL));
        };
        auto buf = generate_random_data<4>();
        auto lo = static_cast<uint128_t>(get64(buf, 0));
        auto hi = static_cast<uint128_t>(get64(buf, 2));

        return (lo + (hi << static_cast<uint128_t>(64ULL)));
    }

    uint256_t get_random_uint256() override
    {
        const auto get64 = [](const std::array<uint32_t, 8>& buffer, const size_t offset) {
            auto lo = static_cast<uint64_t>(buffer[0 + offset]);
            auto hi = static_cast<uint64_t>(buffer[1 + offset]);
            return (lo + (hi << 32ULL));
        };
        auto buf = generate_random_data<8>();
        uint64_t lolo = get64(buf, 0);
        uint64_t lohi = get64(buf, 2);
        uint64_t hilo = get64(buf, 4);
        uint64_t hihi = get64(buf, 6);
        return { lolo, lohi, hilo, hihi };
    }
};

class DebugEngine : public RNG {
  public:
    DebugEngine()
        // disable linting for this line: we want the DEBUG engine to produce predictable pseudorandom numbers!
        // NOLINTNEXTLINE(cert-msc32-c, cert-msc51-cpp)
        : engine(std::mt19937_64(12345))
    {}

    DebugEngine(std::uint_fast64_t seed)
        : engine(std::mt19937_64(seed))
    {}

    uint8_t get_random_uint8() override { return static_cast<uint8_t>(dist(engine)); }

    uint16_t get_random_uint16() override { return static_cast<uint16_t>(dist(engine)); }

    uint32_t get_random_uint32() override { return static_cast<uint32_t>(dist(engine)); }

    uint64_t get_random_uint64() override { return dist(engine); }

    uint128_t get_random_uint128() override
    {
        uint128_t hi = dist(engine);
        uint128_t lo = dist(engine);
        return (hi << 64) | lo;
    }

    uint256_t get_random_uint256() override
    {
        // Do not inline in constructor call. Evaluation order is important for cross-compiler consistency.
        auto a = dist(engine);
        auto b = dist(engine);
        auto c = dist(engine);
        auto d = dist(engine);
        return { a, b, c, d };
    }

  private:
    std::mt19937_64 engine;
    std::uniform_int_distribution<uint64_t> dist = std::uniform_int_distribution<uint64_t>{ 0ULL, UINT64_MAX };
};

/**
 * Used by tests to ensure consistent behavior.
 */
RNG& get_debug_randomness(bool reset, std::uint_fast64_t seed)
{
    // static std::seed_seq seed({ 1, 2, 3, 4, 5 });
    static DebugEngine debug_engine = DebugEngine();
    if (reset) {
        debug_engine = DebugEngine(seed);
    }
    return debug_engine;
}

/**
 * Default engine. If wanting consistent proof construction, uncomment the line to return the debug engine.
 */
RNG& get_randomness()
{
#ifdef BBERG_DEBUG_LOG
    // Use determinism for logging
    return get_debug_randomness();
#else
    static RandomEngine engine;
    return engine;
#endif
}

} // namespace bb::numeric
