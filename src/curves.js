import { buildBls12381, Scalar } from "ffjavascript";

const bls12381q = Scalar.e(
  "1a0111ea397fe69a4b1ba7b6434bacd764774b84f38512bf6730d2a0f6b0f6241eabfffeb153ffffb9feffffffffaaab",
  16,
);

export async function getCurveFromQ(q) {
  let curve;
  if (Scalar.eq(q, bls12381q)) {
    curve = await buildBls12381();
  } else {
    throw new Error(`Curve not supported: ${Scalar.toString(q)}`);
  }
  return curve;
}

export async function getCurveFromName(name, options) {
  let curve;
  let singleThread = options && options.singleThread;
  const normName = normalizeName(name);
  if (["BLS12381"].indexOf(normName) >= 0) {
    curve = await buildBls12381(singleThread);
  } else {
    throw new Error(`Curve not supported: ${name}`);
  }
  return curve;

  function normalizeName(n) {
    return n
      .toUpperCase()
      .match(/[A-Za-z0-9]+/g)
      .join("");
  }
}
