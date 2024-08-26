const express = require('express');

const cheerio = require('cheerio');

const app = express();
const port = 3000;
app.use(express.static('public')); // Для обслуживания статических файлов

const puppeteer = require('puppeteer-core'); 
const chromiumPath = '/opt/render/project/src/chrome/linux-128.0.6613.84/chrome-linux64/chrome';

app.get('/fetch-clips', async (req, res) => {
    const url = req.query.url;

    if (!url) {
        return res.status(400).send('Не указан URL сообщества.');
    }

    let browser;
    let page;
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

        page = await browser.newPage();

        // Отключение загрузки изображений и других ненужных ресурсов
        await page.setRequestInterception(true);
        page.on('request', (request) => {
            if (['image', 'stylesheet', 'font', 'media'].includes(request.resourceType())) {
                request.abort();
            } else {
                request.continue();
            }
        });

        await page.goto(url, { waitUntil: 'networkidle2' });

        let previousHeight;
        while (true) {
            previousHeight = await page.evaluate('document.body.scrollHeight');
            await page.evaluate('window.scrollTo(0, document.body.scrollHeight)');

            // Использование setTimeout для добавления паузы
            await new Promise(resolve => setTimeout(resolve, 500)); // Начальная задержка для загрузки контента
            const newHeight = await page.evaluate('document.body.scrollHeight');
            
            if (newHeight === previousHeight) {
                await new Promise(resolve => setTimeout(resolve, 1000)); // Дополнительная задержка для загрузки контента
                const finalHeight = await page.evaluate('document.body.scrollHeight');
                if (finalHeight === newHeight) break;
            }
        }

        const content = await page.content();
        const $ = cheerio.load(content);

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



// const puppeteer = require('puppeteer-core'); 
// const chromiumPath = '/opt/render/project/src/chrome/linux-128.0.6613.84/chrome-linux64/chrome';
// executablePath: chromiumPath
