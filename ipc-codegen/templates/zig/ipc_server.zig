/// Generic IPC server over Unix Domain Sockets.
/// Handles: socket setup, accept, length-prefixed framing, msgpack decode/encode.
/// Service-specific dispatch is injected via the DispatchFn parameter.
const std = @import("std");
const posix = std.posix;
const msgpack = @import("msgpack");
const Payload = msgpack.Payload;

const alloc = std.heap.page_allocator;

pub const DispatchFn = *const fn (cmd_name: []const u8, fields: Payload) DispatchResult;
pub const DispatchResult = struct { resp_name: []const u8, resp_payload: anyerror!Payload };

/// Run an IPC server on the given UDS path.
/// Accepts one connection, serves requests until shutdown or disconnect.
pub fn serve(socket_path: []const u8, dispatch: DispatchFn) !void {
    std.fs.cwd().deleteFile(socket_path) catch {};

    const address = try std.net.Address.initUnix(socket_path);
    const server_fd = try posix.socket(posix.AF.UNIX, posix.SOCK.STREAM, 0);
    defer posix.close(server_fd);
    try posix.bind(server_fd, &address.any, address.getOsSockLen());
    try posix.listen(server_fd, 1);

    std.debug.print("ipc-server: listening on {s}\n", .{socket_path});

    const client_fd = try posix.accept(server_fd, null, null, 0);
    defer posix.close(client_fd);

    while (true) {
        const frame = recvFrame(client_fd) catch break;
        defer alloc.free(frame);

        // Decode msgpack: [[commandName, {fields}]]
        var reader = std.Io.Reader.fixed(frame);
        var packer = msgpack.PackerIO.init(&reader, undefined);
        const request = packer.read(alloc) catch break;

        const outer_len = request.getArrLen() catch break;
        if (outer_len != 1) break;

        const inner = request.getArrElement(0) catch break;
        const inner_len = inner.getArrLen() catch break;
        if (inner_len != 2) break;

        const cmd_name = (inner.getArrElement(0) catch break).asStr() catch break;
        const fields = inner.getArrElement(1) catch break;

        // Dispatch
        const result = dispatch(cmd_name, fields);
        const resp_payload = result.resp_payload catch blk: {
            var err_map = Payload.mapPayload(alloc);
            const msg = std.fmt.allocPrint(alloc, "error: {s}", .{cmd_name}) catch "error";
            err_map.mapPut("message", Payload.strToPayload(msg, alloc) catch break) catch break;
            break :blk err_map;
        };
        const is_error = if (result.resp_payload) |_| false else |_| true;
        const resp_name = if (is_error) "ErrorResponse" else result.resp_name;

        const response = encodeResponse(resp_name, resp_payload) catch break;
        defer alloc.free(response);
        sendFrame(client_fd, response) catch break;

        // Check for shutdown
        if (std.mem.indexOf(u8, cmd_name, "Shutdown") != null) break;
    }

    std.fs.cwd().deleteFile(socket_path) catch {};
    std.debug.print("ipc-server: shutdown\n", .{});
}

fn encodeResponse(name: []const u8, payload: Payload) ![]u8 {
    var resp_arr = try Payload.arrPayload(2, alloc);
    try resp_arr.setArrElement(0, try Payload.strToPayload(name, alloc));
    try resp_arr.setArrElement(1, payload);

    var allocating_writer = std.Io.Writer.Allocating.init(alloc);
    var packer = msgpack.PackerIO.init(undefined, &allocating_writer.writer);
    try packer.write(resp_arr);
    return try allocating_writer.toOwnedSlice();
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
