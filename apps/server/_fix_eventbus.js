const fs = require("fs");
const p = require("path");
const filePath = p.join(__dirname, "src", "event-bus.ts");
let content = fs.readFileSync(filePath, "utf8");

// Fix: move broadcastSystem inside the class
const oldCode = `}

  /** Broadcast a system event to all connected clients */
  broadcastSystem(action: string, data?: any) {`;

const newCode = `  /** Broadcast a system event to all connected clients */
  broadcastSystem(action: string, data?: any) {`;

content = content.replace(oldCode, newCode);

// Also fix the extra closing brace
content = content.replace(`    dead.forEach(id => this.clients.delete(id));
  }
}

export const eventBus = new EventBus();`, `    dead.forEach(id => this.clients.delete(id));
  }
}

export const eventBus = new EventBus();`);

fs.writeFileSync(filePath, content, "utf8");
console.log("Fixed event-bus.ts");
