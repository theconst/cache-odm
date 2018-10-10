const Promise = require('bluebird').Promise;

const Session = require('./Session');

const log = require('./logger');

const getSchemaQuery = `
    SELECT COLUMN_NAME cn, PRIMARY_KEY pk
    FROM INFORMATION_SCHEMA.COLUMNS
    WHERE TABLE_NAME = ? AND TABLE_SCHEMA = ?`
    .replace(/\r?\n/gm, " ");

const defaultBatchSize = 10;
const defaultNamespace = 'SQLUser';

const schema = Symbol('schema');
class Persistent {

    static _getTable() {
        return this.description && this.description.name || this.name;
    }

    static _getNamespace() {
        return this.description && this.description.namespace || defaultNamespace;
    }

    static _getSchemaPromise() {
        const constructor = this;
        return Promise.resolve(constructor[schema] ||
            Session.transact(connection => {
                return connection.prepareStatementPromise(getSchemaQuery)
                    .then(statement => {
                        const bindings = [constructor._getTable(), constructor._getNamespace()];
                        log.log('debug', 'Bindings: %j', bindings, {});
                        return statement.queryPromise({
                            bindings: bindings,
                            batchSize: defaultBatchSize,
                        });
                    }).then(fields => {
                        return constructor[schema] = {
                            table: [constructor._getNamespace(), constructor._getTable()].join('.'),
                            primaryKeys: fields.filter(f => f['pk'] === 'YES').map(f => f['cn']),
                            fields: fields.map(f => f['cn']),
                        };
                    });
            }));
    }

    static _fromResult(result) {
        const object = new this();

        Object.assign(object, result);

        return object;
    }

    static openId(id) {
        id = Array.isArray(id) ? id : [id];
        const constructor = this;
        return Session.transact(connection => {
            return constructor._getSchemaPromise().then(schema => {
                log.log('debug', 'Schema: %s', schema);

                const pks = schema.primaryKeys.map(k => `${k} = ?`).join(',');
                const query = `SELECT * FROM ${schema.table} WHERE ${pks}`;
    
                log.log('debug', 'OpenId query: %s', query);

                return connection.prepareStatementPromise(query)
                    .then(statement => statement.queryPromise(id))
                    .then(resultSet => {
                        if (resultSet.length === 0) {
                            return null;
                        }
                        if (resultSet.length > 1) {
                            return Promise.reject('Item not unique');
                        }
                        return constructor._fromResult(resultSet[0]);
                    });
            });
        });
    }

    static existsId(id) {
        id = Array.isArray(id) ? id : [id];
        const constructor = this;
        return Session.transact(connection => {
            return constructor._getSchemaPromise().then(schema => {
                log.log('debug', 'Schema: %s', schema);
    
                const pks = schema.primaryKeys.map(k => `${k} = ?`).join(' AND ');
                const query = `SELECT 1 FROM ${schema.table} WHERE ${pks}`;
    
                log.log('debug', 'Exists query: %s', query);
    
                return connection.prepareStatementPromise(query)
                    .then(statement => statement.queryPromise(id))
                    .then(resultSet => {
                        if (resultSet.length === 0) {
                            return false;
                        }
                        if (resultSet.length > 1) {
                            return Promise.reject('Item not unique');
                        }
                        return true;
                    });
            });
        });
    }

    static findBy(keyValue) {
        const constructor = this;
        return Session.transact(connection => {
            return constructor._getSchemaPromise().then(schema => {
                log.log('debug', 'Schema: %s', schema);

                const keys = Object.keys(keyValue);

                const andKeys = keys.map(k => `${k} = ?`).join(' AND ');
                const query = `SELECT * FROM ${schema.table} WHERE ${andKeys}`;

                log.log('debug', 'Find by query: %s', query);

                const values = Object.values(keyValue);
                return connection.prepareStatementPromise(query)
                    .then(statement => statement.queryPromise(values))
                    .then(resultSet => resultSet.map(r => constructor._fromResult(r)));
            });
        });
    }

    static deleteId(id) {
        id = Array.isArray(id) ? id : [id];
        const constructor = this;
        return Session.transact(connection => {
            return constructor._getSchemaPromise().then(schema => {
                log.log('debug', 'Schema: %s', schema);

                const pks = schema.primaryKeys.map(k => `${k} = ?`).join(',');
                const query = `DELETE FROM ${schema.table} WHERE ${pks}`;
    
                log.log('debug', 'Delete query: %s', query);
    
                return connection.prepareStatementPromise(query)
                    .then(statement => statement.executePromise(id));
            });
        });
    } 

    save(projection) {
        const self = this;
        return Session.transact(connection => {
            return self.constructor._getSchemaPromise().then(schema => {
                log.log('debug', 'Schema: %s', schema);

                const fields = projection || schema.fields;

                const csFields = fields.join(',');
                const placeholders = fields.map(() => '?').join(',');
                const query = `INSERT OR UPDATE INTO ${schema.table}(${csFields}) VALUES(${placeholders})`;
    
                log.log('debug', 'Save query: %s', query);
                

                const values = fields.map(f => this[f] || 'NULL');
                return connection.prepareStatementPromise(query)
                    .then(statement => statement.executePromise(values))
                    .then(() => self);
            });
        });
    }

    delete() {
        const self = this;
        return self.constructor._getSchemaPromise()
            .then(schema => 
                self.constructor.deleteId(schema.primaryKeys.map(k => self[k])));
    }

}


module.exports = Persistent;