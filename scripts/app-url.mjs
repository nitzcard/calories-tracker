import { execFileSync } from "node:child_process";

const HOST = "127.0.0.1";
const START_PORT = 7001;
const END_PORT = 7010;

function commandOutput(command, args) {
  try {
    return execFileSync(command, args, {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    }).trim();
  } catch {
    return "";
  }
}

function pidListeningOn(port) {
  const output = commandOutput("lsof", ["-nP", `-iTCP:${port}`, "-sTCP:LISTEN", "-t"]);
  return output.split("\n").map((line) => line.trim()).find(Boolean) ?? null;
}

for (let port = START_PORT; port <= END_PORT; port += 1) {
  if (!pidListeningOn(port)) continue;

  console.log(`http://${HOST}:${port}`);
  process.exit(0);
}

process.exit(1);
