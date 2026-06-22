/// Echo IPC client (Zig) — uses GENERATED typed client + the ipc-runtime
/// Zig binding for transport. No per-service UDS code in the example.
/// Usage: echo_client --socket /tmp/echo.sock
const std = @import("std");
const ipc_runtime = @import("ipc_runtime");
const echo_client = @import("generated/echo_client.zig");
const types = @import("generated/echo_types.zig");

fn testHash(base: u8) types.Fr {
    var hash: types.Fr = undefined;
    for (&hash, 0..) |*byte, i| {
        byte.* = base + @as(u8, @intCast(i));
    }
    return hash;
}

pub fn main() !void {
    var args = std.process.args();
    _ = args.next();
    var socket_path: ?[:0]const u8 = null;
    while (args.next()) |arg| {
        if (std.mem.eql(u8, arg, "--socket")) {
            socket_path = args.next();
        }
    }
    const path = socket_path orelse {
        std.debug.print("Usage: echo_client --socket <path>\n", .{});
        std.process.exit(1);
    };

    // Use page_allocator: the codegen-emitted client frees response buffers
    // with std.heap.page_allocator, so the runtime Client must allocate with
    // the same one.
    var backend = try ipc_runtime.Client.fromPath(std.heap.page_allocator, path);
    defer backend.deinit();

    const EchoClient = echo_client.Client(ipc_runtime.Client);
    var client = EchoClient.init(&backend);

    // Test 1: EchoBytes
    {
        const cmd = types.EchoBytes{ .data = &[_]u8{ 0xDE, 0xAD, 0xBE, 0xEF, 0x42 } };
        const resp = try client.bytes(cmd);
        if (!std.mem.eql(u8, resp.data, &[_]u8{ 0xDE, 0xAD, 0xBE, 0xEF, 0x42 })) {
            std.debug.print("echo_client(zig): EchoBytes FAIL\n", .{});
            std.process.exit(1);
        }
        std.debug.print("echo_client(zig): EchoBytes OK\n", .{});
    }

    // Test 2: EchoFields
    {
        const cmd = types.EchoFields{ .a = 42, .b = 999999, .name = "hello wire compat" };
        const resp = try client.fields(cmd);
        if (resp.a != 42 or resp.b != 999999 or !std.mem.eql(u8, resp.name, "hello wire compat")) {
            std.debug.print("echo_client(zig): EchoFields FAIL\n", .{});
            std.process.exit(1);
        }
        std.debug.print("echo_client(zig): EchoFields OK\n", .{});
    }

    // Test 3: EchoNested
    {
        const values = &[_][]const u8{ &[_]u8{ 1, 2, 3 }, &[_]u8{ 4, 5 } };
        const cmd = types.EchoNested{
            .inner = types.EchoInner{ .values = values, .flag = true },
        };
        const resp = try client.nested(cmd);
        if (resp.inner.values.len != 2) {
            std.debug.print("echo_client(zig): EchoNested FAIL\n", .{});
            std.process.exit(1);
        }
        if (resp.inner.flag != true) {
            std.debug.print("echo_client(zig): EchoNested flag FAIL\n", .{});
            std.process.exit(1);
        }
        std.debug.print("echo_client(zig): EchoNested OK\n", .{});
    }

    // Test 4: EchoAliases
    {
        const hash = testHash(0x10);
        const second = testHash(0x40);
        const hashes = &[_]types.Fr{ hash, second };
        const cmd = types.EchoAliases{
            .tree_id = 7,
            .hash = hash,
            .maybe_hash = second,
            .hashes = hashes,
        };
        const resp = try client.aliases(cmd);
        if (resp.tree_id != 7 or !std.mem.eql(u8, &resp.hash, &hash)) {
            std.debug.print("echo_client(zig): EchoAliases FAIL\n", .{});
            std.process.exit(1);
        }
        if (resp.maybe_hash == null or !std.mem.eql(u8, &resp.maybe_hash.?, &second) or resp.hashes.len != 2) {
            std.debug.print("echo_client(zig): EchoAliases optional/vector FAIL\n", .{});
            std.process.exit(1);
        }
        if (!std.mem.eql(u8, &resp.hashes[0], &hash) or !std.mem.eql(u8, &resp.hashes[1], &second)) {
            std.debug.print("echo_client(zig): EchoAliases hashes contents FAIL\n", .{});
            std.process.exit(1);
        }
        std.debug.print("echo_client(zig): EchoAliases OK\n", .{});
    }

    // Test 5: EchoAliases with maybe_hash = null (optional-absent over live IPC)
    {
        const hash = testHash(0x10);
        const cmd = types.EchoAliases{
            .tree_id = 7,
            .hash = hash,
            .maybe_hash = null,
            .hashes = &[_]types.Fr{hash},
        };
        const resp = try client.aliases(cmd);
        if (resp.maybe_hash != null) {
            std.debug.print("echo_client(zig): EchoAliases none FAIL\n", .{});
            std.process.exit(1);
        }
        std.debug.print("echo_client(zig): EchoAliases none OK\n", .{});
    }

    // Test 6: EchoFields with b > u32::MAX (uint64 wire encoding over live IPC)
    {
        const big: u64 = (1 << 53) - 1;
        const cmd = types.EchoFields{ .a = 42, .b = big, .name = "big" };
        const resp = try client.fields(cmd);
        if (resp.b != big) {
            std.debug.print("echo_client(zig): EchoFields u64 FAIL\n", .{});
            std.process.exit(1);
        }
        std.debug.print("echo_client(zig): EchoFields u64 OK\n", .{});
    }

    // Test 7: EchoBlobs — optional bytes Some/None and fixed [bytes; 2]
    {
        const cmd = types.EchoBlobs{
            .maybe_data = &[_]u8{ 0xAA, 0xBB },
            .parts = .{ &[_]u8{ 1, 2, 3 }, &[_]u8{4} },
        };
        const resp = try client.blobs(cmd);
        if (resp.maybe_data == null or !std.mem.eql(u8, resp.maybe_data.?, &[_]u8{ 0xAA, 0xBB })) {
            std.debug.print("echo_client(zig): EchoBlobs maybe_data FAIL\n", .{});
            std.process.exit(1);
        }
        if (!std.mem.eql(u8, resp.parts[0], &[_]u8{ 1, 2, 3 }) or !std.mem.eql(u8, resp.parts[1], &[_]u8{4})) {
            std.debug.print("echo_client(zig): EchoBlobs parts FAIL\n", .{});
            std.process.exit(1);
        }
        const cmd_none = types.EchoBlobs{
            .maybe_data = null,
            .parts = .{ &[_]u8{}, &[_]u8{9} },
        };
        const resp_none = try client.blobs(cmd_none);
        if (resp_none.maybe_data != null) {
            std.debug.print("echo_client(zig): EchoBlobs none FAIL\n", .{});
            std.process.exit(1);
        }
        std.debug.print("echo_client(zig): EchoBlobs OK\n", .{});
    }

    // Test 8: EchoFail — server error surfaces, message available on the client
    {
        const cmd = types.EchoFail{ .message = "deliberate failure" };
        if (client.fail(cmd)) |_| {
            std.debug.print("echo_client(zig): EchoFail FAIL (no error)\n", .{});
            std.process.exit(1);
        } else |err| {
            if (err != error.ServerError) {
                std.debug.print("echo_client(zig): EchoFail wrong error: {s}\n", .{@errorName(err)});
                std.process.exit(1);
            }
            const message = client.last_server_error orelse {
                std.debug.print("echo_client(zig): EchoFail missing message\n", .{});
                std.process.exit(1);
            };
            if (std.mem.indexOf(u8, message, "deliberate failure") == null) {
                std.debug.print("echo_client(zig): EchoFail message mismatch: {s}\n", .{message});
                std.process.exit(1);
            }
        }
        std.debug.print("echo_client(zig): EchoFail OK\n", .{});
    }

    std.debug.print("echo_client(zig): all tests passed\n", .{});
}
