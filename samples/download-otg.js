/*
 * Example: downloading OTG assets for all viewables in a Model Derivative URN.
 * The script will generate the following folder structure under the output folder:
 * - <output folder>
 *   - <urn folder>
 *     - <guid folder>
 *     - <guid folder>
 *   - <urn folder>
 *     - <guid folder>
 *     - <guid folder>
 *   - <"g" folder with all shared geometries>
 *     - <hash file with geometry content>
 *     - <hash file with geometry content>
 *   - <"m" folder with all shared materials>
 *     - <hash file with material json>
 *     - <hash file with material json>
 *   - <"t" folder with all shared textures>
 *     - <hash file with texture image>
 *     - <hash file with texture image>
 * Usage:
 *     export FORGE_CLIENT_ID=<your client id>
 *     export FORGE_CLIENT_SECRET=<your client secret>
 *     node download-otg.js <your model urn> <output folder>
 */

const { OtgDownloader } = require('..');
const { FORGE_CLIENT_ID, FORGE_CLIENT_SECRET } = process.env;

async function run(urn, outputDir = '.') {
    const downloader = new OtgDownloader(FORGE_CLIENT_ID, FORGE_CLIENT_SECRET);
    const download = downloader.download(urn, { outputDir, log: console.log });
    await download.ready;
}

run(process.argv[2], process.argv[3]);
