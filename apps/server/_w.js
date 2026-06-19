const fs = require("fs"); const code = fs.readFileSync("_b.js", "utf8"); console.log("First 100:", code.substring(0,100));
