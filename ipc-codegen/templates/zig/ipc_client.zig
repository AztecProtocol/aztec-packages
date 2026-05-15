/// Generic IPC client over Unix Domain Sockets.
/// Handles: socket connect, length-prefixed framing, msgpack encode/decode.
/// Service-specific typed methods are in the generated wrapper.
const std = @import("std");
const posix = std.posix;
const msgpack = @import("msgpack");
const Payload = msgpack.Payload;

const alloc = std.heap.page_allocator;

pub const IpcClient = struct {
    fd: posix.socket_t,

    /// Connect to a service at the given UDS path.
    pub fn connect(socket_path: []const u8) !IpcClient {
        const address = try std.net.Address.initUnix(socket_path);
        const fd = try posix.socket(posix.AF.UNIX, posix.SOCK.STREAM, 0);
        try posix.connect(fd, &address.any, address.getOsSockLen());
        return .{ .fd = fd };
    }

    /// Close the connection.
    pub fn close(self: *IpcClient) void {
        posix.close(self.fd);
    }

    /// Send a command and receive a response.
    /// Returns [responseName, responsePayload].
    pub fn call(self: *IpcClient, cmd_name: []const u8, fields: Payload) !struct { []const u8, Payload } {
        // Encode: [[cmdName, fields]]
        var inner = try Payload.arrPayload(2, alloc);
        try inner.setArrElement(0, try Payload.strToPayload(cmd_name, alloc));
        try inner.setArrElement(1, fields);
        var outer = try Payload.arrPayload(1, alloc);
        try outer.setArrElement(0, inner);

        // Serialize
        var allocating_writer = std.Io.Writer.Allocating.init(alloc);
        var packer = msgpack.PackerIO.init(undefined, &allocating_writer.writer);
        try packer.write(outer);
        const request_bytes = try allocating_writer.toOwnedSlice();
        defer alloc.free(request_bytes);

        // Send
        try sendFrame(self.fd, request_bytes);

        // Receive
        const response_bytes = try recvFrame(self.fd);
        defer alloc.free(response_bytes);

        // Decode: [responseName, payload]
        var reader = std.Io.Reader.fixed(response_bytes);
        var unpacker = msgpack.PackerIO.init(&reader, undefined);
        const resp = try unpacker.read(alloc);
        const resp_len = try resp.getArrLen();
        if (resp_len != 2) return error.InvalidResponse;

        const name = try (try resp.getArrElement(0)).asStr();
        const payload = try resp.getArrElement(1);
        return .{ name, payload };
    }

    fn sendFrame(fd: posix.socket_t, data: []const u8) !void {
        const len: u32 = @intCast(data.len);
        const header = [4]u8{
            @intCast(len & 0xFF),
            @intCast((len >> 8) & 0xFF),
            @intCast((len >> 16) & 0xFF),
            @intCast((len >> 24) & 0xFF),
        };
        _ = try posix.write(fd, &header);
        _ = try posix.write(fd, data);
    }

    fn recvFrame(fd: posix.socket_t) ![]u8 {
        var hdr: [4]u8 = undefined;
        var got: usize = 0;
        while (got < 4) {
            const n = try posix.read(fd, hdr[got..]);
            if (n == 0) return error.ConnectionClosed;
            got += n;
        }
        const len: u32 = @as(u32, hdr[0]) | (@as(u32, hdr[1]) << 8) | (@as(u32, hdr[2]) << 16) | (@as(u32, hdr[3]) << 24);
        const data = try alloc.alloc(u8, len);
        got = 0;
        while (got < len) {
            const n = try posix.read(fd, data[got..]);
            if (n == 0) return error.ConnectionClosed;
            got += n;
        }
        return data;
    }
};
