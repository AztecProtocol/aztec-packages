#pragma once
#include <fstream>
#include <sys/stat.h>

#include "../constants.hpp"
#include "barretenberg/common/log.hpp"
#include "barretenberg/common/timer.hpp"
#include "barretenberg/plonk/proof_system/proving_key/serialize.hpp"
#include "join_split/join_split.hpp"

#ifndef __wasm__
#include <filesystem>
#endif

namespace bb::join_split_example::proofs {

struct circuit_data {
    circuit_data()
        : num_gates(0)
    {}

    std::shared_ptr<bb::srs::factories::CrsFactory<curve::BN254>> srs;
    std::shared_ptr<plonk::proving_key> proving_key;
    std::shared_ptr<plonk::verification_key> verification_key;
    size_t num_gates;
    std::vector<uint8_t> padding_proof;
    bool mock;
};

namespace {
inline bool exists(std::string const& path)
{
    struct stat st;
    return (stat(path.c_str(), &st) != -1);
}
} // namespace

} // namespace bb::join_split_example::proofs
