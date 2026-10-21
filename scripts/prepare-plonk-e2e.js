// SPDX-License-Identifier: GPL-3.0-or-later
import { ensurePlonkE2EArtifacts } from "../test-support/plonk_e2e.js";

console.log(`PLONK E2E artifacts: ${await ensurePlonkE2EArtifacts()}`);
