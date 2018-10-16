const handleDate = date => ({
    'day': date.getDay(),
    'month': date.getMonth() + 1,
    'year': date.getFullYear(),
});

const handleDateTime = datetime => Object.assign(handleDate(datetime), {
    'hours': datetime.getHours(),
    'minutes': datetime.getMinutes(),
    'seconds': datetime.getSeconds(),
    'fractionalSeconds': datetime.getMilliseconds(),
});

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