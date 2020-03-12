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
    const downloader = new SvfDownloader(FORGE_CLIENT_ID, FORGE_CLIENT_SECRET);
    await downloader.download(urn, outputDir);
}

run(process.argv[2], process.argv[3]);
