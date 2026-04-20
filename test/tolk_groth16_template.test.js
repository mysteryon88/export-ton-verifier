import test from "node:test";
import assert from "node:assert/strict";
import fs from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";
import ejs from "ejs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const templatePath = path.join(
  __dirname,
  "../templates/tolk_verifier_groth16.ejs",
);

const dummyG1 = "a0" + "11".repeat(47);
const dummyG2 = "b0" + "22".repeat(95);

async function renderTemplate(nPublic) {
  const template = await fs.readFile(templatePath, "utf8");
  return ejs.render(template, {
    protocol: "groth16",
    curve: "bn128",
    vk_alpha_1: dummyG1,
    vk_beta_2: dummyG2,
    vk_gamma_2: dummyG2,
    vk_delta_2: dummyG2,
    IC: Array.from({ length: nPublic + 1 }, () => dummyG1),
    nPublic,
    publicInputKeyLen: 32,
  });
}

test("renders array-based public input handling for small Groth16 circuits", async () => {
  const rendered = await renderTemplate(2);

  assert.match(rendered, /pubInputs: RemainingBitsAndRefs/);
  assert.match(rendered, /if \(pubInputs\.size\(\) != N_PUBLIC\)/);
  assert.match(rendered, /pubInputs\.get\(0\)/);
  assert.match(rendered, /pubInputs\.get\(1\)/);
  assert.match(rendered, /ERR_INVALID_INPUTS: int = 258/);
  assert.match(rendered, /blsG1Multiexp_2/);
  assert.match(rendered, /\.hexToSlice\(\)/);
  assert.match(rendered, /var payload: slice = msg\.pubInputs;/);
  assert.match(rendered, /loadNextPubInput\(mutate payload\)/);
  assert.match(rendered, /payload\.remainingBitsCount\(\) != 0 \|\| payload\.remainingRefsCount\(\) != 0/);
  assert.match(rendered, /get fun verify\(piA: slice, piB: slice, piC: slice, pubInputs: array<int>\): bool/);

  assert.doesNotMatch(rendered, /@stdlib\/tvm-dicts/);
  assert.doesNotMatch(rendered, /stringHexToSlice/);
  assert.doesNotMatch(rendered, /uDictGet/);
  assert.doesNotMatch(rendered, /PUBLIC_KEY_LEN/);
  assert.doesNotMatch(rendered, /ERR_PUBLIC_NOT_PRESENT/);
  assert.doesNotMatch(rendered, /ERR_TOO_MANY_PUBLICS/);
  assert.doesNotMatch(rendered, /loadDict\(/);
  assert.doesNotMatch(rendered, /ERR_INDEX_OUT_OF_RANGE/);
});

test("renders runtime batching helpers only when more than seven public inputs exist", async () => {
  const rendered = await renderTemplate(9);

  assert.match(rendered, /fun ic\(idx: int\): slice/);
  assert.match(rendered, /fun pubInputAt\(/);
  assert.match(rendered, /ERR_INDEX_OUT_OF_RANGE: int = 259/);
  assert.match(rendered, /var full: int = N_PUBLIC \/ 7/);
  assert.match(rendered, /var rem:\s+int = N_PUBLIC % 7/);
  assert.match(rendered, /blsG1Multiexp_7/);
  assert.match(rendered, /blsG1Multiexp_2/);
  assert.match(rendered, /pubInputAt\(done \+ 6,/);
  assert.match(rendered, /pubInputs\.get\(8\)/);
  assert.match(rendered, /pubInputs: RemainingBitsAndRefs/);
  assert.match(rendered, /Verify\.fromSlice/);

  assert.doesNotMatch(rendered, /uDictGet/);
  assert.doesNotMatch(rendered, /ERR_PUBLIC_NOT_PRESENT/);
  assert.doesNotMatch(rendered, /ERR_TOO_MANY_PUBLICS/);
});
