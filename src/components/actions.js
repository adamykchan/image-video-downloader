// @ts-check
import { removeSpecialCharacters } from '../utils.js';
import { folderName, newFileName } from './data.js';
import { addDownloadRefererRules, getActiveTabUrl, removeRefererRules } from './refererRules.js';
import { mimeExtensions } from './useImageStats.js';

// Some CDNs reject requests without a Referer header (hotlink protection / WAFs), so the current
// page's URL is temporarily set as the Referer via declarativeNetRequest while downloading.
// Those rules only affect fetches made from extension pages - requests started by
// `chrome.downloads.download` bypass declarativeNetRequest entirely - which is why each file is
// fetched here first and then handed to `chrome.downloads` as a blob.
export const downloadImages = async (/** @type {string[]} */ imagesToDownload) => {
	if (!chrome.downloads) return; // e.g. the web dev harness

	const options = {
		folder_name: folderName.value,
		new_file_name: newFileName.value,
	};

	const referer = await getActiveTabUrl();
	const ruleIds = await addDownloadRefererRules(imagesToDownload, referer);

	try {
		// Fetch a few files at a time to limit memory usage
		let nextIndex = 0;
		const workers = Array.from({ length: Math.min(3, imagesToDownload.length) }, async () => {
			while (nextIndex < imagesToDownload.length) {
				const index = nextIndex++;
				await downloadImage(imagesToDownload[index], index, imagesToDownload.length, options);
			}
		});
		await Promise.allSettled(workers);
	} finally {
		removeRefererRules(ruleIds);
	}
};

/** @typedef {{ folder_name: string, new_file_name: string }} DownloadOptions */

async function downloadImage(
	/** @type {string} */ url,
	/** @type {number} */ index,
	/** @type {number} */ total,
	/** @type {DownloadOptions} */ options
) {
	try {
		const response = await fetch(url);
		if (!response.ok) throw new Error(`HTTP ${response.status}`);

		const blob = await response.blob();
		const objectUrl = URL.createObjectURL(blob);
		await startDownload(objectUrl, buildFilename(url, index, total, options, blob.type));
		// Revoke later - the download reads from the object URL after it starts
		setTimeout(() => URL.revokeObjectURL(objectUrl), 60_000);
	} catch {
		// Fall back to downloading the URL directly (e.g. for URLs fetch cannot access)
		await startDownload(url, buildFilename(url, index, total, options, ''));
	}
}

function startDownload(/** @type {string} */ url, /** @type {string} */ filename) {
	return new Promise((/** @type {(downloadId?: number) => void} */ resolve) => {
		chrome.downloads.download(filename ? { url, filename, conflictAction: 'uniquify' } : { url }, (downloadId) => {
			if (downloadId == null && chrome.runtime.lastError) {
				if (filename) {
					// The derived filename was rejected - retry with a plain name, keeping the extension
					const extension = /\.([a-zA-Z0-9]{1,8})$/.exec(filename)?.[1];
					const fallback = `download${extension ? `.${extension}` : ''}`;
					console.warn(`${url}: ${chrome.runtime.lastError.message} - retrying as ${fallback}`);
					chrome.downloads.download({ url, filename: fallback, conflictAction: 'uniquify' }, (retryId) => {
						if (retryId == null && chrome.runtime.lastError) {
							console.error(`${url}:`, chrome.runtime.lastError.message);
							// Last resort - let the browser pick a name
							chrome.downloads.download({ url }, resolve);
							return;
						}
						resolve(retryId);
					});
					return;
				}
				console.error(`${url}:`, chrome.runtime.lastError.message);
			}
			resolve(downloadId);
		});
	});
}

/** @returns {string} */
function buildFilename(
	/** @type {string} */ url,
	/** @type {number} */ index,
	/** @type {number} */ total,
	/** @type {DownloadOptions} */ options,
	/** @type {string} */ mimeType
) {
	let base = '';
	try {
		base = decodeURIComponent(new URL(url).pathname.split('/').pop() || '');
	} catch {
		// data: and other non-hierarchical URLs have no usable path
	}
	// Strip characters that Windows/Chrome reject in filenames, including leading/trailing dots and spaces
	base = removeSpecialCharacters(base)
		.replace(/[\\/]/g, '')
		.replace(/^[.\s]+/, '')
		.replace(/[.\s]+$/, '');

	let extension = /\.([a-zA-Z0-9]{1,8})$/.exec(base)?.[1]?.toLowerCase() || '';
	if (!extension && mimeType) {
		extension = mimeExtensions[mimeType.split(';')[0].trim().toLowerCase()] || '';
		if (extension) {
			base = `${base || 'download'}.${extension}`;
		}
	}
	if (!base) {
		// Nothing to name the file by - let the browser pick, unless a folder/rename is configured
		if (!options.folder_name && !options.new_file_name) return '';
		base = 'download';
	}

	let filename = '';
	if (options.folder_name) {
		filename += `${options.folder_name}/`;
	}

	if (options.new_file_name) {
		const numberOfDigits = `${total}`.length;
		const formattedImageNumber = `${index + 1}`.padStart(numberOfDigits, '0');
		filename += `${options.new_file_name}${formattedImageNumber}${extension ? `.${extension}` : ''}`;
	} else {
		filename += base;
	}

	return filename.replace(/\\/g, '/').replace(/\/{2,}/g, '/');
}
