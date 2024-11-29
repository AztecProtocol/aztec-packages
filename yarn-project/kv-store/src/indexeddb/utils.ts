export const mockLogger = {
  debug: (msg: string, data: any) => console.log(msg, data),
  info: (msg: string, data: any) => console.log(msg, data),
  warn: (msg: string, data: any) => console.log(msg, data),
  error: (msg: string, data: any) => console.error(msg, data),
  silent: (msg: string, data: any) => console.log(msg, data),
  verbose: (msg: string, data: any) => console.log(msg, data),
};
