import fs from "fs";
import http from "http";
import express from "express";
import { Server } from "socket.io";

const logFile = "./test.log";
let last10 = [];

// Ensure file exists
if (!fs.existsSync(logFile)) fs.writeFileSync(logFile, "");

// --- Helpers ---
function readLastLines(filePath, n = 10) {
  const data = fs.readFileSync(filePath, "utf8");
  const lines = data.trim().split("\n").filter(Boolean);
  return lines.slice(-n);
}
function saveLine(line) {
  if (last10.length >= 10) last10.shift();
  last10.push(line);
}

// --- Express + Socket.IO setup ---
const app = express();
const server = http.createServer(app);
const io = new Server(server);

// Serve a minimal client directly
app.get("/", (req, res) => {
  res.send(`
    <!DOCTYPE html>
    <html>
    <head>
      <title>Live Log Tail</title>
      <script src="/socket.io/socket.io.js"></script>
      <style>
        body { font-family: monospace; background: #111; color: #0f0; }
        pre { padding: 10px; white-space: pre-wrap; }
      </style>
    </head>
    <body>
      <h2>Last 10 Lines (Live)</h2>
      <pre id="logBox"></pre>
      <script>
        const socket = io({ transports: ["websocket"] });
        const logBox = document.getElementById("logBox");

        socket.on("init", (lines) => {
          logBox.textContent = lines.join("\\n") + "\\n";
        });

        socket.on("log", (line) => {
          logBox.textContent += line + "\\n";
          const lines = logBox.textContent.trim().split("\\n");
          if (lines.length > 10) {
            logBox.textContent = lines.slice(-10).join("\\n") + "\\n";
          }
        });
      </script>
    </body>
    </html>
  `);
});

// WebSocket connection
io.on("connection", (socket) => {
  console.log("✅ Client connected:", socket.id);
  socket.emit("init", last10);

  socket.on("disconnect", () => {
    console.log("❌ Client disconnected:", socket.id);
  });
});

// --- Dummy log writer (simulating app logs) ---
setInterval(() => {
  const now = new Date().toISOString();
  const line = `new data: ${now}`;
  fs.appendFileSync(logFile, line + "\n");
}, 1000);

// --- File watcher (tail -f) ---
let fileSize = fs.statSync(logFile).size;
setInterval(() => {
  const stats = fs.statSync(logFile);
  if (stats.size > fileSize) {
    const stream = fs.createReadStream(logFile, { start: fileSize, end: stats.size });
    stream.on("data", (chunk) => {
      const newLines = chunk.toString().trim().split("\n").filter(Boolean);
      newLines.forEach((line) => {
        saveLine(line);
        io.emit("log", line); // broadcast to all clients
      });
    });
    fileSize = stats.size;
  }
}, 1000);

// Initialize last 10 lines
last10 = readLastLines(logFile, 10);

// --- Start server ---
server.listen(3000, () => {
  console.log("🚀 Log watcher running at http://localhost:3000");
});
