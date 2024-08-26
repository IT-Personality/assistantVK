const puppeteer = require('puppeteer-core');

(async () => {
  try {
    const browser = await puppeteer.launch({
      executablePath: '/opt/render/project/src/chrome/linux-128.0.6613.84/chrome-linux64/chrome' // Используйте найденный путь
    });
    const page = await browser.newPage();
    await page.goto('https://www.google.com');
    console.log('Page title:', await page.title());
    await browser.close();
  } catch (error) {
    console.error('Error:', error);
  }
})();
