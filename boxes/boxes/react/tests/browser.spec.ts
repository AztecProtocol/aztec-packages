import { test, expect } from '@playwright/test';

test('test', async ({ page }) => {
  test.slow();
  page.on('console', msg => {
    const text = msg.text();
    if (msg.type() === 'error') {
      console.error(text);
      // Fail immediately on JavaScript errors to avoid timeout

      // Check if this is an "Error:" message that should fail the test
      // We exclude MIME type errors due to an 'expected' error in Firefox
      // Note: It's unclear why Firefox shows MIME type errors for index.js in some cases
      const isErrorThatShouldFail =
        text.includes('Error: ') &&
        !text.includes('Error: Timed out ') &&
        !text.includes('was blocked because of a disallowed MIME type');

      if (
        isErrorThatShouldFail ||
        text.includes('Uncaught') ||
        text.includes('TypeError') ||
        text.includes('ReferenceError') ||
        text.includes('SyntaxError') ||
        text.includes('RangeError')
      ) {
        throw new Error(`JavaScript error detected: ${text}`);
      }
    } else {
      console.log(text);
    }
  });
  await page.goto('/');

  // Deploy contract
  await page.getByRole('button', { name: 'Deploy dummy contract' }).click();
  await expect(page.getByText('Deploying contract...')).toBeVisible();
  await expect(page.getByText('Address:')).toBeVisible();

  // Read number
  await page.getByRole('button', { name: 'Read' }).click();
  await expect(page.getByText('Number is:')).toBeVisible();

  // Set number
  await page.locator('#numberToSet').fill('1');
  await page.getByRole('button', { name: 'Write' }).click();
  await expect(page.getByText('Setting number...')).toBeVisible();
  await expect(page.getByText('Number set to: 1')).toBeVisible();

  // Read number
  await page.getByRole('button', { name: 'Read' }).click();
  await expect(page.getByText('Number is: 1')).toBeVisible();
});
