const config = require('./config');
const nc = require('./nc-wrapper');
const Promise = require('bluebird').Promise;
const genericPool = require("generic-pool");


const factory = {
    create: () => nc.createConnectionPromise(config["dsn"]),
    destroy: connection => connection.closePromise(),
    validate: connection => connection.connectedPromise(),
};

const opts = {
    max: config["poolSizeMin"],
    min: config["poolSizeMax"],
    autostart: false,
    testOnBorrow: false,
    evictionRunIntervalMillis: config["evictionInterval"],
    Promise: Promise,
};
   
module.exports = genericPool.createPool(factory, opts);
  