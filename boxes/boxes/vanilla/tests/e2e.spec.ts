import { test, expect } from '@playwright/test';

// Time take to generate a proof.
const proofTimeout = 250_000;

test.beforeAll(async () => {
  // Make sure the node is running
  const nodeUrl = process.env.AZTEC_NODE_URL || 'http://localhost:8080';
  const nodeResp = await fetch(nodeUrl + "/status");
  if (!nodeResp.ok) {
    throw new Error(`Failed to connect to node. This test assumes you have a Sandbox running at ${nodeUrl}.`);
  }
});


test('create account and cast vote', async ({ page }, testInfo) => {
  await page.goto('/');
  await expect(page).toHaveTitle(/Private Voting/);

  const connectTestAccount = await page.locator('#connect-test-account');
  const selectTestAccount = await page.locator('#test-account-number');
  const accountDisplay = await page.locator('#account-display');
  const voteButton = await page.locator('#vote-button');
  const voteInput = await page.locator('#vote-input');
  const voteResults = await page.locator('#vote-results');

  // Connect test account
  await expect(connectTestAccount).toBeVisible();
  await expect(selectTestAccount).toBeVisible();

  // Select different account for each browser
  const testAccountNumber = {
    'chromium': 1,
    'firefox': 2,
    'webkit': 3,
  }[testInfo.project.name];
  await selectTestAccount.selectOption(testAccountNumber.toString());

  await connectTestAccount.click();
  await expect(accountDisplay).toBeVisible();
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

  // This will take some time to complete (Client IVC proof generation)
  // Button is enabled when the transaction is complete
  await expect(voteButton).toBeEnabled({
    enabled: true,
    timeout: proofTimeout,
  });

  // Verify vote results
  await expect(voteResults).toHaveText(new RegExp(`Candidate ${candidateId}: 1 votes`));
});
