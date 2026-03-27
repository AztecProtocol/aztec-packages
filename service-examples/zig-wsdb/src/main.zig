/// Zig WSDB Server — a skeleton WSDB implementation using generated types.
///
/// All command handlers return "not implemented" errors.
/// Replace them with real world-state logic to build a working WSDB.
///
/// Usage: zig-wsdb --socket /tmp/wsdb.sock
const std = @import("std");
const posix = std.posix;
const msgpack = @import("msgpack");
const Payload = msgpack.Payload;
const types = @import("generated/types.zig");

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
        std.debug.print("Usage: zig-wsdb --socket <path>\n", .{});
        std.process.exit(1);
    };

    std.fs.cwd().deleteFile(path) catch {};

    const address = try std.net.Address.initUnix(path);
    const server_fd = try posix.socket(posix.AF.UNIX, posix.SOCK.STREAM, 0);
    defer posix.close(server_fd);
    try posix.bind(server_fd, &address.any, address.getOsSockLen());
    try posix.listen(server_fd, 1);

    std.debug.print("zig-wsdb: listening on {s}\n", .{path});

    const client_fd = try posix.accept(server_fd, null, null, 0);
    defer posix.close(client_fd);
    std.debug.print("zig-wsdb: client connected\n", .{});

    while (true) {
        const frame = recvFrame(client_fd) catch break;
        defer alloc.free(frame);

        // Check for shutdown before decoding
        if (std.mem.indexOf(u8, frame, "WsdbShutdown") != null) {
            const resp = encodeResponse("WsdbShutdownResponse", Payload.mapPayload(alloc)) catch break;
            defer alloc.free(resp);
            sendFrame(client_fd, resp) catch {};
            break;
        }

        const response = handleFrame(frame) catch |err| {
            std.debug.print("zig-wsdb: error: {}\n", .{err});
            const err_resp = makeErrorResponse("internal error") catch break;
            defer alloc.free(err_resp);
            sendFrame(client_fd, err_resp) catch {};
            continue;
        };
        defer alloc.free(response);
        sendFrame(client_fd, response) catch break;
    }

    std.fs.cwd().deleteFile(path) catch {};
    std.debug.print("zig-wsdb: shutdown\n", .{});
}

fn handleFrame(frame: []const u8) ![]u8 {
    // Decode msgpack: [[commandName, {fields}]]
    var reader = std.Io.Reader.fixed(frame);
    var packer = msgpack.PackerIO.init(&reader, undefined);
    const request = try packer.read(alloc);

    const outer_len = try request.getArrLen();
    if (outer_len != 1) return error.InvalidFormat;

    const inner = try request.getArrElement(0);
    const inner_len = try inner.getArrLen();
    if (inner_len != 2) return error.InvalidFormat;

    const cmd_name = try (try inner.getArrElement(0)).asStr();
    const fields = try inner.getArrElement(1);

    // Dispatch — try each command name
    inline for (commands) |entry| {
        if (std.mem.eql(u8, cmd_name, entry.cmd_name)) {
            const cmd = entry.CmdType.fromPayload(fields) catch {
                return makeErrorResponse("failed to deserialize command");
            };
            const resp = handleCommand(entry.CmdType, entry.RespType, cmd) catch {
                const msg = std.fmt.allocPrint(alloc, "not implemented: {s}", .{cmd_name}) catch "error";
                return makeErrorResponse(msg);
            };
            const resp_payload = try resp.toPayload(alloc);
            return encodeResponse(entry.resp_name, resp_payload);
        }
    }

    return makeErrorResponse("unknown command");
}

const CommandEntry = struct {
    cmd_name: []const u8,
    resp_name: []const u8,
    CmdType: type,
    RespType: type,
};

