import { test } from '@playwright/test';

test('test', async ({ page }) => {
  test.slow();
  await page.goto('/');
});
