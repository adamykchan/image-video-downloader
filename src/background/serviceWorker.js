// @ts-check
// Handle updates
chrome.runtime.onInstalled.addListener(async (details) => {
	if (details.reason === 'install') {
		// Open the Options page after install
		chrome.tabs.create({ url: 'src/Options/index.html' });
	}

	// Set initial popup state based on open_mode
	await updateActionPopup();
});

// Handle storage changes to update popup state
chrome.storage.onChanged.addListener(async (changes, areaName) => {
	if (areaName === 'local' && changes.open_mode) {
		await updateActionPopup();
	}
});

// Initialize popup state on service worker startup
updateActionPopup();

async function updateActionPopup() {
	const { open_mode = 'sidebar' } = await chrome.storage.local.get('open_mode');
	// Some Chromium-based browsers (e.g. Opera) don't implement the sidePanel
	// API. Fall back to the popup so the extension stays functional there.
	if (open_mode === 'sidebar' && chrome.sidePanel) {
		// Clear popup so onClicked listener fires
		await chrome.action.setPopup({ popup: '' });
	} else {
		// Set popup so it opens naturally
		await chrome.action.setPopup({ popup: 'src/Popup/index.html' });
	}
}

// Handle icon click - open sidebar (only fires when popup is cleared)
if (chrome.sidePanel) {
	chrome.action.onClicked.addListener(async (tab) => {
		await chrome.sidePanel.open({ windowId: tab.windowId });
	});
}

// NOTE: Downloads (including folder and filename handling) happen entirely in the panel - see
// components/actions.js. Do NOT add a downloads.onDeterminingFilename listener here: an empty
// suggest() from such a listener discards the filename passed to chrome.downloads.download,
// which renames blob downloads to random GUIDs.
