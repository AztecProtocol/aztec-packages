'use strict';
/**
 * Sets up a React Native app for Aztec's client stack. Import it once, before anything that uses the stack
 * (a labs PXE or wallet, bb.js, Noir):
 *
 *   import '@aztec-foundation/react-native';
 *
 * It installs the native bindings into the JavaScript runtime (ipc-runtime's JSI binding, which reaches bb,
 * the ACVM and kv-sqlite linked into the app; the app's files; crypto.getRandomValues) and the built-ins Hermes lacks
 * (polyfills.js).
 * The app's Metro config needs `withAztec` from '@aztec-foundation/react-native/metro'.
 */
const { installPolyfills } = require('./polyfills');

function installNative() {
  if (globalThis.__ipcRuntimeJsi !== undefined && globalThis.__aztecReactNative !== undefined) {
    return;
  }
  const { TurboModuleRegistry } = require('react-native');
  const module = TurboModuleRegistry.get('AztecReactNative');
  if (module == null) {
    throw new Error(
      "@aztec-foundation/react-native: the native module is not in the app. It needs React Native's new " +
        'architecture; rebuild the app after installing the package (on iOS, run pod install first).',
    );
  }
  // An empty directory means the platform's default: <files dir>/aztec on Android, <Application Support>/aztec on
  // iOS.
  module.install('');
}

installNative();

installPolyfills();

/** Whether the native bindings are installed. */
function isInstalled() {
  return globalThis.__ipcRuntimeJsi !== undefined && globalThis.__aztecReactNative !== undefined;
}

/** The app's directory for Aztec's data: bb's CRS and the PXE's databases live under it. */
function dataDirectory() {
  return globalThis.__aztecReactNative.dataDir;
}

module.exports = { isInstalled, dataDirectory };
