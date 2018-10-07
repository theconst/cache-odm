const Promise = require('bluebird').Promise;

const nc = require('./nc-wrapper');
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
        const self = this;
        return Promise.resolve(self[schema] || Promise.coroutine(function*() {
            const connection = yield nc.createConnectionPromise();
            const statement = yield connection.prepareStatementPromise(getSchemaQuery);

            const bindings = [self._getTable(), self._getNamespace()];

            log.log('debug', 'Bindings: %j', bindings, {});
            const fields = yield statement.queryPromise({
                bindings: bindings,
                batchSize: defaultBatchSize,
            });

            return self[schema] = {
                table: [self._getNamespace(), self._getTable()].join('.'),
                primaryKeys: fields.filter(f => f['pk'] === 'YES').map(f => f['cn']),
                fields: fields.map(f => f['cn']),
            };
        })());
    }

    static _fromResult(result) {
        const object = new this();

        Object.assign(object, result);

        return object;
    }

    static openId(id) {
        if (!Array.isArray(id)) {
            id = [id];
        }
        const self = this;
        return Promise.coroutine(function*() {
            const connection = yield nc.createConnectionPromise();
            const schema = yield self._getSchemaPromise();

            log.log('debug', 'Schema: %s', schema);

            const pks = schema.primaryKeys.map(k => `${k} = ?`).join(',');
            const query = `SELECT * FROM ${schema.table} WHERE ${pks}`;

            log.log('debug', 'Insert query: %s', query);
            const statement = yield connection.prepareStatementPromise(query);

            const resultSet = yield statement.queryPromise(id);

            if (resultSet.length === 0) {
                return Promise.resolve(null);
            }
            if (resultSet.length > 1) {
                return Promise.reject('Item not unique');
            }
            return Promise.resolve(self._fromResult(resultSet[0]));
        })();
    }

    static existsId(id) {
        if (!Array.isArray(id)) {
            id = [id];
        }
        const self = this;
        return Promise.coroutine(function*() {
            const connection = yield nc.createConnectionPromise();
            const schema = yield self._getSchemaPromise();

            log.log('debug', 'Schema: %s', schema);

            const pks = schema.primaryKeys.map(k => `${k} = ?`).join(' AND ');
            const query = `SELECT 1 FROM ${schema.table} WHERE ${pks}`;

            log.log('debug', 'Exists query: %s', query);

            const statement = yield connection.prepareStatementPromise(query);

            const resultSet = yield statement.queryPromise(id);

            if (resultSet.length === 0) {
                return Promise.resolve(false);
            }
            if (resultSet.length > 1) {
                return Promise.reject('Item not unique');
            }

            return Promise.resolve(true);
        })();
    }

    static findBy(keyValue) {
        const self = this;
        return Promise.coroutine(function*() {
            const connection = yield nc.createConnectionPromise();
            const schema = yield self._getSchemaPromise();

            log.log('debug', 'Schema: %s', schema);

            const keys = Object.keys(keyValue);

            const andKeys = keys.map(k => `${k} = ?`).join(' AND ');
            const query = `SELECT * FROM ${schema.table} WHERE ${andKeys}`;

            log.log('debug', 'Find by query: %s', query);

            const statement = yield connection.prepareStatementPromise(query);

            const values = Object.values(keyValue);
            const result = yield statement.queryPromise(values);

            return Promise.resolve(result.map(r => self._fromResult(r)));
        })();
    }

    static deleteId(id) {
        if (!Array.isArray(id)) {
            id = [id];
        }
        const self = this;
        return Promise.coroutine(function*() {
            const connection = yield nc.createConnectionPromise();
            const schema = yield self._getSchemaPromise();

            log.log('debug', 'Schema: %s', schema);

            const pks = schema.primaryKeys.map(k => `${k} = ?`).join(',');
            const query = `DELETE FROM ${schema.table} WHERE ${pks}`;

            log.log('debug', 'Delete query: %s', query);

            const statement = yield connection.prepareStatementPromise(query);

            yield statement.executePromise(id);

            return Promise.resolve(null);
        })();
    } 

    save() {
        const constructor = this.constructor;
        const self = this;
        return Promise.coroutine(function*() {
            const connection = yield nc.createConnectionPromise();
            const schema = yield constructor._getSchemaPromise();

            log.log('debug', 'Schema: %s', schema);

            const fields = schema.fields.join(',');
            const placeholders = schema.fields.map(() => '?').join(',');
            const query = `INSERT OR UPDATE INTO ${schema.table}(${fields}) VALUES(${placeholders})`;

            log.log('debug', 'Save query: %s', query);

            const statement = yield connection.prepareStatementPromise(query);
            
            const values = schema.fields.map(f => self[f] || 'NULL');

            yield statement.executePromise(values);

            return Promise.resolve(self);
        })();
    }

    delete() {
        const constructor = this.constructor;
        return constructor._getSchemaPromise()
            .then(schema => constructor.deleteId(schema.primaryKeys.map(k => this[k])));
    }

}


module.exports = Persistent;