//! Golden file wire-format conformance test (Zig).
//! For each golden file, asserts:
//!   1. We can decode the bytes into the expected typed value.
//!   2. Re-encoding the same value produces byte-identical output.
//! The combination pins down the wire format as a binding contract.
//!
//! Usage: golden_test --golden-dir <path>

const std = @import("std");
const msgpack = @import("msgpack");
const Payload = msgpack.Payload;
const types = @import("generated/echo_types.zig");

const alloc = std.heap.page_allocator;

var pass: u32 = 0;
var fail: u32 = 0;

fn testHash(base: u8) types.Fr {
    var hash: types.Fr = undefined;
    for (&hash, 0..) |*byte, i| {
        byte.* = base + @as(u8, @intCast(i));
    }
    return hash;
}

// --- framing helpers (mirror generated echo_client.zig / echo_server.zig) ---
//
// Re-encoding goes through toPayload() for every field value, but the struct
// maps themselves are emitted with an explicit schema field order: zig-msgpack
// Payload maps are std.HashMap, so toPayload + PackerIO.write alone would emit
// fields in hash-bucket order and the byte-roundtrip against the goldens
// (which use schema declaration order) would spuriously fail. The wire
// contract is name-keyed, so this only fixes ordering — every field's byte
// encoding still comes from the library encoder.

const FieldSpec = struct {
    name: []const u8,
    nested: ?[]const FieldSpec = null,
};

const inner_fields = [_]FieldSpec{ .{ .name = "values" }, .{ .name = "flag" } };

fn writeOrderedMap(
    writer: *std.Io.Writer,
    packer: *msgpack.PackerIO,
    map: Payload,
    comptime fields: []const FieldSpec,
) !void {
    comptime std.debug.assert(fields.len < 16);
    try writer.writeByte(0x80 | @as(u8, fields.len));
    inline for (fields) |spec| {
        try packer.write(try Payload.strToPayload(spec.name, alloc));
        const value = (try map.mapGet(spec.name)) orelse return error.MissingField;
        if (spec.nested) |nested| {
            try writeOrderedMap(writer, packer, value, nested);
        } else {
            try packer.write(value);
        }
    }
}

/// Requests are framed as [[name, payload-map]].
fn encodeRequest(name: []const u8, fields_payload: Payload, comptime fields: []const FieldSpec) ![]u8 {
    var allocating_writer = std.Io.Writer.Allocating.init(alloc);
    var packer = msgpack.PackerIO.init(undefined, &allocating_writer.writer);
    try allocating_writer.writer.writeByte(0x91); // fixarray(1)
    try allocating_writer.writer.writeByte(0x92); // fixarray(2)
    try packer.write(try Payload.strToPayload(name, alloc));
    try writeOrderedMap(&allocating_writer.writer, &packer, fields_payload, fields);
    return try allocating_writer.toOwnedSlice();
}

/// Responses are framed as [name, payload-map].
fn encodeResponse(name: []const u8, fields_payload: Payload, comptime fields: []const FieldSpec) ![]u8 {
    var allocating_writer = std.Io.Writer.Allocating.init(alloc);
    var packer = msgpack.PackerIO.init(undefined, &allocating_writer.writer);
    try allocating_writer.writer.writeByte(0x92); // fixarray(2)
    try packer.write(try Payload.strToPayload(name, alloc));
    try writeOrderedMap(&allocating_writer.writer, &packer, fields_payload, fields);
    return try allocating_writer.toOwnedSlice();
}

fn decodePayload(bytes: []const u8) !Payload {
    var reader = std.Io.Reader.fixed(bytes);
    var unpacker = msgpack.PackerIO.init(&reader, undefined);
    return try unpacker.read(alloc);
}

// --- per-type schema field orders (must match schema.json declaration order) ---

