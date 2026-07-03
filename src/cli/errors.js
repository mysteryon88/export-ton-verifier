// SPDX-License-Identifier: GPL-3.0-or-later
export class CliUsageError extends Error {
  constructor(message, { showHelp = false } = {}) {
    super(message);
    this.name = "CliUsageError";
    this.showHelp = showHelp;
  }
}