const commands = [_]CommandEntry{
    .{ .cmd_name = "WsdbGetTreeInfo", .resp_name = "WsdbGetTreeInfoResponse", .CmdType = types.WsdbGetTreeInfo, .RespType = types.WsdbGetTreeInfoResponse },
    .{ .cmd_name = "WsdbGetStateReference", .resp_name = "WsdbGetStateReferenceResponse", .CmdType = types.WsdbGetStateReference, .RespType = types.WsdbGetStateReferenceResponse },
    .{ .cmd_name = "WsdbGetInitialStateReference", .resp_name = "WsdbGetInitialStateReferenceResponse", .CmdType = types.WsdbGetInitialStateReference, .RespType = types.WsdbGetInitialStateReferenceResponse },
    .{ .cmd_name = "WsdbGetLeafValue", .resp_name = "WsdbGetLeafValueResponse", .CmdType = types.WsdbGetLeafValue, .RespType = types.WsdbGetLeafValueResponse },
    .{ .cmd_name = "WsdbGetLeafPreimage", .resp_name = "WsdbGetLeafPreimageResponse", .CmdType = types.WsdbGetLeafPreimage, .RespType = types.WsdbGetLeafPreimageResponse },
    .{ .cmd_name = "WsdbGetSiblingPath", .resp_name = "WsdbGetSiblingPathResponse", .CmdType = types.WsdbGetSiblingPath, .RespType = types.WsdbGetSiblingPathResponse },
    .{ .cmd_name = "WsdbFindLeafIndices", .resp_name = "WsdbFindLeafIndicesResponse", .CmdType = types.WsdbFindLeafIndices, .RespType = types.WsdbFindLeafIndicesResponse },
    .{ .cmd_name = "WsdbFindLowLeaf", .resp_name = "WsdbFindLowLeafResponse", .CmdType = types.WsdbFindLowLeaf, .RespType = types.WsdbFindLowLeafResponse },
    .{ .cmd_name = "WsdbAppendLeaves", .resp_name = "WsdbAppendLeavesResponse", .CmdType = types.WsdbAppendLeaves, .RespType = types.WsdbAppendLeavesResponse },
    .{ .cmd_name = "WsdbBatchInsert", .resp_name = "WsdbBatchInsertResponse", .CmdType = types.WsdbBatchInsert, .RespType = types.WsdbBatchInsertResponse },
    .{ .cmd_name = "WsdbSequentialInsert", .resp_name = "WsdbSequentialInsertResponse", .CmdType = types.WsdbSequentialInsert, .RespType = types.WsdbSequentialInsertResponse },
    .{ .cmd_name = "WsdbCommit", .resp_name = "WsdbCommitResponse", .CmdType = types.WsdbCommit, .RespType = types.WsdbCommitResponse },
    .{ .cmd_name = "WsdbRollback", .resp_name = "WsdbRollbackResponse", .CmdType = types.WsdbRollback, .RespType = types.WsdbRollbackResponse },
    .{ .cmd_name = "WsdbSyncBlock", .resp_name = "WsdbSyncBlockResponse", .CmdType = types.WsdbSyncBlock, .RespType = types.WsdbSyncBlockResponse },
    .{ .cmd_name = "WsdbCreateFork", .resp_name = "WsdbCreateForkResponse", .CmdType = types.WsdbCreateFork, .RespType = types.WsdbCreateForkResponse },
    .{ .cmd_name = "WsdbDeleteFork", .resp_name = "WsdbDeleteForkResponse", .CmdType = types.WsdbDeleteFork, .RespType = types.WsdbDeleteForkResponse },
    .{ .cmd_name = "WsdbFinalizeBlocks", .resp_name = "WsdbFinalizeBlocksResponse", .CmdType = types.WsdbFinalizeBlocks, .RespType = types.WsdbFinalizeBlocksResponse },
    .{ .cmd_name = "WsdbUnwindBlocks", .resp_name = "WsdbUnwindBlocksResponse", .CmdType = types.WsdbUnwindBlocks, .RespType = types.WsdbUnwindBlocksResponse },
    .{ .cmd_name = "WsdbRemoveHistoricalBlocks", .resp_name = "WsdbRemoveHistoricalBlocksResponse", .CmdType = types.WsdbRemoveHistoricalBlocks, .RespType = types.WsdbRemoveHistoricalBlocksResponse },
    .{ .cmd_name = "WsdbGetStatus", .resp_name = "WsdbGetStatusResponse", .CmdType = types.WsdbGetStatus, .RespType = types.WsdbGetStatusResponse },
    .{ .cmd_name = "WsdbCreateCheckpoint", .resp_name = "WsdbCreateCheckpointResponse", .CmdType = types.WsdbCreateCheckpoint, .RespType = types.WsdbCreateCheckpointResponse },
    .{ .cmd_name = "WsdbCommitCheckpoint", .resp_name = "WsdbCommitCheckpointResponse", .CmdType = types.WsdbCommitCheckpoint, .RespType = types.WsdbCommitCheckpointResponse },
    .{ .cmd_name = "WsdbRevertCheckpoint", .resp_name = "WsdbRevertCheckpointResponse", .CmdType = types.WsdbRevertCheckpoint, .RespType = types.WsdbRevertCheckpointResponse },
    .{ .cmd_name = "WsdbCommitAllCheckpoints", .resp_name = "WsdbCommitAllCheckpointsResponse", .CmdType = types.WsdbCommitAllCheckpoints, .RespType = types.WsdbCommitAllCheckpointsResponse },
    .{ .cmd_name = "WsdbRevertAllCheckpoints", .resp_name = "WsdbRevertAllCheckpointsResponse", .CmdType = types.WsdbRevertAllCheckpoints, .RespType = types.WsdbRevertAllCheckpointsResponse },
    .{ .cmd_name = "WsdbCopyStores", .resp_name = "WsdbCopyStoresResponse", .CmdType = types.WsdbCopyStores, .RespType = types.WsdbCopyStoresResponse },
};

/// Stub handler — replace with your world-state implementation.
fn handleCommand(comptime CmdType: type, comptime RespType: type, cmd: CmdType) !RespType {
    _ = cmd;
    return error.NotImplemented;
}

fn makeErrorResponse(message: []const u8) ![]u8 {
    var err_map = Payload.mapPayload(alloc);
    try err_map.mapPut("message", try Payload.strToPayload(message, alloc));
    return encodeResponse("WsdbErrorResponse", err_map);
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
