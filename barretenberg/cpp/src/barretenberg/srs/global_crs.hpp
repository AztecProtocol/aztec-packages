#pragma once
#include "./factories/crs_factory.hpp"
#include "barretenberg/ecc/curves/bn254/bn254.hpp"
#include "barretenberg/ecc/curves/grumpkin/grumpkin.hpp"

namespace bb::srs {

// TODO(Adam): These are called even with wasm-in-the-browser, which seems wrong.
// We end up aborting due to the wasi call to resolve the environment variables (I commented the stubs abort for now).
// The call comes from GoblinProver ctor and call to perform_op_queue_interactions_for_mock_first_circuit.
// Delete this ifdef block once resolved.
inline std::string get_ignition_crs_path()
{
    const char* env_var = std::getenv("IGNITION_CRS_PATH");
    return env_var != nullptr ? std::string(env_var) : "../srs_db/ignition";
}

inline std::string get_grumpkin_crs_path()
{
    const char* env_var = std::getenv("GRUMPKIN_CRS_PATH");
    return env_var != nullptr ? std::string(env_var) : "../srs_db/grumpkin";
}

// Initializes the crs using files
void init_crs_factory(std::string crs_path);
void init_grumpkin_crs_factory(std::string crs_path);

// Initializes the crs using memory buffers
void init_grumpkin_crs_factory(std::vector<curve::Grumpkin::AffineElement> const& points);
void init_crs_factory(std::vector<bb::g1::affine_element> const& points, bb::g2::affine_element const g2_point);

std::shared_ptr<factories::CrsFactory<curve::BN254>> get_bn254_crs_factory();
std::shared_ptr<factories::CrsFactory<curve::Grumpkin>> get_grumpkin_crs_factory();

template <typename Curve> std::shared_ptr<factories::CrsFactory<Curve>> get_crs_factory();

} // namespace bb::srs