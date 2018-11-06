'use strict'

const config = require('./config');
const winston = require('winston');
const createLogger = winston.createLogger;
const format = winston.format;
const transports = winston.transports;

module.exports = createLogger({
    level: config.logLevel,
    format: format.combine(
        format.splat(),
        format.simple()
    ),
    transports: [
      new transports.Console({}),
    ],
});