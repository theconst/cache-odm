const ftools = {

    sequence: (array, unit) => {
        // preallocate for better performance
        let i = 0;
        const result = new Array(array.length);

        return array.reduce((r1, r2) => r1.flatMap(v => r2.map(w => (v[i++] = w, v))), unit(result));
    },

    flatMap: (array, fn) => {
        let size = 0; 
        
        const length = array.length;
        const mapped = new Array(length);
        for (let i = 0; i < length; ++i) {
            size += (mapped[i] = fn(array[i])).length;
        }

        const result = new Array(size);
        for (let i = 0, k = 0; i < length; ++i) {
            const batch = mapped[i];
            for (let j = 0; j < batch.length; ++j) {
                result[k++] = batch[j];
            }
        }
        return result;
    },

    flat: (array) => {
        return ftools.flatMap(array, x => x);
    }
    
};

module.exports = ftools;