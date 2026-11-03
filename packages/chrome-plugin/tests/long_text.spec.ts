import { expect, test } from './fixtures';
import { getHarperHighlights } from './testUtils';

test('Checks the beginning of a text over the length limit.', async ({ page }) => {
	await page.goto('http://localhost:8081/long_text.html');

	const highlights = getHarperHighlights(page);
	await expect(highlights).toHaveCount(1, { timeout: 60000 });
});
