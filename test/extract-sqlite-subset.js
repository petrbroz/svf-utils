// Script for generating new glTF from a sqlite manifest using a specific filter,
// in this case only including objects with "Structural Material" property containing the word "Concrete".
// Usage:
//     node test/extract-sqlite-subset.js path/to/manifest.sqlite path/to/new.gltf

const fse = require('fs-extra');

const { deserialize } = require('../lib/gltf/sqlite');

async function extract(inputSqlitePath, newGltfPath) {
    const filter = 'SELECT DISTINCT dbid FROM properties WHERE name = "Structural Material" AND value LIKE "%Concrete%"';
    console.log('Creating new gltf:', newGltfPath);
    console.log('From sqlite manifest:', inputSqlitePath);
    console.log('Only including objects matching:', filter);
    try {
        const gltf = await deserialize(inputSqlitePath, filter);
        fse.writeJsonSync(newGltfPath, gltf, { spaces: 2 });
        console.log('Done!');
    } catch(err) {
        console.error(err);
    }
}

extract(process.argv[2], process.argv[3]);
