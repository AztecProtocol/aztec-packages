/// Echo IPC client (Zig) — connects, sends test commands, verifies responses.
/// Usage: echo_client --socket /tmp/echo.sock
const std = @import("std");
const posix = std.posix;

const alloc = std.heap.page_allocator;

pub fn main() !void {
    var args = std.process.args();
    _ = args.next();
    var socket_path: ?[]const u8 = null;
    while (args.next()) |arg| {
        if (std.mem.eql(u8, arg, "--socket")) {
            socket_path = args.next();
        }
    }
    const path = socket_path orelse {
        std.debug.print("Usage: echo_client --socket <path>\n", .{});
        std.process.exit(1);
    };

    const address = try std.net.Address.initUnix(path);
    const fd = try posix.socket(posix.AF.UNIX, posix.SOCK.STREAM, 0);
    defer posix.close(fd);
    try posix.connect(fd, &address.any, address.getOsSockLen());

    // Test 1: EchoBytes {data: [0xDE, 0xAD, 0xBE, 0xEF, 0x42]}
    {
        var buf: std.ArrayListUnmanaged(u8) = .{};
        defer buf.deinit(alloc);
        try buf.append(alloc, 0x91); // fixarray(1)
        try buf.append(alloc, 0x92); // fixarray(2)
        try writeStr(&buf, "EchoBytes");
        try buf.append(alloc, 0x81); // fixmap(1)
        try writeStr(&buf, "data");
        try buf.append(alloc, 0xC4); // bin8
        try buf.append(alloc, 5);
        try buf.appendSlice(alloc, &[_]u8{ 0xDE, 0xAD, 0xBE, 0xEF, 0x42 });

        try sendFramed(fd, buf.items);
        const resp = try recvFramed(fd);
        defer alloc.free(resp);

        if (std.mem.indexOf(u8, resp, "EchoBytesResponse") == null or
            std.mem.indexOf(u8, resp, &[_]u8{ 0xDE, 0xAD, 0xBE, 0xEF, 0x42 }) == null)
        {
            std.debug.print("echo_client(zig): EchoBytes FAIL\n", .{});
            std.process.exit(1);
        }
        std.debug.print("echo_client(zig): EchoBytes OK\n", .{});
    }

    // Test 2: EchoFields {a: 42, b: 999999, name: "hello wire compat"}
    {
        var buf: std.ArrayListUnmanaged(u8) = .{};
        defer buf.deinit(alloc);
        try buf.append(alloc, 0x91);
        try buf.append(alloc, 0x92);
        try writeStr(&buf, "EchoFields");
        try buf.append(alloc, 0x83); // fixmap(3)
        try writeStr(&buf, "a");
        try buf.append(alloc, 42);
        try writeStr(&buf, "b");
        try buf.append(alloc, 0xCE); // uint32
        try buf.appendSlice(alloc, &[_]u8{ 0x00, 0x0F, 0x42, 0x3F }); // 999999 BE
        try writeStr(&buf, "name");
        try writeStr(&buf, "hello wire compat");

        try sendFramed(fd, buf.items);
        const resp = try recvFramed(fd);
        defer alloc.free(resp);

        if (std.mem.indexOf(u8, resp, "EchoFieldsResponse") == null or
            std.mem.indexOf(u8, resp, "hello wire compat") == null)
        {
            std.debug.print("echo_client(zig): EchoFields FAIL\n", .{});
            std.process.exit(1);
        }
        std.debug.print("echo_client(zig): EchoFields OK\n", .{});
    }

    // Test 3: EchoNested {inner: {values: [[1,2,3],[4,5]], flag: true}}
    {
        var buf: std.ArrayListUnmanaged(u8) = .{};
        defer buf.deinit(alloc);
        try buf.append(alloc, 0x91);
        try buf.append(alloc, 0x92);
        try writeStr(&buf, "EchoNested");
        try buf.append(alloc, 0x81); // fixmap(1)
        try writeStr(&buf, "inner");
        try buf.append(alloc, 0x82); // fixmap(2)
        try writeStr(&buf, "values");
        try buf.append(alloc, 0x92); // fixarray(2)
        try buf.append(alloc, 0xC4); try buf.append(alloc, 3);
        try buf.appendSlice(alloc, &[_]u8{ 1, 2, 3 });
        try buf.append(alloc, 0xC4); try buf.append(alloc, 2);
        try buf.appendSlice(alloc, &[_]u8{ 4, 5 });
        try writeStr(&buf, "flag");
        try buf.append(alloc, 0xC3); // true

        try sendFramed(fd, buf.items);
        const resp = try recvFramed(fd);
        defer alloc.free(resp);

        if (std.mem.indexOf(u8, resp, "EchoNestedResponse") == null) {
            std.debug.print("echo_client(zig): EchoNested FAIL\n", .{});
            std.process.exit(1);
        }
        std.debug.print("echo_client(zig): EchoNested OK\n", .{});
    }

    // Shutdown
    {
        var buf: std.ArrayListUnmanaged(u8) = .{};
        defer buf.deinit(alloc);
        try buf.append(alloc, 0x91);
        try buf.append(alloc, 0x92);
        try writeStr(&buf, "EchoShutdown");
        try buf.append(alloc, 0x80); // fixmap(0)
        try sendFramed(fd, buf.items);
        _ = recvFramed(fd) catch {};
    }

    std.debug.print("echo_client(zig): all tests passed\n", .{});
}

fn writeStr(buf: *std.ArrayListUnmanaged(u8), s: []const u8) !void {
    if (s.len < 32) {
        try buf.append(alloc, @intCast(0xA0 | s.len));
    } else if (s.len < 256) {
        try buf.append(alloc, 0xD9);
        try buf.append(alloc, @intCast(s.len));
    }
    try buf.appendSlice(alloc, s);
}

fn recvFramed(fd: posix.socket_t) ![]u8 {
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

fn sendFramed(fd: posix.socket_t, data: []const u8) !void {
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
