/*
 * Example: downloading SVF assets for all viewables in a Model Derivative URN.
 * Usage:
 *     export APS_CLIENT_ID=<your client id>
 *     export APS_CLIENT_SECRET=<your client secret>
 *     export APS_REGION=<your region> # optional, can be one of the following: "US", "EMEA", "APAC"
 *     node download-svf.js <your model urn> <output folder>
 */

const { SvfDownloader, TwoLeggedAuthenticationProvider } = require('..');
const { APS_CLIENT_ID, APS_CLIENT_SECRET, APS_REGION } = process.env;

async function run(urn, outputDir = '.') {
    const authenticationProvider = new TwoLeggedAuthenticationProvider(APS_CLIENT_ID, APS_CLIENT_SECRET);
    const downloader = new SvfDownloader(authenticationProvider);
    const download = downloader.download(urn, { outputDir, log: console.log, region: APS_REGION });
    await download.ready;
}

run(process.argv[2], process.argv[3]);
