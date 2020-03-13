/*
 * Example: downloading SVF assets for all viewables in a Model Derivative URN.
 * Usage:
 *     export FORGE_CLIENT_ID=<your client id>
 *     export FORGE_CLIENT_SECRET=<your client secret>
 *     node download-svf.js <your model urn> <output folder>
 */

const { SvfDownloader } = require('..');
const { FORGE_CLIENT_ID, FORGE_CLIENT_SECRET } = process.env;

async function run(urn, outputDir = '.') {
    const downloader = new SvfDownloader({ client_id: FORGE_CLIENT_ID, client_secret: FORGE_CLIENT_SECRET });
    const download = downloader.download(urn, { outputDir, log: console.log });
    await download.ready;
}

run(process.argv[2], process.argv[3]);
