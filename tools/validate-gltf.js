const fs = require('fs');
const path = require('path');
const validator = require('gltf-validator');

async function validate(filepaths) {
    const log = fs.createWriteStream(path.join(__dirname, 'validate-gltf.log'));
    let failed = false;
    for (const filepath of filepaths) {
        const asset = fs.readFileSync(filepath);
        const report = await validator.validateBytes(new Uint8Array(asset));
        if (report.issues.numErrors > 0) {
            log.write('Validation failed: ' + filepath + '\n');
            log.write(report.issues.messages.map(msg => JSON.stringify(msg)).join('\n'));
            failed = true;
        } else {
            log.write('Validation succeeded: ' + filepath + '\n');
            log.write(report.issues.messages.map(msg => JSON.stringify(msg)).join('\n'));
        }        
    }
    log.on('finish', function () {
        process.exit(failed ? 1 : 0);
    });
    log.close();
}

validate(process.argv.slice(2));
