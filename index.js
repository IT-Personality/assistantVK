// const puppeteer = require('puppeteer');

// (async () => {
//   try {
//     const browser = await puppeteer.launch({
//       executablePath: '/opt/render/.cache/puppeteer/chrome/linux-127.0.6533.119/chrome-linux64/chrome'
//     });
//     const page = await browser.newPage();
//     await page.goto('https://www.google.com');
//     console.log('Page title:', await page.title());
//     await browser.close();
//   } catch (error) {
//     console.error('Error:', error);
//   }
// })();

const puppeteer = require('puppeteer');

(async () => {
  const browserFetcher = puppeteer.createBrowserFetcher();
  const revisionInfo = browserFetcher.revisionInfo('127.0.0'); // замените на нужный номер версии

  console.log('Chromium executable path:', revisionInfo.executablePath);
})();
