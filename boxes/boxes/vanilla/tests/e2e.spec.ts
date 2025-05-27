import { test, expect } from '@playwright/test';

const proofTimeout = 240_000;

test.beforeAll(async ({ }, { config }) => {
  // Make sure the node is running
  const nodeUrl = process.env.AZTEC_NODE_URL || 'http://localhost:8080';
  const nodeResp = await fetch(nodeUrl + "/status");
  if (!nodeResp.ok) {
    throw new Error(`Failed to connect to node. This test assumes you have a Sandbox running at ${nodeUrl}.`);
  }

  // Make sure the dev server is running
  const devServerUrl = config.webServer.url;
  const serverResp = await fetch(devServerUrl);
  if (!serverResp.ok) {
    throw new Error(`Failed to connect to app server at ${devServerUrl}.`);
  }
});


test('create account and cast vote', async ({ page }, testInfo) => {
  await page.goto('/');
  await expect(page).toHaveTitle(/Private Voting/);

  const createAccountButton = await page.locator('#create-account');
  const accountDisplay = await page.locator('#account-display');
  const voteButton = await page.locator('#vote-button');
  const voteInput = await page.locator('#vote-input');
  const voteResults = await page.locator('#vote-results');

  // Create account
  await expect(createAccountButton).toBeVisible();
  await createAccountButton.click();

  await expect(accountDisplay).toBeVisible({ timeout: proofTimeout });
  await expect(accountDisplay).toHaveText(/Account: 0x[a-fA-F0-9]{4}/);

  // Cast vote
  // Choose the candidate to vote for based on the browser used to run the test.
  // This is a hack to avoid race conditions when tests are run in parallel against the same network.
  const candidateId = {
    'chromium': 2,
    'firefox': 3,
    'webkit': 4,
  }[testInfo.project.name];

  await expect(voteInput).toBeVisible();
  await expect(voteButton).toBeVisible();
  await voteInput.selectOption(candidateId!.toString());
  await voteButton.click();
  await expect(voteButton).toBeEnabled({
    enabled: true,
    timeout: proofTimeout,
  });

  // Verify vote results
  await expect(voteResults).toHaveText(new RegExp(`Candidate ${candidateId}: 1 votes`), {
    timeout: 40_000,
  });
  await expect(voteResults).toHaveText(/Candidate 1: 0 votes/);
});
