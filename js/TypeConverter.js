const tryParseDate = date => {
    const type = typeof date;

    if (type === 'string') {
        return new Date(date);
    } else if (type === 'object') {
        return date;
    } else if (type === 'number') {
        return new Date(date);
    } else {
        throw new TypeError('Cannot coerce to date type');
    }
};

const handleDate = date => {
    const parsed = tryParseDate(date);

    return {
        'day': parsed.getDay(),
        'month': parsed.getMonth() + 1,
        'year': parsed.getFullYear(),
    };
};

const handleDateTime = datetime => {
    const parsed = tryParseDate(datetime);
    return Object.assign(handleDate(parsed), {
        'hours': parsed.getHours(),
        'minutes': parsed.getMinutes(),
        'seconds': parsed.getSeconds(),
        'fractionalSeconds': parsed.getMilliseconds(),
    })
};

module.exports = {
    convert: (value, type) => {
        const handler = {
            'date': handleDate,
            'datetime': handleDateTime,
            'timestamp': handleDateTime, 
        }[type];
        return handler && handler(value) || value;
    }
};