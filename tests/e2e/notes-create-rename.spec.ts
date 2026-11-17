import { test, expect, type Page } from "@playwright/test";
import { prepareWebLibrary } from "./helpers";

async function noteFilenames(page: Page): Promise<string[]> {
  return page.locator("[data-note-filename]").evaluateAll((els) => els.map((el) => (el as HTMLElement).dataset.noteFilename ?? ""));
}

async function openNotes(page: Page) {
  await page.locator('.nav-item[data-route="notes"]').click();
  await expect(page.locator('.notes-layout[data-notes-ready="1"]')).toBeVisible();
}

test("three new notes never overwrite each other; rename and reload keep all", async ({ page }) => {
  await prepareWebLibrary(page);
  await openNotes(page);
  const created: { filename: string; text: string }[] = [];
  for (let i = 1; i <= 3; i += 1) {
    const before = await noteFilenames(page);
    await page.locator("#btn-new-note").click();
    await expect.poll(() => noteFilenames(page).then((f) => f.length)).toBe(before.length + 1);
    const filename = (await noteFilenames(page)).find((f) => !before.includes(f))!;
    const text = `Obsah poznámky ${i}`;
    await page.locator(".cm-content").click();
    await page.keyboard.press("End");
    await page.keyboard.type(text);
    await page.waitForTimeout(900);
    created.push({ filename, text });
  }
  expect(created.map((c) => c.filename)).toEqual(["Bez názvu.md", "Bez názvu 2.md", "Bez názvu 3.md"]);

  await page.locator('[data-note-filename="Bez názvu 2.md"]').click();
  await page.locator("#note-title").fill("Přejmenovaná");
  await page.locator("#note-title").press("Enter");
  await expect.poll(() => noteFilenames(page)).toContain("Přejmenovaná.md");

  await page.reload();
  await page.waitForSelector(".sidebar");
  await openNotes(page);
  const after = await noteFilenames(page);
  expect(after.sort()).toEqual(["Bez názvu 3.md", "Bez názvu.md", "Přejmenovaná.md"].sort());
  const bodies = await page.evaluate(() =>
    (JSON.parse(localStorage.getItem("marginalia.notes") ?? "[]") as { filename: string; body: string; title: string }[]).map(
      (n) => ({ filename: n.filename, body: n.body, title: n.title }),
    ),
  );
  expect(bodies.find((n) => n.filename === "Bez názvu.md")?.body).toContain("Obsah poznámky 1");
  expect(bodies.find((n) => n.filename === "Přejmenovaná.md")).toMatchObject({ title: "Přejmenovaná" });
  expect(bodies.find((n) => n.filename === "Přejmenovaná.md")?.body).toContain("Obsah poznámky 2");
  expect(bodies.find((n) => n.filename === "Bez názvu 3.md")?.body).toContain("Obsah poznámky 3");
});
