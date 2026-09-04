const { withEntitlementsPlist, withInfoPlist } = require('@expo/config-plugins');

const APP_GROUP = 'group.fr.goway.app';

function withGowayNative(config) {
  config = withEntitlementsPlist(config, (config) => {
    config.modResults['com.apple.security.application-groups'] = [APP_GROUP];
    return config;
  });

  config = withInfoPlist(config, (config) => {
    config.modResults.NSSupportsLiveActivities = true;
    config.modResults.NSSupportsLiveActivitiesFrequentUpdates = true;
    return config;
  });

  return config;
}

module.exports = withGowayNative;
