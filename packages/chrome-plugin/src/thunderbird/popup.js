// Loaded into the popup before its own code. From the compose window's popup,
// runtime.openOptionsPage() has no mail tab to open the settings in, so ask the background
// script to open them in a main window instead.
const openOptionsInMainWindow = () =>
	browser.runtime.sendMessage({ kind: 'thunderbirdOpenOptions' }).finally(() => window.close());

for (const api of [globalThis.chrome?.runtime, globalThis.browser?.runtime]) {
	try {
		if (api) api.openOptionsPage = openOptionsInMainWindow;
	} catch (e) {
		console.error('[harper] could not redirect openOptionsPage', e);
	}
}
