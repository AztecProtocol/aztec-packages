/// UDS (Unix Domain Socket) backend for IPC communication.
/// Handles: socket connect, length-prefixed framing, raw byte send/receive.
/// Satisfies the backend interface: call(request) -> response, destroy().
const std = @import("std");
const posix = std.posix;

const alloc = std.heap.page_allocator;

pub const UdsBackend = struct {
    fd: posix.socket_t,

    /// Connect to a service at the given UDS path.
    pub fn connect(socket_path: []const u8) !UdsBackend {
        const address = try std.net.Address.initUnix(socket_path);
        const fd = try posix.socket(posix.AF.UNIX, posix.SOCK.STREAM, 0);
        try posix.connect(fd, &address.any, address.getOsSockLen());
        return .{ .fd = fd };
    }

    /// Send a raw msgpack request and receive a raw msgpack response.
    /// Framing: 4-byte LE length prefix + payload.
    pub fn call(self: *UdsBackend, request: []const u8) ![]u8 {
        try sendFrame(self.fd, request);
        return try recvFrame(self.fd);
    }

    /// Close the connection.
    pub fn destroy(self: *UdsBackend) void {
        posix.close(self.fd);
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
