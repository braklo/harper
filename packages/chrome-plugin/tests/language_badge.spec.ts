import { expect, test } from './fixtures';
import { getBackground, getTextarea } from './testUtils';

const TEST_PAGE_URL = 'http://localhost:8081/simple_textarea.html';

test('Shows the active language in the corner of the focused field.', async ({ page }) => {
	await page.goto(TEST_PAGE_URL);

	const editor = getTextarea(page);
	await editor.click();

	const badge = page.locator('harper-language-badge');
	await expect(badge).toHaveAttribute('data-language', /\S/, { timeout: 15000 });

	const editorBox = (await editor.boundingBox())!;
	const badgeBox = (await badge.boundingBox())!;
	expect(badgeBox.width).toBeGreaterThan(0);
	expect(badgeBox.y).toBeGreaterThanOrEqual(editorBox.y);
	expect(badgeBox.y + badgeBox.height).toBeLessThanOrEqual(editorBox.y + editorBox.height);
	expect(badgeBox.x + badgeBox.width).toBeLessThanOrEqual(editorBox.x + editorBox.width);
	expect(badgeBox.x + badgeBox.width).toBeGreaterThan(editorBox.x + editorBox.width - 10);

	await editor.blur();
	await expect(badge).toHaveCount(0);
});

test('Hides the language when the option is off.', async ({ context, page, browserName }) => {
	test.skip(
		browserName === 'firefox',
		'Firefox MV3 background context is not exposed reliably in playwright-webextext.',
	);

	const background = await getBackground(context);
	await background.evaluate(() => chrome.storage.local.set({ showLanguageBadge: false }));

	await page.goto(TEST_PAGE_URL);
	const editor = getTextarea(page);
	await editor.click();
	await page.waitForTimeout(1000);
	await expect(page.locator('harper-language-badge')).toHaveCount(0);

	await background.evaluate(() => chrome.storage.local.set({ showLanguageBadge: true }));
	await expect(page.locator('harper-language-badge')).toHaveCount(1, { timeout: 15000 });
});
