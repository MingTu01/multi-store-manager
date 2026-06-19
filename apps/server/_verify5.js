const AdmZip = require("adm-zip");
const path = require("path");
const zipPath = path.join(__dirname, "..", "..", "multi-shop-link-upgrade-v1.1.48.zip");
const z = new AdmZip(zipPath);

const eventBusEntry = z.getEntry("server-src/event-bus.ts");
const content = eventBusEntry.getData().toString("utf8");
const lines = content.split("\n");
console.log("=== event-bus.ts broadcast method ===");
for (let i = 28; i < 45; i++) {
  console.log((i+1) + ": " + lines[i]);
}
