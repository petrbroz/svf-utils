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