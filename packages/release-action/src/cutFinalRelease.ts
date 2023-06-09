import fs from 'fs';
import path from 'path';

import { exec } from '@actions/exec';
import * as github from '@actions/github';

import { createNpmFile } from './createNpmFile';
import { setupOctokit } from './setupOctokit';
import { getChangelogEntry } from './utils';

export async function cutFinalRelease({ githubToken, cwd = process.cwd() }: { githubToken: string; cwd?: string }) {
	const octokit = setupOctokit(githubToken);

	// TODO do this only if publishing to npm
	await createNpmFile();

	let preRelease = false;
	try {
		fs.accessSync(path.resolve(cwd, '.changeset', 'pre.json'));

		preRelease = true;
	} catch (e) {
		// nothing to do, not a pre release
	}

	if (preRelease) {
		// finish release candidate
		await exec('yarn', ['changeset', 'pre', 'exit']);
	}

	// bump version of all packages to rc
	await exec('yarn', ['changeset', 'version']);


	const mainPackagePath = path.join(cwd, 'apps', 'backend');

	// get version from main package
	const mainPackageJsonPath = path.join(mainPackagePath, 'package.json');
	const { version: newVersion } = require(mainPackageJsonPath);

	const mainPackageChangelog = path.join(mainPackagePath, 'CHANGELOG.md');

	const changelogContents = fs.readFileSync(
		mainPackageChangelog,
		'utf8'
	);
	const changelogEntry = getChangelogEntry(changelogContents, newVersion);
	if (!changelogEntry) {
		// we can find a changelog but not the entry for this version
		// if this is true, something has probably gone wrong
		throw new Error('Could not find changelog entry for version newVersion');
	}

	const releaseBody = changelogEntry.content;

	// update root package.json
	const rootPackageJsonPath = path.resolve(cwd, "package.json");
	const content = fs.readFileSync(rootPackageJsonPath, "utf8");
	const updatedContent = content.replace(
		/"version": ".*",$/m,
		`"version": "${newVersion}",`
	);
	fs.writeFileSync(rootPackageJsonPath, updatedContent);

	await exec("git", ['add', '.']);
	await exec("git", ["commit", "-m", newVersion]);

	await exec('yarn', ['changeset', 'publish']);

	await exec("git", [
		"push",
		"--follow-tags",
	]);

	await octokit.rest.repos.createRelease({
		name: newVersion,
		tag_name: newVersion,
		body: releaseBody,
		prerelease: newVersion.includes("-"),
		...github.context.repo,
	});
}
