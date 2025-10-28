const std = @import("std");
const api = @import("api.zig");
const types = @import("types.zig");

test "basic structure compiles" {
    // This test verifies that the basic structure compiles
    // Full integration tests will be added once msgpack serialization is implemented

    const allocator = std.testing.allocator;

    // Create a mock backend
    const MockBackend = struct {
        fn call(_: *anyopaque, input: []const u8) ![]u8 {
            _ = input;
            return error.NotImplemented;
        }

        fn destroy(_: *anyopaque) void {}
    };

    var mock_data: u8 = 0;
    const backend = api.Backend{
        .ptr = &mock_data,
        .vtable = &.{
            .call = MockBackend.call,
            .destroy = MockBackend.destroy,
        },
    };

    const bb_api = api.BarretenbergApi.init(backend, allocator);
    _ = bb_api;

    // Verify types exist
    _ = types.Command;
    _ = types.Response;
}

test "types are well-formed" {
    // Verify that generated types have expected structure
    const cmd = types.Command{ .Blake2s = .{ .data = "test" } };
    try std.testing.expect(cmd == .Blake2s);

    const resp = types.Response{ .Blake2sResponse = .{ .hash = "hash" } };
    try std.testing.expect(resp == .Blake2sResponse);
}
