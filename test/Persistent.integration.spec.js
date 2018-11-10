'use strict';

require('console.table');

const config = require('./config');

require('../js/config').override({
    "dsn": "DSN=CacheWinHost",
});

const dsn = config['dsn'];

const expect = require('chai').expect;

const db = require('../js/wrapper');

const Persistent = require('../js/Persistent');

const pool = require('../js/Pool');

const Session = require('../js/Session');

describe('Persistent spec', function() {
    this.timeout(config['timeout']);

    const schema = 'Samples';

    const tableName = 'EmployeePersistentTest';

    class EmployeeTest extends Persistent {

        beforePropertySet() {
            console.log('callback before');
        }

        afterPropertyGet() {
            console.log('callback after');
        }

    }

    EmployeeTest.description = {
        namespace: schema,
        name: tableName,
    };

    before(function() {
        const connection = db.createConnection();

        return connection.connectPromise(dsn)
        .then(() => connection.executePromise(`
            CREATE TABLE ${schema}.${tableName} (
                id INT NOT NULL,
                lastName   CHAR(30),
                firstName  CHAR(30),
                CONSTRAINT IDPK PRIMARY KEY(id)
            )
        `.replace(/\r?\n/gm," ")))
        .finally(() => connection.closePromise());
    });

    it('should insert into table', function() {
        const john = new EmployeeTest();
        john.id = 1;
        john.lastName = 'Smith';
        john.firstName = 'John';

        return Session.transact(() => {
            return john.save()
                .flatMap(() => EmployeeTest.openId(1))
                .map(result => {
                    expect(result).to.be.instanceOf(EmployeeTest);
                    expect(result).to.deep.equal(john);
                });
        });
    });

    it('should delete from table', function() {
        const john = new EmployeeTest();
        john.id = 2;
        john.lastName = 'Smith';
        john.firstName = 'John';

        return Session.transact(() => {
            const saved = john.save();

            return saved.flatMap(() => 
                EmployeeTest.openId(2)
                .tap(result => {
                    expect(result).to.be.instanceOf(EmployeeTest);
                    expect(result).to.deep.equal(john);
                })
                .tap(result => result.delete())
                .tap(() => {
                    return EmployeeTest.openId(2)
                        .tap(r => {
                            expect(r).to.not.exist;
                        });
                }));
        });
    });

    it('should find by fields', function() {
        const john = new EmployeeTest();
        john.id = 3;
        john.lastName = 'Smithers';
        john.firstName = 'John'; 

        return Session.transact(() => 
            john.save().flatMap(() => {
                return EmployeeTest.findBy({
                    lastName: 'Smithers',
            })
            .tap(result => {
                expect(result).to.be.an('array');
                expect(result).to.have.a.lengthOf(1);

                expect(result[0]).to.be.instanceOf(EmployeeTest);
                expect(result[0]).to.deep.equal({
                    id: 3,
                    lastName: 'Smithers',
                    firstName: 'John',
                });
            })
            .flatMap(result => {
                return EmployeeTest.findBy({
                    'lastName': 'Smithers',
                })
            });
        }));
    });

    it('should return exists', function() {
        const john = new EmployeeTest();
        john.id = 5;
        john.lastName = 'Smith';
        john.firstName = 'John';

        return Session.transact(() => {
            const saved = john.save();

            return saved.flatMap(() => EmployeeTest.existsId(5))
                .tap(r => expect(r).to.be.true)
                .flatMap(() => EmployeeTest.deleteId(5))
                .flatMap(() => EmployeeTest.existsId(5))
                .tap(r => expect(r).to.be.false);
        });
    });

    it('should attach object', function() {
        const john = new EmployeeTest();
        john.id = 6;
        john.lastName = 'Smith';
        john.firstName = 'John';

        return Session.transact(() => {
            return john.save();
        }).then(() => Session.transact(() => {
            const johnDetached = new EmployeeTest();
            johnDetached.id = 6;
            return johnDetached.attach()
                .tap(r => {
                    expect(r).to.deep.equal(john);
                })
                .flatMap(r => {
                    r.lastName = 'Wesson';
                    return r.save();
                });
        })).then(() => Session.transact(() => {
            return EmployeeTest.openId(6);
        }).tap(r => {
            expect(r).to.deep.equal({
                id: 6,
                lastName: 'Wesson',
                firstName: 'John',
            });
        }));
    });

    it('should modify entity', function() {
        const john = new EmployeeTest();
        john.id = 5;
        john.lastName = 'Smith';
        john.firstName = 'John';

        Session.transact(() => {
            const saved = john.save();

            return saved.flatMap(() => EmployeeTest.existsId(5))
                .tap(r => expect(r).to.be.true)
                .flatMap(() => EmployeeTest.openId(5))
                .flatMap(john => {
                    john.id = 6;
                    john.lastName = 'Wesson';
                    return john.save();
                })
                .flatMap(() => EmployeeTest.openId(6))
                .tap(wesson => {
                    expect(wesson.lastName).to.be.equal('Wesson');
                });
        });        
    });

    after(function() {
        const connection = db.createConnection();
        return connection.connectPromise(dsn)
        .then(() => connection.executePromise(`
            DROP TABLE ${schema}.${tableName}
        `))
        .finally(() => connection.closePromise())
        .finally(() => pool.drain());
    });

});