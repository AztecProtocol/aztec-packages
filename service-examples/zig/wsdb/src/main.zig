/// Zig WSDB Server — uses generated server dispatch + generic IPC transport.
///
/// All command handlers return "not implemented" errors.
/// Edit src/generated/server.zig to implement your world-state logic.
///
/// Usage: zig-wsdb --socket /tmp/wsdb.sock
const server = @import("generated/server_gen.zig");

pub fn main() !void {
    var args = @import("std").process.args();
    _ = args.next();
    var socket_path: ?[]const u8 = null;
    while (args.next()) |arg| {
        if (@import("std").mem.eql(u8, arg, "--socket")) {
            socket_path = args.next();
        }
    }
    const path = socket_path orelse {
        @import("std").debug.print("Usage: zig-wsdb --socket <path>\n", .{});
        @import("std").process.exit(1);
    };

    try server.serve(path);
}
