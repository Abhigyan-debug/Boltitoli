import AxeBuilder from "@axe-core/playwright";
import { expect, type Page, test } from "@playwright/test";

const uid = () => Math.random().toString(36).slice(2, 8);

// The interface defaults to Hindi; these tests use the English labels.
test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem("bt-lang", "en"));
});

async function register(page: Page) {
  const email = `teacher-${uid()}@example.org`;
  await page.goto("/register");
  await page.getByLabel("Your name").fill("Meera Singh");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill("chalk-board-42");
  await page.getByLabel("School name").fill("GPS Rampur");
  await page.getByRole("button", { name: "Create account" }).click();
  await page.waitForURL("**/onboarding");
  return email;
}

async function onboard(page: Page) {
  await page.getByRole("button", { name: "Set up my classroom" }).click();
  await page.getByLabel("Classroom name").fill("Class 1–3");
  await page.getByRole("button", { name: "Create classroom" }).click();
  await page.getByRole("button", { name: "Create groups" }).click();
  await page.getByLabel("Skill for प्रगति").selectOption({ label: "10 तक जोड़ — Addition within 10" });
  await page.getByRole("button", { name: "Save skills" }).click();
  await page.getByRole("button", { name: "Continue" }).click(); // sound check
}

async function enter(page: Page, n: number) {
  for (const d of String(n)) await page.locator(".grid.grid-cols-3 button", { hasText: new RegExp(`^${d}$`) }).first().click();
  await page.getByRole("button", { name: /भेजें/ }).click();
}

async function currentAnswer(page: Page): Promise<number> {
  const text = (await page.locator("section[aria-label='Current question'] p[lang='hi']").first().textContent()) ?? "";
  const nums = (text.match(/\d+/g) ?? []).map(Number);
  return nums[0] + nums[1]; // addition lesson
}

test("register → onboarding → session → summary", async ({ page }) => {
  await register(page);
  await onboard(page);
  await page.getByRole("button", { name: "Go to my dashboard" }).click();
  await expect(page.getByRole("heading", { name: /Good (morning|afternoon|evening), Meera/ })).toBeVisible();

  await page.getByRole("button", { name: "Start 15-minute Session" }).click();
  await page.locator("label", { hasText: "प्रगति" }).first().click();
  await page.getByRole("button", { name: /Prepare 15-minute session/ }).click();
  await page.waitForURL("**/session/**");
  await page.getByRole("button", { name: /शुरू करें/ }).click();

  // wrong answer → hint on the same question
  const ans = await currentAnswer(page);
  await enter(page, ans + 3);
  await expect(page.getByText("करीब हो! एक बार फिर सोचो।")).toBeVisible();
  await expect(page.getByText(/^संकेत:/)).toBeVisible();
  // right answer after the hint
  await enter(page, ans);
  await expect(page.getByText("सही! संकेत के बाद तुमने सही जवाब दिया।")).toBeVisible();
  // a first-try correct answer on the next question
  await expect(page.getByRole("status").filter({ hasText: "सही!" })).toBeHidden({ timeout: 8000 });
  await enter(page, await currentAnswer(page));

  await page.getByRole("button", { name: /End session/ }).click();
  await page.getByRole("alertdialog").getByRole("button", { name: "End session" }).click();
  await page.waitForURL("**/summary", { timeout: 20_000 });
  await expect(page.getByRole("heading", { name: "सत्र पूरा हुआ" })).toBeVisible();
  await expect(page.getByText("2 questions")).toBeVisible();
  await expect(page.getByText("Right first try (1)")).toBeVisible();
  await expect(page.getByText("After a hint (1)")).toBeVisible();

  // the session is listed in history
  await page.goto("/app/sessions");
  await expect(page.getByRole("cell", { name: "प्रगति" })).toBeVisible();
});

