const express = require('express');
const cheerio = require('cheerio');
const Mutex = require('async-mutex').Mutex;

const app = express();
const port = 3000;
app.use(express.static('public'));

const mutex = new Mutex();

const puppeteer = require('puppeteer-core'); 
const chromiumPath = '/opt/render/project/src/chrome/linux-128.0.6613.84/chrome-linux64/chrome';
let browser;
async function startBrowser() {
    try {
        browser = await puppeteer.launch({
            headless: true,
            executablePath: chromiumPath,
            args: [
                '--disable-setuid-sandbox',
                '--no-sandbox',
                '--disable-dev-shm-usage',
                '--single-process',
                '--no-zygote'
            ]
        });
        console.log('Браузер запущен и готов к работе');
    } catch (error) {
        console.error('Ошибка при запуске браузера:', error);
    }
}

app.get('/fetch-clips', async (req, res) => {
    const url = req.query.url;

    if (!url) {
        return res.status(400).send(
            `<div class="text-center">
                <p>Не указан URL сообщества</p>
            </div>`);
    }

    if (!isValidVkClipUrl(url)) {
        return res.status(400).send(
            `<div class="text-center">
                <p>Ссылка некорректна</p>
            </div>`
        );
    }

    let page;
    try {
        await mutex.runExclusive(async () => {
            if (!browser) {
                await startBrowser();
            }

            page = await browser.newPage();

            await page.setRequestInterception(true);
            page.on('request', (request) => {
                if (['image', 'stylesheet', 'font', 'media'].includes(request.resourceType())) {
                    request.abort();
                } else {
                    request.continue();
                }
            });

            await page.goto(url, { waitUntil: 'networkidle2' });

            // Проверка на 404 Not Found
            const title = await page.title();
            if (title.includes('404 Not Found')) {
                return res.status(404).send(
                    `<div class="text-center">
                        <p>Страница не найдена (404 Not Found)</p>
                    </div>`
                );
            }

            let previousHeight;
            while (true) {
                previousHeight = await page.evaluate('document.body.scrollHeight');
                await page.evaluate('window.scrollTo(0, document.body.scrollHeight)');

                await new Promise(resolve => setTimeout(resolve, 300)); // Начальная задержка для загрузки контента
                const newHeight = await page.evaluate('document.body.scrollHeight');

                if (newHeight === previousHeight) {
                    await new Promise(resolve => setTimeout(resolve, 1000)); // Дополнительная задержка для загрузки контента
                    const finalHeight = await page.evaluate('document.body.scrollHeight');
                    if (finalHeight === newHeight) break;
                }
            }

            const content = await page.content();
            const $ = cheerio.load(content);

            // Извлечение названия сообщества
            const communityName = $('a.ui_crumb').text().trim() || 'Сообщество';

            const clips = [];

            $('a.ShortVideoGridItem').each((index, element) => {
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

            res.send(generateHTML(clips, communityName)); // Передача названия сообщества
        });
    } catch (error) {
        console.error('Ошибка при получении клипов:', error);
        res.status(500).send('Ошибка при получении клипов');
    } finally {
        if (page) {
            await page.close();
        }
    }
});

function isValidVkClipUrl(url) {
    const regex = /^https:\/\/vk\.com\/clips\/[\w-]+$/;
    return regex.test(url);
}

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

function generateHTML(clips, communityName) {
    return `
        <h1 class="container h1-group">Клипы сообщества «${communityName}»</h1>
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

app.listen(port, async () => {
    console.log(`Сервер запущен на http://localhost:${port}`);
    await startBrowser();
});

process.on('exit', async () => {
    if (browser) {
        await browser.close();
        console.log('Браузер закрыт');
    }
});



// const puppeteer = require('puppeteer-core'); 
// const chromiumPath = '/opt/render/project/src/chrome/linux-128.0.6613.84/chrome-linux64/chrome';
// executablePath: chromiumPath
