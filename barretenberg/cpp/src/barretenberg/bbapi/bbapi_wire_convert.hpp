#pragma once
/**
 * @file bbapi_wire_convert.hpp
 * @brief Wire <-> domain conversion for the bbapi handlers.
 *
 * The codegen-emitted wire types in generated/bb_types.hpp and the
 * hand-written domain types in bbapi_*.hpp share a SERIALIZATION_FIELDS
 * shape (same field names, msgpack-compatible field types — Fr packs as
 * bin32 matching bb::fr; nested point types pack as {x, y} maps in both
 * versions). That means a wire value can be turned into its domain
 * counterpart by msgpack round-trip — pack the wire struct, unpack into
 * the domain struct — and vice versa.
 *
 * Each handler is then one line: roundtrip wire->domain, call execute(),
 * roundtrip domain->wire. Slower than field-by-field copying (one extra
 * pack/unpack) but trivial to write and resistant to schema drift.
 */
#include "barretenberg/bbapi/generated/bb_types.hpp"
#include "barretenberg/serialize/msgpack.hpp"

namespace bb::bbapi {

template <typename Target, typename Source> inline Target msgpack_roundtrip(const Source& src)
{
    msgpack::sbuffer buf;
    msgpack::pack(buf, src);
    auto unpacked = msgpack::unpack(buf.data(), buf.size());
    Target target;
    unpacked.get().convert(target);
    return target;
}

} // namespace bb::bbapi
