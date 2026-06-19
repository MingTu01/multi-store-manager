const AdmZip = require("adm-zip");
const path = require("path");
const zipPath = path.join(__dirname, "..", "..", "multi-shop-link-upgrade-v1.1.48.zip");
const z = new AdmZip(zipPath);

// Check sse.ts
const sseEntry = z.getEntry("server-src/lib/sse.ts");
if (sseEntry) {
  const content = sseEntry.getData().toString("utf8");
  console.log("sse.ts includes server-ready:", content.includes("server-ready"));
  console.log("sse.ts includes 'system':", content.includes("'system'"));
} else {
  console.log("sse.ts not found in zip");
}

// Check SettingsPage
const spEntry = z.getEntry("web-dist/assets/SettingsPage-DwL-2jUZ.js");
if (spEntry) {
  const content = spEntry.getData().toString("utf8");
  console.log("SettingsPage includes server-ready:", content.includes("server-ready"));
  console.log("SettingsPage includes addEventListener:", content.includes("addEventListener"));
} else {
  console.log("SettingsPage not found in zip");
}
