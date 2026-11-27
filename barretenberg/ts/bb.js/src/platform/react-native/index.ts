/** Whether the app runs on iOS, as @aztec-foundation/react-native reports it. */
export function isIos(): boolean {
  return (globalThis as { __aztecReactNative?: { platform?: string } }).__aztecReactNative?.platform === 'ios';
}
