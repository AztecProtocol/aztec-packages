const std = @import("std");

pub fn build(b: *std.Build) void {
    const target = b.standardTargetOptions(.{});
    const optimize = b.standardOptimizeOption(.{});

    // Create library module
    const lib = b.createModule(.{
        .root_source_file = b.path("src/api.zig"),
    });
    _ = lib;

    // Create tests - Zig 0.15 uses different API
    const tests = b.addTest(.{
        .name = "barretenberg-tests",
        .root_module = b.createModule(.{
            .root_source_file = b.path("src/test.zig"),
            .target = target,
            .optimize = optimize,
        }),
    });

    const run_tests = b.addRunArtifact(tests);
    const test_step = b.step("test", "Run tests");
    test_step.dependOn(&run_tests.step);
}
