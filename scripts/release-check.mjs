#!/usr/bin/env node
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative, resolve } from "node:path";

const root = resolve(new URL("..", import.meta.url).pathname);
const pluginRoot = join(root, "plugins", "multi-gmail");
const requiredFiles = [
  ".agents/plugins/marketplace.json",
  "plugins/multi-gmail/.codex-plugin/plugin.json",
  "plugins/multi-gmail/.mcp.json",
  "plugins/multi-gmail/dist/auth.mjs",
  "plugins/multi-gmail/dist/server.mjs",
  "plugins/multi-gmail/skills/multi-gmail/SKILL.md",
  "README.md",
  "LICENSE",
  "PRIVACY.md",
  "SECURITY.md",
];

for (const file of requiredFiles) {
  if (!existsSync(join(root, file))) throw new Error(`Missing required file: ${file}`);
}

const manifest = JSON.parse(readFileSync(join(pluginRoot, ".codex-plugin", "plugin.json"), "utf8"));
if (manifest.name !== "multi-gmail") throw new Error("Plugin manifest name must be multi-gmail.");
if (!/^\d+\.\d+\.\d+$/.test(manifest.version)) {
  throw new Error("Public plugin version must use strict semantic versioning.");
}

const marketplace = JSON.parse(readFileSync(join(root, ".agents", "plugins", "marketplace.json"), "utf8"));
const entry = marketplace.plugins?.find((plugin) => plugin.name === "multi-gmail");
if (marketplace.name !== "itsixteen" || entry?.source?.path !== "./plugins/multi-gmail") {
  throw new Error("Marketplace entry does not resolve to plugins/multi-gmail.");
}

const ignoredDirectories = new Set([".git", "node_modules", "coverage"]);
const scannableExtensions = new Set(["", ".json", ".md", ".mjs", ".ts", ".yml", ".yaml"]);
const forbiddenNames = [/^client_secret.*\.json$/i, /^credentials.*\.json$/i, /^token.*\.json$/i];
const forbiddenContent = [
  { name: "Google OAuth client secret", pattern: /GOCSPX-[A-Za-z0-9_-]{20,}/ },
  { name: "Google OAuth client ID", pattern: /\d{10,}-[a-z0-9_-]{20,}\.apps\.googleusercontent\.com/i },
  { name: "OAuth refresh token", pattern: /1\/\/[A-Za-z0-9_-]{20,}/ },
  { name: "private key", pattern: /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/ },
];

function walk(directory) {
  for (const name of readdirSync(directory)) {
    if (ignoredDirectories.has(name)) continue;
    const path = join(directory, name);
    const relativePath = relative(root, path);
    const stat = statSync(path);
    if (stat.isDirectory()) {
      walk(path);
      continue;
    }
    if (forbiddenNames.some((pattern) => pattern.test(name))) {
      throw new Error(`Credential-like filename must not be committed: ${relativePath}`);
    }
    const extension = name.includes(".") ? name.slice(name.lastIndexOf(".")) : "";
    if (!scannableExtensions.has(extension) || stat.size > 5_000_000) continue;
    const content = readFileSync(path, "utf8");
    for (const check of forbiddenContent) {
      if (check.pattern.test(content)) throw new Error(`${check.name} detected in ${relativePath}`);
    }
  }
}

walk(root);
process.stdout.write(`Release check passed for multi-gmail v${manifest.version}.\n`);
