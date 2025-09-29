const std = @import("std");

// Pure Zig function to download BN254 G1 data using HTTP range request
fn downloadBn254G1Data(allocator: std.mem.Allocator, num_points: usize) ![]u8 {
    // Calculate the byte range needed
    const g1_element_size = 64; // sizeof(g1::affine_element) = 64 bytes
    const end_byte = (num_points * g1_element_size) - 1;

    // Create the HTTP client
    var client = std.http.Client{ .allocator = allocator };
    defer client.deinit();

    // Create range header
    var range_header_buf: [64]u8 = undefined;
    const range_header = std.fmt.bufPrint(&range_header_buf, "bytes=0-{d}", .{end_byte}) catch return error.MemoryError;

    // Make the request
    const uri = std.Uri.parse("https://crs.aztec.network/g1.dat") catch return error.UriParseFailed;
    var request = client.request(.GET, uri, .{
        .extra_headers = &.{
            .{ .name = "range", .value = range_header },
        },
    }) catch return error.HttpRequestFailed;
    defer request.deinit();

    // Send the request
    request.sendBodiless() catch return error.HttpRequestFailed;

    // Receive response headers
    var redirect_buffer: [1024]u8 = undefined;
    var response = request.receiveHead(&redirect_buffer) catch return error.HttpRequestFailed;

    // Read the response body
    var transfer_buffer: [8192]u8 = undefined;
    var reader = response.reader(&transfer_buffer);

    var data_list = std.ArrayList(u8).empty;
    defer data_list.deinit(allocator);

    var read_buffer: [4096]u8 = undefined;
    while (true) {
        const bytes_read = reader.readSliceShort(&read_buffer) catch break;
        if (bytes_read == 0) break;
        data_list.appendSlice(allocator, read_buffer[0..bytes_read]) catch return error.MemoryError;
    }

    return data_list.toOwnedSlice(allocator) catch return error.MemoryError;
}

// Pure Zig function to download BN254 G2 data completely
fn downloadBn254G2Data(allocator: std.mem.Allocator) ![]u8 {
    // Create the HTTP client
    var client = std.http.Client{ .allocator = allocator };
    defer client.deinit();

    // Make the request
    const uri = std.Uri.parse("https://crs.aztec.network/g2.dat") catch return error.UriParseFailed;
    var request = client.request(.GET, uri, .{}) catch return error.HttpRequestFailed;
    defer request.deinit();

    // Send the request
    request.sendBodiless() catch return error.HttpRequestFailed;

    // Receive response headers
    var redirect_buffer: [1024]u8 = undefined;
    var response = request.receiveHead(&redirect_buffer) catch return error.HttpRequestFailed;

    // Read the response body
    var transfer_buffer: [8192]u8 = undefined;
    var reader = response.reader(&transfer_buffer);

    var data_list = std.ArrayList(u8).empty;
    defer data_list.deinit(allocator);

    var read_buffer: [4096]u8 = undefined;
    while (true) {
        const bytes_read = reader.readSliceShort(&read_buffer) catch break;
        if (bytes_read == 0) break;
        data_list.appendSlice(allocator, read_buffer[0..bytes_read]) catch return error.MemoryError;
    }

    return data_list.toOwnedSlice(allocator) catch return error.MemoryError;
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

pub fn downloadCrsToCache(allocator: std.mem.Allocator, num_g1_points: usize, cache_path: []const u8) !void {
    const g1_path = std.fs.path.join(allocator, &.{ cache_path, "bn254_g1.dat" }) catch return error.MemoryError;
    defer allocator.free(g1_path);
    const g2_path = std.fs.path.join(allocator, &.{ cache_path, "bn254_g2.dat" }) catch return error.MemoryError;
    defer allocator.free(g2_path);

    // Check if files have the expected length. g1 = num_g1_points * 64, g2 = 128.
    const g1_stats = std.fs.cwd().statFile(g1_path) catch null;
    const g2_stats = std.fs.cwd().statFile(g2_path) catch null;

    if (g1_stats != null and g1_stats.?.size >= @as(u64, num_g1_points * 64) and
        (g2_stats != null and g2_stats.?.size == 128))
    {
        // std.log.info("BN254 CRS files already exist in cache path: {s}\n", .{cache_path});
        return;
    }

    std.log.info("Downloading BN254 CRS to cache path: {s}\n", .{cache_path});
    const g1_data = try downloadBn254G1Data(allocator, num_g1_points);
    defer allocator.free(g1_data);

    const g2_data = try downloadBn254G2Data(allocator);
    defer allocator.free(g2_data);

    // Write to two files: g1.dat and g2.dat in the specified cache path.
    try std.fs.cwd().writeFile(.{ .sub_path = g1_path, .data = g1_data });

    try std.fs.cwd().writeFile(.{ .sub_path = g2_path, .data = g2_data });
}
