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

test("renders virtualized bridge results with safe theme fallbacks", async ({
  page,
}) => {
  await page.goto("/test-host.html");
  const widget = page.frameLocator("iframe[title='Starfetch widget']");

  await expect(
    widget.getByRole("heading", { name: "Gaia source results" }),
  ).toBeVisible();
  await expect(widget.getByText("100 source rows")).toBeVisible();
  await expect(widget.getByText(/rows shown/)).toHaveCount(0);
  await expect(widget.locator(".table-scroll")).toHaveAttribute(
    "data-virtualized",
    "true",
  );
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
    .toBe("rgb(31, 31, 29)");
  await expect
    .poll(() =>
      sqlKeyword.evaluate((element) => getComputedStyle(element).color),
    )
    .not.toBe(lightKeywordColor);
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

  await widget.getByRole("button", { name: "Show more" }).click();
  await expect(widget.locator(".table-scroll")).toHaveAttribute(
    "data-mode",
    "fullscreen",
  );
  await widget.getByRole("button", { name: "Show less" }).click();
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
