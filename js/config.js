/*
 * Mutable global configuration 
 */
module.exports = {
    "poolSizeMin":  3,
    "poolSizeMax": 3,
    "cacheSize": 10,
    "evictionInterval": 60000,
    "dsn": "Cache",
    "defaultNamespace": "SQLUser",
    "logLevel": "debug",
    override: function(overrides) {
        // TODO: this is definetely not best practice
        Object.assign(this, overrides);
        return this;
    }
};