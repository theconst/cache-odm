const pool = require('./Pool');

module.exports = {

    transact: doInTransaction => {
        return pool.acquire().then(connection => {
            const started = connection.beginTransactionPromise();
            const done = started.then(() => doInTransaction().run(connection));

            return done
                .tap(() => connection.commitPromise())
                .tap(() => pool.release(connection))
                .catch(err => {
                    return connection.rollbackPromise()
                        .tap(() => pool.release(connection))
                        .catch(err => {
                            pool.destroy(connection);
                            return Promise.reject(err);
                        })
                        .then(() => Promise.reject(err));
                });
        });
    },

    exec: doInAutoCommit => {
        return pool.acquire().then(connection => {
            return doInAutoCommit().run(connection)
                .tap(() => pool.release(connection))
                .catch(err => {
                    pool.destroy(connection);
                    return Promise.reject(err);
                });
        });
    },

    destroy: () => pool.drain(),
};