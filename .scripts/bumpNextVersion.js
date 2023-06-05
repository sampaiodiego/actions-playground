const fs = require('fs');
const path = require('path');
const { exec } = require('@actions/exec');

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

(async () => {
	await setupUser();

	// start release candidate
	await exec('yarn', ['changeset', 'pre', 'enter', 'rc']);

	// bump version of all packages to rc
	await exec('yarn', ['changeset', 'version']);

	// get version from main package
	const { version: newVersion } = require(path.join(__dirname, '..', 'apps', 'backend', 'package.json'));

	const newBranch = `release-${newVersion.split('-')[0]}`;

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

	// TODO create pull request to master on rc.0

	await exec("git", [
		"push",
		"--force",
		"--follow-tags",
		"origin",
		`HEAD:refs/heads/${newBranch}`,
	]);

	// TODO create release on github
})();
