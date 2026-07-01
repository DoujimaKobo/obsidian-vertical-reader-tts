import { readFileSync, writeFileSync } from "fs";

// Read the target version from npm (set by `npm version`) or the manifest.
const targetVersion = process.env.npm_package_version;

// Update manifest.json with the new version, keeping minAppVersion in sync.
const manifest = JSON.parse(readFileSync("manifest.json", "utf8"));
const { minAppVersion } = manifest;
manifest.version = targetVersion;
writeFileSync("manifest.json", JSON.stringify(manifest, null, "\t") + "\n");

// Record the version -> minAppVersion mapping in versions.json so older
// Obsidian installs know which plugin release they can use.
const versions = JSON.parse(readFileSync("versions.json", "utf8"));
versions[targetVersion] = minAppVersion;
writeFileSync("versions.json", JSON.stringify(versions, null, "\t") + "\n");
