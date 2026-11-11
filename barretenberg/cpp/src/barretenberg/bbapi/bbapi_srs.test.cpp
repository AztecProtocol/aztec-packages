#include "barretenberg/bbapi/generated/bb_ffi.hpp"
#include "barretenberg/bbapi/generated/bb_types.hpp"
#include "barretenberg/bbapi/generated/ipc_codegen/msgpack_adaptor.hpp"
#include "barretenberg/bbapi/generated/ipc_codegen/msgpack_include.hpp"
#include "barretenberg/common/serialize.hpp"
#include "barretenberg/ecc/curves/bn254/g2.hpp"
#include "barretenberg/srs/factories/bn254_crs_data.hpp"
#include "barretenberg/srs/factories/grumpkin_crs_data.hpp"
#include "barretenberg/srs/factories/grumpkin_srs_gen.hpp"
#include <gtest/gtest.h>

// SRS ingress is tested through the FFI entry, the dispatch every client (bb.js, the IPC server,
// barretenberg-rs) goes through.

#ifndef BB_NO_EXCEPTIONS

using namespace bb;
using namespace bb::bbapi;

namespace {

/** Runs a command through the FFI entry and returns the response's type name. */
template <typename Cmd> std::string dispatch(const char* name, const Cmd& cmd)
{
    msgpack::sbuffer buf;
    msgpack::packer<msgpack::sbuffer> pk(buf);
    pk.pack_array(1);
    pk.pack_array(2);
    pk.pack(std::string(name));
    pk.pack(cmd);

    uint8_t* out = nullptr;
    size_t out_len = 0;
    bb_ipc_ffi_entry(reinterpret_cast<const uint8_t*>(buf.data()), buf.size(), &out, &out_len);
    auto oh = msgpack::unpack(reinterpret_cast<const char*>(out), out_len);
    bb_ipc_ffi_free(out);
    return oh.get().via.array.ptr[0].as<std::string>();
}

const std::string GRUMPKIN_OK = "BbSrsInitGrumpkinSrsResponse";
const std::string ERROR = "BbErrorResponse";

std::string init_grumpkin(const std::vector<curve::Grumpkin::AffineElement>& points, uint32_t num_points)
{
    wire::BbSrsInitGrumpkinSrs cmd;
    cmd.points_buf = to_buffer(points);
    cmd.num_points = num_points;
    return dispatch("BbSrsInitGrumpkinSrs", cmd);
}

} // namespace

TEST(GrumpkinSrsIngress, RejectsUnverifiedPrefix)
{
    auto points = srs::generate_grumpkin_srs(2);
    points[1] = points[0];
    EXPECT_EQ(init_grumpkin(points, 2), ERROR);
}

TEST(GrumpkinSrsIngress, RejectsTamperedChunk)
{
    auto points = srs::generate_grumpkin_srs(srs::GRUMPKIN_G1_CHUNK_SIZE_POINTS);
    points.back() = points.front();
    EXPECT_EQ(init_grumpkin(points, static_cast<uint32_t>(points.size())), ERROR);
}

TEST(GrumpkinSrsIngress, RejectsUnverifiedTrailingPoints)
{
    auto points = srs::generate_grumpkin_srs(srs::GRUMPKIN_G1_CHUNK_SIZE_POINTS);
    points.push_back(points[0]);
    points.push_back(points[0]);
    EXPECT_EQ(init_grumpkin(points, static_cast<uint32_t>(points.size())), ERROR);
}

TEST(GrumpkinSrsIngress, AcceptsCanonicalChunksForRequestedPrefix)
{
    const auto points = srs::generate_grumpkin_srs(srs::GRUMPKIN_G1_NUM_POINTS);
    for (uint32_t count :
         { 2U, static_cast<uint32_t>(srs::GRUMPKIN_G1_CHUNK_SIZE_POINTS), static_cast<uint32_t>(points.size()) }) {
        SCOPED_TRACE(count);
        EXPECT_EQ(init_grumpkin(points, count), GRUMPKIN_OK);
    }
}

TEST(GrumpkinSrsIngress, RejectsInvalidPointCounts)
{
    const auto points = srs::generate_grumpkin_srs(srs::GRUMPKIN_G1_CHUNK_SIZE_POINTS);
    for (uint32_t count : { 0U, static_cast<uint32_t>(srs::GRUMPKIN_G1_NUM_POINTS + 1) }) {
        SCOPED_TRACE(count);
        EXPECT_EQ(init_grumpkin(points, count), ERROR);
    }
}

TEST(Bn254SrsIngress, RejectsG2PointAtInfinity)
{
    wire::BbSrsInitSrs cmd;
    cmd.points_buf = to_buffer(std::vector<g1::affine_element>{ srs::BN254_G1_FIRST_ELEMENT });
    cmd.num_points = 1;
    cmd.g2_point = to_buffer(g2::affine_element::infinity());
    EXPECT_EQ(dispatch("BbSrsInitSrs", cmd), ERROR);
}

#endif
