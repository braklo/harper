import type { Span } from 'harper.js';
import { isBoxInScreen } from './Box';

/**
 * Turn a `NodeList` into a normal JavaScript array.
 * @param collection
 */
export function extractFromHTMLCollection(collection: HTMLCollection): Element[] {
	const elements: Element[] = [];
	for (let i = 0; i < collection.length; i++) {
		const el = collection.item(i);
		if (el) elements.push(el);
	}
	return elements;
}

/**
 * Turn a `NodeList` into a normal JavaScript array.
 * @param list
 */
export function extractFromNodeList<T extends Node>(list: NodeListOf<T>): T[] {
	const elements: T[] = [];

	for (let i = 0; i < list.length; i++) {
		const item = list[i];
		elements.push(item);
	}

	return elements;
}

export function getNodesFromQuerySelector(element: Element, query: string) {
	return extractFromNodeList(element.querySelectorAll(query));
}

/** Get a node's closest ancestor that has `display: block`. */
export function getClosestBlockAncestor(leaf: Node, root: Element): Element | null {
	let current: Node | null = leaf;

	while (current) {
		if (current instanceof Element) {
			if (getComputedStyle(current).display === 'block') {
				return current;
			}

			if (current === root) {
				break;
			}
		}

		current = current.parentNode;
	}

	return null;
}

/**
 * Content inside an editor that Harper leaves unchecked: widgets marked non-editable, and the
 * quoted message, forwarded message or signature in e-mail editors (Thunderbird, Gmail, Apple Mail),
 * which the user is replying to rather than writing.
 */
export const SKIPPED_CONTENT_SELECTOR = [
	'[contenteditable="false"]',
	'[disabled]',
	'[readonly]',
	'blockquote[type="cite"]',
	'.moz-cite-prefix',
	'.moz-forward-container',
	'.moz-signature',
	'.gmail_quote',
	'.gmail_signature',
].join(',');

/** Blocks inside skipped content that the user has started editing, and so are checked again. */
const unlockedBlocks = new WeakSet<Element>();

/** Check a block inside skipped content (e.g. a quoted paragraph the user edits) from now on. */
export function unlockSkippedBlock(block: Element) {
	unlockedBlocks.add(block);
}

/** Whether `node` lies in content Harper should not check, unless the user unlocked its block. */
export function isSkippedContent(node: Node): boolean {
	const el = node instanceof Element ? node : node.parentElement;
	const skipped = el?.closest(SKIPPED_CONTENT_SELECTOR);

	if (el == null || skipped == null) {
		return false;
	}

	for (let n: Element | null = el; n != null; n = n.parentElement) {
		if (unlockedBlocks.has(n)) {
			return false;
		}

		if (n === skipped) {
			break;
		}
	}

	return true;
}

/**
 * Flatten a provided node, and its children into a single array.
 * @param node
 */
export function leafNodes(node: Node): Node[] {
	const out: Node[] = [];

	const children = extractFromNodeList(node.childNodes);

	if (children.length === 0) {
		return [node];
	}

	for (const child of children) {
		const sub = leafNodes(child);
		sub.forEach((v) => {
			out.push(v);
		});
	}

	return out;
}

/** Whether a target contains descendants that must not be checked (`SKIPPED_CONTENT_SELECTOR`). */
export function hasSkippedContent(target: Element): boolean {
	return target.querySelector(SKIPPED_CONTENT_SELECTOR) != null;
}

const BLOCK_TAGS = new Set([
	'ADDRESS',
	'ARTICLE',
	'ASIDE',
	'BLOCKQUOTE',
	'DD',
	'DIV',
	'DL',
	'DT',
	'FIGCAPTION',
	'FIGURE',
	'FOOTER',
	'H1',
	'H2',
	'H3',
	'H4',
	'H5',
	'H6',
	'HEADER',
	'HR',
	'LI',
	'OL',
	'P',
	'PRE',
	'SECTION',
	'TABLE',
	'TD',
	'TH',
	'TR',
	'UL',
]);

/** The nearest block-level ancestor of `node` inside `root`, or `root` itself. */
function blockOf(node: Node, root: Element): Node {
	for (let n = node.parentNode; n != null && n !== root; n = n.parentNode) {
		if (n instanceof Element && BLOCK_TAGS.has(n.tagName)) {
			return n;
		}
	}

	return root;
}

