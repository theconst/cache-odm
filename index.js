/**
 * Entry point to the application
 */
module.exports = overrides => {
    require('./js/config').override(overrides);
    
    return {
        Persistent: require('./js/Persistent'),               // Persistent object
        Session: require('./js/Session'),                     // Session object
        functools: require('./js/functools'),                 // functools utilities
        TypeConverter: require('./js/TypeConverter'),         // type conversions
        Reader: require('./js/Reader'),                       // Reader monad helper
        Pool: require('./js/Pool'),                           // Pool to acquire native connections
    }
};