import { test, expect } from '@playwright/test';

const proofTimeout = 200_000;

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
  // This is a hack to avoid race conditions as test are run in parallel with 
  // multiple browsers against the same network (sandbox) and contract.
  // Ideally we should deploy contracts for each test, but this will result in a slow CI.
  const candidateId = {
    'chromium': 1,
    'firefox': 2,
    'webkit': 3,
  }[testInfo.project.name];

  // Get the current vote count for the candidate
  await expect(voteResults).toHaveText(/.+/, { timeout: 10_000 });
  const currentResults = await voteResults.textContent();
  
  const match = currentResults.match(new RegExp(`Candidate ${candidateId}: (\\d+) votes`));
  const currentResultsNumber = parseInt(match?.[1]);

  expect(currentResultsNumber).toBeGreaterThanOrEqual(0);

  await expect(voteInput).toBeVisible();
  await expect(voteButton).toBeVisible();
  await voteInput.selectOption(candidateId.toString());
  await voteButton.click();
  await expect(voteButton).toBeEnabled({
    enabled: true,
    timeout: proofTimeout,
  });

  // Verify vote results
  const newVoteCount = currentResultsNumber + 1;
  await expect(voteResults).toHaveText(new RegExp(`Candidate ${candidateId}: ${newVoteCount} votes`));
  await expect(voteResults).toHaveText(/Candidate 0: 0 votes/);
});
