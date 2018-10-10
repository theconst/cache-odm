const pool = require('./Pool');


class Session {

    static transact(doInTransaction) {
        return pool.acquire()
            .then(connection => {
                const done = doInTransaction(connection);

                return done.then()
                    .tap(() => pool.release(connection))
                    .catch(err => {
                        pool.release(connection);
                        return Promise.reject(err);
                    });
            });
    }

}

module.exports = Session;