export class EngineUnavailableError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "EngineUnavailableError";
  }
}

export class EngineLanguageError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "EngineLanguageError";
  }
}
