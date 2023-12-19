#include "get_bn254_crs.hpp"

std::vector<uint8_t> download_bn254_g1_data(size_t num_points)
{
    size_t g1_end = num_points * 64 - 1;

    std::string url = "https://aztec-ignition.s3.amazonaws.com/MAIN%20IGNITION/flat/g1.dat";

    std::string command = "curl -s -H \"Range: bytes=0-" + std::to_string(g1_end) + "\" '" + url + "'";

    auto data = exec_pipe(command);
    // Header + num_points * sizeof point.
    if (data.size() < g1_end) {
        throw std::runtime_error("Failed to download g1 data.");
    }

    return data;
}

std::vector<uint8_t> download_bn254_g2_data()
{
    std::string url = "https://aztec-ignition.s3.amazonaws.com/MAIN%20IGNITION/flat/g2.dat";
    std::string command = "curl -s '" + url + "'";
    return exec_pipe(command);
}

std::vector<barretenberg::g1::affine_element> get_bn254_g1_data(const std::filesystem::path& path, size_t num_points)
{
    std::filesystem::create_directories(path);
    std::ifstream size_file(path / "size");
    size_t size = 0;
    if (size_file) {
        size_file >> size;
        size_file.close();
    }
    if (size >= num_points) {
        auto file = path / "g1.dat";
        vinfo("using cached crs at: ", file);
        auto data = read_file(file, num_points * 64);
        auto points = std::vector<barretenberg::g1::affine_element>(num_points);
        for (size_t i = 0; i < num_points; ++i) {
            points[i] = from_buffer<barretenberg::g1::affine_element>(data, i * 64);
        }
        return points;
    }

    vinfo("downloading crs...");
    auto data = download_bn254_g1_data(num_points);
    write_file(path / "g1.dat", data);

    std::ofstream new_size_file(path / "size");
    if (!new_size_file) {
        throw std::runtime_error("Failed to open size file for writing");
    }
    new_size_file << num_points;
    new_size_file.close();

    auto points = std::vector<barretenberg::g1::affine_element>(num_points);
    for (size_t i = 0; i < num_points; ++i) {
        points[i] = from_buffer<barretenberg::g1::affine_element>(data, i * 64);
    }
    return points;
}

barretenberg::g2::affine_element get_bn254_g2_data(const std::filesystem::path& path)
{
    std::filesystem::create_directories(path);

    try {
        auto data = read_file(path / "g2.dat");
        return from_buffer<barretenberg::g2::affine_element>(data.data());
    } catch (std::exception&) {
        auto data = download_bn254_g2_data();
        write_file(path / "g2.dat", data);
        return from_buffer<barretenberg::g2::affine_element>(data.data());
    }
}