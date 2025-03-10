#pragma once

#include <cstdint>
#include <iostream>
#include <vector>

/**
 * @brief Writes raw bytes of the vector to stdout
 *
 * Note: std::cout << byte is not being used here because that always prints the numerical value.
 * << can also apply formatting and seems is not the appropriate way to write raw bytes to stdout.
 *
 * Example:
 *
 *  uint8_t byte = 'A'
 *  std::cout << byte; // prints 65
 *  std::cout.put(byte); // prints 'A'
 *
 * @param data The raw bytes that we want to write to stdout
 */
inline void write_bytes_to_stdout(const std::vector<uint8_t>& data)
{
    for (auto byte : data) {
        // Safety: a byte and a char occupy one byte
        std::cout.put(static_cast<char>(byte));
    }
}

/**
 * @brief Writes a uint64_t to stdout in little endian format
 *
 * @param value The value to be written to stdout
 */
inline void writeUint64AsRawBytesToStdout(uint64_t value)
{
    // Convert the uint64_t to a vector of bytes, since std::cout.put
    // only accepts a single byte.
    std::vector<uint8_t> bytes;
    bytes.reserve(sizeof(uint64_t));

    for (size_t i = 0; i < sizeof(uint64_t); ++i) {
        bytes.push_back(static_cast<uint8_t>(value & 0xFF));
        value >>= 8;
    }

    write_bytes_to_stdout(bytes);
}
