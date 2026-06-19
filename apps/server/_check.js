const fs = require("fs");
const path = require("path");
const srcDir = path.join(__dirname, "src");
console.log("=== src directory ===");
const items = fs.readdirSync(srcDir, { withFileTypes: true });
items.forEach(item => {
  if (item.isDirectory()) {
    console.log("DIR:", item.name);
    const subItems = fs.readdirSync(path.join(srcDir, item.name));
    subItems.forEach(sub => console.log("  ", sub));
  } else {
    console.log("FILE:", item.name);
  }
});
