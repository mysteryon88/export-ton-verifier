import test from "node:test";
import assert from "node:assert/strict";
import fs from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";
import ejs from "ejs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const templatePath = path.join(
  __dirname,
  "..",
  "templates",
  "tolk_verifier_plonk.ejs",
);

test("Tolk PLONK template fails closed before rendering verifier code", async () => {
  const template = await fs.readFile(templatePath, "utf8");

  assert.throws(
    () => ejs.render(template, {}),
    /PLONK verifier generation is disabled.*transcript points.*compressed points/i,
  );
  assert.doesNotMatch(template, /get fun verify\(/);
  assert.doesNotMatch(template, /betaHash|alphaHash|xiHash|uHash/);
  assert.doesNotMatch(template, /blsPairing/);
});
