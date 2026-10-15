// SPDX-License-Identifier: GPL-3.0-or-later
import { fileURLToPath } from "url";
import { prepareActonFixtures } from "../test-support/prepare_acton.js";

await prepareActonFixtures(fileURLToPath(new URL("../test/acton/", import.meta.url)));
