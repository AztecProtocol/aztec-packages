const std = @import("std");

pub fn build(b: *std.Build) void {
    const target = b.standardTargetOptions(.{});
    const optimize = b.standardOptimizeOption(.{});

    // Create library
    const lib = b.addStaticLibrary(.{
        .name = "barretenberg-zig",
        .root_source_file = b.path("src/api.zig"),
        .target = target,
        .optimize = optimize,
    });
    b.installArtifact(lib);

    // Create tests
    const tests = b.addTest(.{
        .root_source_file = b.path("src/test.zig"),
        .target = target,
        .optimize = optimize,
    });

    const run_tests = b.addRunArtifact(tests);
    const test_step = b.step("test", "Run tests");
    test_step.dependOn(&run_tests.step);
}
