import test from "node:test";
import assert from "node:assert/strict";
import fs from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";
import ejs from "ejs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const templatesDir = path.join(__dirname, "../templates");

const dummyG1 = "a0" + "11".repeat(47);
const dummyG2 = "b0" + "22".repeat(95);

async function renderTemplate(templateName, nPublic) {
  const template = await fs.readFile(path.join(templatesDir, templateName), "utf8");
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

test("Func Groth16 template omits unused index-out-of-range errors", async () => {
  const [noPublics, withPublics] = await Promise.all([
    renderTemplate("func_verifier_groth16.ejs", 0),
    renderTemplate("func_verifier_groth16.ejs", 2),
  ]);

  assert.doesNotMatch(noPublics, /index_out_of_range/);
  assert.doesNotMatch(withPublics, /index_out_of_range/);
  assert.doesNotMatch(noPublics, /public_not_present/);
  assert.match(withPublics, /public_not_present/);
});

test("Tact Groth16 template omits unused error constants and helpers", async () => {
  const [noPublics, withPublics, batched] = await Promise.all([
    renderTemplate("tact_verifier_groth16.ejs", 0),
    renderTemplate("tact_verifier_groth16.ejs", 2),
    renderTemplate("tact_verifier_groth16.ejs", 9),
  ]);

  assert.doesNotMatch(noPublics, /ERR_PUBLIC_NOT_PRESENT/);
  assert.doesNotMatch(noPublics, /fun getPub/);
  assert.match(withPublics, /ERR_PUBLIC_NOT_PRESENT/);
  assert.match(withPublics, /fun getPub/);

  assert.doesNotMatch(noPublics, /ERR_INDEX_OUT_OF_RANGE/);
  assert.doesNotMatch(withPublics, /ERR_INDEX_OUT_OF_RANGE/);
  assert.doesNotMatch(batched, /ERR_INDEX_OUT_OF_RANGE/);
  assert.match(batched, /fun ic\(idx: Int\): Slice/);
});
