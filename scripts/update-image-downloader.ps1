# Installs or updates Image Downloader (with videos) from the latest GitHub release.
#
# The extension goes into an image-video-downloader folder next to this script, so one folder can
# hold updaters for several extensions. Load that folder once with "Load unpacked" in
# chrome://extensions. After each update, click the reload button on the extension's card. Keep
# the script in the same place - Chrome ties the extension's identity (and saved settings) to the
# folder path.
#
# Usage:
#   powershell -ExecutionPolicy Bypass -File update-image-downloader.ps1 [-InstallDir <folder>] [-Force]

param(
	[string]$InstallDir = (Join-Path $PSScriptRoot 'image-video-downloader'),
	# Reinstall even if the latest version is already installed
	[switch]$Force
)

$ErrorActionPreference = 'Stop'
# Show errors as one readable line instead of PowerShell's stack details
trap {
	Write-Host "Error: $($_.Exception.Message)" -ForegroundColor Red
	exit 1
}
$ProgressPreference = 'SilentlyContinue' # The progress bar makes Invoke-WebRequest very slow in Windows PowerShell

$Repo = 'adamykchan/image-video-downloader'
$ManifestPath = Join-Path $InstallDir 'manifest.json'

# Windows PowerShell 5.1 doesn't enable TLS 1.2 by default, which GitHub requires
[Net.ServicePointManager]::SecurityProtocol = [Net.ServicePointManager]::SecurityProtocol -bor [Net.SecurityProtocolType]::Tls12

Write-Host "Checking the latest release of $Repo..."
$release = $null
try {
	$release = Invoke-RestMethod -Uri "https://api.github.com/repos/$Repo/releases/latest" -Headers @{ 'User-Agent' = 'image-video-downloader-updater' }
} catch {
	if ($_.ErrorDetails.Message -notmatch 'rate limit') { throw "Couldn't reach GitHub. Check your internet connection. ($($_.Exception.Message))" }
}

if ($release) {
	$tag = $release.tag_name
	# The built extension - not GitHub's automatic "Source code" archives, which aren't listed as assets
	$asset = $release.assets | Where-Object { $_.name -like '*.zip' } | Select-Object -First 1
	if (-not $asset) { throw "Release $tag has no .zip file attached." }
	$zipName = $asset.name
	$zipUrl = $asset.browser_download_url
	$digest = $asset.digest
} else {
	# GitHub's API allows only 60 checks per hour per internet connection, shared by everyone on it
	# (e.g. on a VPN). The regular release pages aren't limited that way, but don't publish checksums
	Write-Host 'GitHub is limiting update checks, so using the release page instead (without checksum verification)...'
	$page = Invoke-WebRequest -Uri "https://github.com/$Repo/releases/latest" -Method Head -UseBasicParsing
	# Redirects to .../releases/tag/<tag>
	$tag = ($page.BaseResponse.ResponseUri.AbsolutePath -split '/')[-1]
	if ($tag -notmatch '^v\d') { throw "Couldn't find the latest release of $Repo." }
	# The name `bun run build` gives the zip
	$zipName = "image-video-downloader-$tag.zip"
	$zipUrl = "https://github.com/$Repo/releases/download/$tag/$zipName"
	$digest = ''
}

# Release tags are the manifest version with a "v" in front, e.g. v4.5.3.1
$latest = $tag -replace '^v', ''

# The installed version, whether it was installed by this script or unzipped by hand
$manifest = if (Test-Path $ManifestPath) { Get-Content $ManifestPath -Raw | ConvertFrom-Json } else { $null }
$installed = if ($manifest -and $manifest.name -like 'Image Downloader*') { $manifest.version } else { '' }

# Refuse to empty a folder that isn't an install of this extension
if (-not $installed -and (Test-Path $InstallDir) -and (Get-ChildItem $InstallDir -Force | Select-Object -First 1)) {
	throw "$InstallDir isn't empty and doesn't contain this extension. Pick an empty folder with -InstallDir."
}

if ($installed -eq $latest -and -not $Force) {
	Write-Host "Already up to date ($latest) in $InstallDir"
	exit 0
}

$temp = Join-Path ([IO.Path]::GetTempPath()) ("image-video-downloader-" + [guid]::NewGuid())
New-Item -ItemType Directory -Path $temp | Out-Null
try {
	$zipPath = Join-Path $temp $zipName
	Write-Host "Downloading $zipName..."
	try {
		Invoke-WebRequest -Uri $zipUrl -OutFile $zipPath -UseBasicParsing
	} catch {
		throw "Couldn't download $zipName from release $tag. ($($_.Exception.Message))"
	}

	# GitHub publishes a SHA-256 checksum for each release file
	if ($digest -match '^sha256:(.+)$') {
		$actual = (Get-FileHash $zipPath -Algorithm SHA256).Hash
		if ($actual -ne $Matches[1]) { throw "Downloaded file is corrupted (checksum mismatch). Try again." }
	}

	$extracted = Join-Path $temp 'extracted'
	try {
		Expand-Archive -Path $zipPath -DestinationPath $extracted
	} catch {
		throw "Couldn't unzip $zipName - the download may be damaged. Try again."
	}
	if (-not (Test-Path (Join-Path $extracted 'manifest.json'))) { throw "$zipName doesn't contain an extension (no manifest.json)." }

	# Replace the contents but keep the folder itself, so Chrome keeps the same extension
	New-Item -ItemType Directory -Path $InstallDir -Force | Out-Null
	Get-ChildItem $InstallDir -Force | Remove-Item -Recurse -Force
	Copy-Item -Path (Join-Path $extracted '*') -Destination $InstallDir -Recurse
} finally {
	Remove-Item $temp -Recurse -Force -ErrorAction SilentlyContinue
}

if ($installed) {
	Write-Host "Updated $installed -> $latest in $InstallDir"
	Write-Host 'Now open chrome://extensions and click the reload button on the extension.'
	Write-Host '(If you have never loaded this folder in Chrome, use "Load unpacked" instead.)'
} else {
	Write-Host "Installed $latest in $InstallDir"
	Write-Host 'Now open chrome://extensions, turn on Developer mode, click "Load unpacked" and pick that folder.'
}
