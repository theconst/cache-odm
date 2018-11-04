'use strict'

const db = require('cache-odbc');
const {promisifyAll, Promise} = require('bluebird');

const LRU = require('lru-cache');

const promisifySettings = {
    suffix: 'Promise',
};

const config = require('./config');

const log = require('./logger');

class Statement extends db.ODBCStatement {

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

class Transaction extends db.ODBCTransaction {
    constructor(connection) {
        super(connection);
    }
}
promisifyAll(Transaction.prototype, promisifySettings);

const transaction = Symbol('transaction');
const statementCache = Symbol('statementCache');
class Connection extends db.ODBCConnection {
    constructor(options) {
        super();
        this[statementCache] = LRU(options && options.cacheSize || config['cacheSize']);
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
                return cb(err);
            }
            // https://docs.intersystems.com/latest/csp/docbook/DocBook.UI.Page.cls?KEY=RSQL_commit
            return cb(new Error('Intersystems Cache does not allow nested transactions. Use savepoints'));
        });
        const tx = this[transaction] = new Transaction(this);
        tx.begin(err => cb(err, tx));
    }

    _checkTx(tx, cb) {
        if (!tx) {
            return cb(new Error('No transaction associated with connection'));
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

    forcePrepareStatement(query, cb) {
        const createStatement = () => {
            const newStatement = new Statement(this);
            newStatement.prepare(query, err => {
                cb(err, newStatement);
            });
        }
        log.debug('Forcing `%s` udpdate', query)
        const cache = this[statementCache];
        const statement = cache.get(query);
        if (statement) {
            cache.delete(query);
            return statement.close(err => {
                if (err) {
                    return cb(err);
                }
                return createStatement();
            });
        }
        return createStatement();
    }

    prepareStatement(query, cb) {
        const cache = this[statementCache];
        const cached = cache.get(query);
        if (cached) {
            log.debug('Using `%s` from cache', query);
            return cb(null, cached);
        }
        const statement = new Statement(this);
        statement.prepare(query, err => {
            err || cache.set(query, statement);
            cb(err, statement);
        });
    }
}


promisifyAll(Connection.prototype, promisifySettings);
class ConnectionFactory {
    static createConnection(options) {
        return new Connection(options);
    }

    static createConnectionPromise(options) {
        const dsnOnly = typeof options === 'string';
        const dsn = dsnOnly && options || options.dsn;
        const connection = dsnOnly ? new Connection() : new Connection(options);
        return connection.connectPromise(dsn).then(() => connection);    
    }
}

module.exports = ConnectionFactory;