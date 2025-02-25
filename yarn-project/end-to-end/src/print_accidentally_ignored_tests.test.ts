import { readFileSync } from 'fs';
import { glob } from 'glob';
import { join } from 'path';

describe('print_accidentally_ignored_tests', () => {
  // This test scans for test files that may have been accidentally ignored
  // It checks:
  // 1. All .test.ts files in the end-to-end directory
  // 2. The .test_skip_patterns file for explicitly skipped tests
  // 3. The bootstrap.sh file for tests that are included in the test suite
  // And reports any test files that are neither skipped nor included
  it('finds tests that are not explicitly skipped or included in bootstrap.sh', async () => {
    // Get repo root directory
    const repoRoot = process.cwd().split('yarn-project')[0];

    // Get all test files in end-to-end directory
    const testFiles = await glob('**/*.test.ts', {
      cwd: join(repoRoot, 'yarn-project/end-to-end'),
      ignore: ['node_modules/**'],
    });

    // Read skip patterns file
    const skipPatternsContent = readFileSync(join(repoRoot, '.test_skip_patterns'), 'utf8');
    const skipPatterns = skipPatternsContent
      .split('\n')
      .filter(line => line.trim() && !line.startsWith('#'))
      .map(pattern => new RegExp(pattern));

    // Read bootstrap.sh to get included tests
    const bootstrapContent = readFileSync(join(repoRoot, 'yarn-project/end-to-end/bootstrap.sh'), 'utf8');
    const includedTests = bootstrapContent
      .split('\n')
      .filter(line => line.includes('$prefix simple') || line.includes('$prefix compose'))
      .map(line => {
        const match = line.match(/(?:simple|compose)\s+(.+?)(?:\s|")/);
        return match ? match[1] : null;
      })
      .filter(Boolean)
      .map(test => new RegExp(test as string));

    // Filter out skipped and included tests
    const unaccountedTests = testFiles.filter(testFile => {
      const isSkipped = skipPatterns.some(pattern => {
        // Handle both simple test names and full paths
        const testName = testFile.replace(/^src\//, '').replace(/\.test\.ts$/, '');
        // For simple patterns like 'simple flakey_e2e_inclusion_proofs_contract', extract just the test name
        const skipTestName = pattern.source.replace(/^simple\s+/, '');
        return pattern.test(testFile) || pattern.test(testName) || testName.includes(skipTestName);
      });
      const isIncluded = includedTests.some(pattern => pattern.test(testFile));
      return !isSkipped && !isIncluded;
    });

    if (unaccountedTests.length > 0) {
      console.log(
        'Found test files that are neither skipped nor included in bootstrap.sh:\n' + unaccountedTests.join('\n'),
      );
    }

    // expect(unaccountedTests).toHaveLength(0);
  });
});
