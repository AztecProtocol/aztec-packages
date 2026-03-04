#!/usr/bin/env bash
# Generate SHA256 chunk hashes for BN254 CRS G1 data.
# Outputs a C++ header file (bn254_crs_hashes.hpp) with embedded hashes.
#
# Usage: ./generate_crs_hashes.sh [crs_file] [output_file]
#   crs_file:    Path to bn254_g1.dat (default: downloads from CDN)
#   output_file: Output header path (default: stdout)
#
# Requirements: python3, curl (if downloading)

set -euo pipefail

CRS_FILE="${1:-}"
OUTPUT_FILE="${2:-}"
CHUNK_SIZE=8388608  # 8MB

# Download CRS if not provided
if [ -z "$CRS_FILE" ]; then
    CRS_FILE=$(mktemp /tmp/bn254_g1_XXXXXX.dat)
    trap 'rm -f "$CRS_FILE"' EXIT

    # Download 2^25 + 1 points = 33,554,433 * 64 bytes
    NUM_BYTES=$((33554433 * 64))
    END_BYTE=$((NUM_BYTES - 1))

    PRIMARY_URL="http://crs.aztec-cdn.foundation/g1.dat"
    FALLBACK_URL="http://crs.aztec-labs.com/g1.dat"

    echo "Downloading BN254 CRS G1 data ($NUM_BYTES bytes)..." >&2
    if ! curl -f --range "0-$END_BYTE" "$PRIMARY_URL" -o "$CRS_FILE" 2>/dev/null; then
        echo "Primary download failed, trying fallback..." >&2
        curl -f --range "0-$END_BYTE" "$FALLBACK_URL" -o "$CRS_FILE"
    fi
    echo "Download complete." >&2
fi

if [ ! -f "$CRS_FILE" ]; then
    echo "Error: CRS file not found: $CRS_FILE" >&2
    exit 1
fi

python3 -c "
import hashlib, sys, os

CHUNK_SIZE = $CHUNK_SIZE
crs_file = '$CRS_FILE'
hashes = []

with open(crs_file, 'rb') as f:
    while True:
        chunk = f.read(CHUNK_SIZE)
        if not chunk:
            break
        hashes.append(hashlib.sha256(chunk).digest())

file_size = os.path.getsize(crs_file)
full_chunks = file_size // CHUNK_SIZE
partial_size = file_size % CHUNK_SIZE
points_per_chunk = CHUNK_SIZE // 64

out = sys.stdout
out.write('#pragma once\n')
out.write('#include \"barretenberg/common/thread.hpp\"\n')
out.write('#include \"barretenberg/common/throw_or_abort.hpp\"\n')
out.write('#include \"barretenberg/crypto/sha256/sha256.hpp\"\n')
out.write('#include <array>\n')
out.write('#include <atomic>\n')
out.write('#include <cstddef>\n')
out.write('#include <cstdint>\n')
out.write('#include <span>\n')
out.write('#include <string>\n')
out.write('#include <vector>\n')
out.write('\n')
out.write('namespace bb::srs {\n')
out.write('\n')
out.write('/**\n')
out.write(' * @brief SHA256 hashes for integrity verification of downloaded BN254 CRS G1 data.\n')
out.write(' *\n')
out.write(' * @details The CRS file is divided into 8MB (8,388,608 byte) chunks. Each entry contains\n')
out.write(' * the SHA256 hash of the corresponding chunk. Downloads are rounded up to 8MB boundaries\n')
out.write(' * so that every downloaded chunk can be fully verified.\n')
out.write(' *\n')
out.write(f' * Source file: bn254_g1.dat ({file_size} bytes, {file_size // 64} G1 points)\n')
out.write(f' * Chunk size: {CHUNK_SIZE} bytes ({points_per_chunk} points per chunk)\n')
out.write(f' * Total chunks: {len(hashes)} ({full_chunks} full + 1 partial of {partial_size} bytes)\n')
out.write(' *\n')
out.write(' * Regenerate with: barretenberg/scripts/generate_crs_hashes.sh\n')
out.write(' */\n')
out.write(f'constexpr size_t CRS_HASH_CHUNK_SIZE = {CHUNK_SIZE};\n')
out.write(f'constexpr size_t CRS_NUM_CHUNK_HASHES = {len(hashes)};\n')
out.write('\n')
out.write('// clang-format off\n')
out.write(f'inline const std::array<crypto::Sha256Hash, {len(hashes)}> BN254_CRS_CHUNK_HASHES = {{{{\n')
for i, h in enumerate(hashes):
    hex_bytes = ', '.join(f'0x{b:02x}' for b in h)
    comma = ',' if i < len(hashes) - 1 else ''
    out.write(f'    {{ {hex_bytes} }}{comma}\n')
