#include "get_bn254_crs.hpp"
#include "barretenberg/api/file_io.hpp"
#include "barretenberg/common/flock.hpp"
#include "barretenberg/common/serialize.hpp"
#include "barretenberg/common/thread.hpp"
#include "barretenberg/crypto/sha256/sha256.hpp"
#include "barretenberg/ecc/curves/bn254/g1.hpp"
#include "barretenberg/ecc/curves/bn254/g2.hpp"
#include "bn254_crs_data.hpp"
#include "bn254_g1_chunk_hashes.hpp"
#include "http_download.hpp"
#include <array>
#include <atomic>
#include <bit>
#include <cerrno>
#include <cstdio>
#include <cstring>
#include <fstream>
#include <optional>
#include <span>
#include <type_traits>
#if !defined(__wasm__) && !defined(_WIN32)
#include <fcntl.h>
#include <sys/mman.h>
#include <sys/stat.h>
#include <unistd.h>
#endif

namespace {
// Primary CRS URL (Cloudflare R2)
constexpr const char* CRS_PRIMARY_URL = "http://crs.aztec-cdn.foundation/g1_compressed.dat";
// Fallback CRS URL (AWS S3)
constexpr const char* CRS_FALLBACK_URL = "http://crs.aztec-labs.com/g1_compressed.dat";
constexpr size_t COMPRESSED_POINT_SIZE = 32;
constexpr size_t UNCOMPRESSED_POINT_SIZE = 64; // sizeof(g1::affine_element)

/**
 * @brief Write decompressed G1 points to a file in uncompressed format (64 bytes each).
 */
void write_uncompressed_g1_points(const std::vector<bb::g1::affine_element>& points, const std::filesystem::path& path)
{
    std::vector<uint8_t> buf(points.size() * UNCOMPRESSED_POINT_SIZE);
    bb::parallel_for([&](bb::ThreadChunk chunk) {
        for (auto i : chunk.range(points.size())) {
            auto serialized = to_buffer(points[i]);
            std::copy(serialized.begin(), serialized.end(), &buf[i * UNCOMPRESSED_POINT_SIZE]);
        }
    });
    bb::write_file(path, buf);
}

/**
 * @brief Read uncompressed G1 points (64 bytes each) from a file.
 */
std::vector<bb::g1::affine_element> read_uncompressed_g1_points(const std::filesystem::path& path, size_t num_points)
{
    auto data = bb::read_file(path, num_points * UNCOMPRESSED_POINT_SIZE);
    if (num_points > data.size() / UNCOMPRESSED_POINT_SIZE) {
        throw_or_abort("Truncated uncompressed BN254 CRS");
    }
    std::vector<bb::g1::affine_element> points(num_points);
    bb::parallel_for([&](bb::ThreadChunk chunk) {
        for (auto i : chunk.range(num_points)) {
            points[i] = from_buffer<bb::g1::affine_element>(data, i * UNCOMPRESSED_POINT_SIZE);
        }
    });
    return points;
}

/**
 * @brief Round num_points up to the next chunk boundary so every downloaded byte is hash-verified.
 */
size_t round_up_to_chunk_boundary(size_t num_points)
{
    if (num_points >= bb::srs::SRS_TOTAL_POINTS) {
        return bb::srs::SRS_TOTAL_POINTS;
    }
    size_t rounded = ((num_points + bb::srs::SRS_CHUNK_SIZE_POINTS - 1) / bb::srs::SRS_CHUNK_SIZE_POINTS) *
                     bb::srs::SRS_CHUNK_SIZE_POINTS;
    return std::min(rounded, bb::srs::SRS_TOTAL_POINTS);
}

/**
 * @brief Verify downloaded CRS data against embedded SHA-256 chunk hashes.
 *
 * @details Verifies all complete chunks in parallel across available cores with early-exit
 * on first mismatch. Also verifies the partial last chunk (if present) so every downloaded byte
 * is covered. Uses std::span to avoid per-chunk memory allocation.
 *
 * @note Invoked from `download_bn254_g1_data` (compensating for plain-HTTP fetch) and from the
 * cache-load path when `BB_VERIFY_CRS=1` is set. NOT invoked unconditionally on cache-load: the
 * default trust model assumes whatever populated the cache (`download_bn254_g1_data`, the
 * `barretenberg/crs/bootstrap.sh` script, an AMI/container preseed, or a `CRS_PATH` mount) is
 * the operator's responsibility to ensure correct. Operators who want per-load verification opt
 * in via `BB_VERIFY_CRS=1` or invoke `bb verify-crs` out-of-band. WASM (`bbapi::SrsInitSrs`)
 * receives bytes that bb.js fetched over HTTPS; `MemBn254Crs` is built in-process from
 * already-validated points.
 */
void verify_bn254_crs_integrity(const std::vector<uint8_t>& data)
{
    size_t num_full_chunks = data.size() / bb::srs::SRS_CHUNK_SIZE_BYTES;
    size_t chunks_to_verify = std::min(num_full_chunks, static_cast<size_t>(bb::srs::SRS_NUM_FULL_CHUNKS));

    // Sentinel value means "no failure found yet"
    const size_t sentinel = bb::srs::SRS_NUM_CHUNKS;
    std::atomic<size_t> failed_chunk{ sentinel };

    // Verify all complete chunks in parallel
    if (chunks_to_verify > 0) {
        bb::parallel_for([&](const bb::ThreadChunk& tc) {
            for (size_t i : tc.range(chunks_to_verify)) {
                // Early exit if another thread already found a mismatch
                if (failed_chunk.load(std::memory_order_relaxed) < sentinel) {
                    return;
                }
                size_t offset = i * bb::srs::SRS_CHUNK_SIZE_BYTES;
                auto chunk = std::span<const uint8_t>(data.data() + offset, bb::srs::SRS_CHUNK_SIZE_BYTES);
                auto hash = bb::crypto::sha256(chunk);
                if (hash != bb::srs::BN254_G1_CHUNK_HASHES[i]) {
                    size_t expected = sentinel;
                    failed_chunk.compare_exchange_strong(expected, i, std::memory_order_relaxed);
                }
            }
        });
    }

    // Verify partial last chunk (e.g. the 32-byte tail of the full CRS)
    size_t tail_offset = chunks_to_verify * bb::srs::SRS_CHUNK_SIZE_BYTES;
    size_t tail_size = data.size() - tail_offset;
    if (tail_size > 0 && chunks_to_verify < bb::srs::SRS_NUM_CHUNKS) {
        auto tail = std::span<const uint8_t>(data.data() + tail_offset, tail_size);
        auto hash = bb::crypto::sha256(tail);
        if (hash != bb::srs::BN254_G1_CHUNK_HASHES[chunks_to_verify]) {
            size_t expected = sentinel;
            failed_chunk.compare_exchange_strong(expected, chunks_to_verify, std::memory_order_relaxed);
        }
    }

    size_t bad = failed_chunk.load();
    if (bad < sentinel) {
        size_t offset = bad * bb::srs::SRS_CHUNK_SIZE_BYTES;
        throw_or_abort("CRS integrity check failed: SHA-256 mismatch at chunk " + std::to_string(bad) + " (bytes " +
                       std::to_string(offset) + "+)");
    }

    vinfo("verified ", chunks_to_verify + (tail_size > 0 ? 1 : 0), " BN254 G1 CRS chunks via SHA-256");
}

/**
 * @brief Decompress a buffer of compressed G1 points (32 bytes each) into affine elements.
 */
std::vector<bb::g1::affine_element> decompress_g1_points(const std::vector<uint8_t>& data, size_t num_points)
{
    if (num_points > data.size() / COMPRESSED_POINT_SIZE) {
        throw_or_abort("Truncated compressed BN254 CRS");
    }
    std::vector<bb::g1::affine_element> points(num_points);
    bb::parallel_for([&](bb::ThreadChunk chunk) {
        for (auto i : chunk.range(num_points)) {
            uint256_t compressed = from_buffer<uint256_t>(data, i * COMPRESSED_POINT_SIZE);
            points[i] = bb::g1::affine_element::from_compressed(compressed);
        }
    });
    return points;
}

std::vector<uint8_t> download_bn254_g1_data(size_t num_points,
                                            const std::string& primary_url,
                                            const std::string& fallback_url)
{
    // Round up to chunk boundary so every downloaded byte is hash-verified
    size_t download_points = round_up_to_chunk_boundary(num_points);
    size_t g1_end = (download_points * COMPRESSED_POINT_SIZE) - 1;

    // Try primary URL first, with fallback on failure.
    // Note: WASM is compiled with -fno-exceptions, so try/catch is not available.
    // In practice, WASM never calls this function - it initializes CRS via srs_init_srs from JavaScript.
    std::vector<uint8_t> data;
#ifndef __wasm__
    try {
        data = bb::srs::http_download(primary_url, 0, g1_end);
    } catch (const std::exception& e) {
        vinfo("Primary CRS download failed: ", e.what(), ". Trying fallback...");
        data = bb::srs::http_download(fallback_url, 0, g1_end);
    }
#else
    // WASM fallback: just try primary (will abort on failure)
    data = bb::srs::http_download(primary_url, 0, g1_end);
    static_cast<void>(fallback_url);
#endif

    if (data.size() < COMPRESSED_POINT_SIZE) {
        throw_or_abort("Downloaded g1 data is too small");
    }

    // Quick sanity check: verify the first two G1 points match expected values
    auto first = from_buffer<uint256_t>(data, 0);
    if (first != bb::srs::BN254_G1_FIRST_ELEMENT_COMPRESSED) {
        throw_or_abort("Downloaded BN254 G1 CRS first element does not match expected point.");
    }

    if (data.size() >= 2 * COMPRESSED_POINT_SIZE) {
        auto second = from_buffer<uint256_t>(data, COMPRESSED_POINT_SIZE);
        if (second != bb::srs::BN254_G1_SECOND_ELEMENT_COMPRESSED) {
            throw_or_abort("Downloaded BN254 G1 CRS second element does not match expected point.");
        }
    }

    // Full integrity verification: SHA-256 chunk hashes in parallel
    verify_bn254_crs_integrity(data);

    return data;
}

bb::Bn254G1Points heap_g1_points(std::vector<bb::g1::affine_element> points)
{
    auto storage = std::make_shared<const std::vector<bb::g1::affine_element>>(std::move(points));
    return { storage, std::span<const bb::g1::affine_element>(*storage) };
}

#if !defined(__wasm__) && !defined(_WIN32)
constexpr std::array<char, 8> NATIVE_CACHE_MAGIC = { 'B', 'B', 'G', '1', 'N', 'A', 'T', 'V' };
constexpr uint32_t NATIVE_CACHE_VERSION = 2;
constexpr uint32_t NATIVE_CACHE_ENDIAN_MARKER = 0x01020304;

/**
 * @brief Header of `bn254_g1.native.dat`, followed by the points exactly as they are laid out in memory (Montgomery
 * form, native-endian limbs). Its size keeps every point 64-byte aligned in the mapping.
 */
struct NativeCacheHeader {
    std::array<char, 8> magic;
    uint32_t version;
    uint32_t point_size;
    uint32_t endian_marker;
    uint32_t reserved;
    uint64_t num_points;
    // Size and POSIX modification time (ns since the Unix epoch) of the bn254_g1.dat the points were decoded from; a
    // refreshed source invalidates the cache.
    uint64_t source_size;
    int64_t source_mtime_ns;
    std::array<uint8_t, 16> padding;
};
static_assert(sizeof(NativeCacheHeader) == UNCOMPRESSED_POINT_SIZE);
static_assert(sizeof(bb::g1::affine_element) == UNCOMPRESSED_POINT_SIZE);
static_assert(std::is_trivially_copyable_v<bb::g1::affine_element>);

struct SourceStamp {
    uint64_t size;
    int64_t mtime_ns;
};

// Read with stat rather than std::filesystem::last_write_time: file_clock's epoch differs between libstdc++ and
// libc++, and binaries built with either share one cache.
std::optional<SourceStamp> stamp_of(const std::filesystem::path& path)
{
    struct stat st{};
    if (stat(path.c_str(), &st) != 0) {
        return std::nullopt;
    }
#if defined(__APPLE__)
    const auto& mtime = st.st_mtimespec;
#else
    const auto& mtime = st.st_mtim;
#endif
    return SourceStamp{ static_cast<uint64_t>(st.st_size),
                        static_cast<int64_t>(mtime.tv_sec) * 1'000'000'000 + static_cast<int64_t>(mtime.tv_nsec) };
}

NativeCacheHeader make_native_cache_header(uint64_t num_points, const SourceStamp& source)
{
    NativeCacheHeader header{};
    header.magic = NATIVE_CACHE_MAGIC;
    header.version = NATIVE_CACHE_VERSION;
    header.point_size = sizeof(bb::g1::affine_element);
    header.endian_marker = NATIVE_CACHE_ENDIAN_MARKER;
    header.num_points = num_points;
    header.source_size = source.size;
    header.source_mtime_ns = source.mtime_ns;
    return header;
}

/**
 * @brief Points held by an existing cache, whatever source or format version it was written for (num_points has kept
 * its offset since version 1); 0 if there is none. Only used to size a regenerated cache.
 */
size_t native_cache_point_count(const std::filesystem::path& cache_path)
{
    std::ifstream file(cache_path, std::ios::binary);
    NativeCacheHeader header{};
    if (!file.read(reinterpret_cast<char*>(&header), sizeof(header))) {
        return 0;
    }
    if (header.magic != NATIVE_CACHE_MAGIC || header.point_size != sizeof(bb::g1::affine_element) ||
        header.endian_marker != NATIVE_CACHE_ENDIAN_MARKER) {
        return 0;
    }
    return static_cast<size_t>(header.num_points);
}

/**
 * @brief Map the native-layout cache read-only and shared, returning its first num_points points, or nullopt when the
 * cache is missing, truncated, too short, or was written for another layout or source.
 */
std::optional<bb::Bn254G1Points> map_native_cache(const std::filesystem::path& cache_path,
                                                  size_t num_points,
                                                  const SourceStamp& source)
{
    int fd = open(cache_path.c_str(), O_RDONLY);
    if (fd < 0) {
        return std::nullopt;
    }
    struct stat st{};
    if (fstat(fd, &st) != 0 || static_cast<size_t>(st.st_size) < sizeof(NativeCacheHeader)) {
        close(fd);
        return std::nullopt;
    }
    const auto file_size = static_cast<size_t>(st.st_size);
    void* addr = mmap(nullptr, file_size, PROT_READ, MAP_SHARED, fd, 0);
    close(fd);
    if (addr == MAP_FAILED) {
        return std::nullopt;
    }
    std::shared_ptr<const void> storage(addr, [file_size](const void* p) { munmap(const_cast<void*>(p), file_size); });

    NativeCacheHeader header;
    std::memcpy(&header, addr, sizeof(header));
    const NativeCacheHeader expected = make_native_cache_header(header.num_points, source);
    const size_t payload_bytes = file_size - sizeof(NativeCacheHeader);
    if (std::memcmp(&header, &expected, sizeof(header)) != 0 || payload_bytes % UNCOMPRESSED_POINT_SIZE != 0 ||
        header.num_points != payload_bytes / UNCOMPRESSED_POINT_SIZE || header.num_points < num_points) {
        return std::nullopt;
    }
    const auto* points =
        reinterpret_cast<const bb::g1::affine_element*>(static_cast<const uint8_t*>(addr) + sizeof(NativeCacheHeader));
    return bb::Bn254G1Points{ std::move(storage), std::span<const bb::g1::affine_element>(points, num_points) };
}

bool write_all(int fd, const void* data, size_t bytes)
{
    const auto* cursor = static_cast<const uint8_t*>(data);
    while (bytes > 0) {
        const ssize_t written = write(fd, cursor, bytes);
        if (written < 0 && errno == EINTR) {
            continue;
        }
        if (written <= 0) {
            return false;
        }
        cursor += written;
        bytes -= static_cast<size_t>(written);
    }
    return true;
}

/**
 * @brief Write the cache from the first num_points points of the uncompressed source, decoding it in bounded chunks so
 * regeneration holds no full copy of the points. Written under a temporary name and renamed into place, so a reader
 * never maps a partial file and a process with the old file mapped keeps its inode.
 */
bool write_native_cache(const std::filesystem::path& cache_path,
                        const std::filesystem::path& uncompressed_path,
                        size_t num_points,
                        const SourceStamp& source)
{
    constexpr size_t CHUNK_POINTS = size_t{ 1 } << 14;
    std::ifstream input(uncompressed_path, std::ios::binary);
    if (!input) {
        return false;
    }
    auto tmp_path = cache_path;
    tmp_path += ".tmp." + std::to_string(getpid());
    int fd = open(tmp_path.c_str(), O_WRONLY | O_CREAT | O_TRUNC, 0644);
    if (fd < 0) {
        return false;
    }
    const NativeCacheHeader header = make_native_cache_header(num_points, source);
    bool ok = write_all(fd, &header, sizeof(header));
    std::vector<uint8_t> bytes(std::min(num_points, CHUNK_POINTS) * UNCOMPRESSED_POINT_SIZE);
    std::vector<bb::g1::affine_element> points(std::min(num_points, CHUNK_POINTS));
    for (size_t done = 0; ok && done < num_points;) {
        const size_t count = std::min(CHUNK_POINTS, num_points - done);
        if (!input.read(reinterpret_cast<char*>(bytes.data()),
                        static_cast<std::streamsize>(count * UNCOMPRESSED_POINT_SIZE))) {
            ok = false;
            break;
        }
        bb::parallel_for([&](bb::ThreadChunk chunk) {
            for (auto i : chunk.range(count)) {
                points[i] = from_buffer<bb::g1::affine_element>(bytes, i * UNCOMPRESSED_POINT_SIZE);
            }
        });
        ok = write_all(fd, points.data(), count * sizeof(bb::g1::affine_element));
        done += count;
    }
    ok = ok && fsync(fd) == 0;
    ok = close(fd) == 0 && ok;
    ok = ok && std::rename(tmp_path.c_str(), cache_path.c_str()) == 0;
    if (!ok) {
        unlink(tmp_path.c_str());
    }
    return ok;
}
#endif

} // namespace

namespace bb {

namespace {
// Body of get_bn254_g1_data; the caller holds the CRS lock.
std::vector<g1::affine_element> get_bn254_g1_data_locked(const std::filesystem::path& path,
                                                         size_t num_points,
                                                         bool allow_download,
                                                         const std::string& primary_url,
                                                         const std::string& fallback_url)
{
    BB_BENCH_NAME("get_bn254_g1_data");
    const bool verify_cached_crs = std::getenv("BB_VERIFY_CRS") != nullptr;
    const size_t cached_read_points = verify_cached_crs ? round_up_to_chunk_boundary(num_points) : num_points;

    auto uncompressed_path = path / "bn254_g1.dat";
    auto compressed_path = path / "bn254_g1_compressed.dat";

    // Uncompressed caches have no pinned hashes; verified loads must use the compressed source.
    // 1. Prefer cached uncompressed (fastest: parallel from_buffer, ~0.3s for 2^20 points)
    size_t uncompressed_points = get_file_size(uncompressed_path) / UNCOMPRESSED_POINT_SIZE;
    if (!verify_cached_crs && uncompressed_points >= num_points) {
        vinfo("using cached uncompressed bn254 crs with ", uncompressed_points, " points at ", uncompressed_path);
        return read_uncompressed_g1_points(uncompressed_path, num_points);
    }

    // 2. Fall back to compressed on disk: decompress and cache uncompressed
    size_t compressed_points = get_file_size(compressed_path) / COMPRESSED_POINT_SIZE;
    if (compressed_points >= num_points) {
        vinfo("decompressing cached compressed bn254 crs (", compressed_points, " points)...");
        auto data = read_file(compressed_path, cached_read_points * COMPRESSED_POINT_SIZE);
        // BB_VERIFY_CRS=1 opts in to per-load verification of cached compressed bytes against the
        // compiled-in chunk hashes. Off by default so cache-hit loads stay cheap.
        if (verify_cached_crs) {
            verify_bn254_crs_integrity(data);
        }
        auto points = decompress_g1_points(data, num_points);
        write_uncompressed_g1_points(points, uncompressed_path);
        vinfo("cached uncompressed bn254 crs at ", uncompressed_path);
        return points;
    }

    if (!allow_download && compressed_points == 0) {
        throw_or_abort("bn254 g1 data not found at " + path.string() +
                       " and bb does not automatically download in this context." +
                       " Run barretenberg/crs/bootstrap.sh to download.");
    } else if (!allow_download) {
        throw_or_abort(format("bn254 g1 data had ",
                              compressed_points,
                              " points and ",
                              num_points,
                              " were requested but download not allowed in this context"));
    }

    // Double-check after acquiring lock (another process may have downloaded while we waited)
    uncompressed_points = get_file_size(uncompressed_path) / UNCOMPRESSED_POINT_SIZE;
    if (!verify_cached_crs && uncompressed_points >= num_points) {
        return read_uncompressed_g1_points(uncompressed_path, num_points);
    }
    compressed_points = get_file_size(compressed_path) / COMPRESSED_POINT_SIZE;
    if (compressed_points >= num_points) {
        auto data = read_file(compressed_path, cached_read_points * COMPRESSED_POINT_SIZE);
        if (verify_cached_crs) {
            verify_bn254_crs_integrity(data);
        }
        auto points = decompress_g1_points(data, num_points);
        write_uncompressed_g1_points(points, uncompressed_path);
        return points;
    }

    // 3. Download compressed, decompress, cache uncompressed
    vinfo("downloading bn254 crs...");
    auto data = download_bn254_g1_data(num_points, primary_url, fallback_url);
    write_file(compressed_path, data);
    auto points = decompress_g1_points(data, num_points);
    write_uncompressed_g1_points(points, uncompressed_path);
    vinfo("cached uncompressed bn254 crs at ", uncompressed_path);
    return points;
}
} // namespace

// Main implementation with configurable URLs
std::vector<g1::affine_element> get_bn254_g1_data(const std::filesystem::path& path,
                                                  size_t num_points,
                                                  bool allow_download,
                                                  const std::string& primary_url,
                                                  const std::string& fallback_url)
{
    std::filesystem::create_directories(path);
    // Acquire exclusive lock to prevent simultaneous downloads
    FileLockGuard lock((path / "crs.lock").string());
    return get_bn254_g1_data_locked(path, num_points, allow_download, primary_url, fallback_url);
}

// Default overload using production URLs
std::vector<g1::affine_element> get_bn254_g1_data(const std::filesystem::path& path,
                                                  size_t num_points,
                                                  bool allow_download)
{
    return get_bn254_g1_data(path, num_points, allow_download, CRS_PRIMARY_URL, CRS_FALLBACK_URL);
}

Bn254G1Points load_bn254_g1_points(const std::filesystem::path& path, size_t num_points, bool allow_download)
{
#if !defined(__wasm__) && !defined(_WIN32)
    if (std::endian::native != std::endian::little || std::getenv("BB_VERIFY_CRS") != nullptr) {
        return heap_g1_points(get_bn254_g1_data(path, num_points, allow_download));
    }
    const auto uncompressed_path = path / "bn254_g1.dat";
    const auto cache_path = path / "bn254_g1.native.dat";
    std::filesystem::create_directories(path);
    // Held across check and regeneration, so concurrent requests of different sizes cannot overwrite each other.
    FileLockGuard lock((path / "crs.lock").string());

    auto source = stamp_of(uncompressed_path);
    if (source) {
        if (auto mapped = map_native_cache(cache_path, num_points, *source)) {
            vinfo("mapped native bn254 crs cache at ", cache_path);
            return *mapped;
        }
    }

    std::optional<std::vector<g1::affine_element>> decoded;
    if (!source || source->size / UNCOMPRESSED_POINT_SIZE < num_points) {
        // Only this path, which has to produce bn254_g1.dat, decodes the points onto the heap.
        decoded = get_bn254_g1_data_locked(path, num_points, allow_download, CRS_PRIMARY_URL, CRS_FALLBACK_URL);
        source = stamp_of(uncompressed_path);
    }
    if (source) {
        // Never shrink the cache: another process may need the points a smaller request does not.
        const size_t available = source->size / UNCOMPRESSED_POINT_SIZE;
        const size_t cache_points = std::min(available, std::max(num_points, native_cache_point_count(cache_path)));
        decoded.reset();
        if (cache_points >= num_points && write_native_cache(cache_path, uncompressed_path, cache_points, *source)) {
            if (auto mapped = map_native_cache(cache_path, num_points, *source)) {
                vinfo("wrote and mapped native bn254 crs cache (", cache_points, " points) at ", cache_path);
                return *mapped;
            }
        }
    }
    vinfo("could not use a native bn254 crs cache at ", cache_path, "; keeping the points on the heap");
    if (!decoded) {
        decoded = get_bn254_g1_data_locked(path, num_points, allow_download, CRS_PRIMARY_URL, CRS_FALLBACK_URL);
    }
    return heap_g1_points(std::move(*decoded));
#else
    return heap_g1_points(get_bn254_g1_data(path, num_points, allow_download));
#endif
}

// Loads the canonical 128-byte serialization of [x]_2 from disk and verifies it against the pinned
// SHA-256 and the BN254 G2 prime-order subgroup.
g2::affine_element get_bn254_g2_data(const std::filesystem::path& path)
{
    constexpr size_t G2_BYTES = 128;
    auto g2_path = path / "bn254_g2.dat";
    if (get_file_size(g2_path) != G2_BYTES) {
        throw_or_abort("bn254 g2 data not found at " + path.string() +
                       " or has wrong size. Run barretenberg/crs/bootstrap.sh to provision.");
    }
    auto data = read_file(g2_path, G2_BYTES);
    auto point = from_buffer<g2::affine_element>(data.data());

    // Reject the point at infinity: it is a member of every subgroup (so subgroup check passes)
    // but `e(−W, O) = 1` for every W, which collapses the KZG verifier's pairing check and lets
    // a malicious prover forge arbitrary openings.
    if (point.is_point_at_infinity()) {
        throw_or_abort("bn254 g2 cannot be the point at infinity");
    }

    // Verify SHA-256 hash of the raw bytes matches the pinned constant for canonical [x]_2.
    auto hash = bb::crypto::sha256(std::span<const uint8_t>(data.data(), data.size()));
    if (hash != bb::srs::BN254_G2_ELEMENT_SHA256) {
        throw_or_abort("bn254 g2 SHA-256 mismatch: payload does not match the canonical [x]_2");
    }
    if (!point.is_in_prime_subgroup()) {
        throw_or_abort("bn254 g2 deserialized to a point outside the prime-order subgroup");
    }
    return point;
}

} // namespace bb
