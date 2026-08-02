import type { Configuration } from "electron-builder";
import baseConfig from "./electron-builder.config";

const config: Configuration = {
  ...baseConfig,
  appId: "top.mopelotus.splayer-next-tuneweave-beta",
  productName: "SPlayer-Next-TuneWeave-Beta",
  directories: {
    ...baseConfig.directories,
    output: "dist/tuneweave-beta",
  },
  extraMetadata: {
    version: "1.0.0-tuneweave-beta.1",
  },
  win: {
    ...baseConfig.win,
    executableName: "SPlayer-Next-TuneWeave-Beta",
    artifactName: "${productName}-${version}-${arch}.${ext}",
  },
  nsis: {
    ...baseConfig.nsis,
    guid: "top.mopelotus.splayer-next-tuneweave-beta",
    shortcutName: "SPlayer Next TuneWeave Beta",
    uninstallDisplayName: "SPlayer Next TuneWeave Beta",
    artifactName: "${productName}-${version}-${arch}-setup.${ext}",
  },
  portable: {
    ...baseConfig.portable,
    artifactName: "${productName}-${version}-${arch}-portable.${ext}",
  },
  publish: undefined,
};

export default config;
