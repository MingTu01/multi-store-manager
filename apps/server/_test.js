const http = require("http");
const fs = require("fs");
const path = require("path");

function post(path, body, token) {
  return new Promise((resolve, reject) => {
    const data = JSON.stringify(body);
    const req = http.request({
      hostname: "localhost", port: 3001, path: "/api" + path, method: "POST",
      headers: { "Content-Type": "application/json", "Authorization": "Bearer " + token, "Content-Length": Buffer.byteLength(data) }
    }, (res) => { let d = ""; res.on("data", c => d += c); res.on("end", () => { try { resolve(JSON.parse(d)); } catch { resolve(d); } }); });
    req.on("error", reject);
    req.write(data);
    req.end();
  });
}

function get(path, token) {
  return new Promise((resolve, reject) => {
    http.get("http://localhost:3001/api" + path, { headers: { "Authorization": "Bearer " + token } }, (res) => {
      let d = ""; res.on("data", c => d += c); res.on("end", () => { try { resolve(JSON.parse(d)); } catch { resolve(d); } });
    }).on("error", reject);
  });
}

async function main() {
  const loginRes = await post("/auth/login", { username: "admin", password: "admin123" });
  const token = loginRes.token;
  
  const info = await get("/system/info", token);
  console.log("Current version:", info.version);
  
  const status = await get("/system/upgrade/status", token);
  console.log("Upgrade status:", JSON.stringify(status));
  
  console.log("\nUpgrade package ready: multi-shop-link-upgrade-v1.1.55.zip");
  console.log("Ready for testing!");
}

main().catch(console.error);