const bytes_fields = [_]FieldSpec{.{ .name = "data" }};
const fields_fields = [_]FieldSpec{ .{ .name = "a" }, .{ .name = "b" }, .{ .name = "name" } };
const nested_fields = [_]FieldSpec{.{ .name = "inner", .nested = &inner_fields }};
const aliases_fields = [_]FieldSpec{ .{ .name = "treeId" }, .{ .name = "hash" }, .{ .name = "maybeHash" }, .{ .name = "hashes" } };
const blobs_fields = [_]FieldSpec{ .{ .name = "maybeData" }, .{ .name = "parts" } };
const message_fields = [_]FieldSpec{.{ .name = "message" }};
const empty_fields = [_]FieldSpec{};

// --- generic per-file check ---

fn check(
    comptime T: type,
    comptime is_request: bool,
    dir: []const u8,
    file: []const u8,
    name: []const u8,
    comptime fields: []const FieldSpec,
    comptime verify: fn (T) bool,
) void {
    runCheck(T, is_request, dir, file, name, fields, verify) catch |err| {
        std.debug.print("  FAIL: {s}: {s}\n", .{ file, @errorName(err) });
        fail += 1;
        return;
    };
    std.debug.print("  PASS: {s}\n", .{file});
    pass += 1;
}

fn runCheck(
    comptime T: type,
    comptime is_request: bool,
    dir: []const u8,
    file: []const u8,
    name: []const u8,
    comptime fields: []const FieldSpec,
    comptime verify: fn (T) bool,
) !void {
    const path = try std.fs.path.join(alloc, &.{ dir, file });
    defer alloc.free(path);
    const golden = try std.fs.cwd().readFileAlloc(alloc, path, 1 << 20);

    const decoded = try decodePayload(golden);
    const named = if (is_request) blk: {
        if (try decoded.getArrLen() != 1) return error.BadOuterArray;
        break :blk try decoded.getArrElement(0);
    } else decoded;
    if (try named.getArrLen() != 2) return error.BadNamedArray;
    const got_name = try (try named.getArrElement(0)).asStr();
    if (!std.mem.eql(u8, got_name, name)) return error.WrongUnionName;

    const value = try T.fromPayload(try named.getArrElement(1));
    if (!verify(value)) return error.DecodedValueMismatch;

    const reencoded = if (is_request)
        try encodeRequest(name, try value.toPayload(alloc), fields)
    else
        try encodeResponse(name, try value.toPayload(alloc), fields);
    if (!std.mem.eql(u8, reencoded, golden)) return error.RoundtripByteMismatch;
}

// --- expected-value predicates ---

fn verifyBytes(v: types.EchoBytes) bool {
    return std.mem.eql(u8, v.data, &[_]u8{ 0xDE, 0xAD, 0xBE, 0xEF, 0x42 });
}

fn verifyFields(v: types.EchoFields) bool {
    return v.a == 42 and v.b == 999999 and std.mem.eql(u8, v.name, "hello wire compat");
}

fn verifyInnerHappy(inner: types.EchoInner) bool {
    return inner.values.len == 2 and
        std.mem.eql(u8, inner.values[0], &[_]u8{ 1, 2, 3 }) and
        std.mem.eql(u8, inner.values[1], &[_]u8{ 4, 5 }) and
        inner.flag == true;
}

fn verifyNested(v: types.EchoNested) bool {
    return verifyInnerHappy(v.inner);
}

fn verifyAliases(v: types.EchoAliases) bool {
    const hash = testHash(0x10);
    const second = testHash(0x40);
    return v.tree_id == 7 and
        std.mem.eql(u8, &v.hash, &hash) and
        v.maybe_hash != null and std.mem.eql(u8, &v.maybe_hash.?, &second) and
        v.hashes.len == 2 and
        std.mem.eql(u8, &v.hashes[0], &hash) and
        std.mem.eql(u8, &v.hashes[1], &second);
}

