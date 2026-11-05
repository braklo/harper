// Runs in the Thunderbird compose window before Harper's content script.
// The compose body is a designMode document without [contenteditable], which Harper looks for.
if (
	document.designMode === 'on' &&
	document.body &&
	!document.body.hasAttribute('contenteditable')
) {
	document.body.setAttribute('contenteditable', 'true');
}
