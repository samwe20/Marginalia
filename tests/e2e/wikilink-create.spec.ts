import { test, expect, type Page } from "@playwright/test";
import { prepareWebLibrary } from "./helpers";

type StoredNote = { filename: string; title: string; body: string };

async function storedNotes(page: Page): Promise<StoredNote[]> {
  return page.evaluate(() => JSON.parse(localStorage.getItem("marginalia.notes") ?? "[]") as StoredNote[]);
}

async function writeLinkInNewNote(page: Page, target: string) {
  await page.locator('.nav-item[data-route="notes"]').click();
  await expect(page.locator('.notes-layout[data-notes-ready="1"]')).toBeVisible();
  await page.locator("#btn-new-note").click();
  await expect(page.locator('.notes-layout[data-notes-ready="1"] .cm-content')).toBeVisible();
  await page.locator(".cm-content").click();
  await page.keyboard.press("End");
  await page.keyboard.type(`Odkaz na [[${target}`);
  await page.keyboard.press("Escape");
  await page.keyboard.type("]] konec");
  await page.keyboard.press("Home");
}

test.describe("[[wikilink]] creates a missing note like Folio", () => {
  test("typing alone does not create; double-click + confirm creates # Title", async ({ page }) => {
    await prepareWebLibrary(page);
    await writeLinkInNewNote(page, "Nový cíl");
    await page.waitForTimeout(900);
    expect((await storedNotes(page)).some((n) => n.title === "Nový cíl")).toBe(false);

    const dialogs: string[] = [];
    page.on("dialog", (d) => {
      dialogs.push(d.message());
      void d.accept();
    });
    await page.locator(".cm-wiki-link.missing", { hasText: "Nový cíl" }).dblclick();
    await expect.poll(async () => (await storedNotes(page)).find((n) => n.title === "Nový cíl")?.body).toBe("# Nový cíl\n\n");
    expect(dialogs.join("\n")).toContain("Nový cíl");
    expect((await storedNotes(page)).find((n) => n.title === "Nový cíl")?.filename).toBe("Nový cíl.md");
  });

  test("dismissing the confirm creates nothing", async ({ page }) => {
    await prepareWebLibrary(page);
    await writeLinkInNewNote(page, "Odmítnutý");
    page.on("dialog", (d) => void d.dismiss());
    await page.locator(".cm-wiki-link.missing", { hasText: "Odmítnutý" }).dblclick();
    await page.waitForTimeout(800);
    expect((await storedNotes(page)).some((n) => n.title === "Odmítnutý")).toBe(false);
  });
});
