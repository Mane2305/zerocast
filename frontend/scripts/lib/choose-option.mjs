// Pick a value in the app's Select / MultiSelect dropdowns (they replaced native
// <select>, so Playwright's selectOption no longer applies).
// `label` is the dropdown's visible label; `value` the option text to click.
export async function chooseOption(page, label, value, { exact = true } = {}) {
  await page.getByRole("button", { name: label, exact }).first().click();
  const popover = page.locator(".zc-popover");
  const search = popover.locator("input");
  if (await search.count()) await search.fill(String(value));
  await popover
    .locator(".zc-option")
    .filter({ hasText: String(value) })
    .first()
    .click();
  // MultiSelect stays open; close it.
  if (await popover.count()) await page.keyboard.press("Escape");
}
