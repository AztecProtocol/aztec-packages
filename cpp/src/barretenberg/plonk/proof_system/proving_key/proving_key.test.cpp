#include "barretenberg/common/test.hpp"
#include "barretenberg/common/streams.hpp"
#include "proving_key.hpp"
#include "serialize.hpp"
#include "barretenberg/plonk/composer/standard_plonk_composer.hpp"
#include "barretenberg/plonk/composer/ultra_plonk_composer.hpp"

#ifndef __wasm__
#include <filesystem>
#endif

using namespace barretenberg;
using namespace proof_system;

// Test proving key serialization/deserialization to/from buffer
TEST(proving_key, proving_key_from_serialized_key)
{
    plonk::StandardPlonkComposer composer = plonk::StandardPlonkComposer();
    fr a = fr::one();
    composer.add_public_variable(a);

    plonk::proving_key& p_key = *composer.compute_proving_key();
    auto pk_buf = to_buffer(p_key);
    auto pk_data = from_buffer<plonk::proving_key_data>(pk_buf);
    auto crs = std::make_unique<barretenberg::srs::factories::FileCrsFactory>("../srs_db/ignition");
    auto proving_key =
        std::make_shared<plonk::proving_key>(std::move(pk_data), crs->get_prover_crs(pk_data.circuit_size + 1));

    // Loop over all pre-computed polys for the given composer type and ensure equality
    // between original proving key polynomial store and the polynomial store that was
    // serialized/deserialized from buffer
    plonk::PrecomputedPolyList precomputed_poly_list(p_key.composer_type);
    bool all_polys_are_equal{ true };
    for (size_t i = 0; i < precomputed_poly_list.size(); ++i) {
        std::string poly_id = precomputed_poly_list[i];
        auto input_poly = p_key.polynomial_store.get(poly_id);
        auto output_poly = proving_key->polynomial_store.get(poly_id);
        all_polys_are_equal = all_polys_are_equal && (input_poly == output_poly);
    }

    // Check that all pre-computed polynomials are equal
    EXPECT_EQ(all_polys_are_equal, true);

    // Check equality of other proving_key_data data
    EXPECT_EQ(p_key.composer_type, proving_key->composer_type);
    EXPECT_EQ(p_key.circuit_size, proving_key->circuit_size);
    EXPECT_EQ(p_key.num_public_inputs, proving_key->num_public_inputs);
    EXPECT_EQ(p_key.contains_recursive_proof, proving_key->contains_recursive_proof);
}

// Test proving key serialization/deserialization to/from buffer using UltraPlonkComposer
TEST(proving_key, proving_key_from_serialized_key_ultra)
{
    plonk::UltraPlonkComposer composer = plonk::UltraPlonkComposer();
    fr a = fr::one();
    composer.add_public_variable(a);

    plonk::proving_key& p_key = *composer.compute_proving_key();
    auto pk_buf = to_buffer(p_key);
    auto pk_data = from_buffer<plonk::proving_key_data>(pk_buf);
    auto crs = std::make_unique<barretenberg::srs::factories::FileCrsFactory>("../srs_db/ignition");
    auto proving_key =
        std::make_shared<plonk::proving_key>(std::move(pk_data), crs->get_prover_crs(pk_data.circuit_size + 1));

    // Loop over all pre-computed polys for the given composer type and ensure equality
    // between original proving key polynomial store and the polynomial store that was
    // serialized/deserialized from buffer
    plonk::PrecomputedPolyList precomputed_poly_list(p_key.composer_type);
    bool all_polys_are_equal{ true };
    for (size_t i = 0; i < precomputed_poly_list.size(); ++i) {
        std::string poly_id = precomputed_poly_list[i];
        auto input_poly = p_key.polynomial_store.get(poly_id);
        auto output_poly = proving_key->polynomial_store.get(poly_id);
        all_polys_are_equal = all_polys_are_equal && (input_poly == output_poly);
    }

    // Check that all pre-computed polynomials are equal
    EXPECT_EQ(all_polys_are_equal, true);

    // Check equality of other proving_key_data data
    EXPECT_EQ(p_key.composer_type, proving_key->composer_type);
    EXPECT_EQ(p_key.circuit_size, proving_key->circuit_size);
    EXPECT_EQ(p_key.num_public_inputs, proving_key->num_public_inputs);
    EXPECT_EQ(p_key.contains_recursive_proof, proving_key->contains_recursive_proof);
}

/**
// Test that a proving key can be serialized/deserialized using mmap
#ifndef __wasm__
TEST(proving_key, proving_key_from_mmaped_key)
{
    plonk::StandardPlonkComposer composer = plonk::StandardPlonkComposer();
    fr a = fr::one();
    composer.add_public_variable(a);

    // Write each precomputed polynomial in the proving key to
    // its own file using write_mmap
    std::string pk_dir = "../src/barretenberg/proof_system/proving_key/fixtures";
    std::filesystem::create_directories(pk_dir);
    std::string pk_path = pk_dir + "/proving_key";
    std::ofstream os(pk_path);
    // TODO: Investigate why this test fails in CI.
    // WASI-SDK does not include support for <filesystem>, so we had to replace the call to
    // `std::filesystem::create_directories(pk_dir);`
    // with
    // `mkdir(pk_dir.c_str(), 0700);`.
    // It looks like the POSIX method would set the ERRNO after attempting to create the directory.
    // The exception block is left here to help solve the problem later.
    // try {
    //     os.exceptions(std::ifstream::failbit | std::ifstream::badbit);
    // } catch (const std::ios_base::failure& e) {
    //     std::cout << "Caught an ios_base::failure.\n"
    //               << "Error code: " << e.code().value() << " (" << e.code().message() << ")\n"
    //               << "Error category: " << e.code().category().name() << '\n';
    // }
    if (!os.good()) {
        std::cerr << "OS failed in composer_from_mmap_keys! \n";
    }
    plonk::proving_key& p_key = *composer.compute_proving_key();
    write_mmap(os, pk_dir, p_key);
    os.close();

    // Read each precomputed polynomial from the files written above
    // into a proving_key_data polynomial store using read_mmap
    std::ifstream pk_stream = std::ifstream(pk_path);
    if (!pk_stream.good()) {
        std::cerr << "IS failed in composer_from_mmap_keys! \n";
    }
    plonk::proving_key_data pk_data;
    read_mmap(pk_stream, pk_dir, pk_data);
    pk_stream.close();

    // Loop over all pre-computed polys for the given composer type and ensure equality
    // between original proving key polynomial store and the polynomial store that was
    // serialized/deserialized via mmap
    plonk::PrecomputedPolyList precomputed_poly_list(p_key.composer_type);
    bool all_polys_are_equal{ true };
    for (size_t i = 0; i < precomputed_poly_list.size(); ++i) {
        std::string poly_id = precomputed_poly_list[i];
        barretenberg::polynomial& input_poly = p_key.polynomial_store.get(poly_id);
        barretenberg::polynomial& output_poly = pk_data.polynomial_store.get(poly_id);
        all_polys_are_equal = all_polys_are_equal && (input_poly == output_poly);
    }

    // Check that all pre-computed polynomials are equal
    EXPECT_EQ(all_polys_are_equal, true);

    // Check equality of other proving_key_data data
    EXPECT_EQ(p_key.composer_type, pk_data.composer_type);
    EXPECT_EQ(p_key.circuit_size, pk_data.circuit_size);
    EXPECT_EQ(p_key.num_public_inputs, pk_data.num_public_inputs);
    EXPECT_EQ(p_key.contains_recursive_proof, pk_data.contains_recursive_proof);
}
#endif
*/
