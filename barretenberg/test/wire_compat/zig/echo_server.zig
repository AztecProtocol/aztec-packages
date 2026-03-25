/// Echo IPC server (Zig) — echoes commands back as responses.
/// Usage: echo_server --socket /tmp/echo.sock
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
        std.debug.print("Usage: echo_server --socket <path>\n", .{});
        return error.InvalidArgument;
    };

    std.fs.cwd().deleteFile(path) catch {};

    const address = try std.net.Address.initUnix(path);
    const server = try posix.socket(posix.AF.UNIX, posix.SOCK.STREAM, 0);
    defer posix.close(server);
    try posix.bind(server, &address.any, address.getOsSockLen());
    try posix.listen(server, 1);

    std.debug.print("echo_server(zig): listening on {s}\n", .{path});

    const client = try posix.accept(server, null, null, 0);
    defer posix.close(client);

    while (true) {
        const payload = recvFramed(client) catch break;
        defer alloc.free(payload);

        // The echo server just transforms the command name to add "Response"
        // Parse: [[cmdName, {fields}]] -> [cmdNameResponse, {fields}]
        const response = processCommand(payload) catch break;
        defer alloc.free(response);

        sendFramed(client, response) catch break;

        if (std.mem.indexOf(u8, payload, "EchoShutdown") != null) break;
    }

    std.fs.cwd().deleteFile(path) catch {};
    std.debug.print("echo_server(zig): shutdown\n", .{});
}

fn processCommand(payload: []const u8) ![]u8 {
    var pos: usize = 0;
    if (payload[pos] != 0x91) return error.InvalidFormat; // fixarray(1)
    pos += 1;
    if (payload[pos] != 0x92) return error.InvalidFormat; // fixarray(2)
    pos += 1;

    const cmd_name = try readStr(payload, &pos);
    const fields_bytes = payload[pos..];

    // Build response: [cmdName+"Response", fields]
    var buf: std.ArrayListUnmanaged(u8) = .{};
    try buf.append(alloc, 0x92); // fixarray(2)
    const resp_name = try std.fmt.allocPrint(alloc, "{s}Response", .{cmd_name});
    defer alloc.free(resp_name);
    try writeStr(&buf, resp_name);
    try buf.appendSlice(alloc, fields_bytes);
    return try buf.toOwnedSlice(alloc);
}

fn readStr(data: []const u8, pos: *usize) ![]const u8 {
    const b = data[pos.*];
    if (b & 0xE0 == 0xA0) {
        const len: usize = b & 0x1F;
        pos.* += 1;
        const s = data[pos.* .. pos.* + len];
        pos.* += len;
        return s;
    } else if (b == 0xD9) {
        pos.* += 1;
        const len: usize = data[pos.*];
        pos.* += 1;
        const s = data[pos.* .. pos.* + len];
        pos.* += len;
        return s;
    }
    return error.InvalidStringFormat;
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
