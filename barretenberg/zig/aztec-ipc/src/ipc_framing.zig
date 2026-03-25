//! IPC framing: 4-byte little-endian length prefix over a stream.
//!
//! All Aztec IPC services use this framing protocol:
//!   [4 bytes: payload length, LE u32][payload: msgpack bytes]

const std = @import("std");

/// Send a length-prefixed message over a stream.
pub fn send(writer: anytype, data: []const u8) !void {
    const len: u32 = @intCast(data.len);
    try writer.writeInt(u32, len, .little);
    try writer.writeAll(data);
}

/// Receive a length-prefixed message from a stream.
/// Caller owns the returned slice.
pub fn receive(reader: anytype, allocator: std.mem.Allocator) ![]u8 {
    const len = try reader.readInt(u32, .little);
    const data = try allocator.alloc(u8, len);
    errdefer allocator.free(data);
    try reader.readNoEof(data);
    return data;
}

test "round-trip framing" {
    var buf: [1024]u8 = undefined;
    var write_stream = std.io.fixedBufferStream(&buf);

    const payload = "hello msgpack";
    try send(write_stream.writer(), payload);

    var read_stream = std.io.fixedBufferStream(write_stream.getWritten());
    const result = try receive(read_stream.reader(), std.testing.allocator);
    defer std.testing.allocator.free(result);

    try std.testing.expectEqualStrings(payload, result);
}
