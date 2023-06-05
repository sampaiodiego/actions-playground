const fs = require('fs');
const path = require('path');
const { exec } = require('@actions/exec');
const { GitHub, getOctokitOptions } = require("@actions/github/lib/utils");

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

	// start release candidate
	await exec('yarn', ['changeset', 'pre', 'enter', 'rc']);

	// bump version of all packages to rc
	await exec('yarn', ['changeset', 'version']);

	// get version from main package
	const { version: newVersion } = require(path.join(__dirname, '..', 'apps', 'backend', 'package.json'));

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

	// TODO create release on github
})();
