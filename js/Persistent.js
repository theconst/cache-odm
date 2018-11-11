const Promise = require('bluebird').Promise;

const Reader = require('./Reader');

const PersistentProxy = require('./PersistentProxy');

const log = require('./logger');

const Converter = require('./TypeConverter');

const config = require('./config');

const getSchemaQuery = `
    SELECT COLUMN_NAME cn, PRIMARY_KEY pk, DATA_TYPE dt, IS_NULLABLE nb, AUTO_INCREMENT ai
    FROM INFORMATION_SCHEMA.COLUMNS
    WHERE TABLE_NAME = ? AND TABLE_SCHEMA = ?
`.replace(/\r?\n/gm, " ");

const defaultBatchSize = 10;
const defaultNamespace = config['defaultNamespace'];

const schema = Symbol('schema');
class Persistent {

    static _getTable() {
        return this.description && this.description.name || this.name;
    }

    static _getNamespace() {
        return this.description && this.description.namespace || defaultNamespace;
    }

    static _mergeProjection(projection, schema) {
        return projection && Array.from(new Set([...schema.nonNullKeys, ...projection]))
            || schema.fields;
    }

    static getShema() {
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
                log.log('debug', 'Filter: %j', fields);
                const columnNames = fields.map(f => f['cn']);

                const typesMap = columnNames
                    .map((cn, i) => ({[cn]: fields[i]['dt']}))  
                    .reduce(Object.assign, {});

                const cached = constructor[schema] = {
                    table: [constructor._getNamespace(), constructor._getTable()].join('.'),
                    primaryKeys: fields.filter(f => f['pk'] === 'YES').map(f => f['cn']),
                    nonNullKeys: fields.filter(f => f['nb'] === 'NO' && f['ai'] !== 'YES')
                        .map(f => f['cn']),
                    types: typesMap,
                    fields: columnNames,
                };
                return cached;
            })));
    }

    static _fromResult(result) {
        const object = new this();

        Object.assign(object, result);

        return PersistentProxy.createProxy(object);
    }

    static _resolveId(id, primaryKeys) {
        const t = typeof id;
        log.debug('Type of id is %s', t);
        if (t === 'function') {
            throw new TypeError('Id should be object, array of values of values');
        }
        return (t === 'object') 
            ? primaryKeys.map(k => id[k]) 
            : (t === 'array') ? id : [id];
    }

    static openId(id, projection) {
        const self = this;
        return self.getShema()
            .flatMap(schema => Reader(connection => {
                log.log('debug', 'Schema: %s', schema);

                const primaryKeys = schema.primaryKeys;
                const pks = primaryKeys.map(k => `${k} = ?`).join(' AND ');
                const csFields = projection && [...projection].join(',') || '*';
                const query = `SELECT ${csFields} FROM ${schema.table} WHERE ${pks}`;

                log.log('debug', 'OpenId query: %s', query);

                return connection.prepareStatementPromise(query)
                    .then(statement => 
                        statement.queryPromise(self._resolveId(id, primaryKeys)))
                    .then(resultSet => {
                        if (resultSet.length === 0) {
                            return null;
                        }
                        if (resultSet.length > 1) {
                            return Promise.reject('Item not unique');
                        }
                        return self._fromResult(resultSet[0]);
                    });
            }));
    }

    static _doCall(opName, argsArray) {
        const self = this;
        const methodName = argsArray[0];
        const functionArgs = argsArray.slice(1);

        const name = `${self._getTable()}_${methodName}`;
 
        const placeholders = functionArgs.map(() => '?').join(',');
        const query = `CALL ${self._getNamespace()}.${name}(${placeholders})`;

        return Reader(connection => connection
            .prepareStatementPromise(query)
            .then(statement => statement[opName](functionArgs)));
    }

    static call() {
        return this._doCall('queryPromise', [...arguments]);
    }

    static exec() {
        return this._doCall('executePromise', [...arguments]);
    }

    static existsId(id) {
        const self = this;
        return self.getShema()
            .flatMap(schema => Reader(connection => {
                log.log('debug', 'Schema: %s', schema);

                const primaryKeys = schema.primaryKeys;
                const pks = primaryKeys.map(k => `${k} = ?`).join(' AND ');
                const query = `SELECT 1 FROM ${schema.table} WHERE ${pks}`;

                log.log('debug', 'Exists query: %s', query);

                return connection.prepareStatementPromise(query)
                    .then(statement =>
                        statement.queryPromise(self._resolveId(id, primaryKeys)))
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
        return constructor.getShema()
            .flatMap(schema => Reader(connection => {
                log.log('debug', 'Schema: %s', schema);

                const keys = Object.keys(keyValue);

                const andKeys = keys.map(k => `${k} = ?`).join(' AND ');
                const csFields = projection && [...projection].join(',') || '*';
                const query = `SELECT ${csFields} FROM ${schema.table} WHERE ${andKeys}`;

                log.log('debug', 'Find by query: %s', query);

                const values = Object.values(keyValue);
                return connection.prepareStatementPromise(query)
                    .then(statement => statement.queryPromise(values))
                    .then(resultSet => resultSet.map(r => constructor._fromResult(r)));
        }));
    }

    static deleteId(id) {
        const self = this;
        return self.getShema()
            .flatMap(schema => Reader(connection =>{
                log.log('debug', 'Schema: %s', schema);

                const primaryKeys = schema.primaryKeys;
                const pks = primaryKeys.map(k => `${k} = ?`).join(' AND ');
                const query = `DELETE FROM ${schema.table} WHERE ${pks}`;

                log.log('debug', 'Delete query: %s', query);

                return connection.forcePrepareStatementPromise(query)
                    .then(statement =>
                        statement.executePromise(self._resolveId(id, primaryKeys)));
        }));
    } 

    static findAll(projection) {
        const self = this;
        return self.getShema()
            .flatMap(schema => Reader(connection => {
                const fields = self._mergeProjection(projection, schema);
                const csFields = fields.join(',');
                return connection
                    .prepareStatementPromise(`SELECT ${csFields} FROM ${schema.table}`)
                    .then(statement => statement.queryPromise())
                    .then(result => result.map(x => self._fromResult(x)));
            }));
    }

    attach() {
        return this.constructor.getShema()
            .flatMap(schema => this.constructor.openId(
                schema.primaryKeys.map(k => ({[k]: this[k]}))
                .reduce(Object.assign, {})));
    }

    _convertValues(fields, schema) {
        const values = fields.map(f => Converter.convert(this[f], schema.types[f]) || 'NULL');
        log.log('debug', 'Converted values: %s', values);

        return values;
    }

    _executeDML(query, fields, schema) {
        const self = this;
        return Reader(connection => {
            log.log('debug', 'Executing DML query: %s', query);

            const values = this._convertValues(fields, schema);

            log.log('debug', 'Values %j', values);
    
            return connection.forcePrepareStatementPromise(query)
                .then(statement => statement.executePromise(values))
                .then(() => PersistentProxy.createProxy(self));
        });
    }

    save(projection) {
        const self = this;
        return self.constructor.getShema()
            .flatMap(schema => {
                log.log('debug', 'Schema: %j', schema);

                const fields = self.constructor._mergeProjection(projection, schema);
                const csFields = fields.join(',');
                const placeholders = fields.map(() => '?').join(',');

                const query = `INSERT OR UPDATE INTO ${schema.table}(${csFields}) VALUES(${placeholders})`;

                return self._executeDML(query, fields, schema);
            });
    }

    update(projection) {
        const self = this;
        return self.constructor.getShema()
            .flatMap(schema => {
                log.log('debug', 'Schema: %j', schema);

                const primaryKeys = schema.primaryKeys;

                const fields = self.constructor._mergeProjection(projection, schema)
                    .filter(f => !primaryKeys.includes(f));

                const fieldsToUpdate = fields
                    .map(f => `${f} = ?`)
                    .join(',');
               
                const pks = primaryKeys.map(k => `${k} = ?`).join(' AND ');
                const query = `UPDATE ${schema.table} SET ${fieldsToUpdate} WHERE ${pks}`;
                log.log('debug', 'Update query: %s', query);

                return self._executeDML(query, [...fields, ...primaryKeys], schema);
            });
    }

    delete() {
        const self = this;
        return self.constructor.getShema()
            .flatMap(schema => self.constructor.deleteId(schema.primaryKeys.map(k => self[k])));
    }

}


module.exports = Persistent;