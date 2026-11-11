#include "barretenberg/bbapi/bbapi_handlers.hpp"
#include "barretenberg/bbapi/bbapi_wire_convert.hpp"
#include "barretenberg/bbapi/ffi_test_dispatch.hpp"
#include <gtest/gtest.h>

// What clients see on the wire: how points (including the point at infinity) are encoded, and how
// the dispatcher answers a request it cannot decode.

#ifndef BB_NO_EXCEPTIONS

using namespace bb;
using namespace bb::bbapi;
using ffi_test::ffi_call;
using ffi_test::ffi_call_ok;

namespace {

constexpr std::array<uint8_t, 32> ALL_ONES = [] {
    std::array<uint8_t, 32> r{};
    r.fill(0xff);
    return r;
}();

/** The wire encoding of infinity, as affine_element's msgpack encoding writes it: every coordinate all-ones. */
template <typename W> bool is_wire_infinity(const W& point)
{
    if constexpr (std::is_same_v<W, wire::Bn254G2Point>) {
        return wire_bytes(point.x[0]) == ALL_ONES && wire_bytes(point.x[1]) == ALL_ONES &&
               wire_bytes(point.y[0]) == ALL_ONES && wire_bytes(point.y[1]) == ALL_ONES;
    } else {
        return wire_bytes(point.x) == ALL_ONES && wire_bytes(point.y) == ALL_ONES;
    }
}

template <typename Coord> Coord all_ones()
{
    return Coord{ ALL_ONES };
}

} // namespace

TEST(BBApiWirePoints, InfinityIsEncodedAllOnes)
{
    auto grumpkin = ffi_call_ok<wire::BbGrumpkinMulResponse>(wire::BbGrumpkinMul{
        .point = grumpkin_point_to_wire(grumpkin::g1::affine_one), .scalar = field_to_wire_as<Fq>(grumpkin::fr(0)) });
    EXPECT_TRUE(is_wire_infinity(grumpkin.point));

    auto bn254_g1 = ffi_call_ok<wire::BbBn254G1MulResponse>(
        wire::BbBn254G1Mul{ .point = bn254_g1_point_to_wire(g1::affine_one), .scalar = fr_to_wire(fr(0)) });
    EXPECT_TRUE(is_wire_infinity(bn254_g1.point));

    auto bn254_g2 = ffi_call_ok<wire::BbBn254G2MulResponse>(
        wire::BbBn254G2Mul{ .point = bn254_g2_point_to_wire(g2::affine_one), .scalar = fr_to_wire(fr(0)) });
    EXPECT_TRUE(is_wire_infinity(bn254_g2.point));

    auto secp256k1 = ffi_call_ok<wire::BbSecp256k1MulResponse>(
        wire::BbSecp256k1Mul{ .point = secp256k1_point_to_wire(secp256k1::g1::affine_one),
                              .scalar = field_to_wire_as<Secp256k1Fr>(secp256k1::fr(0)) });
    EXPECT_TRUE(is_wire_infinity(secp256k1.point));

    auto secp256r1 = ffi_call_ok<wire::BbEcdsaSecp256r1ComputePublicKeyResponse>(
        wire::BbEcdsaSecp256r1ComputePublicKey{ .private_key = field_to_wire_as<Secp256r1Fr>(secp256r1::fr(0)) });
    EXPECT_TRUE(is_wire_infinity(secp256r1.public_key));
}

TEST(BBApiWirePoints, AllOnesIsDecodedAsInfinity)
{
    const auto generator = grumpkin_point_to_wire(grumpkin::g1::affine_one);
    const wire::GrumpkinPoint infinity{ .x = all_ones<Fr>(), .y = all_ones<Fr>() };

    // G + O = G
    auto sum =
        ffi_call_ok<wire::BbGrumpkinAddResponse>(wire::BbGrumpkinAdd{ .point_a = generator, .point_b = infinity });
    EXPECT_EQ(sum.point, generator);

    auto on_curve = ffi_call_ok<wire::BbBn254G1IsOnCurveResponse>(
        wire::BbBn254G1IsOnCurve{ .point = { .x = all_ones<Fq>(), .y = all_ones<Fq>() } });
    EXPECT_TRUE(on_curve.is_on_curve);
}

TEST(BBApiWirePoints, FinitePointsRoundTrip)
{
    const auto point = grumpkin::g1::affine_element(grumpkin::g1::one * grumpkin::fr(7));
    EXPECT_EQ(grumpkin_point_from_wire(grumpkin_point_to_wire(point)), point);
    EXPECT_FALSE(is_wire_infinity(grumpkin_point_to_wire(point)));

    const auto g2_point = g2::affine_element(g2::one * fr(7));
    EXPECT_EQ(bn254_g2_point_from_wire(bn254_g2_point_to_wire(g2_point)), g2_point);
}

/**
 * Requests the dispatcher can't decode must come back as error frames: the IPC server treats an
 * exception escaping the dispatcher as fatal and shuts down.
 */
TEST(BBApiDispatch, UndecodableRequestsGetErrorResponses)
{
    BBApiRequest ctx;
    auto dispatch = make_bb_handler(ctx);

    auto frame = [](auto&& pack_payload) {
        msgpack::sbuffer buf;
        msgpack::packer<msgpack::sbuffer> pk(buf);
        pk.pack_array(1);
        pk.pack_array(2);
        pack_payload(pk);
        return std::vector<uint8_t>(buf.data(), buf.data() + buf.size());
    };
    // The payload has the wrong type for its field.
    auto wrong_type = frame([](auto& pk) {
        pk.pack(std::string("BbBlake2s"));
        pk.pack_map(1);
        pk.pack(std::string("data"));
        pk.pack(5);
    });
    // A 32-byte field sent with 33 bytes.
    auto wrong_length = frame([](auto& pk) {
        pk.pack(std::string("BbBn254FrSqrt"));
        pk.pack_map(1);
        pk.pack(std::string("input"));
        pk.pack(std::vector<uint8_t>(33, 1));
    });
    // Truncated mid-frame.
    auto truncated = std::vector<uint8_t>(wrong_type.begin(), wrong_type.end() - 2);

    for (const auto& [name, request] : std::vector<std::pair<std::string, std::vector<uint8_t>>>{
             { "wrong type", wrong_type }, { "wrong length", wrong_length }, { "truncated", truncated } }) {
        SCOPED_TRACE(name);
        std::vector<uint8_t> response;
        EXPECT_NO_THROW(dispatch(request, [&](std::vector<uint8_t> r) { response = std::move(r); }));
        ASSERT_FALSE(response.empty());
        auto handle = msgpack::unpack(reinterpret_cast<const char*>(response.data()), response.size());
        EXPECT_EQ(handle.get().via.array.ptr[0].as<std::string>(), wire::BbErrorResponse::MSGPACK_SCHEMA_NAME);
    }
}

#endif
