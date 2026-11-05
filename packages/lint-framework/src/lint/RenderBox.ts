import type { VNode } from 'virtual-dom';
import createElement from 'virtual-dom/create-element';
import diff from 'virtual-dom/diff';
import patch from 'virtual-dom/patch';
import { adoptedSheets, constructedSheet, isStyleBlocked, setAdoptedSheets } from './cspStyles';

type ParentResolver = () => Node;

/** Wraps `virtual-dom` to create a box that is unaffected by the style of the rest of the page. */
export default class RenderBox {
	/** The node we reattach into if a host is removed by editor-managed DOM updates. */
	private parentResolver: ParentResolver;
	/** The element our virtual DOM is attached to. */
	private virtualRoot: Element | undefined;
	/** The current state of the virtual DOM */
	private virtualTree: VNode | undefined;
	/** The shadow DOM the `virtualRoot` is attached to. */
	private shadowHost: HTMLElement;

	constructor(parent: Node | ParentResolver) {
		this.parentResolver = typeof parent === 'function' ? parent : () => parent;
		this.shadowHost = document.createElement('harper-render-box');
		this.parentResolver().appendChild(this.shadowHost);
	}

	/** Render to the box. */
	public render(node: VNode) {
		if (!this.shadowHost.isConnected) {
			this.parentResolver().appendChild(this.shadowHost);
		}

		if (!this.virtualRoot || !this.virtualTree) {
			this.virtualRoot = createElement(node);
			const shadow = this.shadowHost.attachShadow({ mode: 'open' });
			shadow.appendChild(this.virtualRoot);
		} else {
			const patches = diff(this.virtualTree, node);
			this.virtualRoot = patch(this.virtualRoot, patches);
		}
		this.virtualTree = node;
		this.adoptBlockedStyles();
	}

	/**
	 * Apply the CSS of `<style>` elements the page's Content Security Policy blocked as constructed
	 * stylesheets. The shadow root is ours, so its adopted sheets always mirror the blocked styles.
	 */
	private adoptBlockedStyles() {
		const root = this.getShadowRoot();
		const wanted: CSSStyleSheet[] = [];

		for (const style of root.querySelectorAll('style')) {
			if (!isStyleBlocked(style)) continue;
			const sheet = constructedSheet(style.textContent ?? '');
			if (sheet != null) wanted.push(sheet);
		}

		const current = adoptedSheets(root);
		if (current.length === wanted.length && current.every((sheet, i) => sheet === wanted[i])) {
			return;
		}

		setAdoptedSheets(root, wanted);
	}

	/** Remove the box from the DOM. */
	public remove() {
		try {
			this.shadowHost.outerHTML = this.shadowHost.outerHTML;
		} catch (e) {
			console.error(e);
		}
		this.virtualRoot = undefined;
		this.virtualTree = undefined;
	}

	public getShadowHost(): HTMLElement {
		return this.shadowHost;
	}
}
