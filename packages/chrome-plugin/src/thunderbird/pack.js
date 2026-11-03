// Repackages the Firefox build (build/) as a Thunderbird MailExtension in package/<target>.
//
// Thunderbird's compose window is not a web page, so the manifest content scripts never reach it.
// This adds a background script that registers Harper's content script as a compose script and
// cleans Harper's markup out of messages on send.
//
// Environment:
//   THUNDERBIRD_EXTENSION_ID      gecko id (default: the Firefox build's id)
//   THUNDERBIRD_EXTENSION_NAME    extension name (default: the Firefox build's name)
//   THUNDERBIRD_VERSION_SUFFIX    appended to the version as `.<suffix>`, for local rebuilds that
//                                 Thunderbird must accept as updates

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import gulp from 'gulp';
import zip from 'gulp-zip';

const [, , target = 'harper-thunderbird-plugin.xpi'] = process.argv;
const here = path.dirname(fileURLToPath(import.meta.url));
const stage = 'package/thunderbird-build';

function fail(message) {
	console.error(`pack.js: ${message}`);
	process.exit(1);
}

fs.rmSync(stage, { recursive: true, force: true });
fs.cpSync('build', stage, { recursive: true });

const manifestPath = path.join(stage, 'manifest.json');
const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));

// Fail loudly if the Firefox build no longer looks the way this script expects.
const contentScript = manifest.content_scripts?.find((cs) => cs.matches?.includes('<all_urls>'))
	?.js?.[0];
if (contentScript == null) fail('no <all_urls> content script in the Firefox manifest');
if (!Array.isArray(manifest.background?.scripts))
	fail('no background.scripts in the Firefox manifest');

const gecko = manifest.browser_specific_settings?.gecko ?? {};
manifest.browser_specific_settings = {
	gecko: {
		...gecko,
		id: process.env.THUNDERBIRD_EXTENSION_ID ?? gecko.id,
		strict_min_version: '128.0',
	},
};
if (process.env.THUNDERBIRD_EXTENSION_NAME) manifest.name = process.env.THUNDERBIRD_EXTENSION_NAME;
if (process.env.THUNDERBIRD_VERSION_SUFFIX) {
	manifest.version = `${manifest.version}.${process.env.THUNDERBIRD_VERSION_SUFFIX}`;
}
manifest.permissions = [...new Set([...(manifest.permissions ?? []), 'compose', 'scripting'])];
manifest.background.scripts = ['thunderbird-background.js', ...manifest.background.scripts];
// Thunderbird opens the settings page only from `options_ui`; the Chrome-style `options_page`
// of the Firefox build leaves runtime.openOptionsPage() (the popup's Settings link) doing nothing.
if (manifest.options_page && !manifest.options_ui) {
	manifest.options_ui = { page: manifest.options_page, open_in_tab: true };
}
// Thunderbird does not fall back to `icons` for a toolbar button, and it shows the title as the
// button's text. Give the button the icon and a short label; the badge shows the language and the
// full title stays in the tooltip.
manifest.action = {
	...manifest.action,
	default_icon: manifest.action?.default_icon ?? manifest.icons,
	default_label: 'Harper',
};
// The compose window has no browser action, so give it the same button (popup, icon, badge).
manifest.compose_action = {
	default_popup: manifest.action.default_popup,
	default_icon: manifest.action.default_icon,
	default_title: manifest.action.default_title ?? manifest.name,
	default_label: 'Harper',
};

fs.writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
fs.writeFileSync(
	path.join(stage, 'thunderbird-background.js'),
	fs
		.readFileSync(path.join(here, 'background.js'), 'utf8')
		.replaceAll('__HARPER_CONTENT_SCRIPT__', `/${contentScript}`),
);
fs.copyFileSync(path.join(here, 'compose.js'), path.join(stage, 'thunderbird-compose.js'));

// Load popup.js before the popup's own module script (see popup.js).
const popupPath = path.join(stage, manifest.action?.default_popup ?? 'popup.html');
const popupHtml = fs.readFileSync(popupPath, 'utf8');
if (!popupHtml.includes('</head>')) fail(`no </head> in ${popupPath}`);
fs.writeFileSync(
	popupPath,
	popupHtml.replace('</head>', '<script src="/thunderbird-popup.js"></script></head>'),
);
fs.copyFileSync(path.join(here, 'popup.js'), path.join(stage, 'thunderbird-popup.js'));

gulp.src(`${stage}/**`, { encoding: false }).pipe(zip(target)).pipe(gulp.dest('package'));
