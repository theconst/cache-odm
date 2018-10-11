const log = require('./logger');

const dirtyProperties = Symbol('dirtyProperties');

class ProxyHandler {

    static set(target, name, value) {
        if (!target[dirtyProperties]) {
            log.log('debug', 'Creating array of dirty properties');
            target[dirtyProperties] = new Set();
        }
        log.log('debug', 'Adding %s to dirty set', name);
        target[dirtyProperties].add(name);
        target[name] = value;

        return true;
    }

    static get(target, property) {
        if (property === 'save') {
            const dirty = target[dirtyProperties];
            log.log('debug', 'Saving only dirty');
            return projection => target['save'].call(target, projection || dirty);
        }
        return target[property];
    }
};


module.exports = {
    createProxy: persistent => persistent instanceof Proxy 
        ? persistent 
        : new Proxy(persistent, ProxyHandler),
}