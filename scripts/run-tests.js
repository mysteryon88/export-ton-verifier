// SPDX-License-Identifier: GPL-3.0-or-later
import fs from "fs/promises";
import path from "path";
import { fileURLToPath, pathToFileURL } from "url";

const scriptsDir = path.dirname(fileURLToPath(import.meta.url));
const testDir = path.join(path.dirname(scriptsDir), "test");
const testFiles = (await fs.readdir(testDir))
  .filter((name) => name.endsWith(".test.js"))
  .sort();

for (const testFile of testFiles) {
  await import(pathToFileURL(path.join(testDir, testFile)).href);
}
