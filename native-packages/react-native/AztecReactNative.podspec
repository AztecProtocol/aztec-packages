require 'json'

package = JSON.parse(File.read(File.join(__dir__, 'package.json')))

# The package's native module on iOS: its C++ TurboModule (registered by ios/AztecReactNative.mm), kv-sqlite and
# SQLite3 Multiple Ciphers compiled in, and bb and the ACVM linked statically from prebuilt/ios. Devices and the
# arm64 simulator.
Pod::Spec.new do |s|
  s.name = 'AztecReactNative'
  s.version = package['version']
  s.summary = package['description']
  s.homepage = 'https://github.com/AztecProtocol/aztec-packages/tree/next/native-packages/react-native'
  s.license = package['license']
  s.authors = 'Aztec'
  # bb's iOS build targets 16.3 (barretenberg/cpp/CMakePresets.json).
  s.platforms = { :ios => '16.3' }
  s.source = { :git => 'https://github.com/AztecProtocol/aztec-packages.git', :tag => "v#{s.version}" }

  s.source_files = [
    'ios/*.{h,mm}',
    'cpp/*.{h,hpp,cpp,c}',
    'third_party/ipc-runtime-jsi/*.{hpp,cpp}',
    'third_party/sqlite3mc/*.h',
  ]
  s.private_header_files = ['cpp/*.{h,hpp}', 'third_party/**/*.{h,hpp}']
  # Compiled through cpp/sqlite3mc_unit.c (with SQLite's symbols renamed) and cpp/kv_sqlite_unit.cpp.
  s.preserve_paths = [
    'third_party/sqlite3mc/sqlite3mc_amalgamation.c',
    'third_party/kv-sqlite/**/*',
    'third_party/msgpack-c/**/*',
  ]
  s.vendored_frameworks = ['prebuilt/ios/AztecBB.xcframework', 'prebuilt/ios/AztecACVM.xcframework']

  s.pod_target_xcconfig = {
    'CLANG_CXX_LANGUAGE_STANDARD' => 'c++20',
    'GCC_PREPROCESSOR_DEFINITIONS' => '$(inherited) AZTEC_REACT_NATIVE_LINKED_LIBRARIES=1',
    'HEADER_SEARCH_PATHS' => [
      '"$(PODS_TARGET_SRCROOT)/cpp"',
      '"$(PODS_TARGET_SRCROOT)/third_party/ipc-runtime-jsi"',
      '"$(PODS_TARGET_SRCROOT)/third_party/sqlite3mc"',
      '"$(PODS_TARGET_SRCROOT)/third_party/kv-sqlite"',
      '"$(PODS_TARGET_SRCROOT)/third_party/msgpack-c/include"',
    ].join(' '),
  }
  s.libraries = 'c++'

  install_modules_dependencies(s)
end
