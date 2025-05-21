import { ILogObj, Logger } from 'tslog';

export const logger = new Logger<ILogObj>({
  name: 'bb.js',
  stylePrettyLogs: false,
  prettyLogTemplate: '{{dateIsoStr}} {{name}} ',
  hideLogPositionForProduction: true,
  minLevel: 3,
});

export function createChildLogger(name: string) {
  const sublogger = logger.getSubLogger({
    name,
  });
  return (msg: string) => {
    sublogger.debug(msg);
  };
}
