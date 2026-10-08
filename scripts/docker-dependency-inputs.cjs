const fs = require("node:fs");
const path = require("node:path");
const process = require("node:process");
const output = process.argv[2];
fs.mkdirSync(output, { recursive: true });
function copyManifests(directory) {
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const source = path.join(directory, entry.name);
    if (entry.isDirectory() && !["node_modules", ".git", ".next", ".turbo"].includes(entry.name)) {
      copyManifests(source);
    } else if (entry.isFile() && entry.name === "package.json") {
      const target = path.join(output, source);
      fs.mkdirSync(path.dirname(target), { recursive: true });
      fs.copyFileSync(source, target);
    }
  }
}
for (const directory of ["apps", "packages", "example-apps"]) copyManifests(directory);
const manifest = JSON.parse(fs.readFileSync("package.json", "utf8"));
// Workspace generation needs source files and runs after the dependency layer.
delete manifest.scripts.postinstall;
fs.writeFileSync(path.join(output, "package.json"), `${JSON.stringify(manifest, null, 2)}\n`);
fs.copyFileSync("yarn.lock", path.join(output, "yarn.lock"));
