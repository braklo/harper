import { expect, test } from './fixtures';
import { getHarperHighlights } from './testUtils';

const TEST_PAGE_URL = 'http://localhost:8081/email_quote.html';

test('Skips the quoted message in an e-mail reply.', async ({ page }) => {
	await page.goto(TEST_PAGE_URL);

	const highlights = getHarperHighlights(page);
	await expect(highlights).toHaveCount(1, { timeout: 24000 });

	// The one highlight belongs to the user's own text, above the quote.
	const highlightBox = (await highlights.first().boundingBox())!;
	const quoteBox = (await page.locator('blockquote').boundingBox())!;
	expect(highlightBox.y + highlightBox.height).toBeLessThanOrEqual(quoteBox.y);
});

test('Checks a quoted block once the user edits it.', async ({ page }) => {
	await page.goto(TEST_PAGE_URL);

	const highlights = getHarperHighlights(page);
	await expect(highlights).toHaveCount(1, { timeout: 24000 });

	await page.locator('blockquote').click();
	await page.keyboard.press('End');
	await page.keyboard.type(' Yes.');

	await expect(highlights).toHaveCount(2, { timeout: 24000 });
});

test('Keeps a list item and the next line apart next to a signature.', async ({ page }) => {
	await page.goto('http://localhost:8081/email_list.html');

	// Only "an test" is flagged, not "documentsIs", and its highlight sits below the list.
	const highlights = getHarperHighlights(page);
	await expect(highlights).toHaveCount(1, { timeout: 24000 });

	const highlightBox = (await highlights.first().boundingBox())!;
	const listBox = (await page.locator('ul').boundingBox())!;
	expect(highlightBox.y + highlightBox.height / 2).toBeGreaterThan(listBox.y + listBox.height);
});
