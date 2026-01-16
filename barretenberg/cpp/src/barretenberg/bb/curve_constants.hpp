/**
 * @file curve_constants.hpp
 * @brief Programmatic interface for generating msgpack-encoded curve constants
 */
#pragma once

#include <string>
#include <vector>

namespace bb {

/**
 * @brief Generate msgpack-encoded curve constants for all supported curves
 * @return Vector of bytes containing msgpack-encoded curve constants
 */
std::vector<uint8_t> get_curve_constants_msgpack();

/**
 * @brief Write msgpack-encoded curve constants to stdout
 */
void write_curve_constants_msgpack_to_stdout();

} // namespace bb
