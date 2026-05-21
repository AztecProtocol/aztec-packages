# Barretenberg Mobile App

This directory contains the first native mobile app shells for running
barretenberg on real phones. The apps share a small C++ bridge under
`shared/` so Android and iOS exercise the same native entry point before the
benchmark path is wired into `libbb-external.a`.

The current CI contract is intentionally small:

- Android builds a debug APK with Gradle and the Android NDK.
- iOS builds an unsigned device app/IPA with Xcode and code signing disabled.

The barretenberg static libraries already have root Makefile targets:

```bash
make bb-cpp-cross-arm64-ios
make bb-cpp-cross-arm64-ios-sim
make bb-cpp-cross-arm64-android
make bb-cpp-cross-x86_64-android
```

The app shells are separate so CI can prove the mobile projects themselves are
healthy without forcing every pull request to rebuild the heavy proving
archives.

## Local Builds

Android:

```bash
barretenberg/mobile-app/scripts/build-android.sh
```

iOS, on macOS with Xcode:

```bash
barretenberg/mobile-app/scripts/build-ios.sh
```

The default iOS output is `barretenberg/mobile-app/ios/build/BBMobileBench.ipa`.
It is unsigned and intended to prove the app target builds in CI. Real
BrowserStack App Automate device runs still need a properly signed `.ipa`.
