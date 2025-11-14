/**
 * Browser-side BBAPI logging test functions
 * These are exposed to the window object and called from Playwright tests
 */

export async function testBbapiLoggingBasic(): Promise<{ success: boolean }> {
  const { Barretenberg } = await import('@aztec/bb.js');

  const api = await Barretenberg.new({ threads: 1 });

  try {
    // Make a real BBAPI call
    // This will automatically log to BBAPI_CALL_LOG if logging is enabled
    await api.grumpkinGetRandomFr({ dummy: 0 });

    // Destroy will trigger flushBbapiLogs() which will save/download if logging enabled
    await api.destroy();

    return { success: true };
  } catch (error: any) {
    throw new Error(`BBAPI test failed: ${error?.message || String(error)}`);
  }
}

export async function testBbapiLoggingMultiple(): Promise<{ success: boolean }> {
  const { Barretenberg } = await import('@aztec/bb.js');

  const api = await Barretenberg.new({ threads: 1 });

  try {
    // Make multiple BBAPI calls
    // These will automatically log to BBAPI_CALL_LOG if logging is enabled
    await api.grumpkinGetRandomFr({ dummy: 0 });
    await api.grumpkinGetRandomFr({ dummy: 0 });

    // Destroy will trigger flushBbapiLogs() which will save/download if logging enabled
    await api.destroy();

    return { success: true };
  } catch (error: any) {
    throw new Error(`BBAPI test failed: ${error?.message || String(error)}`);
  }
}
