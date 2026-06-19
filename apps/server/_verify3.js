const AdmZip = require("adm-zip");
const path = require("path");
const zipPath = path.join(__dirname, "..", "..", "multi-shop-link-upgrade-v1.1.48.zip");
const z = new AdmZip(zipPath);

const eventBusEntry = z.getEntry("server-src/event-bus.ts");
if (eventBusEntry) {
  const content = eventBusEntry.getData().toString("utf8");
  console.log("event-bus.ts includes broadcastSystem:", content.includes("broadcastSystem"));
  console.log("event-bus.ts includes 'system':", content.includes("'system'"));
} else {
  console.log("event-bus.ts not found");
}

const indexEntry = z.getEntry("server-src/index.ts");
if (indexEntry) {
  const content = indexEntry.getData().toString("utf8");
  console.log("index.ts includes server-ready:", content.includes("server-ready"));
  console.log("index.ts includes broadcastSystem:", content.includes("broadcastSystem"));
} else {
  console.log("index.ts not found");
}
