/**
 * Persists iOS Podfile workarounds through `expo prebuild`.
 *
 * Fix: Xcode 26.x + fmt 11.x consteval errors → compile fmt pod as C++17
 */
const { withDangerousMod } = require("@expo/config-plugins");
const fs = require("fs");
const path = require("path");

const MARKER = "# @moo/ios-xcode-fixes";

function applyPodfileFixes(contents) {
  if (contents.includes(MARKER)) {
    return contents;
  }

  const postInstallPatch = `
    ${MARKER} begin
    installer.pods_project.targets.each do |target|
      next unless target.name == 'fmt'

      target.build_configurations.each do |config|
        config.build_settings['CLANG_CXX_LANGUAGE_STANDARD'] = 'c++17'
      end
    end
    ${MARKER} end
`;

  const anchor =
    "          config.build_settings['CODE_SIGNING_ALLOWED'] = 'NO'\n" +
    "        end\n" +
    "      end\n" +
    "    end";

  if (!contents.includes(anchor)) {
    throw new Error(
      "withIosXcodeFixes: Could not find Podfile post_install anchor. Expo Podfile layout may have changed.",
    );
  }

  return contents.replace(anchor, `${anchor}${postInstallPatch}`);
}

function withIosXcodeFixes(config) {
  return withDangerousMod(config, [
    "ios",
    async (config) => {
      const podfilePath = path.join(config.modRequest.platformProjectRoot, "Podfile");
      const original = fs.readFileSync(podfilePath, "utf8");
      const updated = applyPodfileFixes(original);

      if (updated !== original) {
        fs.writeFileSync(podfilePath, updated);
      }

      return config;
    },
  ]);
}

module.exports = withIosXcodeFixes;
