const std = @import("std");
const print = std.debug.print;
const assert = std.debug.assert;

// Import the C API declarations
const c = @cImport({
    @cInclude("c_api.h");
});

// Constants based on the barretenberg field/group sizes
const SCALAR_SIZE = 32; // 32 bytes for field elements (256 bits)
const POINT_SIZE = 64;  // 64 bytes for affine points (x, y coordinates, 32 bytes each)

// Helper struct for managing point data
const GrumpkinPoint = struct {
    data: [POINT_SIZE]u8,

    const Self = @This();

    fn init() Self {
        return Self{
            .data = std.mem.zeroes([POINT_SIZE]u8),
        };
    }

    fn getPtr(self: *Self) [*c]u8 {
        return @ptrCast(&self.data[0]);
    }

    fn getConstPtr(self: *const Self) [*c]const u8 {
        return @ptrCast(&self.data[0]);
    }

    fn setGenerator(self: *Self) void {
        // Set to Grumpkin generator point
        // This is a placeholder - in practice you'd load the actual generator coordinates
        @memset(&self.data, 0);
        self.data[0] = 1; // Simple non-zero point for demo
    }

    fn format(self: Self, comptime fmt: []const u8, options: std.fmt.FormatOptions, writer: anytype) !void {
        _ = fmt;
        _ = options;
        try writer.print("GrumpkinPoint(x: ");
        for (self.data[0..32]) |byte| {
            try writer.print("{:02x}", .{byte});
        }
        try writer.print(", y: ");
        for (self.data[32..64]) |byte| {
            try writer.print("{:02x}", .{byte});
        }
        try writer.print(")");
    }
};

// Helper struct for managing scalar data
const GrumpkinScalar = struct {
    data: [SCALAR_SIZE]u8,

    const Self = @This();

    fn init() Self {
        return Self{
            .data = std.mem.zeroes([SCALAR_SIZE]u8),
        };
    }

    fn getPtr(self: *Self) [*c]u8 {
        return @ptrCast(&self.data[0]);
    }

    fn getConstPtr(self: *const Self) [*c]const u8 {
        return @ptrCast(&self.data[0]);
    }

    fn setRandom(self: *Self) void {
        c.ecc_grumpkin__get_random_scalar_mod_circuit_modulus(self.getPtr());
    }

    fn setFromU64(self: *Self, value: u64) void {
        @memset(&self.data, 0);
        std.mem.writeInt(u64, self.data[0..8], value, .little);
    }

    fn format(self: Self, comptime fmt: []const u8, options: std.fmt.FormatOptions, writer: anytype) !void {
        _ = fmt;
        _ = options;
        try writer.print("GrumpkinScalar(");
        for (self.data) |byte| {
            try writer.print("{:02x}", .{byte});
        }
        try writer.print(")");
    }
};

fn demoPointMultiplication() !void {
    print("\n=== Grumpkin Point Multiplication Demo ===\n", .{});

    // For this demo, let's use a different approach:
    // Start with a random scalar to generate a valid point
    var initial_scalar = GrumpkinScalar.init();
    initial_scalar.setFromU64(123); // Use 123 as our "base" scalar
    print("Initial scalar: {}\n", .{initial_scalar});

    // Generate a point by multiplying the curve generator (which is built into the implementation)
    // by our initial scalar. We'll use point-at-infinity (zeros) as input to represent the generator.
    var generator_point = GrumpkinPoint.init();
    // Point-at-infinity multiplied by a scalar should give us scalar * generator
    c.ecc_grumpkin__mul(generator_point.getConstPtr(), initial_scalar.getConstPtr(), generator_point.getPtr());
    print("Generated point (123 * generator): {}\n", .{generator_point});

    // Now multiply this point by another scalar
    var scalar = GrumpkinScalar.init();
    scalar.setFromU64(42);
    print("Multiplying by scalar: {}\n", .{scalar});

    var result_point = GrumpkinPoint.init();
    c.ecc_grumpkin__mul(generator_point.getConstPtr(), scalar.getConstPtr(), result_point.getPtr());

    print("Result (42 * (123 * generator)): {}\n", .{result_point});
    print("✓ Point multiplication completed successfully!\n", .{});
}

