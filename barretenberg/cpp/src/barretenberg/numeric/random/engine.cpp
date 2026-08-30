// === AUDIT STATUS ===
// internal:    { status: Complete, auditors: [Luke], commit: }
// external_1:  { status: not started, auditors: [], commit: }
// external_2:  { status: not started, auditors: [], commit: }
// =====================

#include "engine.hpp"
#include "barretenberg/common/assert.hpp"
#include "barretenberg/common/throw_or_abort.hpp"
#include <array>
#include <cerrno>
#include <cstdlib>
#include <cstring>
#include <functional>
#include <iostream>
#include <memory>
#include <random>
#if defined(__APPLE__)
#include <TargetConditionals.h>
#if TARGET_OS_IPHONE || TARGET_IPHONE_SIMULATOR
#include <unistd.h>
extern "C" int getentropy(void* buffer, size_t length); // getentropy on iOS
#else
#include <sys/random.h> // getentropy on macOS
#endif
#elif defined(__ANDROID__)
// Android API 24 doesn't have getrandom/getentropy, use /dev/urandom
#include <fcntl.h>
#include <unistd.h>
#elif defined(_WIN32)
#include <bcrypt.h>
#include <windows.h>
#else
#include <sys/random.h>
#endif

namespace bb::numeric {

namespace {

#if defined(__wasm__) || defined(__APPLE__) || defined(__ANDROID__)

// In wasm, on mac os, and on Android the API we are using can only give 256 bytes per call,
// so there is no point in creating a larger buffer
constexpr size_t RANDOM_BUFFER_SIZE = 256;
constexpr size_t BYTES_PER_GETENTROPY_READ = 256;

#elif defined(_WIN32)

// BCryptGenRandom can fill arbitrary sizes, but keep a reasonable buffer
constexpr size_t RANDOM_BUFFER_SIZE = 1UL << 20;

#else

// When working on native we allocate 1M of memory to sample randomness from urandom
constexpr size_t RANDOM_BUFFER_SIZE = 1UL << 20;

#endif
struct RandomBufferWrapper {
    // Buffer with randomness sampled from a CSPRNG (heap-allocated on first use to avoid
    // bloating TLS — a 1 MiB inline array adds ~0.6 ms per thread creation)
    std::unique_ptr<uint8_t[]> buffer;
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
        if (!random_buffer_wrapper.buffer) {
            random_buffer_wrapper.buffer = std::make_unique<uint8_t[]>(RANDOM_BUFFER_SIZE);
        }
        size_t bytes_left = RANDOM_BUFFER_SIZE;
        uint8_t* current_offset = random_buffer_wrapper.buffer.get();
        // Bound EINTR retries so a pathological signal storm cannot mask a genuine fault.
        // Unused on Windows (BCryptGenRandom is not interruptible).
        [[maybe_unused]] constexpr int MAX_EINTR_RETRIES = 16;
        [[maybe_unused]] int eintr_retries = 0;
        // Sample until we fill the buffer
        while (bytes_left != 0) {
#if defined(__wasm__) || defined(__APPLE__)
            // Sample through a "syscall" on wasm. We can't request more than 256, it fails and results in an infinite
            // loop
            ssize_t read_bytes =
                getentropy(current_offset, BYTES_PER_GETENTROPY_READ) == -1 ? -1 : BYTES_PER_GETENTROPY_READ;
#elif defined(__ANDROID__)
            // Android API 24 doesn't have getrandom/getentropy, read from /dev/urandom
            static thread_local int urandom_fd = -1;
            if (urandom_fd == -1) {
                // NOLINTNEXTLINE(cppcoreguidelines-pro-type-vararg)
                urandom_fd = open("/dev/urandom", O_RDONLY | O_CLOEXEC);
            }
            ssize_t read_bytes = ::read(urandom_fd, current_offset, BYTES_PER_GETENTROPY_READ);
#elif defined(_WIN32)
            // Use BCryptGenRandom on Windows
            NTSTATUS status =
                BCryptGenRandom(NULL, current_offset, static_cast<ULONG>(bytes_left), BCRYPT_USE_SYSTEM_PREFERRED_RNG);
            ssize_t read_bytes = (status == 0) ? static_cast<ssize_t>(bytes_left) : -1;
#else
            // Sample from urandom on native
            auto read_bytes = getrandom(current_offset, bytes_left, 0);
#endif
            if (read_bytes > 0) {
                current_offset += read_bytes;
                bytes_left -= static_cast<size_t>(read_bytes);
                continue;
            }
            // read_bytes <= 0: failure or EOF. On platforms that report EINTR via errno, retry a
            // bounded number of times; any other failure (including read_bytes == 0, e.g. a
            // sealed/stubbed urandom returning EOF) is fatal.
#if !defined(_WIN32)
            if (read_bytes == -1 && errno == EINTR && eintr_retries++ < MAX_EINTR_RETRIES) {
                continue;
            }
#endif
            throw_or_abort("CSPRNG read failed: cannot retrieve entropy from system source");
        }
        random_buffer_wrapper.offset = 0;
    }

    memcpy(&random_data, random_buffer_wrapper.buffer.get() + random_buffer_wrapper.offset, random_data_buffer_size);
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
 * Default engine.
 *
 * `BB_RNG_SEED=<u64>` replaces it with the seeded debug engine, making every draw reproducible:
 * witness-map gap fills, in-circuit masking during recursive-verifier construction, and ZK masking
 * all become a function of the seed. This exists so a proof can be reproduced byte-for-byte — by a
 * differential test, a conformance suite, or a bug report — and it is NOT SAFE for production use:
 * a predictable engine destroys the zero-knowledge property and the hiding of every commitment.
 * It therefore announces itself loudly on stderr.
 *
 * Reproducibility additionally requires a deterministic draw ORDER. Non-ZK proving draws only in
 * single-threaded phases and reproduces at any thread count, but ZK proving draws from parallel
 * phases: pin `HARDWARE_CONCURRENCY=1` for those, or the same seed will yield different proofs.
 */
RNG& get_randomness()
{
#ifdef BBERG_DEBUG_LOG
    // Use determinism for logging
    return get_debug_randomness();
#else
    static RNG* const seeded = []() -> RNG* {
        const char* seed_env = std::getenv("BB_RNG_SEED");
        if (seed_env == nullptr) {
            return nullptr;
        }
        const uint64_t seed = std::strtoull(seed_env, nullptr, 10);
        std::cerr << "\n*** BB_RNG_SEED=" << seed << " — randomness is SEEDED and PREDICTABLE. ***\n"
                  << "*** Proofs are reproducible but NOT zero-knowledge. Never set this in production. ***\n"
                  << "*** ZK proving additionally needs HARDWARE_CONCURRENCY=1 to reproduce. ***\n\n";
        return &get_debug_randomness(/*reset=*/true, seed);
    }();
    if (seeded != nullptr) {
        return *seeded;
    }
    static RandomEngine engine;
    return engine;
#endif
}

} // namespace bb::numeric
