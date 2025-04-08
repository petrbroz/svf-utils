/**
 * A sample script that downloads an SVF2 model from the Model Derivative service.
 *
 * Usage:
 *
 *     node download-svf2.js <urn> <outputDir>
 *
 * - `urn` is the URN of the SVF2 file to download.
 * - `outputDir` is the directory to save the downloaded SVF2 file.
 *
 * Set the following environment variables:
 *
 * - `APS_CLIENT_ID`: client ID of your APS application.
 * - `APS_CLIENT_SECRET`: client secret of your APS application.
 *
 * Alternatively, you can set the following environment variable:
 *
 * - `APS_ACCESS_TOKEN`: existing access token (with "viewables:read" scope).
 */

const { SVF2Downloader } = require('..');
const { initializeAuthenticationProvider } = require('./shared.js');

const [,, urn, outputDir] = process.argv;
if (!urn || !outputDir) {
    console.error('Usage: node download-svf2.js <urn> <outputDir>');
    process.exit(1);
}

const authenticationProvider = initializeAuthenticationProvider();
const downloader = new SVF2Downloader(authenticationProvider);
downloader.download(urn, outputDir)
    .then(() => console.log('Done!'))
    .catch(err => {
        console.error(err);
        process.exit(1);
    });