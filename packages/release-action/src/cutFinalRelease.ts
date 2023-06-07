import fs from 'fs';
import path from 'path';

import { exec } from '@actions/exec';
import github from '@actions/github';

import { createNpmFile } from './createNpmFile';
import { setupOctokit } from './setupOctokit';

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

	// get version from main package
	const { version: newVersion } = require(path.resolve(cwd, 'apps', 'backend', 'package.json'));

	// TODO get changelog from main package and copy to root package

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
		body: '// TODO get changelog \nnew release body',
		prerelease: newVersion.includes("-"),
		...github.context.repo,
	});
}
