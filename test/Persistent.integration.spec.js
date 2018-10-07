'use strict';

require('console.table');

const config = require('./config');

const dsn = config['dsn'];

const expect = require('chai').expect;

const Promise = require('bluebird').Promise;

const nc = require('../js/nc-wrapper');

const Persistent = require('../js/Persistent');

describe('Persistent spec', function() {
    this.timeout(config['timeout']);

    const schema = 'Samples';

    const tableName = 'EmployeePersistentTest';

    class EmployeeTest extends Persistent {

    }

    EmployeeTest.description = {
        namespace: schema,
        name: tableName,
    };

    before(function() {
        const connection = nc.createConnection();

        return connection.connectPromise(dsn)
        .then(() => connection.executePromise(`
            CREATE TABLE ${schema}.${tableName} (
                id INT NOT NULL,
                lastName   CHAR(30) NOT NULL,
                firstName  CHAR(30) NOT NULL,
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

        const saved = john.save();

        return saved.then(() => {
            console.log('1');

            return EmployeeTest.openId(1)
                .tap(result => {
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

        const saved = john.save();

        return saved.then(() => {
            return EmployeeTest.openId(2)
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
                });
        });
    });

    it('should find by fields', function() {
        const john = new EmployeeTest();
        john.id = 3;
        john.lastName = 'Smithers';
        john.firstName = 'John'; 

        const saved = john.save();

        return saved.then(() => {
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
            });
        })
    });

    it('should return exists', function() {
        const john = new EmployeeTest();
        john.id = 5;
        john.lastName = 'Smith';
        john.fistName = 'John';

        const saved = john.save();

        return saved.then(() => EmployeeTest.existsId(5))
            .tap(r => expect(r).to.be.true)
            .tap(() => EmployeeTest.deleteId(1))
            .then(() => EmployeeTest.existsId(1))
            .tap(r => expect(r).to.be.false);
    });

    after(function() {
        const connection = nc.createConnection();
        return connection.connectPromise(dsn)
        .then(() => connection.executePromise(`
            DROP TABLE ${schema}.${tableName}
        `))
        .finally(() => connection.closePromise());
    });

});