fn verifyBytesResponse(v: types.EchoBytesResponse) bool {
    return std.mem.eql(u8, v.data, &[_]u8{ 0xDE, 0xAD, 0xBE, 0xEF, 0x42 });
}

fn verifyFieldsResponse(v: types.EchoFieldsResponse) bool {
    return v.a == 42 and v.b == 999999 and std.mem.eql(u8, v.name, "hello wire compat");
}

fn verifyNestedResponse(v: types.EchoNestedResponse) bool {
    return verifyInnerHappy(v.inner);
}

fn verifyAliasesResponse(v: types.EchoAliasesResponse) bool {
    const hash = testHash(0x10);
    const second = testHash(0x40);
    return v.tree_id == 7 and
        std.mem.eql(u8, &v.hash, &hash) and
        v.maybe_hash != null and std.mem.eql(u8, &v.maybe_hash.?, &second) and
        v.hashes.len == 2 and
        std.mem.eql(u8, &v.hashes[0], &hash) and
        std.mem.eql(u8, &v.hashes[1], &second);
}

fn verifyBytesEmpty(v: types.EchoBytes) bool {
    return v.data.len == 0;
}

fn verifyBytesBin16(v: types.EchoBytes) bool {
    if (v.data.len != 256) return false;
    for (v.data) |b| {
        if (b != 0xAA) return false;
    }
    return true;
}

fn verifyFieldsMax(v: types.EchoFields) bool {
    return v.a == std.math.maxInt(u32) and v.b == std.math.maxInt(u64) and v.name.len == 0;
}

fn verifyFieldsUintBoundary(v: types.EchoFields) bool {
    return v.a == 128 and v.b == @as(u64, std.math.maxInt(u32)) + 1 and std.mem.eql(u8, v.name, "x");
}

fn verifyFieldsUnicode(v: types.EchoFields) bool {
    return std.mem.eql(u8, v.name, "héllo τέστ 🚀 mañana");
}

fn verifyFieldsStr16(v: types.EchoFields) bool {
    if (v.name.len != 300) return false;
    for (v.name) |c| {
        if (c != 'a') return false;
    }
    return true;
}

fn verifyNestedFlagNone(v: types.EchoNested) bool {
    return v.inner.values.len == 0 and v.inner.flag == null;
}

fn verifyNestedFlagFalse(v: types.EchoNested) bool {
    return v.inner.values.len == 1 and v.inner.values[0].len == 0 and v.inner.flag == false;
}

fn verifyBlobs(v: types.EchoBlobs) bool {
    return v.maybe_data != null and std.mem.eql(u8, v.maybe_data.?, &[_]u8{ 0xAA, 0xBB }) and
        std.mem.eql(u8, v.parts[0], &[_]u8{ 1, 2, 3 }) and
        std.mem.eql(u8, v.parts[1], &[_]u8{4});
}

fn verifyBlobsNone(v: types.EchoBlobs) bool {
    return v.maybe_data == null and
        v.parts[0].len == 0 and
        std.mem.eql(u8, v.parts[1], &[_]u8{9});
}

fn verifyBlobsResponse(v: types.EchoBlobsResponse) bool {
    return v.maybe_data != null and std.mem.eql(u8, v.maybe_data.?, &[_]u8{ 0xAA, 0xBB }) and
        std.mem.eql(u8, v.parts[0], &[_]u8{ 1, 2, 3 }) and
        std.mem.eql(u8, v.parts[1], &[_]u8{4});
}

fn verifyFail(v: types.EchoFail) bool {
    return std.mem.eql(u8, v.message, "deliberate failure");
}

fn verifyFailResponse(_: types.EchoFailResponse) bool {
    return true;
}

fn verifyErrorResponse(v: types.EchoErrorResponse) bool {
    return std.mem.eql(u8, v.message, "deliberate failure");
}

