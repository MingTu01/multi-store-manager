const AdmZip = require("adm-zip");
const path = require("path");
const zipPath = path.join(__dirname, "..", "..", "multi-shop-link-upgrade-v1.1.48.zip");
const z = new AdmZip(zipPath);

console.log("=== 升级包结构 ===");
z.getEntries().filter(e => e.entryName.includes("sse") || e.entryName.includes("event-bus") || e.entryName.includes("index.ts")).forEach(e => {
  console.log(e.entryName);
});
