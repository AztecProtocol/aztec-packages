//! Smoke test: spawn UDS server thread, client connects + round-trips one msg.
const std = @import("std");
const ipc = @import("ipc_runtime");

const SocketPath = "/tmp/ipc_runtime_zig_smoke.sock";

fn serverThread(arg: usize) void {
    _ = arg;
    std.fs.cwd().deleteFile(SocketPath) catch {};
    var srv = ipc.Server.fromPath(SocketPath) catch unreachable;
    defer srv.deinit();
    srv.listen() catch unreachable;

    const Ctx = struct {
        scratch: []u8,
    };
    var scratch: [16]u8 = undefined;
    var ctx_struct = Ctx{ .scratch = &scratch };

    srv.run(*Ctx, &ctx_struct, struct {
        fn h(ctx: *Ctx, _: i32, req: []const u8) []u8 {
            const n = @min(req.len, ctx.scratch.len);
            for (0..n) |i| ctx.scratch[i] = req[n - 1 - i];
            return ctx.scratch[0..n];
        }
    }.h);
}

pub fn main() !void {
    const thread = try std.Thread.spawn(.{}, serverThread, .{@as(usize, 0)});
    _ = thread;
    std.Thread.sleep(100 * std.time.ns_per_ms);

    var gpa = std.heap.GeneralPurposeAllocator(.{}){};
    defer _ = gpa.deinit();
    var client = try ipc.Client.fromPath(gpa.allocator(), SocketPath);
    defer client.deinit();

    const response = try client.call("hello");
    defer gpa.allocator().free(response);
    std.debug.print("client got: {s}\n", .{response});
    if (!std.mem.eql(u8, response, "olleh")) {
        std.debug.print("mismatch\n", .{});
        std.process.exit(1);
    }
    std.process.exit(0);
}
