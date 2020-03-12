const fse = require('fs-extra');
const validator = require('gltf-validator');

async function validate(gltfPath) {
    try {
        const manifest = fse.readFileSync(gltfPath);
        const { validatorVersion, validatedAt, issues } = await validator.validateBytes(new Uint8Array(manifest));
        console.log('Validator version:', validatorVersion);
        console.log('Validated at:', validatedAt);
        console.log('Number of errors:', issues.numErrors);
        console.log('Number of warnings:', issues.numWarnings);
        console.log('Number of infos:', issues.numInfos);
        console.log('Number of hits:', issues.numHints);
        console.table(issues.messages);
        process.exit(issues.numErrors > 0 ? 1 : 0);
    } catch (err) {
        console.error(err);
        process.exit(2);
    }
}

validate(process.argv[2]);
