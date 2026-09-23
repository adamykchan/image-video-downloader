/**
 * Zips the build folder into ../image-video-downloader-v<version>.zip, ready to attach to a release.
 *
 * Uses the `zip` command where it exists (macOS, Linux) and Windows' built-in `tar` otherwise.
 * Avoid PowerShell's Compress-Archive - it stores paths with backslashes, which break on macOS.
 */

import fs from 'fs-extra';
import { join, resolve } from 'path';

import * as config from './config';

async function zip() {
	const { version } = await fs.readJson(config.packageJson);
	const output = resolve('..', `image-video-downloader-v${version}.zip`);

	// Name the top-level entries instead of `.`, so paths inside the zip don't start with `./`
	const entries = await fs.readdir(config.build);
	if (!entries.includes('manifest.json')) throw new Error(`No manifest.json in ${config.build} - run the build first`);

	await fs.remove(output);

	const command = Bun.which('zip')
		? ['zip', '-r', '-X', '-q', output, ...entries]
		: // Windows 10+ ships bsdtar, which writes zips with -a. Git Bash's GNU tar can't, so skip PATH
			[join(process.env.SystemRoot || 'C:\\Windows', 'System32', 'tar.exe'), '-a', '-c', '-f', output, ...entries];

	const { exitCode } = Bun.spawnSync(command, { cwd: config.build, stdout: 'inherit', stderr: 'inherit' });
	if (exitCode !== 0) throw new Error(`Zipping failed (exit code ${exitCode})`);

	console.log(`Created ${output}`);
}

zip();
