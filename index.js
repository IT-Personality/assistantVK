const express = require('express');
const puppeteer = require('puppeteer');
const cheerio = require('cheerio');

const app = express();
const port = 3000;

app.use(express.static('public')); // Для обслуживания статических файлов

app.get('/fetch-clips', async (req, res) => {
    const url = req.query.url; // Получение URL из параметра запроса

    if (!url) {
        return res.status(400).send('Не указан URL сообщества.');
    }

    let browser;
    let page;
    try {
        browser = await puppeteer.launch({ 
            headless: true,
            executablePath: '/opt/render/.cache/puppeteer/chrome-linux/chrome', // Указание пути к Chrome
            args: [
                '--no-sandbox',
                '--disable-setuid-sandbox',
                '--disable-dev-shm-usage',
                '--disable-accelerated-2d-canvas',
                '--disable-gpu',
                '--no-zygote',
                '--single-process', // Необходим для некоторых хостингов
                '--disable-gl-drawing-for-tests',
                '--disable-background-timer-throttling',
                '--disable-backgrounding-occluded-windows',
                '--disable-breakpad',
                '--disable-component-extensions-with-background-pages',
                '--disable-features=TranslateUI,BlinkGenPropertyTrees',
                '--disable-ipc-flooding-protection',
                '--disable-renderer-backgrounding',
                '--disable-dev-shm-usage',
                '--force-color-profile=srgb',
                '--metrics-recording-only',
                '--no-first-run',
                '--no-sandbox',
                '--no-default-browser-check',
                '--disable-default-apps',
                '--disable-extensions',
                '--disable-hang-monitor',
                '--disable-popup-blocking',
                '--disable-prompt-on-repost',
                '--disable-sync',
                '--disable-translate',
                '--metrics-recording-only',
                '--mute-audio',
                '--no-first-run',
                '--safebrowsing-disable-auto-update',
                '--enable-automation',
                '--password-store=basic',
                '--use-mock-keychain',
            ],
        });

        page = await browser.newPage();
        await page.goto(url, { waitUntil: 'networkidle2' });

        let previousHeight;
        while (true) {
            previousHeight = await page.evaluate('document.body.scrollHeight');
            await page.evaluate('window.scrollTo(0, document.body.scrollHeight)');
            await new Promise(resolve => setTimeout(resolve, 200));
            const newHeight = await page.evaluate('document.body.scrollHeight');
            if (newHeight === previousHeight) break;
        }

        const content = await page.content();
        const $ = cheerio.load(content);

        const clips = [];

        $('a.ShortVideoGridItem').each((index, element) => {
            // Изменение ссылки на клип
            let relativeVideoUrl = $(element).attr('href');
            if (relativeVideoUrl.startsWith('/')) {
                relativeVideoUrl = relativeVideoUrl.substring(1); // Удаление начального "/"
            }
            const videoUrl = `${url}?z=${relativeVideoUrl}`;
            const thumbStyle = $(element).find('div.ShortVideoGridItem__thumb').attr('style');
            const thumbUrlMatch = thumbStyle ? thumbStyle.match(/url\((.*?)\)/) : null;
            const thumbUrl = thumbUrlMatch ? thumbUrlMatch[1].replace(/['"]/g, '') : null;
            let viewsText = $(element).find('div.ShortVideoGridItem__info--views').text().trim();
            let views = parseViews(viewsText);
            clips.push({ videoUrl, thumbUrl, views });
        });

        clips.sort((a, b) => b.views - a.views);

        // Генерация HTML-ответа
        res.send(generateHTML(clips));
    } catch (error) {
        console.error('Ошибка при получении клипов:', error);
        res.status(500).send('Ошибка при получении клипов');
    } finally {
        if (page) {
            await page.close(); // Закрытие страницы после завершения работы
        }
        if (browser) {
            await browser.close(); // Закрытие браузера после завершения работы
        }
    }
});

function parseViews(viewsText) {
    if (viewsText.includes('K')) {
        return parseFloat(viewsText.replace('K', '')) * 1000;
    } else if (viewsText.includes('M')) {
        return parseFloat(viewsText.replace('M', '')) * 1000000;
    } else {
        return parseInt(viewsText.replace(/\D/g, ''), 10);
    }
}

function formatNumber(number) {
    return number.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
}

function generateHTML(clips) {
    return `
        <h1>Клипы, отсортированные по просмотрам</h1>
        <div class="container-clips">
        ${clips.map(clip => `
            <div class="clip">
                <a href="${clip.videoUrl}" target="_blank">
                    <img src="${clip.thumbUrl}" alt="Thumbnail">
                    <div class="views">${formatNumber(clip.views)} просмотров</div>
                </a>
            </div>
        `).join('')}
        </div>
    `;
}

app.get('/', (req, res) => {
    res.sendFile(__dirname + '/public/index.html');
});

app.listen(port, () => {
    console.log(`Сервер запущен на http://localhost:${port}`);
});
