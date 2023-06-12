import fs from 'fs';

import * as core from '@actions/core';

import { cutFinalRelease } from './cutFinalRelease';
import { setupGitUser } from './gitUtils';
import { bumpNextVersion } from './bumpNextVersion';
import { startPatchRelease } from './startPatchRelease';

// const getOptionalInput = (name: string) => core.getInput(name) || undefined;

(async () => {
	const githubToken = process.env.GITHUB_TOKEN;
	if (!githubToken) {
		core.setFailed('Please add the GITHUB_TOKEN to the changesets action');
		return;
	}

	// const inputCwd = core.getInput('cwd');
	// if (inputCwd) {
	// 	core.info('changing directory to the one given as the input');
	// 	process.chdir(inputCwd);
	// }

	core.info('setting git user');
	await setupGitUser();

	core.info('setting GitHub credentials');
	fs.writeFileSync(
		`${process.env.HOME}/.netrc`,
		`machine github.com\nlogin github-actions[bot]\npassword ${githubToken}`
	);

	const action = core.getInput('action');
	const baseRef = core.getInput('base-ref');

	if (action === 'cut') {
		await cutFinalRelease({ githubToken });
	} else if (action === 'bump') {
		await bumpNextVersion({ githubToken });
	} else if (action === 'patch') {
		await startPatchRelease({ baseRef, githubToken });
	}
})().catch((err) => {
	core.error(err);
	core.setFailed(err.message);
});
