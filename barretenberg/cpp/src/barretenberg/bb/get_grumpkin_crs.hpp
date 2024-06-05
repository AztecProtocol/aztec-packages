#pragma once
#include <barretenberg/ecc/curves/bn254/g1.hpp>
#include <barretenberg/srs/io.hpp>
#include <filesystem>
#include <fstream>
#include <ios>
#include <stddef.h>
#include <vector>

#include "barretenberg/ecc/curves/grumpkin/grumpkin.hpp"
#include "exec_pipe.hpp"
#include "file_io.hpp"
#include "log.hpp"

namespace bb {

std::vector<curve::Grumpkin::AffineElement> get_grumpkin_g1_data(const std::filesystem::path& path, size_t num_points);

}