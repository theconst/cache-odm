'use strict'

const nc = require("nanodbc");
const {promisifyAll, Promise} = require('bluebird');

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

class Transaction extends nc.ODBCTransaction {
    constructor(connection) {
        super(connection);
    }
}
promisifyAll(Transaction.prototype, promisifySettings);

const transaction = Symbol('transaction');
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

    beginTransaction(cb) {
        const oldTx = this[transaction];
        oldTx && oldTx.rollback(err => {
            if (err) {
                cb(err);
            }
            //? https://docs.intersystems.com/latest/csp/docbook/DocBook.UI.Page.cls?KEY=RSQL_commit
            cb(new Error('Intersystems Cache does not allow nested transactions. Use savepoints'));
        });
        const tx = this[transaction] = new Transaction(this);
        tx.begin(err => cb(err, tx));
    }

    _checkTx(tx, cb) {
        if (!tx) {
            cb(new Error('No transaction associated with connection'));
        }
    }

    commit(cb) {
        const tx = this[transaction];
        this[transaction] = undefined;
        this._checkTx(tx, cb);
        tx.commit(err => cb(err));
    }

    rollback(cb) {
        const tx = this[transaction];
        this[transaction] = undefined;
        this._checkTx(tx, cb);
        tx.rollback(err => cb(err));
    }

    prepareStatement(query, cb) {
        const statement = new Statement(this);
        statement.prepare(query, (err) => cb(err, statement));
    }
}


promisifyAll(Connection.prototype, promisifySettings);
class ConnectionFactory {
    static createConnection() {
        return new Connection();
    }

    static createConnectionPromise(dsn) {
        return Promise.coroutine(function*() {
            const connection = new Connection();
            yield connection.connectPromise(dsn);
            
            return connection;
        })();
    }
}

module.exports = ConnectionFactory;