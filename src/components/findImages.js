// @ts-check
// Executed via `chrome.scripting.executeScript` - cannot have imports!

export async function findImages(
	/** @type {{ waitForIdleDOM?: number | false; document?: Document; window?: Window; }} */ {
		waitForIdleDOM,
		...rest
	} = {}
) {
	const context = {
		document: rest.document || document,
		window: /** @type {Window & typeof globalThis} */ (rest.window || window),
	};

	// Clean up any previously created observer and timeout from prior executions
	context.window.__observer?.disconnect();
	clearTimeout(context.window.__idleDomTimer);

	// Wait until the page is fully loaded
	if (context.document.readyState !== 'complete') {
		await new Promise((/** @type {(...args: any[]) => void} */ resolve) => {
			context.window.addEventListener('load', resolve, { once: true });
			// Fallback in case 'load' already fired or for SPAs
			if (context.document.readyState === 'complete') resolve();
		});
	}

	// Maybe wait until DOM is likely idle
	if (waitForIdleDOM !== false && waitForIdleDOM != null && waitForIdleDOM >= 0 && Number.isFinite(waitForIdleDOM)) {
		await new Promise((/** @type {(...args: any[]) => void} */ resolve) => {
			const observer = new context.window.MutationObserver(() => {
				resetTimer(waitForIdleDOM);
			});

			observer.observe(context.document.documentElement, {
				childList: true,
				subtree: true,
				attributes: false,
			});

			context.window.__observer = observer;
			resetTimer(waitForIdleDOM);

			function resetTimer(/** @type {number} */ waitForIdleDOM) {
				clearTimeout(context.window.__idleDomTimer);
				context.window.__idleDomTimer = setTimeout(() => {
					observer.disconnect();
					resolve();
				}, waitForIdleDOM);
			}
		});
	}

	// Source: https://support.google.com/webmasters/answer/2598805?hl=en
	const imageUrlRegex =
		/(?:([^:\/?#]+):)?(?:\/\/([^\/?#]*))?([^?#]*\.(?:bmp|gif|ico|jfif|jpe?g|png|svg|tiff?|webp|avif))(?:\?([^#]*))?(?:#(.*))?/i;

	const videoUrlRegex =
		/(?:([^:\/?#]+):)?(?:\/\/([^\/?#]*))?([^?#]*\.(?:mp4|m4v|webm|ogv|mov|mpe?g|avi|mkv|3gpp?|flv|wmv))(?:\?([^#]*))?(?:#(.*))?/i;

	/** @returns {(Document | ShadowRoot)[]} */
	function getRoots(/** @type {Document} */ root) {
		/** @type {(Document | ShadowRoot)[]} */
		const roots = [root];

		/** @type {Document | ShadowRoot | undefined} */ let current;
		for (let index = 0; index < roots.length; index++) {
			const current = roots[index];
			// Find all potential shadow hosts in this root
			for (const element of current.querySelectorAll('*')) {
				if (element.shadowRoot) {
					roots.push(element.shadowRoot);
				}
			}
		}

		return roots;
	}

	/** @returns {string[]} */
	function extractImagesFromSelector(/** @type {(Document | ShadowRoot)[]} */ roots, /** @type {string} */ selector) {
		const images = /** @type {Set<string>} */ (new Set());

		for (const root of roots) {
			root.querySelectorAll(selector).forEach((element) => {
				const urls = extractImageUrlsFromElement(element);
				urls?.forEach((url) => {
					if (url) {
						images.add(relativeUrlToAbsolute(url));
					}
				});
			});
		}

		return [...images];
	}

	/** @returns {string[] | null | undefined} */
	function extractImageUrlsFromElement(/** @type {Element} */ element) {
		if (element.tagName.toLowerCase() === 'img') {
			const images = [];

			// Extract src
			const src = /** @type {HTMLImageElement}  */ (element).src;
			if (src) {
				const hashIndex = src.indexOf('#');
				images.push(hashIndex >= 0 ? src.slice(0, hashIndex) : src);
			}

			// Extract data-src for lazy loading
			const dataSrc = element.getAttribute?.('data-src');
			if (dataSrc) {
				const hashIndex = dataSrc.indexOf('#');
				images.push(hashIndex >= 0 ? dataSrc.slice(0, hashIndex) : dataSrc);
			}

			// Extract srcset URLs
			const srcset = element.getAttribute?.('srcset');
			if (srcset) {
				const srcsetUrls = extractSrcsetURLs(srcset);
				images.push(...srcsetUrls);
			}

			// Extract data-srcset URLs for lazy loading
			const dataSrcset = element.getAttribute?.('data-srcset');
			if (dataSrcset) {
				const dataSrcsetUrls = extractSrcsetURLs(dataSrcset);
				images.push(...dataSrcsetUrls);
			}

			return images.length > 0 ? images : null;
		}

		if (element.tagName.toLowerCase() === 'image') {
			const src = /** @type {string}  */ (element.getAttribute('xlink:href'));
			if (src) {
				const hashIndex = src.indexOf('#');
				return [hashIndex >= 0 ? src.slice(0, hashIndex) : src];
			}
			return null;
		}

		if (element.tagName.toLowerCase() === 'use') {
			// <use> elements in SVG reference external images via xlink:href
			const href = element.getAttribute?.('xlink:href');
			if (href) {
				const hashIndex = href.indexOf('#');
				return [hashIndex >= 0 ? href.slice(0, hashIndex) : href];
			}
			return null;
		}

		if (element.tagName.toLowerCase() === 'source') {
			// <source> elements in <picture> use srcset for responsive images
			const srcset = element.getAttribute?.('srcset');
			if (srcset) {
				return extractSrcsetURLs(srcset);
			}
			return null;
		}

		if (element.tagName.toLowerCase() === 'video') {
			// The poster attribute of a <video> is an image worth collecting
			const poster = /** @type {HTMLVideoElement} */ (element).poster;
			if (poster && isImageURL(poster)) {
				return [stripHash(poster)];
			}
			return null;
		}

		if (element.tagName.toLowerCase() === 'a') {
			const href = /** @type {HTMLAnchorElement} */ (element).href;
			if (isImageURL(href)) {
				return [href];
			}
		}

		const backgroundImage = context.window.getComputedStyle(element).backgroundImage;
		if (backgroundImage) {
			const parsedURLs = extractURLsFromStyle(backgroundImage);
			// For background images, accept any valid URL (not just ones with image extensions)
			// since the browser will load whatever image is specified
			const validURLs = parsedURLs.filter((url) => isImageURL(url) || isValidBackgroundImageURL(url));
			if (validURLs.length > 0) {
				return validURLs;
			}
		}
	}

	function isImageURL(/** @type {string} */ url) {
		return url.indexOf('data:image') === 0 || imageUrlRegex.test(url);
	}

	function isVideoURL(/** @type {string} */ url) {
		return url.indexOf('data:video') === 0 || videoUrlRegex.test(url);
	}

	function stripHash(/** @type {string} */ url) {
		const hashIndex = url.indexOf('#');
		return hashIndex >= 0 ? url.slice(0, hashIndex) : url;
	}

	/** @returns {string[]} */
	function extractVideosFromSelector(/** @type {(Document | ShadowRoot)[]} */ roots, /** @type {string} */ selector) {
		const videos = /** @type {Set<string>} */ (new Set());

		for (const root of roots) {
			root.querySelectorAll(selector).forEach((element) => {
				const urls = extractVideoUrlsFromElement(element);
				urls?.forEach((url) => {
					if (url) {
						videos.add(relativeUrlToAbsolute(url));
					}
				});
			});
		}

		return [...videos];
	}

	/** @returns {string[] | null} */
	function extractVideoUrlsFromElement(/** @type {Element} */ element) {
		const tagName = element.tagName.toLowerCase();

		if (tagName === 'video') {
			const videos = [];

			// currentSrc reflects the <source> child the browser actually picked
			const currentSrc = /** @type {HTMLVideoElement} */ (element).currentSrc;
			if (currentSrc && currentSrc.indexOf('blob:') !== 0) {
				videos.push(stripHash(currentSrc));
			}

			const src = /** @type {HTMLVideoElement} */ (element).src;
			if (src && src.indexOf('blob:') !== 0) {
				videos.push(stripHash(src));
			}

			// data-src for lazy loading
			const dataSrc = element.getAttribute?.('data-src');
			if (dataSrc && dataSrc.indexOf('blob:') !== 0) {
				videos.push(stripHash(dataSrc));
			}

			return videos.length > 0 ? videos : null;
		}

		if (tagName === 'source') {
			// <source> children of <video> use src (unlike <picture> sources, which use srcset)
			const src = /** @type {HTMLSourceElement} */ (element).src || element.getAttribute?.('src');
			if (!src || src.indexOf('blob:') === 0) return null;

			const type = element.getAttribute?.('type') || '';
			const parentTag = element.parentElement?.tagName.toLowerCase();
			if (type.indexOf('video/') === 0 || parentTag === 'video' || isVideoURL(src)) {
				return [stripHash(src)];
			}
			return null;
		}

		if (tagName === 'a') {
			const href = /** @type {HTMLAnchorElement} */ (element).href;
			if (href && isVideoURL(href)) {
				return [href];
			}
			return null;
		}

		return null;
	}

	// Streaming players (HLS/DASH via Media Source Extensions) give <video> a `blob:` src, so the
	// real media URLs only show up in the network requests the page made
	/** @returns {string[]} */
	function getLoadedResourceURLs() {
		try {
			return context.window.performance.getEntriesByType('resource').map((entry) => entry.name);
		} catch {
			return [];
		}
	}

	// Pinterest streams videos over HLS, but usually also serves them as progressive MP4s. A video
	// is identified by a hash path that appears in its playlist, its poster and the page's data:
	//   https://v1.pinimg.com/videos/iht/hls/bb/b9/de/<hash>.m3u8
	//   https://i.pinimg.com/videos/thumbnails/originals/bb/b9/de/<hash>.0000000.jpg  (poster)
	// The MP4's path varies between videos, and some are HLS-only, so each known variant is
	// checked in turn and videos without one are dropped:
	//   https://v1.pinimg.com/videos/iht/720p/bb/b9/de/<hash>.mp4
	//   https://v1.pinimg.com/videos/iht/expMp4/bb/b9/de/<hash>_720w.mp4
	/** @returns {Promise<string[]>} */
	async function extractPinterestVideos(/** @type {(Document | ShadowRoot)[]} */ roots) {
		const videoRegex = /v\d*\.pinimg\.com\/videos\/([\w-]+)\/[\w-]+\/((?:[0-9a-f]{2}\/){3}[0-9a-f]{32})/gi;
		const posterRegex = /i\.pinimg\.com\/videos\/thumbnails\/originals\/((?:[0-9a-f]{2}\/){3}[0-9a-f]{32})/gi;

		const texts = [...getLoadedResourceURLs()];
		for (const root of roots) {
			// Videos that haven't started playing yet have only fetched their poster
			root.querySelectorAll('video[poster]').forEach((element) => {
				texts.push(/** @type {HTMLVideoElement} */ (element).poster);
			});
			// Pin data (including the MP4 URLs) is embedded in inline scripts
			root.querySelectorAll('script:not([src])').forEach((element) => {
				if (element.textContent?.includes('pinimg.com')) texts.push(element.textContent);
			});
		}

		// Hash path -> directory ("iht", "mc", ...), or '' when only the poster was seen
		const videos = /** @type {Map<string, string>} */ (new Map());
		for (const rawText of texts) {
			// Unescape the slashes of URLs inside inline JSON
			const text = rawText.replace(/\\\/|\\u002F/gi, '/');
			for (const match of text.matchAll(videoRegex)) {
				if (!videos.get(match[2])) videos.set(match[2], match[1]);
			}
			for (const match of text.matchAll(posterRegex)) {
				if (!videos.has(match[1])) videos.set(match[1], '');
			}
		}

		const found = await Promise.all(
			[...videos].slice(0, 100).map(async ([hash, directory]) => {
				for (const dir of directory ? [directory] : ['iht', 'mc']) {
					for (const url of [
						`https://v1.pinimg.com/videos/${dir}/720p/${hash}.mp4`,
						`https://v1.pinimg.com/videos/${dir}/expMp4/${hash}_720w.mp4`,
					]) {
						try {
							const response = await fetch(url, { method: 'HEAD', signal: AbortSignal.timeout(5000) });
							if (response.ok) return url;
						} catch {}
					}
				}
				return '';
			})
		);
		return found.filter(Boolean);
	}

	function extractSrcsetURLs(/** @type {string} */ srcset) {
		// Parse srcset format: "url1 1x, url2 2x, url3 100w"
		// Each candidate has a URL followed by an optional descriptor (width or pixel density)
		return srcset
			.split(',')
			.map((candidate) => {
				const url = candidate.trim().split(/\s+/)[0];
				const hashIndex = url.indexOf('#');
				return hashIndex >= 0 ? url.slice(0, hashIndex) : url;
			})
			.filter((url) => url.length > 0);
	}

	function isValidBackgroundImageURL(/** @type {string} */ url) {
		// Accept any URL that looks like it could be a background image
		// (has a protocol or is protocol-relative or is a blob URL)
		return /^https?:\/\//.test(url) || /^\/\//.test(url) || /^blob:/.test(url);
	}

	function extractURLsFromStyle(/** @type {string} */ style) {
		// Extract all URLs from CSS functions like url() - handles multiple values
		const urls = [];
		const urlRegex = /url\(["']?([^"')]+)["']?\)/g;
		let match;
		while ((match = urlRegex.exec(style)) !== null) {
			urls.push(match[1]);
		}
		return urls;
	}

	function relativeUrlToAbsolute(/** @type {string} */ url) {
		// Only convert root-relative URLs (single /), not protocol-relative URLs (//)
		return url.indexOf('/') === 0 && url.indexOf('//') !== 0 ? `${context.window.location.origin}${url}` : url;
	}

	const roots = getRoots(context.document);
	return {
		allImages: extractImagesFromSelector(roots, 'img, image, video, source, use, a, [class], [style]'),
		linkedImages: extractImagesFromSelector(roots, 'a'), // Do not merge into `allImages` - we want to preserve the order of images from the DOM
		allVideos: [
			...new Set([...extractVideosFromSelector(roots, 'video, source, a'), ...(await extractPinterestVideos(roots))]),
		],
		linkedVideos: extractVideosFromSelector(roots, 'a'),
		origin: context.window.location.origin,
	};
}
