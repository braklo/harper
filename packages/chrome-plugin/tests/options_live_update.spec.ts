import { expect, test } from './fixtures';
import {
	getHarperHighlights,
	getTextarea,
	openExtensionPage,
	replaceEditorContent,
} from './testUtils';

const TEST_PAGE_URL = 'http://localhost:8081/simple_textarea.html';

test.describe('settings changed on the options page reach open pages', () => {
	test.setTimeout(90_000);
	test.skip(
		({ browserName }) => browserName === 'firefox',
		'Firefox MV3 background context is not exposed reliably in playwright-webextext.',
	);

	test('disabling a rule removes its highlight without editing the text', async ({
		context,
		page,
	}) => {
		await page.goto(TEST_PAGE_URL);
		await replaceEditorContent(getTextarea(page), 'I could of gone.');
		await expect(getHarperHighlights(page)).toHaveCount(1, { timeout: 15000 });

		const options = await context.newPage();
		await openExtensionPage(context, options, 'options.html');
		await options.evaluate(() =>
			chrome.runtime.sendMessage({ kind: 'setConfig', config: { ModalOf: false } }),
		);
		await options.close();

		await expect(getHarperHighlights(page)).toHaveCount(0, { timeout: 10000 });
	});

	test('a word added to the user dictionary is no longer flagged', async ({ context, page }) => {
		await page.goto(TEST_PAGE_URL);
		await replaceEditorContent(getTextarea(page), 'The word qwzxvy is unknown.');
		await expect(getHarperHighlights(page)).toHaveCount(1, { timeout: 15000 });

		const options = await context.newPage();
		await openExtensionPage(context, options, 'options.html');
		await options.evaluate(() =>
			chrome.runtime.sendMessage({ kind: 'setUserDictionary', words: ['qwzxvy'] }),
		);
		await options.close();

		await expect(getHarperHighlights(page)).toHaveCount(0, { timeout: 10000 });
	});
});
