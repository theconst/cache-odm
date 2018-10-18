const Promise = require('bluebird').Promise;
const ft = require('./functools');

const Reader = compute => ({
    run: ctx => compute(ctx),
    // side effecting
    tap: f => Reader(ctx => compute(ctx).tap(v => f(v))),
    map: f => Reader(ctx => {
        const r = compute(ctx);
        return r.then(v => f(v));
    }),
    flatMap: f => Reader(ctx => {
        const r = compute(ctx);
        return r.then(v => f(v).run(ctx));
    }),
});

Reader.unit = v => Reader(() => Promise.resolve(v));

Reader.sequence = array => ft.sequence(array, Reader.unit);

module.exports = Reader;