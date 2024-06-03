import { test, expect } from "@playwright/test";

test("Deploying, setting, and getting a number", async ({ page }) => {
  test.slow();
  await page.goto("/");
  await page.getByRole("link", { name: "Private Voting Tutorial" }).click();
  const text = await page.getByTestId("0").getByRole("code").innerText();
  console.log(text);
});
