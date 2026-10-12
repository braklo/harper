/** Storage key of the option that shows the active language next to the focused text field. */
export const SHOW_LANGUAGE_BADGE_KEY = 'showLanguageBadge';

const MARGIN = 2;

let enabled = false;
let siteEnabled = false;
let language: { code: string; label: string } | null = null;
let target: HTMLElement | null = null;
let host: HTMLElement | null = null;
let box: HTMLDivElement | null = null;
let frame = 0;

/**
 * Keep a small label with the active language in the top right corner of the focused text field,
 * so the language can be seen while typing, not only after switching it.
 */
export function startLanguageBadge(
	getLanguage: () => Promise<{ code: string; label: string }>,
	isSiteEnabled: () => Promise<boolean>,
) {
	const refreshLanguage = () =>
		Promise.all([getLanguage(), isSiteEnabled()])
			.then(([active, site]) => {
				language = active;
				siteEnabled = site;
				render();
			})
			.catch((err) => console.error('Failed to get the active language:', err));

	chrome.storage.local.get({ [SHOW_LANGUAGE_BADGE_KEY]: true }).then((items) => {
		enabled = items[SHOW_LANGUAGE_BADGE_KEY] !== false;
		if (enabled) {
			refreshLanguage();
		}
		follow(document.activeElement);
	});

	chrome.storage.onChanged.addListener((changes, areaName) => {
		if (areaName !== 'local') {
			return;
		}

		if (changes[SHOW_LANGUAGE_BADGE_KEY] != null) {
			enabled = changes[SHOW_LANGUAGE_BADGE_KEY].newValue !== false;
			if (enabled) {
				refreshLanguage();
			}
			render();
		}

		if (enabled && (changes.dialect != null || changes.languageSwitchedAt != null)) {
			refreshLanguage();
		}
	});

	document.addEventListener(
		'focusin',
		(event) => {
			follow(event.target);
			// Harper may have been turned on or off for this site since the last field.
			if (enabled && target != null) {
				refreshLanguage();
			}
		},
		{ capture: true },
	);
	document.addEventListener('focusout', () => follow(null), { capture: true });
	window.addEventListener('scroll', schedule, { capture: true, passive: true });
	window.addEventListener('resize', schedule, { passive: true });
	document.addEventListener('input', schedule, { capture: true });
}

function follow(element: EventTarget | null): void {
	target = element instanceof HTMLElement && isTextField(element) ? element : null;
	render();
}

function isTextField(element: HTMLElement): boolean {
	if (element instanceof HTMLTextAreaElement) {
		return !element.disabled && !element.readOnly;
	}

	if (element instanceof HTMLInputElement) {
		return element.type === 'text' && element.spellcheck && !element.disabled && !element.readOnly;
	}

	return element.isContentEditable;
}

function schedule(): void {
	if (frame === 0 && target != null) {
		frame = window.requestAnimationFrame(() => {
			frame = 0;
			render();
		});
	}
}

function render(): void {
	if (
		!enabled ||
		!siteEnabled ||
		target == null ||
		!target.isConnected ||
		language == null ||
		language.code === ''
	) {
		hide();
		return;
	}

	if (host == null || box == null || !host.isConnected) {
		create();
	}

	host!.setAttribute('data-language', language.code);
	box!.textContent = language.code;
	box!.title = `Harper: ${language.label}`;

	// The field's corner, kept inside the viewport for fields larger than the window.
	const rect = target.getBoundingClientRect();
	const top = Math.max(rect.top, 0) + MARGIN;
	const right = Math.min(rect.right, document.documentElement.clientWidth) - MARGIN;
	const visible = rect.bottom > top && rect.right > 0 && rect.top < window.innerHeight;

	host!.style.display = visible ? 'block' : 'none';
	host!.style.top = `${top}px`;
	host!.style.left = `${right - host!.offsetWidth}px`;
}

function create(): void {
	host?.remove();
	host = document.createElement('harper-language-badge');
	// Outside <body>: in an editable body (e.g. an e-mail being written) it would become content.
	host.setAttribute('contenteditable', 'false');
	Object.assign(host.style, {
		position: 'fixed',
		zIndex: '2147483646',
		pointerEvents: 'none',
	});
	const shadow = host.attachShadow({ mode: 'closed' });

	box = document.createElement('div');
	box.setAttribute('aria-hidden', 'true');
	Object.assign(box.style, {
		padding: '0 4px',
		borderRadius: '3px',
		background: '#4b5563',
		color: '#ffffff',
		opacity: '0.75',
		font: '600 10px/16px system-ui, sans-serif',
		pointerEvents: 'none',
		whiteSpace: 'nowrap',
	});
	shadow.append(box);
	document.documentElement.append(host);
}

function hide(): void {
	host?.remove();
	host = null;
	box = null;
}
