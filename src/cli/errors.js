export class CliUsageError extends Error {
  constructor(message, { showHelp = false } = {}) {
    super(message);
    this.name = "CliUsageError";
    this.showHelp = showHelp;
  }
}
