const core = require('@actions/core')
const semver = require('semver')
const { exec } = require('child_process');

const requireScript = require('./requireScript')

// get current git branch
const getCurrentBranch = () => {
  return new Promise((resolve, reject) => {
    exec('git rev-parse --abbrev-ref HEAD', (error, stdout, stderr) => {
      if (error) {
        reject(error);
        return;
      }
      if (stderr) {
        reject(new Error(stderr));
        return;
      }
      resolve(stdout.trim());
    });
  });
};

const getPrereleaseFlag = async () => {
  // boolean
  let prerelease = core.getBooleanInput('pre-release')
  let identifier = core.getInput('pre-release-identifier')
  try {
    const currentBranch = await getCurrentBranch();
    const rcMatch = currentBranch.match(/^rc\//);
    const betaMatch = currentBranch.match(/^beta\//);
    
    core.info(`currentBranch - ${currentBranch}`);
    core.info(`rcMatch - ${rcMatch}`);
    core.info(`betaMatch - ${betaMatch}`);
    
    if (rcMatch || betaMatch) {
      prerelease = true;
      identifier = rcMatch ? 'rc' : 'beta';
    }
  } catch (error) {
    core.warning(`Failed to get current git branch: ${error.message}`);
  }
  
  return [prerelease, identifier]
}

const getNextVersion = async (currentVersion, config) => {
  const {
    prerelease, identifier, releaseType
  } = config;
  
  const isUnStableVersion = currentVersion.includes('rc') || currentVersion.includes('beta');
  // working on prerelease version
  const isPrereleasing = prerelease && isUnStableVersion;
  
  core.info(`isPrereleasing: ${isPrereleasing}`);
  core.info(`isUnStableVersion: ${isUnStableVersion}`);
  core.info(`currentVersion: ${currentVersion}`);
  
  if (isPrereleasing) {
    core.info(`bump the suffix version`);
    // if last version include rc or beta, just bump the suffix version
    // 1.2.4-beta.1 => 1.2.4-beta.2
    return semver.inc(currentVersion, `prerelease`, identifier)
  }
  
  // from prelease to stable version
  if (!prerelease && isUnStableVersion) {
    core.info(`bump the release version`);
    // 1.2.4-beta.1 => 1.2.4
    return semver.inc(currentVersion, 'release')
  }
  
  core.info(`bump the ${releaseType} version`);
  return semver.inc(currentVersion, (prerelease ? `pre${releaseType}` : releaseType), identifier)
}

/**
 * Bumps the given version with the given release type
 *
 * @param releaseType
 * @param version
 * @returns {string}
 */
module.exports = async (releaseType, version) => {
  let newVersion

  const [prerelease, identifier] = await getPrereleaseFlag()

  core.info(`prerelease: ${prerelease}`);
  core.info(`prerelease: ${typeof prerelease}`);
  core.info(`identifier: ${identifier}`);

  if (version) {
    newVersion = await getNextVersion(version, { prerelease, identifier, releaseType })
    core.info(`Bumped version from "${version}" to "${newVersion}"`);
  } else {

    const fallbackVersion = core.getInput('fallback-version')

    if (fallbackVersion) {
      newVersion = semver.valid(fallbackVersion)
    }

    if (!newVersion) {
      // default
      newVersion = (prerelease ? `0.1.0-${identifier}.0` : '0.1.0')
    }

    core.info(`The version could not be detected, using fallback version '${newVersion}'.`)
  }

  const preChangelogGenerationFile = core.getInput('pre-changelog-generation')

  if (preChangelogGenerationFile) {
    const preChangelogGenerationScript = requireScript(preChangelogGenerationFile)

    // Double check if we want to update / do something with the version
    if (preChangelogGenerationScript && preChangelogGenerationScript.preVersionGeneration) {
      const modifiedVersion = await preChangelogGenerationScript.preVersionGeneration(newVersion)

      if (modifiedVersion) {
        core.info(`Using modified version "${modifiedVersion}"`)
        newVersion = modifiedVersion
      }
    }
  }

  return newVersion
}
