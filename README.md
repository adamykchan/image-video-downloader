<h1 align="center">
  <img src="images/logo.svg" alt="Image Downloader logo" height="40" valign="middle" />
  &nbsp;Image Downloader (with videos)
</h1>

<h2 align="center">
  Browse and download images and videos on the web
  <br />
  <br />
</h2>

This is a fork of [Image Downloader](https://github.com/PactInteractive/image-downloader) by Vladimir Sabev that adds support for finding and downloading videos. It isn't affiliated with or endorsed by the original author.

To learn how to use the extension, check out the [User Guide](USERGUIDE.md). Everything in it still applies, and the video features are listed [below](#changes-from-the-original).

## Install
This version isn't on the Chrome Web Store, and extensions installed this way don't update automatically. Pick one of the options below.

Requires Chrome 121 or newer. Tested on Google Chrome. Microsoft Edge and Brave should work but haven't been tested.

### Option 1: Update script (recommended)
The script downloads the latest release for you, so updating takes one double-click. It checks each download's checksum before installing it, and if you're already on the latest version, it says so and changes nothing.

#### Windows
**First time:**
1. Download [`update-extension.cmd`](scripts/update-extension.cmd) and [`update-extension.ps1`](scripts/update-extension.ps1) (open each one and click **Download raw file**) and save both in the same folder
2. Double-click `update-extension.cmd`. It installs the extension into `%USERPROFILE%\Extensions\image-video-downloader`
3. Open `chrome://extensions`, enable **Developer mode**, click **Load unpacked** and pick that folder

**To update:** double-click `update-extension.cmd` again, then click the reload button (↻) on the extension's card in `chrome://extensions`.

The first time you run it, Windows may warn that the file came from the internet - click **More info**, then **Run anyway**.

#### macOS
**First time:**
1. Download [`update-extension.command`](scripts/update-extension.command) (open it and click **Download raw file**) into your Downloads folder
2. Open **Terminal** and run these two commands. The first makes the script double-clickable, the second runs it:
    ```bash
    chmod +x ~/Downloads/update-extension.command
    ~/Downloads/update-extension.command
    ```
    It installs the extension into `~/Extensions/image-video-downloader` (the `Extensions` folder in your home folder)
3. Open `chrome://extensions`, enable **Developer mode**, click **Load unpacked** and pick that folder. In the folder picker, press **Cmd+Shift+G** and paste `~/Extensions/image-video-downloader`

**To update:** double-click `update-extension.command` in Finder (or run it in Terminal again), then click the reload button (↻) on the extension's card. If macOS says it can't be opened because it's from an unidentified developer, right-click the file, choose **Open**, then **Open** again - you only need to do this once.

### Option 2: Manual
1. Download the `.zip` file of the [latest release](https://github.com/adamykchan/image-video-downloader/releases/latest) and unzip it into a folder you'll keep
2. Open the extension list in your browser: `chrome://extensions` (`edge://extensions` or `brave://extensions` also work)
3. Enable **Developer mode**
4. Click the **Load unpacked** button and pick the unzipped folder

**To update:** unzip the new release into the same folder, replacing the old files, then click the reload button (↻) on the extension's card.

Always update into the same folder - Chrome ties the extension (and your saved settings) to the folder's location.

## Changes from the original
Modified from Image Downloader 4.5.3 on 2026-09-23 (first released as version 4.5.3.1):
- **Finds videos on the page**: `<video>` and `<source>` elements, direct links to video files (mp4, webm, mov, mkv, avi and more), and video files loaded by streaming players
- **Pinterest videos**: finds the downloadable MP4 behind Pinterest's streaming player
- **Video previews**: videos appear in the grid with a ▶ badge and play silently when you hover over them. Videos are listed first.
- **"Only videos" filter**: a new checkbox under Advanced filters
- **Width/height filters work for videos**, using the video's resolution
- **Downloads from protected sites**: some sites block downloads that don't come from their own pages. The extension now sends the page's address along with its own requests, so those files preview and download correctly. It only affects requests made by the extension itself.
- **Better file names**: downloaded files keep proper names and extensions instead of random ones, and characters Windows doesn't allow are removed

See [Releases](https://github.com/adamykchan/image-video-downloader/releases) for what changed in each version.

## Local development
1. First, install the dependencies:
    ```bash
    bun install
    ```
2. Then you can start the development server which watches for file changes automatically:
    ```bash
    bun start
    ```
    Or alternatively - only run the build once:
    ```bash
    bun run build
    ```
3. Open the extension list in your browser settings: [chrome://extensions](chrome://extensions)
4. Enable **Developer mode**
5. Click the **Load unpacked** button, navigate to the extension root folder and pick the `build` folder
6. Enjoy!

## Test
Run and watch tests related to locally changed files - useful during development:
```bash
bun test --watch
```

Or run all the tests once without watching:
```bash
bun test
```

## License
Same license as the original: GPLv3 with an additional restriction on commercial distribution. See [LICENSE.md](LICENSE.md)

Original work copyright © 2012-2026 Vladimir Sabev
