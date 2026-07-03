// SPDX-License-Identifier: GPL-3.0-or-later
export function createLogger({ logger = null, quiet = false } = {}) {
  if (quiet || logger === false || logger == null) {
    return { log() {} };
  }

  if (typeof logger === "function") {
    return { log: logger };
  }

  if (typeof logger.log === "function") {
    return { log: logger.log.bind(logger) };
  }

  throw new Error(
    "logger must be a function, an object with log(message), false, null, or undefined.",
  );
}
