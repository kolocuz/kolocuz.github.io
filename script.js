// script.js
let allPhotos = [];
let currentPassword = null;

async function loadMetadata() {
    try {
        const response = await fetch('images/_data.json?t=' + Date.now());
        if (!response.ok) throw new Error('Нет метаданных');
        allPhotos = await response.json();
        renderFilters();
        renderGallery();
    } catch(e) {
        console.error('Ошибка загрузки метаданных:', e);
        document.getElementById('gallery').innerHTML = '<p>Нет загруженных фото. Добавьте фото через upload-tool.html</p>';
    }
}

function renderFilters() {
    const categories = [...new Set(allPhotos.map(p => p.category))];
    const filterSelect = document.getElementById('categoryFilter');
    filterSelect.innerHTML = '<option value="all">Все категории</option>';
    categories.forEach(cat => {
        filterSelect.innerHTML += `<option value="${cat}">${cat}</option>`;
    });
}

async function decryptAndDisplayImage(encryptedBase64, password) {
    try {
        const blob = await decryptPhoto(encryptedBase64, password);
        return URL.createObjectURL(blob);
    } catch(e) {
        console.error('Ошибка расшифровки:', e);
        return null;
    }
}

function renderGallery() {
    const category = document.getElementById('categoryFilter').value;
    const filtered = category === 'all' ? allPhotos : allPhotos.filter(p => p.category === category);
    const gallery = document.getElementById('gallery');
    
    gallery.innerHTML = filtered.map(photo => `
        <div class="card" data-id="${photo.id}" data-path="${photo.encryptedPath}" data-password="${photo.isEncrypted && !currentPassword ? 'locked' : ''}">
            <div class="card-img" style="background: #1a1a1a; display: flex; align-items: center; justify-content: center;">
                ${currentPassword ? '<div style="color:#888;">🔒 расшифровывается...</div>' : '<div style="color:#888;">🔒 зашифровано</div>'}
            </div>
            <div class="card-info">
                <div class="card-title">${photo.title || photo.filename} 
                    ${photo.unlisted ? '<span class="unlisted-badge">Unlisted</span>' : ''}
                </div>
                <div class="card-meta">📅 ${photo.date || '—'} | 👤 ${photo.author || 'Аноним'}</div>
                <div class="card-meta">📁 ${photo.category} | ${photo.downloadAllowed ? '⬇️ разрешено' : '🔒 без скачивания'}</div>
            </div>
        </div>
    `).join('');
    
    // Вешаем обработчики на карточки
    document.querySelectorAll('.card').forEach(card => {
        card.addEventListener('click', async (e) => {
            e.stopPropagation();
            const id = card.dataset.id;
            const photo = allPhotos.find(p => p.id === id);
            if (!photo) return;
            
            if (photo.isEncrypted && !currentPassword) {
                const pwd = prompt('Введите пароль для расшифровки:');
                if (!pwd) return;
                currentPassword = pwd;
                await renderGallery(); // перерендер
                // автоматически открываем после ввода пароля
                setTimeout(() => card.click(), 100);
                return;
            }
            
            // Открыть просмотр
            window.location.href = `view.html?id=${photo.id}&password=${encodeURIComponent(currentPassword || '')}`;
        });
    });
    
    // Если есть пароль — расшифруем превью
    if (currentPassword) {
        for (let photo of filtered) {
            if (photo.isEncrypted) {
                const card = document.querySelector(`.card[data-id="${photo.id}"]`);
                if (card) {
                    try {
                        const encResponse = await fetch(photo.encryptedPath);
                        const encBase64 = await encResponse.text();
                        const imgUrl = await decryptAndDisplayImage(encBase64, currentPassword);
                        if (imgUrl) {
                            const imgDiv = card.querySelector('.card-img');
                            imgDiv.innerHTML = `<img src="${imgUrl}" style="width:100%; height:100%; object-fit:cover;">`;
                        }
                    } catch(e) {}
                }
            }
        }
    }
}

document.getElementById('decryptAllBtn').addEventListener('click', () => {
    const pwd = prompt('Введите мастер-пароль для всей галереи:');
    if (pwd) {
        currentPassword = pwd;
        renderGallery();
    }
});

document.getElementById('categoryFilter').addEventListener('change', renderGallery);

loadMetadata();
