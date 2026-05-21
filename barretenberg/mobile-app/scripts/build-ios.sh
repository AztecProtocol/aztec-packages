#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")/../ios"

if ! command -v xcodebuild >/dev/null 2>&1; then
  echo "xcodebuild is required; run this on macOS with Xcode installed." >&2
  exit 127
fi

configuration="${BB_MOBILE_IOS_CONFIGURATION:-Debug}"
sdk="${BB_MOBILE_IOS_SDK:-iphoneos}"
destination="${BB_MOBILE_IOS_DESTINATION:-generic/platform=iOS}"
derived_data="${BB_MOBILE_IOS_DERIVED_DATA:-$PWD/build/DerivedData}"

rm -rf "$derived_data" build/Payload build/BBMobileBench.ipa

xcodebuild \
  -project BBMobileBench.xcodeproj \
  -target BBMobileBench \
  -configuration "$configuration" \
  -sdk "$sdk" \
  -destination "$destination" \
  -derivedDataPath "$derived_data" \
  CODE_SIGNING_ALLOWED=NO \
  CODE_SIGNING_REQUIRED=NO \
  CODE_SIGN_IDENTITY="" \
  build

product_dir="$derived_data/Build/Products/${configuration}-${sdk}"
app_path="$product_dir/BBMobileBench.app"
if [ -d "$app_path" ]; then
  mkdir -p build/Payload
  cp -R "$app_path" build/Payload/
  (cd build && zip -qry BBMobileBench.ipa Payload)
  echo "Wrote ios/build/BBMobileBench.ipa"
fi
