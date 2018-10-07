'use strict'

const {createLogger, format, transports} = require('winston');

module.exports = createLogger({
    level: 'debug',
    format: format.combine(
        format.splat(),
        format.simple()
    ),
    transports: [
      new transports.Console({}),
    ],
});