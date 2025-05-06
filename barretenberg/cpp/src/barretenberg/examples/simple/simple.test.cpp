#include "simple.hpp"
#include "barretenberg/srs/global_crs.hpp"
#include <barretenberg/common/test.hpp>
#include <filesystem>

namespace examples::simple {

TEST(examples_simple, create_proof)
{
    srs::init_file_crs_factory(srs::default_crs_path());
    auto ptrs = create_builder_and_composer();
    auto proof = create_proof(ptrs);
    bool valid = verify_proof(ptrs, proof);
    delete_builder_and_composer(ptrs);
    EXPECT_TRUE(valid);
}

} // namespace examples::simple
