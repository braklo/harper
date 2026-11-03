/**
 * Whether the manifest declares that the extension transmits no data
 * (Firefox `data_collection_permissions` with `required: ["none"]` and nothing optional).
 * Packages built with that declaration must not send the feedback forms to writewithharper.com.
 */
export default function transmitsNoData(): boolean {
	const manifest = chrome.runtime.getManifest() as {
		browser_specific_settings?: {
			gecko?: { data_collection_permissions?: { required?: string[]; optional?: string[] } };
		};
	};
	const declared = manifest.browser_specific_settings?.gecko?.data_collection_permissions;
	return declared?.required?.includes('none') === true && !declared.optional?.length;
}
