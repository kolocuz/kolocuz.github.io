(function() {
    // ========== КОНФИГУРАЦИЯ ==========
    const API_BASE = 'https://yandex-proxy-murex.vercel.app/api';
    const MAX_FILE_SIZE = 50 * 1024 * 1024; // 50 МБ
    
    let settings = {
        lightTheme: false,
        colorTheme: 'blue',
        experimental2k: false
    };
    
    let currentUser = '';
    let currentSeed = '';
    let messages = [];
    let chats = [];
    let activeChatId = null;
    let unreadCount = new Map();
    let selectedFiles = [];
    let isUploading = false;
    let isSending = false;
    let pollInterval = null;
    let isAtBottom = true;
    let imageQuality = '720p';

    // Элементы DOM
    const $ = id => document.getElementById(id);
    
    // ========== VERCEL BLOB КЛИЕНТ ==========
    const blobClient = {
        async uploadFile(file) {
            if (!file.type.startsWith('image/') && !file.type.startsWith('audio/')) {
                throw new Error('Можно загружать только изображения и аудио');
            }

            let fileToUpload = file;
            if (file.type.startsWith('image/')) {
                fileToUpload = await this.compressImage(file);
            }

            const params = new URLSearchParams({
                filename: fileToUpload.name,
                filetype: fileToUpload.type
            });
            
            const response = await fetch(`${API_BASE}/generate-upload-url?${params}`);
            if (!response.ok) throw new Error('Failed to get upload URL');
            
            const { url, downloadUrl } = await response.json();

            const uploadRes = await fetch(url, {
                method: 'PUT',
                body: fileToUpload,
                headers: { 'Content-Type': fileToUpload.type }
            });

            if (!uploadRes.ok) throw new Error('Upload failed');

            return {
                url: downloadUrl,
                name: file.name,
                size: fileToUpload.size
            };
        },

        compressImage(file) {
            const settings = {
                '720p': { maxWidth: 1280, maxHeight: 720, quality: 0.8 },
                '1080p': { maxWidth: 1920, maxHeight: 1080, quality: 0.85 }
            };
            const { maxWidth, maxHeight, quality } = settings[imageQuality];

            return new Promise((resolve) => {
                const reader = new FileReader();
                reader.onload = (e) => {
                    const img = new Image();
                    img.onload = () => {
                        let { width, height } = img;
                        if (width > height) {
                            if (width > maxWidth) {
                                height *= maxWidth / width;
                                width = maxWidth;
                            }
                        } else {
                            if (height > maxHeight) {
                                width *= maxHeight / height;
                                height = maxHeight;
                            }
                        }
                        const canvas = document.createElement('canvas');
                        canvas.width = width;
                        canvas.height = height;
                        canvas.getContext('2d').drawImage(img, 0, 0, width, height);
                        canvas.toBlob(blob => {
                            resolve(new File([blob], file.name, { type: file.type }));
                        }, file.type, quality);
                    };
                    img.src = e.target.result;
                };
                reader.readAsDataURL(file);
            });
        }
    };

    // ========== VERCEL KV КЛИЕНТ ==========
    const kvClient = {
        async getMessages(seed) {
            try {
                const response = await fetch(`${API_BASE}/messages?seed=${encodeURIComponent(seed)}`);
                if (!response.ok) return [];
                return await response.json();
            } catch {
                return [];
            }
        },

        async addMessage(seed, message) {
            try {
                const response = await fetch(`${API_BASE}/messages?seed=${encodeURIComponent(seed)}`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ message })
                });
                return response.ok;
            } catch {
                return false;
            }
        }
    };

    // ========== УПРАВЛЕНИЕ ЧАТАМИ ==========
    const loadChats = () => {
        try {
            const saved = localStorage.getItem('chats');
            chats = saved ? JSON.parse(saved) : [];
        } catch {
            chats = [];
        }
        
        const activeId = localStorage.getItem('activeChatId');
        if (activeId && chats.some(c => c.id === activeId)) {
            activeChatId = activeId;
        } else if (chats.length) {
            activeChatId = chats[0].id;
        } else {
            activeChatId = null;
        }

        if (chats.length) {
            $('login-screen').style.display = 'none';
            $('chat-screen').style.display = 'flex';
            if (activeChatId) switchToChat(activeChatId);
        } else {
            $('login-screen').style.display = 'flex';
            $('chat-screen').style.display = 'none';
        }
        renderChatList();
    };

    const saveChats = () => {
        localStorage.setItem('chats', JSON.stringify(chats));
        if (activeChatId) localStorage.setItem('activeChatId', activeChatId);
    };

    const renderChatList = () => {
        const list = $('chat-list');
        if (!list) return;
        
        list.innerHTML = '';
        chats.forEach(chat => {
            const div = document.createElement('div');
            div.className = `chat-item ${chat.id === activeChatId ? 'active' : ''}`;
            div.dataset.id = chat.id;
            div.innerHTML = `
                <div style="display: flex; justify-content: space-between;">
                    <div>
                        <div class="chat-name">${escapeHtml(chat.name)}</div>
                        <div style="font-size:0.8rem;">${escapeHtml(chat.seed.substring(0, 8))}...</div>
                    </div>
                    <button class="delete-chat" data-id="${chat.id}">✖</button>
                </div>
            `;
            list.appendChild(div);
        });
    };

    const switchToChat = async (id) => {
        const chat = chats.find(c => c.id === id);
        if (!chat) return;

        activeChatId = id;
        currentUser = chat.name;
        currentSeed = chat.seed;
        
        $('display-name').innerText = chat.name;
        $('currentUserDisplay').innerText = currentUser;
        
        await loadMessages();
        saveChats();
        renderChatList();
    };

    const addChat = (name, seed) => {
        const id = Date.now().toString();
        chats.push({ id, name, seed });
        activeChatId = id;
        saveChats();
        renderChatList();
        switchToChat(id);
        $('login-screen').style.display = 'none';
        $('chat-screen').style.display = 'flex';
    };

    // ========== СООБЩЕНИЯ ==========
 const loadMessages = async () => {
    if (!activeChatId) return;
    const chat = chats.find(c => c.id === activeChatId);
    if (!chat) return;

    try {
        const apiUrl = `https://yandex-proxy-murex.vercel.app/api/messages?seed=${encodeURIComponent(chat.seed)}`;
        console.log('📡 Загружаем сообщения с:', apiUrl); // ПОСМОТРИТЕ ЭТОТ ЛОГ В КОНСОЛИ БРАУЗЕРА

        const response = await fetch(apiUrl, {
            method: 'GET',
            headers: {
                'Content-Type': 'application/json'
            }
        });

        console.log('📊 Статус ответа:', response.status); // И ЭТОТ

        if (!response.ok) {
            const errorText = await response.text();
            console.error('❌ Текст ошибки:', errorText);
            throw new Error(`HTTP error! status: ${response.status}`);
        }

        const msgs = await response.json();
        console.log('💬 Получены сообщения:', msgs); // И ЭТОТ
        messages = msgs;
        renderMessages();
    } catch (error) {
        console.error('❌ Ошибка загрузки сообщений:', error);
        showError('Не удалось загрузить сообщения');
    }
};

    const renderMessages = () => {
        const container = $('messages');
        if (!container) return;

        container.innerHTML = '';
        if (!messages.length) {
            container.innerHTML = '<center>Нет сообщений. Напишите что-нибудь!</center>';
            return;
        }

        messages.forEach(msg => {
            const row = document.createElement('div');
            row.className = `message-row ${msg.name === currentUser ? 'own' : 'other'}`;

            let html = '';
            if (msg.name !== currentUser) {
                html += `<div class="avatar"><span>${escapeHtml(msg.name.charAt(0))}</span></div>`;
            }

            html += `<div class="message-content">`;
            if (msg.name !== currentUser) {
                html += `<div class="sender-name">${escapeHtml(msg.name)}</div>`;
            }
            html += `<div class="bubble">`;

            if (msg.text) {
                html += `<div>${escapeHtml(msg.text)}</div>`;
            }

            if (msg.files && msg.files.length) {
                msg.files.forEach(f => {
                    if (f.url.match(/\.(jpeg|jpg|gif|png|webp)$/i)) {
                        html += `<div class="file-preview"><img src="${f.url}" alt="${f.name}" style="max-width:200px; max-height:200px; border-radius:8px;"></div>`;
                    } else if (f.url.match(/\.(mp3|wav|ogg|m4a)$/i)) {
                        html += `<audio controls src="${f.url}" style="width:100%;"></audio>`;
                    } else {
                        html += `<div><a href="${f.url}" target="_blank">📎 ${escapeHtml(f.name)}</a></div>`;
                    }
                });
            }

            html += `<div class="message-time">${new Date(msg.time).toLocaleTimeString()}</div>`;
            html += `</div></div>`;

            row.innerHTML = html;
            container.appendChild(row);
        });

        if (isAtBottom) {
            container.scrollTop = container.scrollHeight;
        }
    };

    const sendMessage = async () => {
        if (isSending) return;
        
        const text = $('msgInput').value.trim();
        const files = [...selectedFiles];
        if (!text && files.length === 0) return;

        isSending = true;
        $('sendBtn').disabled = true;

        try {
            const uploadedFiles = [];
            for (const file of files) {
                try {
                    const result = await blobClient.uploadFile(file);
                    uploadedFiles.push({
                        url: result.url,
                        name: result.name,
                        size: result.size
                    });
                } catch (e) {
                    showWarning(`Не удалось загрузить ${file.name}`);
                }
            }

            const message = {
                id: Date.now() + '-' + Math.random().toString(36),
                name: currentUser,
                time: Date.now(),
                text: text,
                files: uploadedFiles,
                reactions: {}
            };

            const chat = chats.find(c => c.id === activeChatId);
            if (chat) {
                const success = await kvClient.addMessage(chat.seed, message);
                if (success) {
                    messages.push(message);
                    renderMessages();
                }
            }

            $('msgInput').value = '';
            selectedFiles = [];
            renderFilePreviews();

        } catch (err) {
            showError('Ошибка: ' + err.message);
        } finally {
            isSending = false;
            $('sendBtn').disabled = false;
        }
    };

    // ========== ФАЙЛЫ ==========
    const handleFileSelect = (e) => {
        for (let file of e.target.files) {
            if (file.size > MAX_FILE_SIZE) {
                showWarning(`Файл ${file.name} слишком большой (>50 МБ)`);
                continue;
            }
            if (!selectedFiles.some(f => f.name === file.name && f.size === file.size)) {
                selectedFiles.push(file);
            }
        }
        renderFilePreviews();
        $('fileInput').value = '';
    };

    const renderFilePreviews = () => {
        const container = $('file-preview-container');
        if (!container) return;

        if (selectedFiles.length === 0) {
            container.style.display = 'none';
            container.innerHTML = '';
            return;
        }

        container.style.display = 'flex';
        container.innerHTML = '';
        selectedFiles.forEach((file, i) => {
            const div = document.createElement('div');
            div.className = 'file-preview-item';
            div.innerHTML = `
                <span class="file-preview-name">${escapeHtml(file.name)}</span>
                <button class="file-preview-remove" data-index="${i}">✖</button>
            `;
            div.querySelector('button').addEventListener('click', () => {
                selectedFiles.splice(i, 1);
                renderFilePreviews();
            });
            container.appendChild(div);
        });
    };

    // ========== НАСТРОЙКИ ==========
    const loadSettings = () => {
        try {
            const saved = localStorage.getItem('chatSettings');
            if (saved) settings = { ...settings, ...JSON.parse(saved) };
        } catch {}
        applySettings();
    };

    const applySettings = () => {
        document.body.className = `theme-${settings.colorTheme}`;
        if (settings.lightTheme) document.body.classList.add('light-theme');
    };

    const saveSettings = () => {
        localStorage.setItem('chatSettings', JSON.stringify(settings));
        applySettings();
    };

    // ========== УТИЛИТЫ ==========
    const escapeHtml = (text) => {
        const map = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' };
        return text.replace(/[&<>"']/g, m => map[m]);
    };

    const showError = (msg) => {
        const toast = document.createElement('div');
        toast.style.cssText = 'position:fixed; bottom:20px; left:20px; right:20px; background:#f44336; color:white; padding:12px; border-radius:8px; z-index:10000; text-align:center;';
        toast.textContent = '❌ ' + msg;
        document.body.appendChild(toast);
        setTimeout(() => toast.remove(), 3000);
    };

    const showWarning = (msg) => {
        const toast = document.createElement('div');
        toast.style.cssText = 'position:fixed; bottom:20px; left:20px; right:20px; background:#ff9800; color:white; padding:12px; border-radius:8px; z-index:10000; text-align:center;';
        toast.textContent = '⚠️ ' + msg;
        document.body.appendChild(toast);
        setTimeout(() => toast.remove(), 3000);
    };

    const showSuccess = (msg) => {
        const toast = document.createElement('div');
        toast.style.cssText = 'position:fixed; bottom:20px; left:20px; right:20px; background:#4caf50; color:white; padding:12px; border-radius:8px; z-index:10000; text-align:center;';
        toast.textContent = '✅ ' + msg;
        document.body.appendChild(toast);
        setTimeout(() => toast.remove(), 2000);
    };

    // ========== ИНИЦИАЛИЗАЦИЯ ==========
    window.addEventListener('load', () => {
        loadChats();
        loadSettings();
        
        // Запускаем polling
        pollInterval = setInterval(async () => {
            if (activeChatId) await loadMessages();
        }, 5000);

        // Обработчики
        $('addChatBtn').addEventListener('click', () => {
            $('join-chat-modal').style.display = 'flex';
        });

        $('joinChatBtn').addEventListener('click', () => {
            const name = $('joinName').value.trim();
            const seed = $('joinSeedPhrase').value.trim();
            if (name && seed) {
                addChat(name, seed);
                $('join-chat-modal').style.display = 'none';
                $('joinName').value = '';
                $('joinSeedPhrase').value = '';
            }
        });

        $('createNewFromJoinBtn').addEventListener('click', () => {
            $('join-chat-modal').style.display = 'none';
            $('login-screen').classList.add('modal');
            $('login-screen').style.display = 'flex';
        });

        $('closeJoinModal').addEventListener('click', () => {
            $('join-chat-modal').style.display = 'none';
        });

        $('loginBtn').addEventListener('click', () => {
            const name = $('userName').value.trim();
            const seed = $('seedPhrase').value.trim();
            if (name && seed) {
                addChat(name, seed);
                $('login-screen').classList.remove('modal');
                $('login-screen').style.display = 'none';
                $('userName').value = '';
                $('seedPhrase').value = '';
            }
        });

        $('cancelLoginBtn').addEventListener('click', () => {
            $('login-screen').classList.remove('modal');
            $('login-screen').style.display = 'none';
        });

        $('sendBtn').addEventListener('click', sendMessage);
        
        $('msgInput').addEventListener('keypress', (e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                sendMessage();
            }
        });

        $('attachBtn').addEventListener('click', () => $('fileInput').click());
        $('fileInput').addEventListener('change', handleFileSelect);

        // Настройки
        $('qualityToggle').addEventListener('click', () => {
            imageQuality = imageQuality === '720p' ? '1080p' : '720p';
            $('qualityLabel').innerText = imageQuality === '720p' ? '720p (экономно)' : '1080p (лучшее качество)';
            showSuccess(`Качество: ${imageQuality}`);
        });

        $('themeToggle').addEventListener('click', () => {
            settings.lightTheme = !settings.lightTheme;
            saveSettings();
        });

        $('resetSettingsBtn').addEventListener('click', () => {
            settings = { lightTheme: false, colorTheme: 'blue', experimental2k: false };
            imageQuality = '720p';
            $('qualityLabel').innerText = '720p (экономно)';
            saveSettings();
            showSuccess('Настройки сброшены');
        });

        $('closeSettingsModal').addEventListener('click', () => {
            $('settings-modal').style.display = 'none';
        });

        $('settingsBtn').addEventListener('click', () => {
            $('settings-modal').style.display = 'flex';
            $('sidebar').classList.remove('open');
            $('sidebarOverlay').classList.remove('active');
        });

        $('loginSettingsBtn').addEventListener('click', () => {
            $('settings-modal').style.display = 'flex';
        });

        document.querySelectorAll('.theme-option').forEach(opt => {
            opt.addEventListener('click', () => {
                settings.colorTheme = opt.dataset.theme;
                saveSettings();
            });
        });

        // Меню
        $('menuBtn').addEventListener('click', () => {
            $('sidebar').classList.toggle('open');
            $('sidebarOverlay').classList.toggle('active');
        });

        $('sidebarOverlay').addEventListener('click', () => {
            $('sidebar').classList.remove('open');
            $('sidebarOverlay').classList.remove('active');
        });

        // Удаление чата
        document.addEventListener('click', (e) => {
            if (e.target.classList.contains('delete-chat')) {
                const id = e.target.dataset.id;
                if (confirm('Удалить чат?')) {
                    chats = chats.filter(c => c.id !== id);
                    if (chats.length === 0) {
                        activeChatId = null;
                        $('login-screen').style.display = 'flex';
                        $('chat-screen').style.display = 'none';
                    } else {
                        activeChatId = chats[0].id;
                        switchToChat(activeChatId);
                    }
                    saveChats();
                    renderChatList();
                }
            }
        });

        // Информация о чате
        document.addEventListener('click', (e) => {
            if (e.target.classList.contains('chat-item') && !e.target.classList.contains('delete-chat')) {
                const id = e.target.closest('.chat-item')?.dataset.id;
                if (id) switchToChat(id);
            }
        });

        // Модалки
        window.addEventListener('click', (e) => {
            if (e.target.classList.contains('modal')) {
                e.target.style.display = 'none';
            }
        });

        $('closeDetailsModal').addEventListener('click', () => {
            $('chat-details-modal').style.display = 'none';
        });

        $('participantsBtn').addEventListener('click', () => {
            const participants = [...new Set(messages.map(m => m.name))];
            $('participants-list').innerHTML = participants.map(p => `<li>${escapeHtml(p)}</li>`).join('');
            $('participants-modal').style.display = 'flex';
        });

        $('closeParticipantsModal').addEventListener('click', () => {
            $('participants-modal').style.display = 'none';
        });

        $('refreshBtn').addEventListener('click', loadMessages);

        // Scroll
        $('messages').addEventListener('scroll', () => {
            const el = $('messages');
            isAtBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 50;
        });
    });
})();
