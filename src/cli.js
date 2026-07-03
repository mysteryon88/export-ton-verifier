#!/usr/bin/env node
// SPDX-License-Identifier: GPL-3.0-or-later
import path from "path";
import { fileURLToPath } from "url";
import { runCli } from "./cli/commands.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const status = await runCli(process.argv.slice(2), {
  templatesDir: path.join(__dirname, "../templates"),
});

process.exit(status);