pub fn main() !void {
    var args = std.process.args();
    _ = args.next();
    var golden_dir: ?[]const u8 = null;
    while (args.next()) |arg| {
        if (std.mem.eql(u8, arg, "--golden-dir")) {
            golden_dir = args.next();
        }
    }
    const dir = golden_dir orelse {
        std.debug.print("Usage: golden_test --golden-dir <path>\n", .{});
        std.process.exit(1);
    };

    // ============ Original happy-path cases ============

    check(types.EchoBytes, true, dir, "echo_bytes_request.msgpack", "EchoBytes", &bytes_fields, verifyBytes);
    check(types.EchoFields, true, dir, "echo_fields_request.msgpack", "EchoFields", &fields_fields, verifyFields);
    check(types.EchoNested, true, dir, "echo_nested_request.msgpack", "EchoNested", &nested_fields, verifyNested);
    check(types.EchoAliases, true, dir, "echo_aliases_request.msgpack", "EchoAliases", &aliases_fields, verifyAliases);

    check(types.EchoBytesResponse, false, dir, "echo_bytes_response.msgpack", "EchoBytesResponse", &bytes_fields, verifyBytesResponse);
    check(types.EchoFieldsResponse, false, dir, "echo_fields_response.msgpack", "EchoFieldsResponse", &fields_fields, verifyFieldsResponse);
    check(types.EchoNestedResponse, false, dir, "echo_nested_response.msgpack", "EchoNestedResponse", &nested_fields, verifyNestedResponse);
    check(types.EchoAliasesResponse, false, dir, "echo_aliases_response.msgpack", "EchoAliasesResponse", &aliases_fields, verifyAliasesResponse);

    // ============ Boundary cases ============

    check(types.EchoBytes, true, dir, "echo_bytes_empty.msgpack", "EchoBytes", &bytes_fields, verifyBytesEmpty);
    check(types.EchoBytes, true, dir, "echo_bytes_bin16.msgpack", "EchoBytes", &bytes_fields, verifyBytesBin16);
    check(types.EchoFields, true, dir, "echo_fields_max.msgpack", "EchoFields", &fields_fields, verifyFieldsMax);
    check(types.EchoFields, true, dir, "echo_fields_uint_boundary.msgpack", "EchoFields", &fields_fields, verifyFieldsUintBoundary);
    check(types.EchoFields, true, dir, "echo_fields_unicode.msgpack", "EchoFields", &fields_fields, verifyFieldsUnicode);
    check(types.EchoFields, true, dir, "echo_fields_str16.msgpack", "EchoFields", &fields_fields, verifyFieldsStr16);
    check(types.EchoNested, true, dir, "echo_nested_flag_none.msgpack", "EchoNested", &nested_fields, verifyNestedFlagNone);
    check(types.EchoNested, true, dir, "echo_nested_flag_false.msgpack", "EchoNested", &nested_fields, verifyNestedFlagFalse);

    // ============ Blob / fail / error cases ============

    check(types.EchoBlobs, true, dir, "echo_blobs_request.msgpack", "EchoBlobs", &blobs_fields, verifyBlobs);
    check(types.EchoBlobs, true, dir, "echo_blobs_none.msgpack", "EchoBlobs", &blobs_fields, verifyBlobsNone);
    check(types.EchoBlobsResponse, false, dir, "echo_blobs_response.msgpack", "EchoBlobsResponse", &blobs_fields, verifyBlobsResponse);
    check(types.EchoFail, true, dir, "echo_fail_request.msgpack", "EchoFail", &message_fields, verifyFail);
    check(types.EchoFailResponse, false, dir, "echo_fail_response.msgpack", "EchoFailResponse", &empty_fields, verifyFailResponse);
    check(types.EchoErrorResponse, false, dir, "echo_error_response.msgpack", "EchoErrorResponse", &message_fields, verifyErrorResponse);

    std.debug.print("\nResults: {d}/{d} passed, {d} failed\n", .{ pass, pass + fail, fail });
    if (fail > 0) std.process.exit(1);
}
