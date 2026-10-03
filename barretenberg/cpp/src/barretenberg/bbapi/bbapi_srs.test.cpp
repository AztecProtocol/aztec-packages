#include "barretenberg/bbapi/bbapi_srs.hpp"
#include "barretenberg/common/serialize.hpp"
#include "barretenberg/srs/factories/grumpkin_crs_data.hpp"
#include "barretenberg/srs/factories/grumpkin_srs_gen.hpp"
#include <gtest/gtest.h>

namespace bb::bbapi {

TEST(GrumpkinSrsIngress, RejectsUnverifiedPrefix)
{
    auto points = srs::generate_grumpkin_srs(2);
    points[1] = points[0];
    SrsInitGrumpkinSrs command{ .points_buf = to_buffer(points), .num_points = 2 };
    BBApiRequest request;
    EXPECT_THROW(std::move(command).execute(request), std::runtime_error);
}

TEST(GrumpkinSrsIngress, RejectsUnverifiedTrailingPoints)
{
    auto points = srs::generate_grumpkin_srs(srs::GRUMPKIN_G1_CHUNK_SIZE_POINTS);
    points.push_back(points[0]);
    points.push_back(points[0]);
    SrsInitGrumpkinSrs command{ .points_buf = to_buffer(points), .num_points = static_cast<uint32_t>(points.size()) };
    BBApiRequest request;
    EXPECT_THROW(std::move(command).execute(request), std::runtime_error);
}

TEST(GrumpkinSrsIngress, AcceptsCanonicalChunksForRequestedPrefix)
{
    const auto points = srs::generate_grumpkin_srs(srs::GRUMPKIN_G1_NUM_POINTS);
    BBApiRequest request;
    for (uint32_t count :
         { 2U, static_cast<uint32_t>(srs::GRUMPKIN_G1_CHUNK_SIZE_POINTS), static_cast<uint32_t>(points.size()) }) {
        SCOPED_TRACE(count);
        SrsInitGrumpkinSrs command{ .points_buf = to_buffer(points), .num_points = count };
        EXPECT_NO_THROW(std::move(command).execute(request));
    }
}

TEST(GrumpkinSrsIngress, RejectsInvalidPointCounts)
{
    BBApiRequest request;
    for (uint32_t count : { 0U, static_cast<uint32_t>(srs::GRUMPKIN_G1_NUM_POINTS + 1) }) {
        SCOPED_TRACE(count);
        SrsInitGrumpkinSrs command{ .points_buf = {}, .num_points = count };
        EXPECT_THROW(std::move(command).execute(request), std::runtime_error);
    }
}

} // namespace bb::bbapi
