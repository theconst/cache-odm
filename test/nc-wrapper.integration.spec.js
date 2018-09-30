'use strict';

require('console.table');

const config = require('./config');

const dsn = config['dsn'];

const expect = require('chai').expect;

const Bluebird = require('bluebird')
const Promise = Bluebird.Promise;

const nc = require('../js/nc-wrapper');

describe('Wrapper spec', function() {
    this.timeout(config['timeout']);

    const tableName = 'Sample.EmployeeTestTable';

    before(function() {
        const connection = nc.createConnection();

        return connection.connectPromise(dsn)
        .then(() => connection.executePromise(`
            CREATE TABLE ${tableName} (
                EMPNUM     INT NOT NULL,
                NAMELAST   CHAR(30) NOT NULL,
                NAMEFIRST  CHAR(30) NOT NULL,
                STARTDATE  TIMESTAMP,
                SALARY     MONEY,
                ACCRUEDVACATION   INT,
                ACCRUEDSICKLEAVE  INT,
                CONSTRAINT EMPLOYEEPK PRIMARY KEY (EMPNUM)
            )
        `.replace(/\r?\n/gm," "))).then(() => Promise.all([
            `1, 'Smith', 'John', '1995-09-10 13:14:23', 500.0, 1, 2`,
            `2, 'Koenig', 'Peter', '1996-08-11 13:15:23', 700.0, 10, 1`,
        ].map(e => 
            `INSERT INTO ${tableName}(EMPNUM, NAMELAST, NAMEFIRST, 
                STARTDATE, SALARY, ACCRUEDVACATION, ACCRUEDSICKLEAVE) VALUES(${e})`
                .replace(/\r?\n/gm," "))
        .map(s => connection.executePromise(s))))
        .finally(() => connection.closePromise());
    });

    it('Should create connection', function() {
        const connection = nc.createConnection();

        expect(connection).to.exist;
    });

    it('should query from prepared statement', function() {
        const connection = nc.createConnection();

        return connection.connectPromise(dsn)
        .then(() => connection.prepareStatementPromise(`
            SELECT NAMELAST AS lastName, SALARY AS salary FROM ${tableName} WHERE NAMELAST = ?
        `.replace(/\r?\n/gm, " ")))
        .tap(statement => {
            return statement.queryPromise(['Koenig'])
            .then(result => {
                console.table(result);

                expect(result).to.exist;
                expect(result).to.be.an('array');
                expect(result).to.deep.equal([
                    {
                        lastName: 'Koenig',
                        salary: '700.0000',
                    }
                ])
            });
        });
    });

    it('should query with empty result', function() {
        const connection = nc.createConnection();

        return connection.connectPromise(dsn)
        .then(() => connection.prepareStatementPromise(`
            SELECT NAMELAST AS lastName, SALARY AS salary FROM ${tableName} WHERE NAMELAST = ?
        `.replace(/\r?\n/gm, " ")))
        .tap(statement => {
            return statement.queryPromise(['EMPTY'])
                .then(result => {
                    expect(result).to.exist;
                    expect(result).to.be.an('array');
                    expect(result).to.be.empty;
                });
        });
    })

    it('should commit statements in transaction', function() {
        const connection = nc.createConnection(dsn);

        return Promise.coroutine(function*() {
            yield connection.connectPromise(dsn);

            yield connection.beginTransactionPromise('READ COMMITTED');
            
            yield connection.executePromise(`
                INSERT INTO ${tableName}(EMPNUM, NAMELAST, NAMEFIRST, 
                STARTDATE, SALARY, ACCRUEDVACATION, ACCRUEDSICKLEAVE) 
                VALUES(3, 'Smith', 'Jane', '1997-01-12 13:15:23', 300.0, 10, 1)`
                .replace(/\r?\n/gm, " "));
            
            yield connection.commitPromise();

            const res = yield connection.queryPromise(`SELECT * FROM ${tableName} WHERE EMPNUM = 3`)
            console.table(res);
            
            expect(res).to.exist;
            expect(res).to.be.an('array');

            expect(res).to.deep.equal([
                {
                    'EMPNUM': 3,
                    'NAMELAST': 'Smith',
                    'NAMEFIRST': 'Jane',
                    'STARTDATE': new Date(1997, 0, 12, 13, 15, 23, 0),
                    'SALARY': '300.0000',
                    'ACCRUEDVACATION': 10,
                    'ACCRUEDSICKLEAVE': 1,
                },
            ]);
        })();
    });

    it('should rollback statements in transaction', function() {
        const connection = nc.createConnection(dsn);

        return Promise.coroutine(function*() {
            yield connection.connectPromise(dsn);

            yield connection.beginTransactionPromise();
            
            yield connection.executePromise(`
                INSERT INTO ${tableName}(EMPNUM, NAMELAST, NAMEFIRST, 
                STARTDATE, SALARY, ACCRUEDVACATION, ACCRUEDSICKLEAVE) 
                VALUES(5, 'Smith2', 'Jane', '1997-01-12 13:15:23', 300.0, 10, 1)`
                .replace(/\r?\n/gm, " "));
            
            yield connection.rollbackPromise();

            const res = yield connection.queryPromise(`SELECT * FROM ${tableName} WHERE EMPNUM = 5`)
            console.table(res);
            
            expect(res).to.exist;
            expect(res).to.be.an('array');

            expect(res).to.deep.equal([]);
        })();
    });


    after(function() {
        const connection = nc.createConnection();
        return connection.connectPromise(dsn)
        .then(() => connection.executePromise(`
            DROP TABLE ${tableName}
        `))
        .finally(() => connection.closePromise());
    });

});