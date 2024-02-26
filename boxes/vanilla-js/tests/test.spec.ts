import { test, expect } from '@playwright/test';

test('Deploying, setting, and getting a number', async ({ page }) => {
  await page.goto('http://localhost:5173/');
  await expect(page.getByRole('button', { name: 'Deploy' })).toBeVisible();
  await page.getByRole('button', { name: 'Deploy' }).click();

  page.once('dialog', dialog => {
    expect(dialog.message().includes('Contract deployed at '));
    dialog.accept().catch(() => {
      throw new Error('Failed to accept dialog');
    });
  });

  await expect(page.getByRole('button', { name: 'Set Number' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Get Number' })).toBeVisible();
  await expect(page.locator('#number')).toHaveValue('0');

  await page.getByRole('button', { name: 'Get Number' }).click();
  page.once('dialog', dialog => {
    expect(dialog.message().includes('Number is:'));
    dialog.dismiss().catch(() => {});
  });
  await page.locator('#number').fill('1');
  await page.getByRole('button', { name: 'Set Number' }).click();
  page.once('dialog', dialog => {
    expect(dialog.message().includes('Number set!'));
    dialog.accept().catch(() => {
      throw new Error('Failed to accept dialog');
    });
  });
  await page.getByRole('button', { name: 'Get Number' }).click();

  page.once('dialog', dialog => {
    expect(dialog.message().includes('Number is: 1'));
    dialog.accept().catch(() => {
      throw new Error('Failed to accept dialog');
    });
  });
});
