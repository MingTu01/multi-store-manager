const fs = require("fs");
const p = require("path");
const docPath = p.join(__dirname, "..", "..", "UPGRADE.md");
const content = fs.readFileSync(docPath, "utf8");
console.log(content.substring(0, 2000));
