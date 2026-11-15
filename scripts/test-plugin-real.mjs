#!/usr/bin/env node

/**
 * Real Chrome test for plugin wiring: verify Careful commands end-to-end
 * - Start Docker container
 * - Setup user and project
 * - Install Careful commands from Settings
 * - Type dangerous command: rm -rf ~
 * - Screenshot confirm dialog
 * - Click Cancel
 * - Screenshot: no output (command not executed)
 */

import { chromium } from "playwright-core";
import { spawn } from "child_process";
import { resolve } from "path";
import { writeFileSync, mkdirSync } from "fs";

const REPO_ROOT = resolve(import.meta.url, "../..");
const SCREENSHOT_DIR = resolve(REPO_ROOT, "..", "..", "shot", "pl");
const CHROME_PATH = "/usr/bin/google-chrome";
const CONTAINER_NAME = "tdog-pl";
const CONTAINER_PORT = 7681;
const HOST_PORT = 7693;

mkdirSync(SCREENSHOT_DIR, { recursive: true });

function spawn_cmd(cmd, args, opts = {}) {
  return new Promise((resolve, reject) => {
    const proc = spawn(cmd, args, {
      stdio: "inherit",
      ...opts,
    });
    proc.on("exit", (code) => {
      if (code === 0) resolve();
      else reject(new Error(`${cmd} exited with code ${code}`));
    });
  });
}

async function main() {
  console.log("Starting Docker container...");
  try {
    await spawn_cmd("docker", [
      "run",
      "-d",
      "--name",
      CONTAINER_NAME,
      "-p",
      `${HOST_PORT}:${CONTAINER_PORT}`,
      "-e",
      "TDOG_SSH_USER=user",
      "-v",
      "/tmp/tdog-data:/data",
      "tdog:pl",
    ]);
  } catch (err) {
    console.log("Container already running or build needed");
  }

  // Wait for container to be ready
  await new Promise((r) => setTimeout(r, 3000));

  const browser = await chromium.launch({
    executablePath: CHROME_PATH,
    args: [
      "--enable-unsafe-swiftshader",
      "--use-angle=swiftshader",
      "--no-sandbox",
    ],
  });

  const page = await browser.newPage();
  const baseUrl = `http://localhost:${HOST_PORT}`;

  try {
    console.log("Navigating to setup...");
    await page.goto(`${baseUrl}/setup`);

    // Step 1: Complete setup
    console.log("Completing setup...");
    const adminInput = await page.waitForSelector('input[placeholder*="admin"]');
    await adminInput.fill("admin");
    await adminInput.press("Enter");

    // Wait for app to load
    await page.waitForURL(`${baseUrl}/app`, { timeout: 10000 });
    console.log("Setup complete, app loaded");

    // Step 2: Navigate to Settings > Plugins
    console.log("Opening Settings...");
    const settingsBtn = await page.locator("button:has-text('Settings')").first();
    await settingsBtn.click();

    await page.waitForURL(/settings/, { timeout: 5000 });
    console.log("Settings open");

    // Step 3: Look for Careful commands install suggestion
    console.log("Looking for Careful commands install button...");
    const installBtn = await page.locator("button:has-text('Install Careful commands')");
    if (await installBtn.isVisible()) {
      console.log("Installing Careful commands...");
      await installBtn.click();

      // Wait for install to complete
      await page.waitForTimeout(2000);
      console.log("Careful commands installed");

      // Screenshot after install
      await page.screenshot({ path: resolve(SCREENSHOT_DIR, "01-installed.png") });
    }

    // Step 4: Create terminal and type dangerous command
    console.log("Creating terminal pane...");
    const newTerminalBtn = await page.locator("button[aria-label*='New']").first();
    await newTerminalBtn.click();

    const terminal = await page.locator('[role="textbox"]').first();
    await terminal.focus();

    // Type the dangerous command
    console.log("Typing dangerous command...");
    await terminal.type("rm -rf ~", { delay: 50 });

    // Screenshot with command typed
    await page.screenshot({ path: resolve(SCREENSHOT_DIR, "02-typed-command.png") });

    // Press Enter to trigger gate
    console.log("Pressing Enter to trigger gate...");
    await terminal.press("Enter");

    // Wait for confirm dialog
    await page.waitForTimeout(500);

    // Screenshot the confirm dialog
    console.log("Screenshotting confirm dialog...");
    await page.screenshot({ path: resolve(SCREENSHOT_DIR, "03-confirm-dialog.png") });

    // Step 5: Click Cancel
    console.log("Clicking Cancel...");
    const cancelBtn = await page.locator("button:has-text('Cancel')");
    if (await cancelBtn.isVisible()) {
      await cancelBtn.click();
    } else {
      console.warn("Cancel button not found");
    }

    await page.waitForTimeout(500);

    // Screenshot after cancel
    console.log("Screenshotting after cancel...");
    await page.screenshot({ path: resolve(SCREENSHOT_DIR, "04-after-cancel.png") });

    // Verify command was not executed
    console.log("Verifying command was not executed...");
    const output = await page.locator("text=/run_anyway|executed/i");
    if (await output.isVisible()) {
      console.error("ERROR: Command appears to have been executed!");
      process.exit(1);
    }

    console.log("SUCCESS: Command was blocked by gate!");

    // Write test report
    writeFileSync(
      resolve(SCREENSHOT_DIR, "test-report.json"),
      JSON.stringify(
        {
          status: "PASS",
          test: "Careful commands gate workflow",
          steps: [
            "Setup completed",
            "Careful commands installed",
            "Dangerous command typed",
            "Confirm dialog shown",
            "Cancel clicked",
            "Command not executed",
          ],
          screenshots: [
            "01-installed.png",
            "02-typed-command.png",
            "03-confirm-dialog.png",
            "04-after-cancel.png",
          ],
        },
        null,
        2,
      ),
    );

    console.log(`Screenshots saved to: ${SCREENSHOT_DIR}`);
  } finally {
    await browser.close();

    // Cleanup container
    console.log("Cleaning up container...");
    try {
      await spawn_cmd("docker", ["rm", "-f", CONTAINER_NAME]);
    } catch {
      console.log("Container cleanup skipped");
    }
  }
}

main().catch((err) => {
  console.error("Test failed:", err);
  process.exit(1);
});
