const http = require("http");

function post(path, body, token) {
  return new Promise((resolve, reject) => {
    const data = JSON.stringify(body);
    const req = http.request({
      hostname: "localhost",
      port: 3001,
      path: "/api" + path,
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": "Bearer " + token,
        "Content-Length": Buffer.byteLength(data)
      }
    }, (res) => {
      let d = "";
      res.on("data", (chunk) => d += chunk);
      res.on("end", () => {
        try { resolve(JSON.parse(d)); } catch { resolve(d); }
      });
    });
    req.on("error", reject);
    req.write(data);
    req.end();
  });
}

function get(path, token) {
  return new Promise((resolve, reject) => {
    const req = http.request({
      hostname: "localhost",
      port: 3001,
      path: "/api" + path,
      method: "GET",
      headers: { "Authorization": "Bearer " + token }
    }, (res) => {
      let d = "";
      res.on("data", (chunk) => d += chunk);
      res.on("end", () => {
        try { resolve(JSON.parse(d)); } catch { resolve(d); }
      });
    });
    req.on("error", reject);
    req.end();
  });
}

async function main() {
  // Login
  const loginRes = await post("/auth/login", { username: "admin", password: "admin123" });
  const token = loginRes.token;
  console.log("Logged in");

  // Get current version
  const info = await get("/system/info", token);
  console.log("Current version:", info.version);

  // Check upgrade status before
  const statusBefore = await get("/system/upgrade/status", token);
  console.log("Upgrade status before:", JSON.stringify(statusBefore));
}

main().catch(console.error);
