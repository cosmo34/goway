const APP_VARIANT = process.env.APP_VARIANT || 'production';
const isPersonal = APP_VARIANT === 'personal';

const base = require('./app.json').expo;

const productionPlugins = base.plugins;
const personalPlugins = productionPlugins.filter((plugin) => {
  const name = Array.isArray(plugin) ? plugin[0] : plugin;
  return (
    name !== 'expo-notifications' &&
    name !== './plugins/withGowayNative.js' &&
    name !== './plugins/withGowayLiveActivity.js'
  );
});

module.exports = {
  expo: {
    ...base,
    name: isPersonal ? 'GOWAY Dev' : base.name,
    ios: {
      ...base.ios,
      bundleIdentifier: isPersonal ? 'fr.goway.app.dev' : base.ios.bundleIdentifier,
      entitlements: isPersonal ? {} : base.ios.entitlements,
      infoPlist: isPersonal
        ? {
            ...base.ios.infoPlist,
            NSSupportsLiveActivities: false,
            NSSupportsLiveActivitiesFrequentUpdates: false,
            UIBackgroundModes: ['location', 'fetch'],
          }
        : base.ios.infoPlist,
    },
    plugins: isPersonal ? personalPlugins : productionPlugins,
  },
};
