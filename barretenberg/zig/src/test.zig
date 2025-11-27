const std = @import("std");
const api = @import("api.zig");
const generated_types = @import("generated_types.zig");

test "backend interface compiles" {
    // Verify that the Backend interface is well-formed
    const backend = api.Backend{
        .ptr = undefined,
        .vtable = &.{
            .call = struct {
                fn callFn(_: *anyopaque, _: []const u8) anyerror![]u8 {
                    return error.NotImplemented;
                }
            }.callFn,
            .destroy = struct {
                fn destroyFn(_: *anyopaque) void {}
            }.destroyFn,
        },
    };

    // Verify vtable has the expected functions
    _ = backend.vtable.call;
    _ = backend.vtable.destroy;
}

test "mock backend basic usage" {
    const allocator = std.testing.allocator;

    var mock = api.MockBackend.init(allocator);
    const backend = mock.backend();

    // Initial state
    try std.testing.expectEqual(@as(usize, 0), mock.call_count);

    // Make a call
    const result = try backend.call("test");
    defer allocator.free(result);

    // Verify call was tracked
    try std.testing.expectEqual(@as(usize, 1), mock.call_count);

    // Result should be 32 zero bytes (mock Blake2s response)
    try std.testing.expectEqual(@as(usize, 32), result.len);

    // Clean up
    backend.destroy();
}

test "barretenberg api with mock backend" {
    const allocator = std.testing.allocator;

    var mock = api.MockBackend.init(allocator);
    var bb = api.BarretenbergApi.init(mock.backend(), allocator);
    defer bb.deinit();

    // Verify API is usable (placeholder implementation)
    _ = try bb.blake2s("test data");
}

test "types are well-formed" {
    // Verify that generated types have expected structure
    const cmd = generated_types.Command{ .blake2s = .{ .data = "test" } };
    try std.testing.expect(cmd == .blake2s);

    const resp = generated_types.Response{ .blake2s_response = .{ .hash = "hash" } };
    try std.testing.expect(resp == .blake2s_response);
}

test "custom backend implementation" {
    // Example of implementing a custom backend
    const CustomBackend = struct {
        const Self = @This();
        response_data: []const u8,

        fn backend(self: *Self) api.Backend {
            return .{
                .ptr = self,
                .vtable = &.{
                    .call = callImpl,
                    .destroy = destroyImpl,
                },
            };
        }

        fn callImpl(ptr: *anyopaque, _: []const u8) anyerror![]u8 {
            const self: *Self = @ptrCast(@alignCast(ptr));
            // Return the predefined response
            const result = std.testing.allocator.alloc(u8, self.response_data.len) catch unreachable;
            @memcpy(result, self.response_data);
            return result;
        }

        fn destroyImpl(_: *anyopaque) void {}
    };

    var custom = CustomBackend{ .response_data = "custom response!" };
    const backend = custom.backend();

    const result = try backend.call("input");
    defer std.testing.allocator.free(result);

    try std.testing.expectEqualStrings("custom response!", result);
}
