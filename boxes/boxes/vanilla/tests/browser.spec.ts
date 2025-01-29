import { retryUntil } from '@aztec/aztec.js';
import { test, expect } from '@playwright/test';

test('Deploying, setting, and getting a number', async ({ page }) => {
  page.on('console', msg => console.log(msg.text()));
  test.slow();

  await page.goto('/');

  const handleDialog = (expectedMessage: string) => {
    return new Promise<void>(resolve => {
      page.once('dialog', async dialog => {
        expect(dialog.message()).toContain(expectedMessage);
        await dialog.accept();
        resolve();
      });
    });
  };

  // Deploy contract
  const deployDialogPromise = handleDialog('Contract deployed at');
  const deployButton = page.getByRole('button', { name: 'Deploy' });
  await deployButton.click();
  await deployDialogPromise;
  await expect(page.locator('#number')).toHaveValue('0');
  console.log('Contract deployed');

  // Get number
  const getNumberDialogPromise = handleDialog('Number is:');
  await page.getByRole('button', { name: 'Get Number' }).click();
  await getNumberDialogPromise;
  console.log('Get number');

  // Set number
  await page.locator('#number').fill('1');
  const setNumberDialogPromise = handleDialog('Number set!');
  await page.getByRole('button', { name: 'Set Number' }).click();
  await setNumberDialogPromise;
  console.log('Set number');

  // Verifying number
  const verifyNumberDialogPromise = handleDialog('Number is: 1');
  await page.getByRole('button', { name: 'Get Number' }).click();
  await verifyNumberDialogPromise;
  console.log('Get updated number');
});
