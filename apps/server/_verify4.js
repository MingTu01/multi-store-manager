const AdmZip = require("adm-zip");
const path = require("path");
const zipPath = path.join(__dirname, "..", "..", "multi-shop-link-upgrade-v1.1.48.zip");
const z = new AdmZip(zipPath);

const indexEntry = z.getEntry("server-src/index.ts");
const content = indexEntry.getData().toString("utf8");
const lines = content.split("\n");
console.log("=== index.ts around line 270 ===");
for (let i = 268; i < 285; i++) {
  console.log((i+1) + ": " + lines[i]);
}
