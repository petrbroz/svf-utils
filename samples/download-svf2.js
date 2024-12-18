const { SVF2Downloader } = require('../lib');

const { APS_ACCESS_TOKEN } = process.env;
const [,, urn, outputDir] = process.argv;

async function run() {
    const downloader = new SVF2Downloader(APS_ACCESS_TOKEN);
    await downloader.download(urn, outputDir);
}

run()
    .then(() => console.log('Done!'))
    .catch(err => {
        console.error(err);
        process.exit(1);
    });