/**
 * The text of a target that contains skipped content, split into parts: each leaf node with the
 * text it contributes, and a line break (`node: null`) between consecutive leaves in different
 * blocks that nothing else separates, such as a list item followed by a paragraph.
 *
 * Skipped text is blanked out and ends with a line break. Every leaf keeps its length, so
 * `getRangeForTextSpan`, which walks the same parts, maps offsets back to the DOM.
 *
 * The text is linted as Markdown, where a line starting with four spaces is a code block and is
 * not checked. Raw leaf text keeps the source indentation that `innerText` would collapse, so
 * whitespace at the start of a line becomes blank lines.
 */
export function maskedTextParts(target: Element): { node: Node | null; text: string }[] {
	const parts: { node: Node | null; text: string }[] = [];
	let lastChar = '\n';
	let lastBlock: Node | null = null;

	for (const leaf of leafNodes(target)) {
		const block = blockOf(leaf, target);

		if (lastBlock != null && block !== lastBlock && lastChar !== '\n') {
			parts.push({ node: null, text: '\n' });
			lastChar = '\n';
		}
		lastBlock = block;

		let text: string;

		if (leaf.nodeName === 'BR') {
			text = '\n';
		} else {
			const content = leaf.textContent ?? '';
			// Unlocked blocks inside skipped content are added as targets of their own, so they
			// stay blanked out here to avoid checking them twice.
			const skipped = leaf.parentElement?.closest(`${SKIPPED_CONTENT_SELECTOR},style,script,title`);

			if (skipped != null && target.contains(skipped)) {
				text = content.length > 0 ? `${' '.repeat(content.length - 1)}\n` : '';
			} else if (lastChar === '\n') {
				text = content.replace(/^\s+/, (run) => '\n'.repeat(run.length));
			} else {
				text = content;
			}
		}

		parts.push({ node: leaf, text });
		if (text.length > 0) {
			lastChar = text[text.length - 1];
		}
	}

	return parts;
}

/**
 * Given an element and a Span of text inside it, compute the Range that represents the region of the DOM represented.
 * Accounts for `<br>` elements which `innerText` converts to newlines.
 * @param target
 * @param span
 */
export function getRangeForTextSpan(target: Element, span: Span): Range | null {
	const children = hasSkippedContent(target)
		? maskedTextParts(target).map((part) => part.node)
		: leafNodes(target);

	const range = document.createRange();
	let traversed = 0;

	let startFound = false;

	for (let i = 0; i < children.length; i++) {
		const child = children[i] as HTMLElement | null;

		if (child == null || child.nodeName === 'BR') {
			traversed += 1;
			continue;
		}

		const childText = child.textContent ?? '';

		if (traversed + childText.length > span.start && !startFound) {
			range.setStart(child, span.start - traversed);
			startFound = true;
		}

		if (startFound && traversed + childText.length >= span.end) {
			range.setEnd(child, span.end - traversed);
			return range;
		}

		traversed += childText?.length ?? 0;
	}

	return null;
}

const sharedRange: Range | null = typeof document !== 'undefined' ? document.createRange() : null;

/** Check if a node represents a heading (native heading tags or role="heading"). */
export function isHeading(node: Node): boolean {
	if (!(node instanceof Element)) return false;

	const tag = node.tagName.toLowerCase();
	if (/^h[1-6]$/.test(tag)) return true;

	const role = node.getAttribute('role');
	return role?.toLowerCase() === 'heading';
}

/** Check if an element is visible to the user.
 *
 * It is coarse and meant for performance improvements, not precision.*/
export function isVisible(node: Node): boolean {
	try {
		if (!node || !(node as any).ownerDocument) return false;

		if (node instanceof Element) {
			if (!node.isConnected) return false;

			// Google Docs integration uses an off-screen bridge element that is intentionally
			// hidden from users. Treat it as visible when its editor container is on-screen.
			if (node.getAttribute('data-harper-google-docs-target') === 'true') {
				const editor = node.closest('.kix-appview-editor') as HTMLElement | null;
				if (!editor) return false;
				return isBoxInScreen(editor.getBoundingClientRect());
			}

			const rect = node.getBoundingClientRect();
			if (!isBoxInScreen(rect)) return false;
			const cv = (node as any).checkVisibility;
			if (typeof cv === 'function') return cv.call(node);
			const cs = getComputedStyle(node);
			if (cs.display === 'none' || cs.visibility === 'hidden' || cs.opacity === '0') return false;
			return true;
		}

		if (!sharedRange) return false;
		const parent = (node as any).parentElement as Element | null;
		if (parent && !parent.isConnected) return false;
		sharedRange.selectNode(node);
		const rect = sharedRange.getBoundingClientRect();
		return isBoxInScreen(rect);
	} catch {
		return false;
	}
}
