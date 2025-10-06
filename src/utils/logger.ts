export interface ILogger {
  show: () => void;
  log: (text: string) => void;
  warn: (text: string) => void;
  error: (text: string) => void;
  errorMessage: (text: string) => void;
}

export const DEFAULT_LOGGER: ILogger = { show: ()=>{}, log: console.log, warn: console.warn, error: console.error, errorMessage: console.error };
let _logger = DEFAULT_LOGGER;

export function set(logger: ILogger) {
  _logger = logger;
}

export function show() {
  _logger.show();
}

export function log(line: string) {
  _logger.log(line);
}

export function warn(line: string) {
  _logger.warn(line);
}

export function error(line: string) {
  _logger.error(line);
}

export function errorMessage(line: string) {
  _logger.errorMessage(line);
}
