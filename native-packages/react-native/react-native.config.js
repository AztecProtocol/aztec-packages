// React Native autolinking: on Android the package is a pure C++ dependency (android/CMakeLists.txt, no Gradle
// module), with a hand-written stand-in for codegen output (android/codegen); on iOS it is the
// AztecReactNative pod (AztecReactNative.podspec).
module.exports = {
  dependency: {
    platforms: {
      android: {
        libraryName: 'AztecReactNative',
        cmakeListsPath: 'codegen/CMakeLists.txt',
        cxxModuleCMakeListsPath: 'CMakeLists.txt',
        cxxModuleCMakeListsModuleName: 'aztec_react_native',
        cxxModuleHeaderName: 'NativeAztecReactNative',
      },
    },
  },
};
