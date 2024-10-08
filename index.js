const express = require('express');
const axios = require('axios');

const app = express();
const port = 3000;
app.use(express.static('public'));


const VK_GROUP_API_URL = 'https://api.vk.com/method/groups.getById';
const VK_API_URL = 'https://api.vk.com/method/shortVideo.getOwnerVideos';
const API_VERSION = '5.131';
const ACCESS_TOKEN = 'ВАШ ВК ТОКЕН';

async function getOwnerIdAndNameFromGroupName(groupName) {
  try {
    const response = await axios.get(VK_GROUP_API_URL, {
      params: {
        group_ids: groupName,
        access_token: ACCESS_TOKEN,
        v: API_VERSION
      }
    });

    if (response.data.response && response.data.response[0]) {
      const group = response.data.response[0];
      return {
        id: -group.id, // ID сообщества 
        name: group.name // Имя сообщества
      };
    } else {
      throw new Error('Не удалось получить данные группы');
    }
  } catch (error) {
    throw new Error(`Ошибка получения данных группы: ${error.message}`);
  }
}

const params = {
  access_token: ACCESS_TOKEN,
  v: API_VERSION,
  count: 100
};
let allClips = [];

// Функция для получения всех клипов из сообщества
function fetchClips(ownerId, startFrom = null) {
    return axios.get(VK_API_URL, {
      params: { ...params, owner_id: ownerId, start_from: startFrom }
    }).then(response => {
      if (response.data.response) {
        const clips = response.data.response.items;
        const newClips = clips.filter(clip => !allClips.some(existingClip => existingClip.id === clip.id));
        allClips.push(...newClips);
  
        const nextFrom = response.data.response.next_from;
        if (nextFrom) {
          return fetchClips(ownerId, nextFrom);
        }
      } else {
        console.error('Ошибка получения данных:', response.data.error || 'Неизвестная ошибка');
      }
    }).catch(error => {
      console.error('Ошибка запроса:', error.message);
    });
  }
  
function sortClipsByViews(clips) {
  return clips.sort((a, b) => b.views - a.views);
}

function isValidVkClipUrl(url) {
  const regex = /^https:\/\/vk\.com\/clips\/[\w.-]+$/;
  return regex.test(url);
}

function getHighResolutionThumbnail(images) {
  if (!Array.isArray(images) || images.length === 0) {
    return 'https://via.placeholder.com/1080x1920?text=No+Image';
  }

  const highResImage = images.reduce((prev, current) => {
    return prev.width * prev.height > current.width * current.height ? prev : current;
  });

  return highResImage.url;
}

// Функция для получения ссылки на клип в нужном формате
function getClipUrl(clip, ownerId, baseClipUrl) {
    const clipId = clip.clip_id || clip.id || clip.video_id;
    if (!clipId) {
      console.warn('Идентификатор клипа не найден:', clip);
      return '#';
    }
    return `https://vk.com/clips/${baseClipUrl}/?z=clip${ownerId}_${clipId}`;
  }
  
// Генерация HTML для отображения клипов
function generateHTML(clips, communityName, ownerId, baseClipUrl) {
    return `
      <h1 class="container h1-group">Клипы сообщества «${communityName}»</h1>
      <div class="container-clips">
      ${clips
        .map((clip) => {
          const thumbnailUrl = getHighResolutionThumbnail(clip.image || clip.first_frame || []);
          const clipUrl = getClipUrl(clip, ownerId, baseClipUrl);
          return `
            <div class="clip">
              <a href="${clipUrl}" target="_blank">
                <img src="${thumbnailUrl}" alt="Thumbnail">
                <div class="views">${formatNumber(clip.views)} просмотров</div>
              </a>
            </div>
          `;
        })
        .join('')}
      </div>
    `;
  }
// Форматирование числа просмотров
function formatNumber(number) {
  return number.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
}
app.get('/fetch-clips', async (req, res) => {
  const { url, startDate, endDate } = req.query;

  if (!url) {
      return res.status(400).send('<div class="text-center"><p>URL не предоставлен</p></div>');
  }
  if (!isValidVkClipUrl(url)) {
      return res.status(400).send('<div class="text-center"><p>Ссылка некорректна</p></div>');
  }

  try {
      allClips = [];

      const groupName = url.match(/vk\.com\/clips\/([^\/]+)/)[1];
      const { id: ownerId, name: communityName } = await getOwnerIdAndNameFromGroupName(groupName);
      let fetchedClips = await fetchClips(ownerId, startDate, endDate);
      const sortedClips = sortClipsByViews(fetchedClips);
      const baseClipUrl = url.split('/clips/')[1];

      res.send(generateHTML(sortedClips, communityName, ownerId, baseClipUrl));
  } catch (error) {
      console.error('Ошибка при обработке запроса:', error.message);
      res.status(500).send(
          `<div class="text-center">
              <p>Ошибка при обработке запроса</p>
          </div>`
      );
  }
});

function filterClipsByDate(clips, startDate, endDate) {
  const start = new Date(startDate).getTime();
  const end = new Date(endDate).getTime();

  return clips.filter(clip => {
      const clipDate = new Date(clip.date * 1000).getTime(); // Конвертация Unix времени в миллисекунды
      return clipDate >= start && clipDate <= end;
  });
}

  
async function fetchClips(ownerId, startDate = null, endDate = null, startFrom = null) {
  const clips = [];
  const start = startDate ? new Date(startDate).getTime() : null;
  const end = endDate ? new Date(endDate).getTime() : null;

  while (true) {
      try {
          const queryParams = { ...params, owner_id: ownerId, start_from: startFrom };
          const response = await axios.get(VK_API_URL, { params: queryParams });

          if (response.data.response) {
              const fetchedClips = response.data.response.items;

              if (!fetchedClips.length) break;

              for (const clip of fetchedClips) {
                  const clipDate = new Date(clip.date * 1000).getTime();

                  if ((!start || !end) || (clipDate >= start && clipDate <= end)) {
                      clips.push(clip);
                  } else if (start && clipDate < start) {
                      return clips;
                  }
              }

              startFrom = response.data.response.next_from;
              if (!startFrom) break; 
          } else {
              console.error('Ошибка получения данных:', response.data.error || 'Неизвестная ошибка');
              break;
          }
      } catch (error) {
          console.error('Ошибка запроса:', error.message);
          break;
      }
  }
  return clips;
}
  
app.get('/', (req, res) => {
  res.sendFile(__dirname + '/public/index.html');
});
app.listen(port, () => {
  console.log(`Сервер запущен на http://localhost:${port}`);
});
