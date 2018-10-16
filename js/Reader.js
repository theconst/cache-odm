const Reader = compute => ({
    run: ctx => compute(ctx),
    // side effecting
    tap: f => Reader(ctx => compute(ctx).tap(v => f(v))),
    map: f => Reader(ctx => {
        const r = compute(ctx);
        return r.then(v => f(v));
    }),
    fmap: f => Reader(ctx => {
        const r = compute(ctx);
        return r.then(v => f(v).run(ctx));
    }),
});

module.exports = Reader;