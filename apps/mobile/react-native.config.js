module.exports = {
  dependencies: {
    // RN autolinking reads expo's namespace as "expo.core" but the class lives at "expo.modules".
    // Override the import path so PackageList.java uses the correct package.
    expo: {
      platforms: {
        android: {
          packageImportPath: 'import expo.modules.ExpoModulesPackage;',
          packageInstance: 'new ExpoModulesPackage()',
        },
      },
    },
  },
};
