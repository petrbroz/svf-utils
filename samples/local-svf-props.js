/*
 * Example: parsing object properties from a local set of *.json.gz files.
 * Usage:
 *     node local-svf-props.js <folder with objects_*.json.gz files>
 */

const path = require('path');
const fs = require('fs');
const { PropDbReader } = require('../lib/common/propdb-reader.js');

function run(dir) {
    const ids = fs.readFileSync(path.join(dir, 'objects_ids.json.gz'));
    const offs = fs.readFileSync(path.join(dir, 'objects_offs.json.gz'));
    const avs = fs.readFileSync(path.join(dir, 'objects_avs.json.gz'));
    const attrs = fs.readFileSync(path.join(dir, 'objects_attrs.json.gz'));
    const vals = fs.readFileSync(path.join(dir, 'objects_vals.json.gz'));
    const db = new PropDbReader(ids, offs, avs, attrs, vals);
    const numObjects = offs.length - 1;
    for (let dbid = 1; dbid < numObjects; dbid++) {
        console.log(`Properties of #${dbid}`);
        for (const prop of db.enumerateProperties(dbid)) {
            console.log(`${prop.category}: ${prop.name} = ${prop.value}`);
        }
    }
    console.log(`Children of #1: ${db.getChildren(1).join(',')}`);
}

if (process.argv.length >= 3) {
    try {
        run(process.argv[2]);
    } catch (err) {
        console.error(err);
        process.exit(1);
    }
} else {
    console.log('Usage:');
    console.log('  node local-svf-props.js <folder with objects_*.json.gz files>');
}
