import { readdirSync, rmSync } from "node:fs";
import { join } from "node:path";

const root = process.cwd();

const paths = [
  "coverage",
  "dist",
  "logs",
  "tmp",
  ".eslintcache",
  ".vite",
  "chat-service.tar",
  "chat-service-playground.tar",
  "tsconfig.tsbuildinfo",
  "tsconfig.web.tsbuildinfo",
];

const rootPatterns = [/^tmp-.*\.log$/u, /^.*\.tsbuildinfo$/u];

function removePath(relativePath) {
  rmSync(join(root, relativePath), { recursive: true, force: true });
}

for (const relativePath of paths) {
  removePath(relativePath);
}

for (const entry of readdirSync(root)) {
  if (rootPatterns.some((pattern) => pattern.test(entry))) {
    removePath(entry);
  }
}
