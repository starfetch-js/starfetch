import { expect, test } from "@playwright/test";
import { readFile } from "node:fs/promises";

import { browserTestView } from "../src/test-fixture.js";

const browserTestQuery =
  browserTestView.source.tool === "starfetch_tap_query"
    ? browserTestView.source.query
    : "";

test("builds parse-safe single-file HTML", async () => {
  const html = await readFile(
    new URL("../dist/index.html", import.meta.url),
    "utf8",
  );

  expect(Array.from(html).some(isParseInvalid)).toBe(false);
});

test("renders paged bridge results with safe theme fallbacks", async ({
  page,
}) => {
  await page.goto("/test-host.html");
  const widget = page.frameLocator("iframe[title='Starfetch widget']");

  await expect(
    widget.getByRole("heading", { name: "Gaia source results" }),
  ).toBeVisible();
  await expect(widget.getByText("100 source rows")).toBeVisible();
  await expect(widget.getByText(/rows shown/)).toHaveCount(0);
  await expect(widget.locator("tbody tr")).toHaveCount(100);
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          document.documentElement.scrollHeight <=
          document.documentElement.clientHeight,
      ),
    )
    .toBe(true);

  const queryCode = widget.locator(".query-panel code");
  await expect(queryCode).toHaveText(browserTestQuery);
  const sqlKeyword = widget
    .locator(".query-panel .shiki span")
    .filter({ hasText: /^SELECT$/ })
    .first();
  await expect(sqlKeyword).toBeVisible();
  const lightKeywordColor = await sqlKeyword.evaluate(
    (element) => getComputedStyle(element).color,
  );

  await page.evaluate(() => window.setTestTheme("dark"));
  await expect
    .poll(() =>
      page
        .locator("iframe")
        .evaluate(
          (iframe: HTMLIFrameElement) =>
            iframe.contentDocument?.documentElement.style.colorScheme,
        ),
    )
    .toBe("dark");
  await expect
    .poll(() =>
      page.locator("iframe").evaluate((iframe: HTMLIFrameElement) => {
        const body = iframe.contentDocument?.body;
        return body ? getComputedStyle(body).backgroundColor : "";
      }),
    )
    .toBe("rgba(0, 0, 0, 0)");
  await expect
    .poll(() =>
      sqlKeyword.evaluate((element) => getComputedStyle(element).color),
    )
    .not.toBe(lightKeywordColor);
});

test("hydrates from ChatGPT globals when no bridge result notification arrives", async ({
  page,
}) => {
  await page.goto("/test-host.html?globals=1");
  const widget = page.frameLocator("iframe[title='Starfetch widget']");

  await expect(
    widget.getByRole("heading", { name: "Gaia source results" }),
  ).toBeVisible();
  await expect(widget.getByText("100 source rows")).toBeVisible();
});

test("keeps delayed partial host results loading on mobile until data arrives", async ({
  page,
}) => {
  await page.goto("/test-host.html?mobile=1&delayed-globals=1");
  const widget = page.frameLocator("iframe[title='Starfetch widget']");

  await expect(widget.getByLabel("Waiting for Starfetch results…")).toBeVisible(
    {
      timeout: 1_500,
    },
  );
  await expect(widget.locator(".loading-skeleton")).toBeVisible();
  await expect(
    widget.getByRole("heading", { name: "Unable to show Starfetch results" }),
  ).toHaveCount(0);
  await expect(
    widget.getByRole("heading", { name: "Gaia source results" }),
  ).toBeVisible();
  await expect(
    widget.getByRole("table", { name: "Gaia source results" }),
  ).toBeVisible();
});

test("keeps mobile hosts inline instead of exposing a broken fullscreen path", async ({
  page,
}) => {
  await page.goto("/test-host.html?mobile=1");
  const widget = page.frameLocator("iframe[title='Starfetch widget']");

  await expect(
    widget.getByRole("heading", { name: "Gaia source results" }),
  ).toBeVisible();
  await expect(
    widget.getByRole("button", { name: "Open fullscreen" }),
  ).toHaveCount(0);
  await expect(
    widget.getByRole("table", { name: "Gaia source results" }),
  ).toBeVisible();
});

test("supports keyboard actions, host downloads, and table expansion", async ({
  context,
  page,
}) => {
  await context.grantPermissions(["clipboard-read", "clipboard-write"], {
    origin: "http://127.0.0.1:5174",
  });
  await page.goto("/test-host.html");
  const widget = page.frameLocator("iframe[title='Starfetch widget']");
  await expect(
    widget.getByRole("heading", { name: "Gaia source results" }),
  ).toBeVisible();

  const copyAdql = widget.getByRole("button", { name: "Copy ADQL" });
  await copyAdql.focus();
  await page.keyboard.press("Enter");
  await expect
    .poll(() => page.evaluate(() => navigator.clipboard.readText()))
    .toBe(browserTestQuery);
  await expect(
    widget.getByRole("button", { name: "Copied ADQL" }),
  ).toBeVisible();

  await widget.getByRole("button", { name: "Download data" }).click();
  await widget.getByRole("menuitem", { name: "Download JSON" }).click();
  await expect
    .poll(() =>
      page.evaluate(() => {
        const download = window.testDownload as
          | {
              contents?: Array<{ resource?: { text?: string } }>;
            }
          | undefined;
        return download?.contents?.[0]?.resource?.text ?? "";
      }),
    )
    .toContain(`"source_id": "${browserTestView.rows[0]?.source_id}"`);

  await widget.getByRole("button", { name: "Open fullscreen" }).click();
  await expect(widget.locator(".table-scroll")).toHaveAttribute(
    "data-mode",
    "fullscreen",
  );
  await widget.getByRole("button", { name: "Exit fullscreen" }).click();
  await expect(widget.locator(".table-scroll")).toHaveAttribute(
    "data-mode",
    "inline",
  );

  const widgetFrame = page
    .frames()
    .find((frame) => frame.url().endsWith("/dist/index.html"));
  expect(widgetFrame).toBeDefined();
  await expect
    .poll(() =>
      widgetFrame?.evaluate(
        () =>
          document.documentElement.scrollWidth <=
          document.documentElement.clientWidth,
      ),
    )
    .toBe(true);

  await widget.getByRole("button", { name: "Analyze this page" }).click();
  await widget.getByRole("button", { name: "Analyze this page" }).click();
  await expect
    .poll(() =>
      page.evaluate(() => {
        const context = window.testModelContext as
          | { content?: Array<{ text?: string }> }
          | undefined;
        return context?.content?.[0]?.text;
      }),
    )
    .toContain(`"source_id": "${browserTestView.rows[0]?.source_id}"`);
  await expect
    .poll(() => page.evaluate(() => window.testModelContextUpdates))
    .toBe(2);
});

function isParseInvalid(character: string): boolean {
  const codePoint = character.codePointAt(0) ?? 0;
  return (
    codePoint <= 8 ||
    codePoint === 11 ||
    codePoint === 12 ||
    (codePoint >= 14 && codePoint <= 31) ||
    (codePoint >= 127 && codePoint <= 159) ||
    (codePoint >= 0xfdd0 && codePoint <= 0xfdef) ||
    (codePoint & 0xffff) === 0xfffe ||
    (codePoint & 0xffff) === 0xffff
  );
}
