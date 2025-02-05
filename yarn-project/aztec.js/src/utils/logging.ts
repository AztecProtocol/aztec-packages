export enum LogLevel {
  DEBUG,
  INFO,
  WARN,
  ERROR
}

// Basic logger implementation
export class Logger {
  private level: LogLevel;

  constructor(level = LogLevel.INFO) {
    this.level = level;
  }

  // main logging method
  log(level: LogLevel, msg: string, ctx?: string) {
    if (level < this.level) return;
    
    const t = new Date().toISOString().split('T')[1]; // get time part
    const context = ctx ? ` [${ctx}]` : '';
    
    switch(level) {
      case LogLevel.ERROR:
        console.error(`${t}${context} ERR: ${msg}`);
        break;
      case LogLevel.WARN:
        console.warn(`${t}${context} WARN: ${msg}`);
        break;
      default:
        console.log(`${t}${context} ${msg}`);
    }
  }

  error(msg: string, ctx?: string) {
    this.log(LogLevel.ERROR, msg, ctx);
  }

  warn(msg: string, ctx?: string) {
    this.log(LogLevel.WARN, msg, ctx);
  }

  setLevel(l: LogLevel) {
    this.level = l;
  }
} 
