const testData: { [key: string]: unknown[] } = {};

/** Returns whether test data generation is enabled */
export function isGenerateTestDataEnabled() {
  return ['1', 'true'].includes(process.env.AZTEC_GENERATE_TEST_DATA ?? '') && typeof expect !== 'undefined';
}

/** Pushes test data with the given name, only if test data generation is enabled. */
export function pushTestData<T>(itemName: string, data: T) {
  if (!isGenerateTestDataEnabled()) {
    return;
  }

  if (typeof expect === 'undefined') {
    return;
  }

  const testName = expect.getState().currentTestName;
  const fullItemName = `${testName} ${itemName}`;

  if (!testData[fullItemName]) {
    testData[fullItemName] = [];
  }
  testData[fullItemName].push(data);
}

/** Returns all instances of pushed test data with the given name, or empty if test data generation is not enabled. */
export function getTestData(itemName: string): unknown[] {
  if (!isGenerateTestDataEnabled()) {
    return [];
  }

  const testName = expect.getState().currentTestName;
  const fullItemName = `${testName} ${itemName}`;
  return testData[fullItemName];
}
