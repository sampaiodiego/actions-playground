const fs = require('fs');
const path = require('path');
const { exec } = require('@actions/exec');
const { GitHub, getOctokitOptions } = require("@actions/github/lib/utils");
const { throttling } = require("@octokit/plugin-throttling");
const core = require('@actions/core');
const github = require('@actions/github');

const setupUser = async () => {
	await exec("git", [
		"config",
		"user.name",
		`"github-actions[bot]"`,
	]);
	await exec("git", [
		"config",
		"user.email",
		`"github-actions[bot]@users.noreply.github.com"`,
	]);
};

const setupOctokit = (githubToken) => {
	return new (GitHub.plugin(throttling))(
		getOctokitOptions(githubToken, {
			throttle: {
				onRateLimit: (retryAfter, options, octokit, retryCount) => {
					core.warning(
						`Request quota exhausted for request ${options.method} ${options.url}`
					);

					if (retryCount <= 2) {
						core.info(`Retrying after ${retryAfter} seconds!`);
						return true;
					}
				},
				onSecondaryRateLimit: (
					retryAfter,
					options,
					octokit,
					retryCount
				) => {
					core.warning(
						`SecondaryRateLimit detected for request ${options.method} ${options.url}`
					);

					if (retryCount <= 2) {
						core.info(`Retrying after ${retryAfter} seconds!`);
						return true;
					}
				},
			},
		})
	);
};

(async () => {
	const githubToken = process.env.GITHUB_TOKEN;
	if (!githubToken) {
		core.setFailed("Please add the GITHUB_TOKEN to the action");
		return;
	}

	await setupUser();
	const octokit = setupOctokit(githubToken);

	let preRelease = false;
	try {
		fs.accessSync(path.resolve(__dirname, '..', '.changeset', 'pre.json'));

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
	const { version: newVersion } = require(path.resolve(__dirname, '..', 'apps', 'backend', 'package.json'));

	// TODO get changelog from main package and copy to root package

	// update root package.json
	const rootPackageJsonPath = path.resolve(__dirname, "..", "package.json");
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
})();
