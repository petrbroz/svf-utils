const fse = require('fs-extra');

const { deserialize } = require('../lib/gltf/sqlite');

async function extract(inputSqlitePath, newGltfPath) {
    const filter = 'dbid < 4000';
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
