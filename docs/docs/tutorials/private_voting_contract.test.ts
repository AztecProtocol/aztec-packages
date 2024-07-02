import { test } from "@playwright/test";
import { execute } from "../../src/components/Test/testLibrary";

test("Private Voting Tutorial", async ({ page }) => {
  test.slow();

  await page.goto("/");
  await page.getByRole("button", { name: "Tutorials" }).click();
  await page.getByRole("link", { name: "Private Voting Tutorial" }).click();

  await page.waitForLoadState("domcontentloaded");
  await page.waitForFunction(() => !!document.querySelector("code"));

  const cmdCount = await page.evaluate(() => {
    const spans = document.querySelectorAll("span[data-testid]");
    return spans.length;
  });

  for (let i = 1; i <= cmdCount; i++) {
    await page.getByTestId(`${i}`).waitFor({ state: "attached" });
    const cmd = page.getByTestId(`${i}`);
    console.log("executing command", await cmd.innerText());
    await execute(cmd);
  }
});
