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

	// TODO create release on github
})();
