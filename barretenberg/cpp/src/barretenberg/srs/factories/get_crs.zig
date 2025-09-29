const std = @import("std");

// Download num_bytes of CRS data from the remote "filename".
fn downloadData(allocator: std.mem.Allocator, num_bytes: usize, filename: []const u8) ![]u8 {
    // Calculate the byte range needed
    const end_byte = num_bytes - 1;

    // Create the HTTP client
    var client = std.http.Client{ .allocator = allocator };
    defer client.deinit();

    // Create range header
    var range_header_buf: [256]u8 = undefined;
    const range_header = try std.fmt.bufPrint(&range_header_buf, "bytes=0-{d}", .{end_byte});

    // Make the request
    var url_buf: [256]u8 = undefined;
    const url = try std.fmt.bufPrint(&url_buf, "https://crs.aztec.network/{s}", .{filename});
    const uri = try std.Uri.parse(url);
    var request = client.request(.GET, uri, .{
        .extra_headers = &.{
            .{ .name = "range", .value = range_header },
        },
    }) catch return error.HttpRequestFailed;
    defer request.deinit();

    // Send the request
    try request.sendBodiless();

    // Receive response headers
    var read_buffer: [8192]u8 = undefined;
    var response = try request.receiveHead(&read_buffer);

    // Read the response body
    var reader = response.reader(&read_buffer);

    var data_list = try std.ArrayList(u8).initCapacity(allocator, num_bytes);
    defer data_list.deinit(allocator);

    while (true) {
        const bytes_read = reader.readSliceShort(&read_buffer) catch break;
        if (bytes_read == 0) break;
        try data_list.appendSlice(allocator, read_buffer[0..bytes_read]);
    }

    return try data_list.toOwnedSlice(allocator);
}

fn downloadBn254G1Data(allocator: std.mem.Allocator, num_points: usize) ![]u8 {
    // Download the requested number of G1 points (each 64 bytes).
    return downloadData(allocator, num_points * 64, "g1.dat");
}

// Pure Zig function to download BN254 G2 data completely
fn downloadBn254G2Data(allocator: std.mem.Allocator) ![]u8 {
    // Download the single 128 byte G2 point.
    return downloadData(allocator, 128, "g2.dat");
}

fn downloadGrumpkinG1Data(allocator: std.mem.Allocator) ![]u8 {
    // Download entire grumpkin G1 data. It's only 16MB for 2^18 points.
    return downloadData(allocator, (1 << 18) * 64, "grumpkin_g1.dat");
}

// C wrapper for BN254 G1 data download
export fn download_bn254_g1_data(num_points: usize, out_len: *usize) [*]const u8 {
    const gpa = std.heap.c_allocator;
    const data = downloadBn254G1Data(gpa, num_points) catch {
        out_len.* = 0;
        return undefined;
    };

    out_len.* = data.len;
    return data.ptr;
}

// C wrapper for BN254 G2 data download
export fn download_bn254_g2_data(out_len: *usize) [*]const u8 {
    const gpa = std.heap.c_allocator;
    const data = downloadBn254G2Data(gpa) catch {
        out_len.* = 0;
        return undefined;
    };

    out_len.* = data.len;
    return data.ptr;
}

// C wrapper for grumpkin G1 data download
export fn download_grumpkin_g1_data(out_len: *usize) [*]const u8 {
    const gpa = std.heap.c_allocator;
    const data = downloadGrumpkinG1Data(gpa) catch {
        out_len.* = 0;
        return undefined;
    };

    out_len.* = data.len;
    return data.ptr;
}

pub fn downloadCrsToCache(allocator: std.mem.Allocator, num_bn254_g1_points: usize, cache_path: []const u8) !void {
    const bn254_g1_path = try std.fs.path.join(allocator, &.{ cache_path, "bn254_g1.dat" });
    defer allocator.free(bn254_g1_path);
    const bn254_g2_path = try std.fs.path.join(allocator, &.{ cache_path, "bn254_g2.dat" });
    defer allocator.free(bn254_g2_path);
    const grumpkin_g1_path = try std.fs.path.join(allocator, &.{ cache_path, "grumpkin_g1.flat.dat" });
    defer allocator.free(grumpkin_g1_path);

    // Check if files have the expected length. g1 = num_g1_points * 64, g2 = 128.
    const bn254_g1_stats = std.fs.cwd().statFile(bn254_g1_path) catch null;
    const bn254_g2_stats = std.fs.cwd().statFile(bn254_g2_path) catch null;
    const grumpkin_g1_stats = std.fs.cwd().statFile(grumpkin_g1_path) catch null;

    if (bn254_g1_stats != null and bn254_g1_stats.?.size >= @as(u64, num_bn254_g1_points * 64) and
        (bn254_g2_stats != null and bn254_g2_stats.?.size == 128) and
        (grumpkin_g1_stats != null and grumpkin_g1_stats.?.size >= @as(u64, (1 << 18) * 64)))
    {
        // std.log.info("CRS files already exist in cache path: {s}\n", .{cache_path});
        return;
    }

    std.log.info("Downloading CRS to cache path: {s}\n", .{cache_path});
    const g1_data = try downloadBn254G1Data(allocator, num_bn254_g1_points);
    defer allocator.free(g1_data);

    const g2_data = try downloadBn254G2Data(allocator);
    defer allocator.free(g2_data);

    const grumpkin_g1_data = try downloadGrumpkinG1Data(allocator);
    defer allocator.free(grumpkin_g1_data);

    // Write crs to cache.
    try std.fs.cwd().writeFile(.{ .sub_path = bn254_g1_path, .data = g1_data });
    try std.fs.cwd().writeFile(.{ .sub_path = bn254_g2_path, .data = g2_data });
    try std.fs.cwd().writeFile(.{ .sub_path = grumpkin_g1_path, .data = grumpkin_g1_data });
}
