'use strict'

const nc = require("nanodbc");
const {promisifyAll} = require('bluebird');

const promisifySettings = {
    suffix: 'Promise',
};

class Statement extends nc.ODBCStatement {

    constructor(conneciton) {
        super(conneciton);
    }

    _doHandle(bindingsOrCb, cb, action) {
        if (typeof bindingsOrCb == 'function') {
            cb = bindingsOrCb;
            bindingsOrCb = [];
        }
        action(bindingsOrCb, cb);
    }

    query(bindingsOrCb, cb) {
        this._doHandle(bindingsOrCb, cb, (a, cb) => super.query(a, cb));
    }

    execute(bindingsOrCb, cb) {
        this._doHandle(bindingsOrCb, cb, (a, cb) => super.execute(a, cb));
    }
}
promisifyAll(Statement.prototype, promisifySettings);

class Connection extends nc.ODBCConnection {
    constructor() {
        super();
    }

    connect(dsn, timeoutOrCb, cb) {
        if (typeof timeoutOrCb == 'function') {
            cb = timeoutOrCb;
            timeoutOrCb = 0;
        }
        super.connect(dsn, timeoutOrCb, cb);
    }

    close(cb) {
        super.disconnect(cb);
    }

    beginTransaction(isolationLevel, cb) {
        if (typeof isolationLevel == 'function') {
            cb = isolationLevel;
            isolationLevel = '';
        }
        isolationLevel = isolationLevel || '';
        const isolationLevelKeyword = isolationLevel && 'ISOLATION LEVEL' || '';
        super.execute(`START TRANSACTION ${isolationLevelKeyword} ${isolationLevel}`.trim(), cb);
    }

    commit(cb) {
        super.execute('COMMIT', cb);
    }

    rollback(cb) {
        super.execute('ROLLBACK', cb);
    }

    prepareStatement(query, cb) {
        const statement = new Statement(this);
        statement.prepare(query, (err) => cb(err, statement));
    }
}


promisifyAll(Connection.prototype, promisifySettings);
class ConnectionFactory {
    // do not allow synchronous creation
    static createConnection() {
        return new Connection();
    }
}

module.exports = ConnectionFactory;