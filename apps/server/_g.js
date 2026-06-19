const fs=require("fs");const s=fs.readFileSync("_b.js","utf8");console.log("File length:",s.length);console.log("First 50:",s.substring(0,50));
