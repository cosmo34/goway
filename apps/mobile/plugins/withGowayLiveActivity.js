const fs = require('fs');
const path = require('path');
const {
  withXcodeProject,
  withDangerousMod,
  withPodfile,
  withEntitlementsPlist,
} = require('@expo/config-plugins');

const APP_GROUP = 'group.fr.goway.app';
const EXTENSION_NAME = 'GowayLiveActivity';
const EXTENSION_BUNDLE_SUFFIX = '.GowayLiveActivity';

function copyDirectory(source, destination) {
  fs.mkdirSync(destination, { recursive: true });
  for (const entry of fs.readdirSync(source, { withFileTypes: true })) {
    const from = path.join(source, entry.name);
    const to = path.join(destination, entry.name);
    if (entry.isDirectory()) {
      copyDirectory(from, to);
      continue;
    }
    fs.copyFileSync(from, to);
  }
}

function addLiveActivityTarget(project, { extensionDir, bundleIdentifier, deploymentTarget }) {
  const existingTargets = project.pbxNativeTargetSection();
  const alreadyAdded = Object.values(existingTargets).some(
    (target) => target?.name === `"${EXTENSION_NAME}"`
  );
  if (alreadyAdded) return project;

  const target = project.addTarget(EXTENSION_NAME, 'app_extension', EXTENSION_NAME, bundleIdentifier);
  const targetUuid = target.uuid;

  const swiftFile = path.join(EXTENSION_NAME, 'GowayLiveActivity.swift');
  project.addSourceFile(swiftFile, { target: targetUuid }, project.findPBXGroupKey({ name: EXTENSION_NAME }));

  const plistFile = path.join(EXTENSION_NAME, 'Info.plist');
  project.addFile(plistFile, project.findPBXGroupKey({ name: EXTENSION_NAME }));

  const configurations = project.pbxXCBuildConfigurationSection();
  for (const key of Object.keys(configurations)) {
    const config = configurations[key];
    if (config?.buildSettings?.PRODUCT_NAME === `"${EXTENSION_NAME}"`) {
      config.buildSettings.INFOPLIST_FILE = `"${EXTENSION_NAME}/Info.plist"`;
      config.buildSettings.CODE_SIGN_ENTITLEMENTS = `"${EXTENSION_NAME}/GowayLiveActivity.entitlements"`;
      config.buildSettings.IPHONEOS_DEPLOYMENT_TARGET = deploymentTarget;
      config.buildSettings.SWIFT_VERSION = '5.0';
      config.buildSettings.TARGETED_DEVICE_FAMILY = '"1,2"';
      config.buildSettings.CURRENT_PROJECT_VERSION = '1';
      config.buildSettings.MARKETING_VERSION = '1.0';
      config.buildSettings.GENERATE_INFOPLIST_FILE = 'NO';
    }
  }

  const mainTarget = project.getFirstTarget().uuid;
  project.addTargetDependency(mainTarget, [targetUuid]);

  const copyFilesBuildPhase = project.addBuildPhase(
    [],
    'PBXCopyFilesBuildPhase',
    'Embed App Extensions',
    mainTarget,
    'app_extension'
  );
  const extensionProductFile = project.addFile(
    `$(BUILT_PRODUCTS_DIR)/${EXTENSION_NAME}.appex`,
    copyFilesBuildPhase.uuid,
    {
      lastKnownFileType: 'wrapper.app-extension',
      explicitFileType: 'wrapper.app-extension',
    }
  );
  project.addToPbxBuildFileSection(extensionProductFile);

  return project;
}

function withGowayLiveActivity(config) {
  const bundleIdentifier = `${config.ios?.bundleIdentifier ?? 'fr.goway.app'}${EXTENSION_BUNDLE_SUFFIX}`;
  const deploymentTarget = config.ios?.deploymentTarget ?? '16.2';
  const sourceDir = path.join(__dirname, '..', 'ios-widgets', EXTENSION_NAME);

  config = withDangerousMod(config, [
    'ios',
    async (config) => {
      const destination = path.join(config.modRequest.platformProjectRoot, EXTENSION_NAME);
      copyDirectory(sourceDir, destination);
      return config;
    },
  ]);

  config = withPodfile(config, (config) => {
    const marker = '# GOWAY Live Activity';
    if (!config.modResults.contents.includes(marker)) {
      config.modResults.contents += `
${marker}
target '${EXTENSION_NAME}' do
  use_frameworks! :linkage => :static
  pod 'GowayShared', :path => '../modules/goway-shared/ios'
end
`;
    }
    return config;
  });

  config = withXcodeProject(config, (config) => {
    try {
      config.modResults = addLiveActivityTarget(config.modResults, {
        extensionDir: EXTENSION_NAME,
        bundleIdentifier,
        deploymentTarget,
      });
    } catch (error) {
      console.warn('[withGowayLiveActivity] Impossible d’ajouter la cible Xcode:', error);
    }
    return config;
  });

  config = withEntitlementsPlist(config, (config) => {
    const groups = config.modResults['com.apple.security.application-groups'] ?? [];
    if (!groups.includes(APP_GROUP)) {
      config.modResults['com.apple.security.application-groups'] = [...groups, APP_GROUP];
    }
    return config;
  });

  return config;
}

module.exports = withGowayLiveActivity;