out.write('}};\n')
out.write('// clang-format on\n')
out.write('\n')
out.write('/**\n')
out.write(' * @brief Verify downloaded CRS data against embedded SHA256 chunk hashes.\n')
out.write(' *\n')
out.write(' * @details Verifies the integrity of downloaded CRS data by checking SHA256 hashes\n')
out.write(' * of each complete 8MB chunk in parallel across available cores. Only full chunks are\n')
out.write(' * verified - trailing data smaller than the chunk size is not checked (the caller should\n')
out.write(' * validate the first elements separately for small downloads). This provides integrity\n')
out.write(' * verification for CRS data downloaded over HTTP without requiring SSL/TLS.\n')
out.write(' *\n')
out.write(' * @param data The downloaded CRS data bytes\n')
out.write(' * @throws If any chunk hash does not match the expected value\n')
out.write(' */\n')
out.write('inline void verify_bn254_crs_integrity(const std::vector<uint8_t>& data)\n')
out.write('{\n')
out.write('    // Only verify full chunks. Partial trailing data (< 8MB) is not checked here.\n')
out.write('    size_t num_full_chunks = data.size() / CRS_HASH_CHUNK_SIZE;\n')
out.write('    size_t chunks_to_verify = std::min(num_full_chunks, CRS_NUM_CHUNK_HASHES);\n')
out.write('    if (chunks_to_verify == 0) {\n')
out.write('        return;\n')
out.write('    }\n')
out.write('\n')
out.write('    // Track the first failing chunk index across threads.\n')
out.write('    std::atomic<size_t> failed_chunk{ chunks_to_verify }; // sentinel = no failure\n')
out.write('\n')
out.write('    parallel_for([&](const ThreadChunk& tc) {\n')
out.write('        for (size_t i : tc.range(chunks_to_verify)) {\n')
out.write('            // Early exit if another thread already found a mismatch.\n')
out.write('            if (failed_chunk.load(std::memory_order_relaxed) < chunks_to_verify) {\n')
out.write('                return;\n')
out.write('            }\n')
out.write('            size_t offset = i * CRS_HASH_CHUNK_SIZE;\n')
out.write('            auto chunk = std::span<const uint8_t>(data.data() + offset, CRS_HASH_CHUNK_SIZE);\n')
out.write('            auto hash = crypto::sha256(chunk);\n')
out.write('            if (hash != BN254_CRS_CHUNK_HASHES[i]) {\n')
out.write('                // Store the smallest failing index we see.\n')
out.write('                size_t expected = chunks_to_verify;\n')
out.write('                failed_chunk.compare_exchange_strong(expected, i, std::memory_order_relaxed);\n')
out.write('            }\n')
out.write('        }\n')
out.write('    });\n')
out.write('\n')
out.write('    size_t bad = failed_chunk.load();\n')
out.write('    if (bad < chunks_to_verify) {\n')
out.write('        size_t offset = bad * CRS_HASH_CHUNK_SIZE;\n')
out.write('        throw_or_abort(\"CRS integrity check failed: SHA256 mismatch at chunk \" + std::to_string(bad) +\n')
out.write('                       \" (bytes \" + std::to_string(offset) + \"-\" +\n')
out.write('                       std::to_string(offset + CRS_HASH_CHUNK_SIZE - 1) + \")\");\n')
out.write('    }\n')
out.write('}\n')
out.write('\n')
out.write('} // namespace bb::srs\n')

print(f'Generated {len(hashes)} chunk hashes for {file_size} bytes', file=sys.stderr)
" ${OUTPUT_FILE:+> "$OUTPUT_FILE"}

if [ -n "$OUTPUT_FILE" ]; then
    echo "Written to: $OUTPUT_FILE" >&2
fi
