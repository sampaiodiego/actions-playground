const path = require('path');
const { exec } = require('@actions/exec');

(async () => {
  // start release candidate
	await exec('yarn', ['changeset', 'pre', 'enter', 'rc']);

  // bump version of all packages to rc
  await exec('yarn', ['changeset', 'version']);

	// get version from main package
	const { version: newVersion } = require(path.join(__dirname, '..', 'apps', 'backend', 'package.json'));

  const newBranch = `release-${newVersion.split('-')[0]}`;

	console.log('newBranch ->', newBranch);

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
})();
