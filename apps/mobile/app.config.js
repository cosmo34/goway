const APP_VARIANT = process.env.APP_VARIANT || 'production';
const isPersonal = APP_VARIANT === 'personal';
const skipLiveActivity = process.env.SKIP_LIVE_ACTIVITY === '1';

const base = require('./app.json').expo;

const productionPlugins = base.plugins.filter((plugin) => {
  if (!skipLiveActivity) return true;
  const name = Array.isArray(plugin) ? plugin[0] : plugin;
  return name !== './plugins/withGowayLiveActivity.js';
});
const personalPlugins = productionPlugins.filter((plugin) => {
  const name = Array.isArray(plugin) ? plugin[0] : plugin;
  return (
    name !== 'expo-notifications' &&
    name !== './plugins/withGowayNative.js' &&
    name !== './plugins/withGowayLiveActivity.js'
  );
});

const personalInfoPlist = {
  ...base.ios.infoPlist,
  NSSupportsLiveActivities: false,
  NSSupportsLiveActivitiesFrequentUpdates: false,
  UIBackgroundModes: ['location', 'fetch'],
};

const productionInfoPlist = skipLiveActivity
  ? {
      ...base.ios.infoPlist,
      NSSupportsLiveActivities: false,
      NSSupportsLiveActivitiesFrequentUpdates: false,
    }
  : base.ios.infoPlist;

module.exports = {
  expo: {
    ...base,
    name: isPersonal ? 'GOWAY Dev' : base.name,
    ios: {
      ...base.ios,
      bundleIdentifier: isPersonal ? 'fr.goway.app.dev' : base.ios.bundleIdentifier,
      entitlements: isPersonal ? {} : base.ios.entitlements,
      infoPlist: isPersonal ? personalInfoPlist : productionInfoPlist,
    },
    plugins: isPersonal ? personalPlugins : productionPlugins,
  },
};
