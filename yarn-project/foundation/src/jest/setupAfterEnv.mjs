if (Array.isArray(globalThis.__extraEqualityTesters)) {
  expect.addEqualityTesters(globalThis.__extraEqualityTesters);
}
