// Thunderbird background script, loaded before the Firefox extension's own background.
// `__HARPER_CONTENT_SCRIPT__` is replaced by pack.js with the path of Harper's content script.

// Manifest content scripts never reach the compose window, so register ours as a compose script.
const files = ['/thunderbird-compose.js', '__HARPER_CONTENT_SCRIPT__'];

(async () => {
	try {
		if (browser.scripting?.compose) {
			await browser.scripting.compose.registerScripts([{ id: 'harper-compose', js: files }]);
		} else {
			await browser.composeScripts.register({ js: files.map((file) => ({ file })) });
		}
	} catch (e) {
		console.error('[harper] compose script registration failed', e);
	}

	// The compose window has no domain to enable Harper for (see `defaultEnable` in background/index.ts).
	const { defaultEnable } = await browser.storage.local.get('defaultEnable');
	if (defaultEnable === undefined) {
		await browser.storage.local.set({ defaultEnable: true });
	}
})();

// Thunderbird serializes the whole compose document on send, so strip what Harper and
// thunderbird-compose.js added to it. The body is only rewritten when there is something to remove.
browser.compose.onBeforeSend.addListener((_tab, details) => {
	if (details.isPlainText || !details.body) return;

	const doc = new DOMParser().parseFromString(details.body, 'text/html');
	const junk = [
		// Harper's own elements (render boxes, notices) all have a `harper-` tag name.
		...[...doc.querySelectorAll('*')].filter((el) => el.localName.startsWith('harper-')),
		...doc.querySelectorAll('style[id^="harper-highlight-style-"]'),
		// Font Awesome injects its stylesheet into <head> when the suggestion box loads.
		...[...doc.querySelectorAll('style')].filter((s) => s.textContent.includes('--fa-font-')),
	];
	const editable = doc.body?.hasAttribute('contenteditable');
	if (junk.length === 0 && !editable) return;

	for (const el of junk) el.remove();
	doc.body?.removeAttribute('contenteditable');
	return { details: { body: `<!DOCTYPE html>\n${doc.documentElement.outerHTML}` } };
});

// Mirror the main toolbar button onto the compose window's button, so the badge and title the
// extension sets (e.g. the active language) are visible while writing. They are copied on start
// and whenever the stored dialect changes, after the extension has had time to update its button.
async function mirrorActionToCompose() {
	if (!browser.composeAction || !browser.action) return;
	try {
		const [text, title, color] = await Promise.all([
			browser.action.getBadgeText({}),
			browser.action.getTitle({}),
			browser.action.getBadgeBackgroundColor({}),
		]);
		await browser.composeAction.setBadgeText({ text });
		await browser.composeAction.setTitle({ title });
		await browser.composeAction.setBadgeBackgroundColor({ color });
	} catch (e) {
		console.error('[harper] could not mirror the toolbar button', e);
	}
}

function mirrorSoon() {
	for (const delay of [300, 1500, 4000]) setTimeout(mirrorActionToCompose, delay);
}

mirrorSoon();
browser.storage.onChanged.addListener((changes, area) => {
	if (area === 'local' && changes.dialect) mirrorSoon();
});

// Settings link in the popup (see popup.js): open the settings page as a tab in a main window,
// which also works when the popup belongs to a compose window.
browser.runtime.onMessage.addListener((message) => {
	if (message?.kind !== 'thunderbirdOpenOptions') return;
	return openOptionsInMainWindow();
});

async function openOptionsInMainWindow() {
	const manifest = browser.runtime.getManifest();
	const page = manifest.options_ui?.page ?? manifest.options_page;
	const [win] = await browser.windows.getAll({ windowTypes: ['normal'] });
	if (!win || !page) {
		await browser.runtime.openOptionsPage();
		return;
	}
	await browser.tabs.create({ windowId: win.id, url: browser.runtime.getURL(page) });
	await browser.windows.update(win.id, { focused: true });
}
