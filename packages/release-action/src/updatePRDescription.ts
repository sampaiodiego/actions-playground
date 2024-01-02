import fs from 'fs';
import path from 'path';

import * as core from '@actions/core';
import { exec } from '@actions/exec';
import * as github from '@actions/github';

import { setupOctokit } from './setupOctokit';
import { getChangelogEntry, getEngineVersionsMd, readPackageJson } from './utils';

export async function updatePRDescription({
	githubToken,
	mainPackagePath,
	cwd = process.cwd(),
}: {
	githubToken: string;
	mainPackagePath: string;
	cwd?: string;
}) {
	const octokit = setupOctokit(githubToken);

	// generate change logs from changesets
	await exec('yarn', ['changeset', 'version']);

	console.log('mainPackagePath ->', mainPackagePath);

	// get version from main package
	const { version: newVersion } = await readPackageJson(mainPackagePath);

	// console.log('newVersion ->', newVersion);

	const mainPackageChangelog = path.join(mainPackagePath, 'CHANGELOG.md');

	// console.log('mainPackageChangelog ->', mainPackageChangelog);

	const changelogContents = fs.readFileSync(mainPackageChangelog, 'utf8');

	// console.log('changelogContents ->', changelogContents);

	const changelogEntry = getChangelogEntry(changelogContents, newVersion);

	console.log('changelogEntry ->', changelogEntry);
	if (!changelogEntry) {
		// we can find a changelog but not the entry for this version
		// if this is true, something has probably gone wrong
		throw new Error('Could not find changelog entry for version newVersion');
	}

	const releaseBody = (await getEngineVersionsMd(cwd)) + changelogEntry.content;

	// console.log('releaseBody ->', releaseBody);

	core.info('get PR description');
	const result = await octokit.rest.pulls.get({
		pull_number: github.context.issue.number,
		body: releaseBody,
		...github.context.repo,
	});

	console.log('result.data.body ->', result.data.body);

	const oldBody = result.data.body?.replace(/<!-- release-notes-start -->(.|\n)*<!-- release-notes-end -->/m, '').trim();

	console.log('oldBody ->', oldBody);

	core.info('update PR description');
	await octokit.rest.pulls.update({
		owner: github.context.repo.owner,
		repo: github.context.repo.repo,
		pull_number: github.context.issue.number,
		body: `${oldBody}\n\n<!-- release-notes-start -->\n# ${newVersion}\n\n${releaseBody}\n<!-- release-notes-end -->`,
	});
}
