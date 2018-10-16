const Promise = require('bluebird').Promise;

const Reader = require('./Reader');

const PersistentProxy = require('./PersistentProxy');

const log = require('./logger');

const Converter = require('./TypeConverter');

const config = require('./config');

const getSchemaQuery = `
    SELECT COLUMN_NAME cn, PRIMARY_KEY pk, DATA_TYPE dt
    FROM INFORMATION_SCHEMA.COLUMNS
    WHERE TABLE_NAME = ?, TABLE_SCHEMA = ?
`.replace(/\r?\n/gm, " ");

const getRoutineTypeQuery = `
    SELECT ROUTINE_TYPE rt FROM INFORMATION_SCHEMA.ROUTINES
    WHERE SPECIFIC_SCHEMA = ?, SPECIFIC_NAME = ?
`.replace(/\r?\n/gm, " ");

const defaultBatchSize = 10;
const defaultNamespace = config[defaultNamespace];

const schema = Symbol('schema');
class Persistent {

    static _getTable() {
        return this.description && this.description.name || this.name;
    }

    static _getNamespace() {
        return this.description && this.description.namespace || defaultNamespace;
    }

    static _getRoutineTypePromise(name) {
        const self = this;
        return Reader(connection => 
            connection.preapareStatementPromise(getRoutineTypeQuery)
            .then(statement => statement.queryPromise([self._getNamespace(), name])))
            .then(result => {
                if (result.length === 0) {
                    return Promise.reject('Class method not found');
                }
                return result[0]['rt'];
            });
    }

    static _getSchemaPromise() {
        const constructor = this;
        return Reader(connection => Promise.resolve(constructor[schema] ||
            connection.prepareStatementPromise(getSchemaQuery)
            .then(statement => {
                const bindings = [constructor._getTable(), constructor._getNamespace()];
                log.log('debug', 'Bindings: %j', bindings, {});
                return statement.queryPromise({
                    bindings: bindings,
                    batchSize: defaultBatchSize,
                });
            }).then(fields => {
                const cached = constructor[schema] = {
                    table: [constructor._getNamespace(), constructor._getTable()].join('.'),
                    primaryKeys: fields.filter(f => f['pk'] === 'YES').map(f => f['cn']),
                    types: fields.map(f => f['dt']),
                    fields: fields.map(f => f['cn']),
                };
                return cached;
            })));
    }

    static _fromResult(result) {
        const object = new this();

        Object.assign(object, result);

        return PersistentProxy.createProxy(object);
    }

    static openId(id, projection) {
        id = Array.isArray(id) ? id : [id];
        const constructor = this;
        return constructor._getSchemaPromise()
            .fmap(schema => Reader(connection => {
                log.log('debug', 'Schema: %s', schema);

                const pks = schema.primaryKeys.map(k => `${k} = ?`).join(',');
                const csFields = projection && [...projection].join(',') || '*';
                const query = `SELECT ${csFields} FROM ${schema.table} WHERE ${pks}`;

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
            }));
    }

    static call() {
        const self = this;
        const methodName = arguments[0];
        const functionArgs = arguments.slice(1);

        return self._getRoutineTypePromise(methodName)
            .fmap(routineType => 
                self._getSchemaPromise()
                    .fmap(schema => Reader(connection => {
                        const placeholders = functionArgs.map(() => '?').join(',');
                        const query = `CALL ${schema.table}_${methodName}(${placeholders})`;
                        return connection
                            .prepareStatementPromise(query)
                            .then(statement => ({
                                'PROCEDURE': () => statement.executePromise(functionArgs),
                                'FUNCTION': () => statement.queryPromise(functionArgs),
                            }[routineType]()));
                    })));
    }

    static existsId(id) {
        id = Array.isArray(id) ? id : [id];
        const constructor = this;
        return constructor._getSchemaPromise()
            .fmap(schema => Reader(connection => {
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
        }));
    }

    static findBy(keyValue, projection) {
        const constructor = this;
        return constructor._getSchemaPromise()
            .fmap(schema => Reader(connection => {
                log.log('debug', 'Schema: %s', schema);

                const keys = Object.keys(keyValue);

                const andKeys = keys.map(k => `${k} = ?`).join(',');
                const csFields = projection && [...projection].join(',') || '*'
                const query = `SELECT ${csFields} FROM ${schema.table} WHERE ${andKeys}`;

                log.log('debug', 'Find by query: %s', query);

                const values = Object.values(keyValue);
                return connection.prepareStatementPromise(query)
                    .then(statement => statement.queryPromise(values))
                    .then(resultSet => resultSet.map(r => constructor._fromResult(r)));
        }));
    }

    static deleteId(id) {
        id = Array.isArray(id) ? id : [id];
        const constructor = this;
        return constructor._getSchemaPromise()
            .fmap(schema => Reader(connection =>{
                log.log('debug', 'Schema: %s', schema);

                const pks = schema.primaryKeys.map(k => `${k} = ?`).join(',');
                const query = `DELETE FROM ${schema.table} WHERE ${pks}`;

                log.log('debug', 'Delete query: %s', query);

                return connection.forcePrepareStatementPromise(query)
                    .then(statement => statement.executePromise(id));
        }));
    } 

    attach() {
        return this.constructor._getSchemaPromise()
            .fmap(schema => this.constructor.openId(schema.primaryKeys.map(k => this[k])));
    }

    // never project onto user input - TODO: sanitize
    save(projection) {
        const self = this;
        return self.constructor._getSchemaPromise()
            .fmap(schema => Reader(connection => {
                log.log('debug', 'Schema: %j', schema);

                const fields = projection && Array.from(new Set([...schema.primaryKeys, ...projection])) 
                    || schema.fields;

                const csFields = fields.join(',');
                const placeholders = fields.map(() => '?').join(',');
                const query = `INSERT OR UPDATE INTO ${schema.table}(${csFields}) VALUES(${placeholders})`;

                log.log('debug', 'Save query: %s', query);
                

                const values = fields.map((f, i) => 
                    Converter.convert(this[f], schema.types[i]) || 'NULL');
                log.log('debug', 'Values: %s', values, {});

                const result = connection.forcePrepareStatementPromise(query)
                    .then(statement => statement.executePromise(values))
                    .then(() => PersistentProxy.createProxy(self));

                return result;
            }));
    }

    delete() {
        const self = this;
        return self.constructor._getSchemaPromise()
            .fmap(schema => self.constructor.deleteId(schema.primaryKeys.map(k => self[k])));
    }

}


module.exports = Persistent;