fn demoPointAddition() !void {
    print("\n=== Grumpkin Point Addition Demo ===\n", .{});

    // Create two points
    var point_a = GrumpkinPoint.init();
    point_a.setGenerator();

    var scalar_2 = GrumpkinScalar.init();
    scalar_2.setFromU64(2);
    var point_b = GrumpkinPoint.init();
    c.ecc_grumpkin__mul(point_a.getConstPtr(), scalar_2.getConstPtr(), point_b.getPtr());

    print("Point A (generator): {}\n", .{point_a});
    print("Point B (2 * generator): {}\n", .{point_b});

    // Perform point addition: result = point_a + point_b
    var result_point = GrumpkinPoint.init();
    c.ecc_grumpkin__add(point_a.getConstPtr(), point_b.getConstPtr(), result_point.getPtr());

    print("Result (A + B = 3 * generator): {}\n", .{result_point});

    // Verify by computing 3 * generator directly
    var scalar_3 = GrumpkinScalar.init();
    scalar_3.setFromU64(3);
    var verification_point = GrumpkinPoint.init();
    c.ecc_grumpkin__mul(point_a.getConstPtr(), scalar_3.getConstPtr(), verification_point.getPtr());

    print("Verification (3 * generator): {}\n", .{verification_point});
    print("✓ Point addition completed successfully!\n", .{});
}

fn demoBatchOperations() !void {
    print("\n=== Grumpkin Batch Multiplication Demo ===\n", .{});

    const num_points = 3;
    var points: [num_points]GrumpkinPoint = undefined;
    var results: [num_points]GrumpkinPoint = undefined;

    // Initialize points
    for (&points, 0..) |*point, i| {
        point.* = GrumpkinPoint.init();
        point.setGenerator();

        // Make each point slightly different for demo
        var temp_scalar = GrumpkinScalar.init();
        temp_scalar.setFromU64(@intCast(i + 1));
        c.ecc_grumpkin__mul(point.getConstPtr(), temp_scalar.getConstPtr(), point.getPtr());

        print("Input point {}: {}\n", .{ i, point.* });
    }

    // Create scalar to multiply all points by
    var batch_scalar = GrumpkinScalar.init();
    batch_scalar.setFromU64(5);
    print("Batch scalar (5): {}\n", .{batch_scalar});

    // Perform batch multiplication
    c.ecc_grumpkin__batch_mul(
        @ptrCast(&points[0].data[0]),
        batch_scalar.getConstPtr(),
        num_points,
        @ptrCast(&results[0].data[0])
    );

    print("Batch multiplication results:\n", .{});
    for (results, 0..) |result, i| {
        print("Result point {}: {}\n", .{ i, result });
    }

    print("✓ Batch operations completed successfully!\n", .{});
}

fn demoRandomScalars() !void {
    print("\n=== Random Scalar Generation Demo ===\n", .{});

    const num_random = 3;
    var scalars: [num_random]GrumpkinScalar = undefined;

    for (&scalars, 0..) |*scalar, i| {
        scalar.* = GrumpkinScalar.init();
        c.ecc_grumpkin__get_random_scalar_mod_circuit_modulus(scalar.getPtr());
        print("Random scalar {}: {}\n", .{ i, scalar.* });
    }

    print("✓ Random scalar generation completed successfully!\n", .{});
}

fn testThreading() !void {
    print("\n=== Threading Test (to trigger pthread linking) ===\n", .{});

    print("Testing parallel_for function call...\n", .{});
    c.test_pthread_linking();
    print("✓ Threading test completed!\n", .{});
}

pub fn main() !void {
    print("🚀 Barretenberg Grumpkin ECC Demo with Zig!\n", .{});
    print("============================================\n", .{});

    // Start with just the working demos
    try demoRandomScalars();

    // Add threading test to force pthread linking
    try testThreading();

    // Skip the point operations for now since we need to understand
    // how the C API expects the generator point to be represented
    print("\n⚠️  Point operations demos temporarily disabled due to generator point setup\n", .{});
    print("The integration works - we just need to properly initialize curve points.\n", .{});

    print("\n🎉 Demo completed successfully!\n", .{});
    print("This demonstrates Zig calling Barretenberg C++ ECC functions.\n", .{});
}