// @ts-check

// Some CDNs reject requests without a Referer header (hotlink protection / WAFs). These helpers
// set the current page's URL as the Referer on the extension's own requests to the media's
// domains, via declarativeNetRequest session rules scoped to requests initiated by this
// extension - requests made by other pages are never affected.

// Rule ids 1..MAX_PREVIEW_RULES are reserved for preview rules and replaced on every page load,
// so stale rules from earlier page loads or panel sessions clean themselves up
const PREVIEW_RULE_ID_START = 1;
const MAX_PREVIEW_RULES = 500;

// Download rules get unique ids well above the preview range
let nextDownloadRuleId = 10_000 + (Date.now() % 100_000_000);

/** @returns {string[]} */
function getDomains(/** @type {string[]} */ urls) {
	return [
		...new Set(
			urls.flatMap((url) => {
				try {
					return [new URL(url).hostname];
				} catch {
					return [];
				}
			})
		),
	];
}

function makeRule(/** @type {number} */ id, /** @type {string} */ domain, /** @type {string} */ referer) {
	return {
		id,
		priority: 1,
		action: /** @type {any} */ ({
			type: 'modifyHeaders',
			requestHeaders: [{ header: 'Referer', operation: 'set', value: referer }],
		}),
		condition: {
			requestDomains: [domain],
			// Only requests made by this extension (previews, stats, download fetches)
			initiatorDomains: [chrome.runtime.id],
		},
	};
}

// Rules for the media displayed in the panel, so previews and stats can load from
// hotlink-protected domains. Replaces the rules from any previous page load.
export async function updatePreviewRefererRules(/** @type {string[]} */ urls, /** @type {string} */ referer) {
	if (!chrome.declarativeNetRequest) return;

	const domains = referer ? getDomains(urls).slice(0, MAX_PREVIEW_RULES) : [];

	try {
		await chrome.declarativeNetRequest.updateSessionRules({
			removeRuleIds: Array.from({ length: MAX_PREVIEW_RULES }, (_, i) => PREVIEW_RULE_ID_START + i),
			addRules: domains.map((domain, index) => makeRule(PREVIEW_RULE_ID_START + index, domain, referer)),
		});
	} catch (error) {
		console.error('Could not update preview Referer rules:', error);
	}
}

// Short-lived rules covering one batch of downloads
/** @returns {Promise<number[]>} */
export async function addDownloadRefererRules(/** @type {string[]} */ urls, /** @type {string} */ referer) {
	if (!referer || !chrome.declarativeNetRequest) return [];

	const domains = getDomains(urls);
	if (domains.length === 0) return [];

	const rules = domains.map((domain) => makeRule(nextDownloadRuleId++, domain, referer));

	try {
		await chrome.declarativeNetRequest.updateSessionRules({ addRules: rules });
		return rules.map((rule) => rule.id);
	} catch (error) {
		console.error('Could not add download Referer rules:', error);
		return [];
	}
}

export function removeRefererRules(/** @type {number[]} */ ruleIds) {
	if (ruleIds.length === 0) return;
	chrome.declarativeNetRequest?.updateSessionRules({ removeRuleIds: ruleIds }).catch(() => {});
}

/** @returns {Promise<string>} The active tab's URL, when it is a regular web page */
export async function getActiveTabUrl() {
	try {
		const [activeTab] = await chrome.tabs.query({ active: true, currentWindow: true });
		return activeTab?.url && /^https?:/.test(activeTab.url) ? activeTab.url : '';
	} catch {
		return '';
	}
}
