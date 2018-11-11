'use strict';

const config = require('./config');

const expect = require('chai').expect;

const sut = require('../js/TypeConverter');


describe('Persistent spec', function() {
    this.timeout(config['timeout']);

    it('should convert date to date object', function() {
        const date = new Date();

        const actual = sut.convert(date, 'date');

        const expected = {
            'day': date.getDay(),
            'month': date.getMonth() + 1,
            'year': date.getFullYear(),
        }

        expect(actual).to.deep.equal(expected);
    });

    it('should convert datetime and timestamp object', function() {
        ['datetime', 'timestamp'].forEach(t => {
            const date = new Date();

            const actual = sut.convert(date, t);
    
            const expected = {
                'day': date.getDay(),
                'month': date.getMonth() + 1,
                'year': date.getFullYear(),
                'seconds': date.getSeconds(),
                'minutes': date.getMinutes(),
                'hours': date.getHours(),
                'fractionalSeconds': date.getMilliseconds(),
            }
    
            expect(actual).to.deep.equal(expected);
        });
    });

});