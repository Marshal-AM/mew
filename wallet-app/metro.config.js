const path = require("path");
const { getDefaultConfig } = require("expo/metro-config");

const projectRoot = __dirname;
const monorepoRoot = path.resolve(projectRoot, "..");

/** @type {import('expo/metro-config').MetroConfig} */
const config = getDefaultConfig(projectRoot);

config.watchFolders = [monorepoRoot];
config.resolver.nodeModulesPaths = [
  path.resolve(projectRoot, "node_modules"),
  path.resolve(monorepoRoot, "node_modules"),
];

const pinnedModules = new Set(["react", "react-native"]);
const pinnedPrefixes = ["react/", "react-native/"];

function resolveFromWalletApp(moduleName) {
  try {
    return require.resolve(moduleName, { paths: [projectRoot] });
  } catch {
    return null;
  }
}

const defaultResolveRequest = config.resolver.resolveRequest;
config.resolver.resolveRequest = (context, moduleName, platform) => {
  const pinReact =
    pinnedModules.has(moduleName) ||
    pinnedPrefixes.some((prefix) => moduleName.startsWith(prefix));

  if (pinReact) {
    const filePath = resolveFromWalletApp(moduleName);
    if (filePath) {
      return { type: "sourceFile", filePath };
    }
  }

  if (defaultResolveRequest) {
    return defaultResolveRequest(context, moduleName, platform);
  }
  return context.resolveRequest(context, moduleName, platform);
};

module.exports = config;
