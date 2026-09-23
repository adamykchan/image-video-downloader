#!/bin/bash
# Installs or updates Image Downloader (with videos) from the latest GitHub release - macOS version
# of update-image-downloader.ps1.
#
# The extension goes into an image-video-downloader folder next to this script, so one folder can
# hold updaters for several extensions. Load that folder once with "Load unpacked" in
# chrome://extensions. After each update, click the reload button on the extension's card. Keep
# the script in the same place - Chrome ties the extension's identity (and saved settings) to the
# folder path.
#
# Usage (in Terminal):
#   bash update-image-downloader.command [--force] [install folder]
# Or make it double-clickable in Finder once with: chmod +x update-image-downloader.command

set -euo pipefail

REPO='adamykchan/image-video-downloader'
FORCE=0
INSTALL_DIR="$(cd "$(dirname "$0")" && pwd)/image-video-downloader"

# ${1+"$@"} instead of "$@" - older bash (macOS ships 3.2) rejects an empty "$@" under set -u
for arg in ${1+"$@"}; do
	case "$arg" in
		# Reinstall even if the latest version is already installed
		--force) FORCE=1 ;;
		*) INSTALL_DIR="$arg" ;;
	esac
done

fail() {
	echo "Error: $*" >&2
	exit 1
}

# Reads a value from JSON with JavaScript for Automation, which every Mac has built in
# Usage: json_get '<JavaScript expression using `data`>' '<json>'
json_get() {
	osascript -l JavaScript -e 'function run(argv) { const data = JSON.parse(argv[1]); const value = eval(argv[0]); return value == null ? "" : String(value); }' "$1" "$2"
}

echo "Checking the latest release of $REPO..."
response=$(curl -sSL -w '\n%{http_code}' -H 'User-Agent: image-video-downloader-updater' "https://api.github.com/repos/$REPO/releases/latest") ||
	fail "Couldn't reach GitHub. Check your internet connection."
status="${response##*$'\n'}"
release="${response%$'\n'*}"

if [ "$status" = 200 ]; then
	tag=$(json_get 'data.tag_name' "$release")
	# The built extension - not GitHub's automatic "Source code" archives, which aren't listed as assets
	find_zip='data.assets.find((asset) => asset.name.endsWith(".zip"))'
	asset_name=$(json_get "($find_zip || {}).name" "$release")
	asset_url=$(json_get "($find_zip || {}).browser_download_url" "$release")
	asset_digest=$(json_get "($find_zip || {}).digest" "$release")
	[ -n "$asset_url" ] || fail "Release $tag has no .zip file attached."
else
	case "$release" in *"rate limit"*) ;; *) fail "GitHub returned an error (HTTP $status). Try again later." ;; esac

	# GitHub's API allows only 60 checks per hour per internet connection, shared by everyone on it
	# (e.g. on a VPN). The regular release pages aren't limited that way, but don't publish checksums
	echo 'GitHub is limiting update checks, so using the release page instead (without checksum verification)...'
	# Redirects to .../releases/tag/<tag>
	page=$(curl -fsSLI -o /dev/null -w '%{url_effective}' "https://github.com/$REPO/releases/latest") ||
		fail "Couldn't reach GitHub. Check your internet connection."
	tag="${page##*/}"
	case "$tag" in v[0-9]*) ;; *) fail "Couldn't find the latest release of $REPO." ;; esac
	# The name `bun run build` gives the zip
	asset_name="image-video-downloader-$tag.zip"
	asset_url="https://github.com/$REPO/releases/download/$tag/$asset_name"
	asset_digest=''
fi

# Release tags are the manifest version with a "v" in front, e.g. v4.5.3.1
latest="${tag#v}"

# The installed version, whether it was installed by this script or unzipped by hand
installed=''
if [ -f "$INSTALL_DIR/manifest.json" ]; then
	installed=$(json_get '/^Image Downloader/.test(data.name) ? data.version : ""' "$(cat "$INSTALL_DIR/manifest.json")") || installed=''
fi

# Refuse to empty a folder that isn't an install of this extension
if [ -z "$installed" ] && [ -d "$INSTALL_DIR" ] && [ -n "$(ls -A "$INSTALL_DIR")" ]; then
	fail "$INSTALL_DIR isn't empty and doesn't contain this extension. Pass an empty folder instead."
fi

if [ "$installed" = "$latest" ] && [ "$FORCE" -eq 0 ]; then
	echo "Already up to date ($latest) in $INSTALL_DIR"
	exit 0
fi

temp=$(mktemp -d)
trap 'rm -rf "$temp"' EXIT

echo "Downloading $asset_name..."
curl -fsSL -o "$temp/release.zip" "$asset_url" || fail "Couldn't download $asset_name from release $tag. Try again."

# GitHub publishes a SHA-256 checksum for each release file
case "$asset_digest" in
	sha256:*)
		actual=$(shasum -a 256 "$temp/release.zip" | cut -d ' ' -f 1)
		[ "$actual" = "${asset_digest#sha256:}" ] || fail "Downloaded file is corrupted (checksum mismatch). Try again."
		;;
esac

# Exit code 1 means warnings only (e.g. zips made by Windows PowerShell, which use backslashes)
unzip -q "$temp/release.zip" -d "$temp/extracted" || [ $? -eq 1 ] || fail "Couldn't unzip $asset_name - the download may be damaged. Try again."
[ -f "$temp/extracted/manifest.json" ] || fail "$asset_name doesn't contain an extension (no manifest.json)."

# Replace the contents but keep the folder itself, so Chrome keeps the same extension
mkdir -p "$INSTALL_DIR"
find "$INSTALL_DIR" -mindepth 1 -delete
cp -R "$temp/extracted/." "$INSTALL_DIR/"

if [ -n "$installed" ]; then
	echo "Updated $installed -> $latest in $INSTALL_DIR"
	echo 'Now open chrome://extensions and click the reload button on the extension.'
	echo '(If you have never loaded this folder in Chrome, use "Load unpacked" instead.)'
else
	echo "Installed $latest in $INSTALL_DIR"
	echo 'Now open chrome://extensions, turn on Developer mode, click "Load unpacked" and pick that folder.'
	echo 'Tip: in the folder picker, press Cmd+Shift+G and paste the folder path above.'
fi
