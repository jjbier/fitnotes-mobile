const { getDefaultConfig } = require("expo/metro-config");
const { withNativeWind } = require("nativewind/metro");
const path = require("path");

const projectRoot = __dirname;
const monorepoRoot = path.resolve(projectRoot, "../..");

const config = getDefaultConfig(projectRoot);

// Watch all files in the monorepo
config.watchFolders = [monorepoRoot];

// Let Metro resolve from monorepo packages
config.resolver.nodeModulesPaths = [
  path.resolve(projectRoot, "node_modules"),
  path.resolve(monorepoRoot, "node_modules"),
];

// Force a single copy of React — prevents "hooks of null" when monorepo packages
// (core/database) resolve React from a different pnpm store instance (e.g. React 19 vs 18)
// Only react needs forcing — it has two pnpm store instances (react@18 vs react@19)
// because the web app uses React 19 while mobile uses React 18.
const SINGLE_INSTANCE_MODULES = {
  react: path.resolve(projectRoot, "node_modules/react/index.js"),
  "react/jsx-runtime": path.resolve(projectRoot, "node_modules/react/jsx-runtime.js"),
  "react/jsx-dev-runtime": path.resolve(projectRoot, "node_modules/react/jsx-dev-runtime.js"),
};

// Resolve .js imports to .ts source files (TypeScript ESM convention used in monorepo packages)
const defaultResolver = config.resolver.resolveRequest;
config.resolver.resolveRequest = (context, moduleName, platform) => {
  // Force single React/RN instance across the entire monorepo bundle
  if (SINGLE_INSTANCE_MODULES[moduleName]) {
    return { filePath: SINGLE_INSTANCE_MODULES[moduleName], type: "sourceFile" };
  }
  if (moduleName.endsWith(".js")) {
    const tsName = moduleName.slice(0, -3) + ".ts";
    try {
      return context.resolveRequest(context, tsName, platform);
    } catch (_) {}
    const tsxName = moduleName.slice(0, -3) + ".tsx";
    try {
      return context.resolveRequest(context, tsxName, platform);
    } catch (_) {}
  }
  if (defaultResolver) return defaultResolver(context, moduleName, platform);
  return context.resolveRequest(context, moduleName, platform);
};

module.exports = withNativeWind(config, { input: "./global.css" });
