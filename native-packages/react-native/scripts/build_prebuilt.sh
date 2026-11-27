#!/usr/bin/env bash
# Assembles prebuilt/, the native libraries the package ships, from this tree's cross builds (make
# react-native-mobile builds them):
#   prebuilt/android/<abi>/libaztec_bb.so    bb, linked with its own C++ runtime (zig's libc++, which is not the
#                                            NDK's), exporting only its FFI
#   prebuilt/android/<abi>/libaztec_acvm.a   the ACVM and Noir's ABI encoder (native-packages/acvm), a Rust
#                                            static library
#   prebuilt/ios/AztecBB.xcframework         bb's static library, for devices and the arm64 simulator
#   prebuilt/ios/AztecACVM.xcframework       the ACVM's
set -euo pipefail

cd "$(dirname "$0")/.."
root=$(git rev-parse --show-toplevel)
bb=$root/barretenberg/cpp
acvm=$root/native-packages/acvm/rust/target

rm -rf prebuilt
mkdir -p prebuilt/android prebuilt/ios
tmp=$(mktemp -d)
trap 'rm -rf "$tmp"' EXIT

echo '{ global: bb_ipc_ffi_*; local: *; };' >"$tmp/bb.map"
for spec in arm64-v8a:aarch64:arm64-android x86_64:x86_64:x86_64-android; do
  IFS=: read -r abi arch preset <<<"$spec"
  out=prebuilt/android/$abi
  mkdir -p "$out"
  cat >"$tmp/libc-$abi.txt" <<LIBC
include_dir=$bb/android-sysroot/usr/include
sys_include_dir=$bb/android-sysroot/usr/include/$arch-linux-android
crt_dir=$bb/android-sysroot/usr/lib/$arch-linux-android/24
msvc_lib_dir=
kernel32_lib_dir=
gcc_dir=
LIBC
  ZIG_LIBC=$tmp/libc-$abi.txt zig c++ -target $arch-linux-android.24 -shared -o "$out/libaztec_bb.so" \
    -Wl,--whole-archive "$bb/build-$preset/lib/libbb-external.a" -Wl,--no-whole-archive \
    -Wl,--version-script="$tmp/bb.map" -Wl,-soname,libaztec_bb.so -Wl,--gc-sections -s
  cp "$acvm/$arch-linux-android/release/libaztec_acvm.a" "$out/"
done

# An xcframework of a static library for iOS devices and the arm64 simulator.
function xcframework {
  local name=$1 library=$2 device=$3 simulator=$4
  local dir=prebuilt/ios/$name.xcframework
  mkdir -p "$dir/ios-arm64" "$dir/ios-arm64-simulator"
  cp "$device" "$dir/ios-arm64/$library"
  cp "$simulator" "$dir/ios-arm64-simulator/$library"
  cat >"$dir/Info.plist" <<PLIST
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
	<key>AvailableLibraries</key>
	<array>
		<dict>
			<key>LibraryIdentifier</key>
			<string>ios-arm64</string>
			<key>LibraryPath</key>
			<string>$library</string>
			<key>SupportedArchitectures</key>
			<array>
				<string>arm64</string>
			</array>
			<key>SupportedPlatform</key>
			<string>ios</string>
		</dict>
		<dict>
			<key>LibraryIdentifier</key>
			<string>ios-arm64-simulator</string>
			<key>LibraryPath</key>
			<string>$library</string>
			<key>SupportedArchitectures</key>
			<array>
				<string>arm64</string>
			</array>
			<key>SupportedPlatform</key>
			<string>ios</string>
			<key>SupportedPlatformVariant</key>
			<string>simulator</string>
		</dict>
	</array>
	<key>CFBundlePackageType</key>
	<string>XFWK</string>
	<key>XCFrameworkFormatVersion</key>
	<string>1.0</string>
</dict>
</plist>
PLIST
}

xcframework AztecBB libaztec_bb.a "$bb/build-arm64-ios/lib/libbb-external.a" \
  "$bb/build-arm64-ios-sim/lib/libbb-external.a"
xcframework AztecACVM libaztec_acvm.a "$acvm/aarch64-apple-ios/release/libaztec_acvm.a" \
  "$acvm/aarch64-apple-ios-sim/release/libaztec_acvm.a"

# Rust's standard library comes with debug information, which the app's build has no use for.
strip=$(command -v llvm-strip-20 || command -v llvm-strip)
find prebuilt -name libaztec_acvm.a -exec "$strip" --strip-debug {} \;
