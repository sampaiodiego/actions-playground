import path from 'path';

import semver from 'semver';
import { exec } from '@actions/exec';
import * as github from '@actions/github';
import * as core from '@actions/core';

import { setupOctokit } from './setupOctokit';

export async function startPatchRelease({ githubToken, baseRef, cwd = process.cwd() }: { baseRef: string; githubToken: string; cwd?: string }) {
	const octokit = setupOctokit(githubToken);

	await exec("git", ["checkout", baseRef]);

	const mainPackagePath = path.join(cwd, 'apps', 'backend');

	// get version from main package
	const mainPackageJsonPath = path.join(mainPackagePath, 'package.json');
	const { version } = require(mainPackageJsonPath);

	const newVersion = semver.inc(version, 'patch');
	if (!newVersion) {
		throw new Error(`Could not increment version ${version}`);
	}

	const newBranch = `release-${newVersion}`;

	// TODO check if branch exists
	await exec("git", ["checkout", "-b", newBranch]);

	await exec("git", [
		"push",
		"--force",
		"origin",
		`HEAD:refs/heads/${newBranch}`,
	]);

	// create a pull request only if the patch is for current version
	if (baseRef === 'master') {
		const finalPrTitle = `Release ${newVersion}`;

		core.info("creating pull request");
		const { data: newPullRequest } = await octokit.rest.pulls.create({
			base: 'master',
			head: newBranch,
			title: finalPrTitle,
			body: '',
			...github.context.repo,
		});
	}
}
