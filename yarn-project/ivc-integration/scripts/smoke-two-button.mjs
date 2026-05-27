// Smoke-test the rewritten two-button page: load it, click "Run WASM",
// verify the WASM card populates and no JS console errors fire. GPU path is
// not exercised here (this box only has SwiftShader).
import { launch } from "puppeteer";

const URL = process.env.URL ?? "http://127.0.0.1:8765/";
const browser = await launch({
  headless: true,
  args: ["--no-sandbox", "--disable-setuid-sandbox", "--disable-dev-shm-usage"],
  protocolTimeout: 10 * 60_000,
});
const page = await browser.newPage();
const errors = [];
const consoleLines = [];
page.on("console", (m) => consoleLines.push(`[${m.type()}] ${m.text()}`));
page.on("pageerror", (e) => errors.push(`pageerror: ${e.message}`));

try {
  await page.goto(URL, { waitUntil: "networkidle0", timeout: 30_000 });
  await page.waitForFunction(
    () => document.getElementById("status")?.textContent?.includes("ready"),
    { timeout: 30_000 },
  );
  console.log("status:", await page.$eval("#status", (e) => e.textContent));
  console.log("sab   :", await page.$eval("#sab", (e) => e.textContent));
  console.log(
    "buttons present:",
    await page.$$eval("#run-wasm,#run-webgpu", (els) => els.length),
  );

  console.log("clicking #run-wasm…");
  await page.click("#run-wasm");
  await page.waitForFunction(
    () => {
      const t = document.getElementById("wasm-prove-big")?.textContent;
      return t && t !== "—" && t !== "…";
    },
    { timeout: 8 * 60_000 },
  );
  console.log(
    "wasm-prove   :",
    await page.$eval("#wasm-prove", (e) => e.textContent),
  );
  console.log(
    "wasm-verify  :",
    await page.$eval("#wasm-verify", (e) => e.textContent),
  );
  console.log(
    "wasm-verified:",
    await page.$eval("#wasm-verified", (e) => e.textContent),
  );

  if (errors.length) {
    console.error("JS errors:");
    for (const e of errors) console.error("  " + e);
    process.exitCode = 1;
  } else {
    console.log("no JS page errors");
  }
} catch (err) {
  console.error(`smoke FAILED: ${err.message}`);
  for (const l of consoleLines.slice(-30)) console.error("  " + l);
  process.exitCode = 1;
} finally {
  await browser.close();
}
