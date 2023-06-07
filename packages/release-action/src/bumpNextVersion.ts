
import fs from 'fs';
import path from 'path';

import { exec } from '@actions/exec';
import * as core from '@actions/core';
import * as github from '@actions/github';

import { setupOctokit } from "./setupOctokit";
import { createNpmFile } from './createNpmFile';

export async function bumpNextVersion({ githubToken, cwd = process.cwd() }: { githubToken: string; cwd?: string }) {
	const octokit = setupOctokit(githubToken);

	// TODO do this only if publishing to npm
	await createNpmFile();

	// start release candidate
	await exec('yarn', ['changeset', 'pre', 'enter', 'rc']);

	// bump version of all packages to rc
	await exec('yarn', ['changeset', 'version']);

	// get version from main package
	const mainPackagePath = path.join(cwd, 'apps', 'backend', 'package.json');
	const { version: newVersion } = require(mainPackagePath);

	// TODO get changelog from main package and copy to root package

	const finalVersion = newVersion.split('-')[0];

	const newBranch = `release-${finalVersion}`;

	// update root package.json
	const rootPackageJsonPath = path.join(__dirname, "..", "package.json");
	const content = fs.readFileSync(rootPackageJsonPath, "utf8");
	const updatedContent = content.replace(
		/"version": ".*",$/m,
		`"version": "${newVersion}",`
	);
	fs.writeFileSync(rootPackageJsonPath, updatedContent);

	// TODO check if branch exists
	await exec("git", ["checkout", "-b", newBranch]);

	await exec("git", ['add', '.']);
	await exec("git", ["commit", "-m", newVersion]);

	await exec('yarn', ['changeset', 'publish']);

	await exec("git", [
		"push",
		"--force",
		"--follow-tags",
		"origin",
		`HEAD:refs/heads/${newBranch}`,
	]);

	// TODO create PR body
	if (newVersion.includes('rc.0')) {
		const prBody = 'new release';
		const finalPrTitle = `Release ${finalVersion}`;

		core.info("creating pull request");
		const { data: newPullRequest } = await octokit.rest.pulls.create({
			base: 'master',
			head: newBranch,
			title: finalPrTitle,
			body: prBody,
			...github.context.repo,
		});
	}

	await octokit.rest.repos.createRelease({
		name: newVersion,
		tag_name: newVersion,
		body: '// TODO get changelog \nnew release body',
		prerelease: newVersion.includes("-"),
		...github.context.repo,
	});
}