test("offline: download a lesson, run it without network, then sync once", async ({ page, context }) => {
  await register(page);
  await onboard(page);
  // download the addition lesson from the final onboarding step
  await page.getByRole("button", { name: "Download" }).first().click();
  await expect(page.getByText("Saved")).toBeVisible();
  await page.getByRole("button", { name: "Go to my dashboard" }).click();
  await page.goto("/app/lessons");
  await expect(page.getByText(/On this device since/)).toBeVisible();

  // Like a real return visit: the service worker has cached the app shell.
  await page.evaluate(() => navigator.serviceWorker.ready.then(() => true));
  await page.reload();
  await expect(page.getByText(/On this device since/)).toBeVisible();
  await context.setOffline(true);
  await page.getByRole("button", { name: "Run offline" }).click();
  await page.waitForURL("**/session/offline/**");
  await page.locator("label", { hasText: "प्रगति" }).click();
  await page.getByRole("button", { name: "Prepare session" }).click();
  await page.getByRole("button", { name: /शुरू करें/ }).click();
  await expect(page.getByText(/Listening needs internet/)).toBeVisible();
  await enter(page, await currentAnswer(page));
  await expect(page.getByRole("status").filter({ hasText: /सही|शाबाश|वाह|बढ़िया/ })).toBeVisible();
  await page.getByRole("button", { name: /End/ }).first().click();
  await page.getByRole("alertdialog").getByRole("button", { name: "End session" }).click();
  await expect(page.getByText(/^Saved on this device\. This is a preview/)).toBeVisible();

  await context.setOffline(false);
  await page.evaluate(() => window.dispatchEvent(new Event("online")));
  await expect(page.getByText(/Synced/)).toBeVisible({ timeout: 15_000 });
  await page.goto("/app/sessions");
  await expect(page.getByRole("img", { name: "Recorded offline" }).or(page.getByLabel("Recorded offline"))).toHaveCount(1);
});

test("forms validate and show errors", async ({ page }) => {
  await page.goto("/register");
  await page.getByRole("button", { name: "Create account" }).click();
  await expect(page.getByText("Enter your name")).toBeVisible();
  await expect(page.getByText("Enter a valid email address")).toBeVisible();
  await page.goto("/login");
  await page.getByLabel("Email").fill("nobody@example.org");
  await page.getByLabel("Password").fill("wrong-pass-1");
  await page.getByRole("button", { name: "Log in" }).click();
  await expect(page.getByText("Email or password is incorrect.")).toBeVisible();
});

test("accessibility: no serious axe violations on key pages", async ({ page }) => {
  for (const path of ["/", "/login", "/register"]) {
    await page.goto(path);
    await page.waitForTimeout(500);
    const r = await new AxeBuilder({ page }).disableRules(["region"]).analyze();
    const serious = r.violations.filter((v) => v.impact === "serious" || v.impact === "critical");
    expect(serious.map((v) => `${path}: ${v.id} ${v.nodes.map((n) => n.target.join(" ")).join(", ")}`)).toEqual([]);
  }
  await page.goto("/login");
  await page.getByRole("button", { name: "Explore the demo school" }).click();
  await page.waitForURL("**/app");
  for (const path of ["/app", "/app/groups", "/app/lessons", "/app/sessions", "/app/progress"]) {
    await page.goto(path);
    await page.waitForTimeout(800);
    const r = await new AxeBuilder({ page }).disableRules(["region"]).analyze();
    const serious = r.violations.filter((v) => v.impact === "serious" || v.impact === "critical");
    expect(serious.map((v) => `${path}: ${v.id} ${v.nodes.map((n) => n.target.join(" ")).join(", ")}`)).toEqual([]);
  }
});

test("mobile layout has no horizontal scroll @mobile", async ({ page }) => {
  for (const path of ["/", "/login"]) {
    await page.goto(path);
    await page.waitForTimeout(500);
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    expect(overflow, path).toBeLessThanOrEqual(1);
  }
  await page.goto("/login");
  await page.getByRole("button", { name: "Explore the demo school" }).click();
  await page.waitForURL("**/app");
  for (const path of ["/app", "/app/sessions", "/app/lessons", "/app/progress", "/app/settings"]) {
    await page.goto(path);
    await page.waitForTimeout(800);
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    expect(overflow, path).toBeLessThanOrEqual(1);
  }
});
