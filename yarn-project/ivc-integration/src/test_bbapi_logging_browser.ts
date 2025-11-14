/**
 * Browser-side BBAPI logging test functions
 * These are exposed to the window object and called from Playwright tests
 */

export async function testBbapiLoggingBasic(): Promise<{ callCount: number; logsData: Uint8Array[] }> {
  const { Barretenberg } = await import('@aztec/bb.js');
  const { getBbapiLogCount } = await import('@aztec/bb.js/cbind/bbapi_log_shared.js');

  const api = await Barretenberg.new({ threads: 1 });

  try {
    // Make a real BBAPI call
    await api.grumpkinGetRandomFr({ dummy: 0 });

    // Get the log count
    const callCount = getBbapiLogCount();

    // Destroy will trigger flushBbapiLogs()
    await api.destroy();

    return { callCount, logsData: [] };
  } catch (error: any) {
    throw new Error(`BBAPI test failed: ${error?.message || String(error)}`);
  }
}

export async function testBbapiLoggingMultiple(): Promise<{ callCount: number }> {
  const { Barretenberg } = await import('@aztec/bb.js');
  const { getBbapiLogCount } = await import('@aztec/bb.js/cbind/bbapi_log_shared.js');

  const api = await Barretenberg.new({ threads: 1 });

  try {
    // Make multiple BBAPI calls
    await api.grumpkinGetRandomFr({ dummy: 0 });
    await api.grumpkinGetRandomFr({ dummy: 0 });

    // Get the log count
    const callCount = getBbapiLogCount();

    // Destroy will trigger flushBbapiLogs()
    await api.destroy();

    return { callCount };
  } catch (error: any) {
    throw new Error(`BBAPI test failed: ${error?.message || String(error)}`);
  }
}
