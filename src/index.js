const path = require('path');

const { deserialize } = require('./svf/deserialize');
const { serialize } = require('./gltf/serialize')

if (process.argv.length < 4) {
    console.log('Usage: node src/index.js <input-file-path> <output-dir-path>');
} else {
    const model = deserialize(process.argv[2]);
    serialize(model, path.join(process.argv[3], 'output'));
}