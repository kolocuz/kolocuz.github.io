(function() {
    const DEFAULT_TOKEN = '';
    const YANDEX_PATH = 'chat.txt';
    const ATTACHMENTS_FOLDER = 'chat_attachments';
    const AVATARS_FOLDER = 'avatars';
    const FILE_EXPIRY_DAYS = 14;
    const MAX_RETRIES = 3;
    const TIMEOUT = 30000;
    const POLL_INTERVAL = 5000;
    const LONG_PRESS_DELAY = 500;
    const MAX_MESSAGE_LENGTH = 4096;
    const TYPING_TIMEOUT = 3000;
    const MAX_STORED_MESSAGES = 1000;
    const MAX_FILE_SIZE = 50 * 1024 * 1024; // 50 MB
    
    // Прокси для ротации (только без регистрации)
    const PROXY_LIST = [
        'https://api.allorigins.win/raw?url=',      // 50 запросов/час на IP
        'https://corsproxy.io/?url=',               // Публичный, может блокировать
        'https://thingproxy.freeboard.io/fetch/',   // Без ?url=
        'https://cors.5apps.com/?uri=',             // ?uri= вместо ?url=
        'https://crossorigin.me/',                   // Без ?url=
        'https://cors.bridged.cc/'                   // Без ?url=
    ];

    let currentProxyIndex = 0;
    let proxyFailCount = 0;
    const MAX_FAILS = 3;
    let lastProxySwitchTime = 0;
    const MIN_SWITCH_INTERVAL = 5000;
    let allProxiesBlockedUntil = 0;
    const BLOCK_RESET_TIMEOUT = 60000; // 1 минута

    const isSecureContext = location.protocol === 'https:' || location.hostname === 'localhost' || location.hostname.startsWith('127.');
    if (!isSecureContext) {
        console.warn('Микрофон будет недоступен при открытии файла локально');
    }

    const CENSORED_WORDS = [
        'хуй', 'хуя', 'хуе', 'хуи', 'хуйня', 'хуёвый', 'похуй', 'нахуй', 'захуй',
        'пизд', 'пизда', 'пиздец', 'пиздюк', 'пиздатый', 'распиздяй',
        'бля', 'блядь', 'блять', 'блядство', 'блядина',
        'ебл', 'еба', 'ёба', 'ебал', 'ебать', 'ёбаный', 'заебал', 'наебал', 'обоссаный',
        'сука', 'суки', 'сучка', 'сучонок',
        'пидор', 'пидарас', 'пидрила', 'пидоры',
        'мудак', 'мудачье', 'мудозвон',
        'гандон', 'гандонов',
        'шлюх', 'шлюха', 'проститутка', 'блядун',
        'чмо', 'чмошник',
        'лох', 'лошок', 'лошара',
        'долбоеб', 'долбаеб', 'долбоёб',
        'уеб', 'уёбок', 'уебан',
        'залуп', 'залупа',
        'очко', 'очкарь',
        'жопа', 'жополиз', 'жопошник',
        'ссать', 'сцать', 'обоссанец',
        'срать', 'насрать', 'засранец',
        'говно', 'говнище', 'говноед',
        'кал', 'каловый',
        'дерьмо', 'дерьмовый',
        'мразь', 'мразота',
        'тварь', 'тварюга',
        'гад', 'гадина',
        'козёл', 'козлина',
        'пёс', 'псина',
        'свинья', 'свинтус',
        'дурак', 'дурочка',
        'идиот', 'идиотка',
        'дебил', 'дебилка',
        'кретин', 'кретинка',
        'шизик', 'шизоид',
        'даун', 'дауняра',
        'имбицил',
        'конченый', 'конченная',
        'отморозок',
        'ублюдок',
        'выродок',
        'недоносок',
        'недоделок',
        'тупица',
        'бестолочь',
        'бездарь',
        'ничтожество',
        'урод', 'уродина',
        'fuck', 'fucking', 'fucker', 'shit', 'bitch', 'asshole', 'dick', 'pussy',
        'motherfucker', 'cunt', 'whore', 'slut', 'bastard', 'twat', 'wanker',
        'nigger', 'nigga', 'retard', 'faggot', 'dyke', 'tranny', 'gook', 'chink',
        'kike', 'spic', 'wetback', 'raghead', 'cameljockey',
        'убить', 'убью', 'убьют', 'пристрелить', 'взорвать', 'зарезать', 'повесить',
        'насиловать', 'изнасилование',
        'террорист', 'терроризм', 'джихад', 'шахид',
        'нацист', 'скинхед', 'куклуксклан',
        'бомба', 'взрывчатка',
        'черножопый', 'черномазый', 'хач', 'чурка', 'жид', 'хохол', 'москаль',
        'кацап', 'пиндос', 'америкос',
        'кредит', 'займ', 'казино', 'вулкан', 'букмекер', 'ставки', 'пополнение',
        'вывод средств', 'реклама', 'спам'
    ];

    let settings = { 
        notifications: true,
        sound: true, 
        vibration: true, 
        censor: false,
        lightTheme: false, 
        colorTheme: 'blue'
    };
    
    let currentUser = '';
    let currentSeed = '';
    let currentYandexToken = DEFAULT_TOKEN;
    let userAvatars = new Map();

    let selectedFiles = [], isUploading = false, isSending = false;
    let currentUploadController = null;
    let chats = [], activeChatId = null, messageList = [];
    let unreadCount = new Map();
    const fileRegistry = new Map();
    let isAtBottom = true;
    let pollInterval = null;
    let quoteMessageId = null;
    let lastMessageTime = 0;
    let longPressTimer = null;
    let draftMessages = new Map();
    let scrollPositions = new Map();
    let pinnedMessages = new Map();
    let typingTimeouts = new Map();
    let avatarFile = null;

    if (Notification.permission === 'default') {
        Notification.requestPermission();
    }

    const $ = (id) => document.getElementById(id);

    const loginScreen = $('login-screen');
    const chatScreen = $('chat-screen');
    const chatListEl = $('chat-list');
    const messagesEl = $('messages');
    const displayNameEl = $('display-name');
    const filePreviewContainer = $('file-preview-container');
    const uploadIndicator = $('uploadIndicator');
    const uploadStatusText = $('uploadStatusText');
    const uploadProgress = $('uploadProgress');
    const attachBtn = $('attachBtn');
    const sendBtn = $('sendBtn');
    const msgInput = $('msgInput');
    const fileInput = $('fileInput');
    const cancelUploadBtn = $('cancelUploadBtn');
    const participantsBtn = $('participantsBtn');
    const participantsModal = $('participants-modal');
    const participantsList = $('participants-list');
    const closeParticipantsModal = $('closeParticipantsModal');
    const ptrIndicator = $('ptrIndicator');
    const quoteIndicator = $('quoteIndicator');
    const quoteText = $('quoteText');
    const cancelQuoteBtn = $('cancelQuoteBtn');
    const menuBtn = $('menuBtn');
    const sidebar = $('sidebar');
    const sidebarOverlay = $('sidebarOverlay');
    const loginBtn = $('loginBtn');
    const cancelLoginBtn = $('cancelLoginBtn');
    const settingsBtn = $('settingsBtn');
    const settingsModal = $('settings-modal');
    const closeSettingsModal = $('closeSettingsModal');
    const resetSettingsBtn = $('resetSettingsBtn');
    const notificationsToggle = $('notificationsToggle');
    const soundToggle = $('soundToggle');
    const vibrationToggle = $('vibrationToggle');
    const censorToggle = $('censorToggle');
    const themeToggle = $('themeToggle');
    const themeLabel = $('themeLabel');
    const themeOptions = document.querySelectorAll('.theme-option');
    const pinnedContainer = $('pinnedContainer');
    const typingIndicator = $('typingIndicator');
    const loginSettingsBtn = $('loginSettingsBtn');
    const chatDetailsModal = $('chat-details-modal');
    const detailName = $('detailName');
    const detailSeed = $('detailSeed');
    const detailToken = $('detailToken');
    const closeDetailsModal = $('closeDetailsModal');
    const currentUserDisplay = $('currentUserDisplay');
    const currentUserAvatar = $('currentUserAvatar');
    const changeAvatarBtn = $('changeAvatarBtn');
    const addChatBtn = $('addChatBtn');
    const notificationsValue = $('notificationsValue');
    const censorValue = $('censorValue');
    const joinChatModal = $('join-chat-modal');
    const joinSeedPhrase = $('joinSeedPhrase');
    const joinName = $('joinName');
    const joinToken = $('joinToken');
    const joinChatBtn = $('joinChatBtn');
    const createNewFromJoinBtn = $('createNewFromJoinBtn');
    const closeJoinModal = $('closeJoinModal');
    const avatarModal = $('avatar-modal');
    const avatarInput = $('avatarInput');
    const avatarPreview = $('avatarPreview');
    const uploadAvatarBtn = $('uploadAvatarBtn');
    const removeAvatarBtn = $('removeAvatarBtn');
    const closeAvatarModal = $('closeAvatarModal');
    const refreshBtn = $('refreshBtn');

    const loadPinnedMessages = () => {
        try {
            const saved = localStorage.getItem('pinnedMessages');
            if (saved) {
                const parsed = JSON.parse(saved);
                if (Array.isArray(parsed)) {
                    pinnedMessages = new Map(parsed);
                } else {
                    console.warn('pinnedMessages data is not array, resetting');
                    pinnedMessages = new Map();
                }
            } else {
                pinnedMessages = new Map();
            }
        } catch (e) {
            console.error('loadPinnedMessages error:', e);
            pinnedMessages = new Map();
        }
    };

    const savePinnedMessages = () => {
        try {
            if (pinnedMessages && pinnedMessages instanceof Map) {
                const data = Array.from(pinnedMessages.entries());
                localStorage.setItem('pinnedMessages', JSON.stringify(data));
            } else {
                console.error('savePinnedMessages: pinnedMessages not a Map');
                pinnedMessages = new Map();
                localStorage.setItem('pinnedMessages', JSON.stringify([]));
            }
        } catch (e) {
            console.error('savePinnedMessages error:', e);
        }
    };

    const cleanupPinnedMessages = () => {
        if (!activeChatId || !messageList.length) return;
        const validIds = new Set(messageList.map(msg => msg.id));
        const pinned = pinnedMessages.get(activeChatId) || [];
        const filtered = pinned.filter(id => validIds.has(id));
        if (filtered.length !== pinned.length) {
            pinnedMessages.set(activeChatId, filtered);
            savePinnedMessages();
        }
    };

    loadPinnedMessages();

    function maskSeed(seed) {
        if (!seed) return '';
        return '•'.repeat(8);
    }

    const showError = (message) => {
        console.error('Error:', message);
        const toast = document.createElement('div');
        toast.style.cssText = 'position:fixed; bottom:20px; left:20px; right:20px; background:#f44336; color:white; padding:12px; border-radius:8px; z-index:10000; text-align:center; box-shadow:0 4px 12px rgba(0,0,0,0.3);';
        toast.textContent = '❌ ' + message;
        document.body.appendChild(toast);
        setTimeout(() => toast.remove(), 4000);
    };

    const showWarning = (message) => {
        console.warn('Warning:', message);
        const toast = document.createElement('div');
        toast.style.cssText = 'position:fixed; bottom:20px; left:20px; right:20px; background:#ff9800; color:white; padding:12px; border-radius:8px; z-index:10000; text-align:center; box-shadow:0 4px 12px rgba(0,0,0,0.3);';
        toast.textContent = '⚠️ ' + message;
        document.body.appendChild(toast);
        setTimeout(() => toast.remove(), 3000);
    };

    const showSuccess = (message) => {
        const toast = document.createElement('div');
        toast.style.cssText = 'position:fixed; bottom:20px; left:20px; right:20px; background:#4caf50; color:white; padding:12px; border-radius:8px; z-index:10000; text-align:center; box-shadow:0 4px 12px rgba(0,0,0,0.3);';
        toast.textContent = '✅ ' + message;
        document.body.appendChild(toast);
        setTimeout(() => toast.remove(), 3000);
    };

    const updateCurrentUserDisplay = () => {
        if (currentUserDisplay) {
            currentUserDisplay.innerText = currentUser || 'Не выбран';
        }
        updateAvatarDisplay();
    };

    function updateAvatarDisplay() {
        if (!currentUserAvatar) return;
        const avatarImg = currentUserAvatar.querySelector('img');
        const avatarSpan = currentUserAvatar.querySelector('span');
        
        const avatarUrl = userAvatars.get(currentUser);
        if (avatarUrl) {
            avatarImg.src = avatarUrl;
            avatarImg.style.display = 'block';
            avatarSpan.style.display = 'none';
        } else {
            avatarImg.style.display = 'none';
            avatarSpan.style.display = 'flex';
            avatarSpan.innerText = currentUser ? currentUser.charAt(0).toUpperCase() : '👤';
        }
    }

    function censorText(text) {
        if (!settings.censor || !text) return text;
        let censored = text;
        CENSORED_WORDS.forEach(word => {
            const regex = new RegExp(word, 'gi');
            censored = censored.replace(regex, match => {
                return match[0] + '*'.repeat(match.length - 1);
            });
        });
        return censored;
    }

    const loadSettings = () => {
        try {
            const saved = localStorage.getItem('chatSettings');
            if (saved) { 
                const parsed = JSON.parse(saved);
                settings = { ...settings, ...parsed };
            }
        } catch (e) {
            console.error('loadSettings error:', e);
        }
        applySettings();
        updateSettingsUI();
    };

    const applySettings = () => {
        document.body.classList.remove('theme-blue', 'theme-green', 'theme-purple', 'theme-gray', 'light-theme');
        document.body.classList.add(`theme-${settings.colorTheme}`);
        if (settings.lightTheme) {
            document.body.classList.add('light-theme');
        }
        updateSettingsUI();
    };

    const updateSettingsUI = () => {
        const soundValue = $('soundValue');
        const vibrationValue = $('vibrationValue');
        const notificationsValue = $('notificationsValue');
        const censorValue = $('censorValue');
        
        if (soundValue) soundValue.innerText = settings.sound ? 'Вкл' : 'Выкл';
        if (vibrationValue) vibrationValue.innerText = settings.vibration ? 'Вкл' : 'Выкл';
        if (notificationsValue) notificationsValue.innerText = settings.notifications ? 'Вкл' : 'Выкл';
        if (censorValue) censorValue.innerText = settings.censor ? 'Вкл' : 'Выкл';
        
        if (themeLabel) {
            themeLabel.innerText = settings.lightTheme 
                ? 'Переключить на тёмную тему' 
                : 'Переключить на светлую тему';
        }
        
        document.querySelectorAll('.theme-option').forEach(opt => {
            opt.classList.remove('active');
            if (opt.dataset.theme === settings.colorTheme) opt.classList.add('active');
        });
    };

    const saveSettings = () => {
        localStorage.setItem('chatSettings', JSON.stringify(settings));
        applySettings();
    };

    const resetSettings = () => {
        settings = { 
            notifications: true,
            sound: true, 
            vibration: true, 
            censor: false,
            lightTheme: false, 
            colorTheme: 'blue'
        };
        saveSettings();
        showSuccess('Настройки сброшены');
    };

    const playNotificationSound = () => {
        if (!settings.sound) return;
        try {
            const audio = new Audio();
            audio.src = 'data:audio/wav;base64,UklGRlwAAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YVAAAAA8AP8A/gD+AP8A/wD+AP4A/gD+AP8A/wD+AP4A/gD+AP8A/wD+AP4A/gD+AP8A/wD+AP4A/gD+AP8A/wD+AP4A/gD+AP8A/wD+AP4A/gD+AP8A/wD+AP4A/gD+AP8A';
            audio.volume = 0.3;
            audio.play().catch(() => {});
        } catch (e) {}
    };

    const vibrate = () => {
        if (settings.vibration && navigator.vibrate) navigator.vibrate(100);
    };

    const showNotification = (title, body) => {
        if (!settings.notifications) return;
        if (Notification.permission === 'granted') {
            new Notification(title, { 
                body, 
                icon: 'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><circle cx="50" cy="50" r="45" fill="%232a6c9e"/><text x="50" y="70" font-size="50" text-anchor="middle" fill="white">💬</text></svg>',
                badge: '🔔',
                silent: !settings.sound
            });
        } else if (Notification.permission === 'default') {
            Notification.requestPermission();
        }
    };

    const handleNewMessages = (newMessages) => {
        if (newMessages.length > 0) {
            const externalMessages = newMessages.filter(msg => msg.name !== currentUser);
            if (externalMessages.length > 0) {
                if (document.hidden) {
                    playNotificationSound();
                    vibrate();
                    const lastMsg = externalMessages[externalMessages.length - 1];
                    const displayText = settings.censor ? censorText(lastMsg.text) : lastMsg.text;
                    showNotification(
                        `${lastMsg.name} написал(а)`,
                        displayText.substring(0, 50) + (displayText.length > 50 ? '…' : '')
                    );
                }
                const currentUnread = unreadCount.get(activeChatId) || 0;
                unreadCount.set(activeChatId, currentUnread + externalMessages.length);
            }
        }
    };

    async function loadUserAvatar(name) {
        if (!diskClient || !currentSeed) return null;
        const avatarPath = `${AVATARS_FOLDER}/${currentSeed}_${name}.jpg`;
        try {
            const downloadUrl = await diskClient.getDownloadLink(avatarPath);
            if (downloadUrl) {
                const url = PROXY_LIST[currentProxyIndex] + encodeURIComponent(downloadUrl);
                userAvatars.set(name, url + '&t=' + Date.now());
                return url;
            }
        } catch (e) {
            console.log('Avatar not found for', name);
        }
        return null;
    }

    async function loadAllAvatars() {
        if (!diskClient || !currentSeed) return;
        const participants = new Set(messageList.map(msg => msg.name));
        participants.add(currentUser);
        
        for (const name of participants) {
            await loadUserAvatar(name).catch(() => {});
        }
        
        renderMessages();
        updateAvatarDisplay();
    }

    async function uploadAvatar(file) {
        if (!diskClient || !currentSeed || !currentUser) return false;
        
        try {
            await diskClient.ensureFolder(AVATARS_FOLDER);
            const compressedFile = await compressImage(file, 200, 200, 0.8);
            const avatarPath = `${AVATARS_FOLDER}/${currentSeed}_${currentUser}.jpg`;
            await diskClient.uploadFile(compressedFile, avatarPath, () => {});
            const { downloadUrl } = await diskClient.publishFile(avatarPath);
            const url = PROXY_LIST[currentProxyIndex] + encodeURIComponent(downloadUrl);
            userAvatars.set(currentUser, url);
            updateAvatarDisplay();
            renderMessages();
            return true;
        } catch (err) {
            console.error('Avatar upload error:', err);
            showError('Не удалось загрузить аватар');
            return false;
        }
    }

    async function removeAvatar() {
        if (!diskClient || !currentSeed || !currentUser) return false;
        try {
            const avatarPath = `${AVATARS_FOLDER}/${currentSeed}_${currentUser}.jpg`;
            await diskClient.deleteFile(avatarPath);
            userAvatars.delete(currentUser);
            updateAvatarDisplay();
            renderMessages();
            return true;
        } catch (err) {
            console.error('Avatar remove error:', err);
            showError('Не удалось удалить аватар');
            return false;
        }
    }

    class YandexDiskClient {
        constructor(token) {
            this.token = token;
        }

        async request(endpoint, options = {}, retryCount = 0) {
            // Проверяем, не заблокированы ли все прокси
            if (Date.now() < allProxiesBlockedUntil) {
                const waitTime = Math.ceil((allProxiesBlockedUntil - Date.now()) / 1000);
                throw new Error(`Все прокси временно заблокированы. Подождите ${waitTime} сек.`);
            }

            const fullUrl = `https://cloud-api.yandex.net/v1/disk${endpoint}`;
            
            // Формируем URL с учётом формата прокси
            let proxyUrl = PROXY_LIST[currentProxyIndex];
            let targetUrl;
            
            // Для прокси без параметра ?url= (thingproxy, crossorigin.me и т.д.)
            if (!proxyUrl.includes('?url=') && !proxyUrl.includes('?uri=')) {
                proxyUrl = proxyUrl.replace(/\/$/, '');
                targetUrl = proxyUrl + '/' + encodeURIComponent(fullUrl);
            } else {
                targetUrl = proxyUrl + encodeURIComponent(fullUrl);
            }
            
            const headers = { 'Content-Type': 'application/json' };
            if (this.token) {
                headers['Authorization'] = `OAuth ${this.token}`;
            }

            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), TIMEOUT);
            
            try {
                const response = await fetch(targetUrl, {
                    ...options,
                    signal: controller.signal,
                    headers: { ...headers, ...options.headers }
                });
                clearTimeout(timeoutId);
                
                // Проверяем на ошибки лимитов
                if (response.status === 429 || response.status === 403) {
                    throw new Error(`Rate limited (${response.status})`);
                }
                
                proxyFailCount = 0; // Сбрасываем счётчик при успехе
                return response;
                
            } catch (err) {
                clearTimeout(timeoutId);
                
                console.warn(`❌ Прокси #${currentProxyIndex + 1} ошибка:`, err.message);
                
                // Если это ошибка лимита, увеличиваем счётчик
                if (err.message.includes('Rate limited') || 
                    err.message.includes('429') || 
                    err.message.includes('403') ||
                    err.name === 'AbortError' || 
                    err.message.includes('Failed to fetch')) {
                    
                    proxyFailCount++;
                    
                    // Если слишком много ошибок - переключаем прокси
                    if (proxyFailCount >= MAX_FAILS) {
                        const switched = this.switchToNextProxy();
                        
                        // Если не удалось переключиться (все прокси перебрали)
                        if (!switched) {
                            allProxiesBlockedUntil = Date.now() + BLOCK_RESET_TIMEOUT;
                            showError('🔄 Все прокси временно недоступны или исчерпали лимиты. Пожалуйста, подождите 1 минуту.');
                            throw new Error('All proxies are rate limited or unavailable');
                        }
                        
                        // Пробуем снова с новым прокси
                        if (retryCount < PROXY_LIST.length * 2) {
                            await new Promise(resolve => setTimeout(resolve, 1000));
                            return this.request(endpoint, options, retryCount + 1);
                        }
                    }
                }
                
                throw err;
            }
        }

        switchToNextProxy() {
            const now = Date.now();
            
            // Проверяем, не переключались ли мы слишком часто
            if (now - lastProxySwitchTime < MIN_SWITCH_INTERVAL) {
                return true;
            }
            
            const startIndex = currentProxyIndex;
            let attempts = 0;
            
            // Пытаемся найти работающий прокси
            while (attempts < PROXY_LIST.length) {
                currentProxyIndex = (currentProxyIndex + 1) % PROXY_LIST.length;
                attempts++;
                
                // Если вернулись к начальному - все прокси перебрали
                if (currentProxyIndex === startIndex) {
                    proxyFailCount = 0;
                    lastProxySwitchTime = now;
                    return false;
                }
                
                proxyFailCount = 0;
                lastProxySwitchTime = now;
                
                console.log(`🔄 Переключено на прокси #${currentProxyIndex + 1}: ${PROXY_LIST[currentProxyIndex]}`);
                showWarning(`Прокси переключён на #${currentProxyIndex + 1}`);
                
                return true;
            }
            
            return false;
        }

        async getDownloadLink(path) {
            const response = await this.request(`/resources/download?path=${encodeURIComponent(path)}`);
            const data = await response.json();
            return data.href;
        }

        async getFileContent(path) {
            try {
                const downloadUrl = await this.getDownloadLink(path);
                if (!downloadUrl) return '';
                
                let proxyUrl = PROXY_LIST[currentProxyIndex];
                let targetUrl;
                
                if (!proxyUrl.includes('?url=') && !proxyUrl.includes('?uri=')) {
                    proxyUrl = proxyUrl.replace(/\/$/, '');
                    targetUrl = proxyUrl + '/' + encodeURIComponent(downloadUrl);
                } else {
                    targetUrl = proxyUrl + encodeURIComponent(downloadUrl);
                }
                
                const controller = new AbortController();
                const timeoutId = setTimeout(() => controller.abort(), TIMEOUT);
                const response = await fetch(targetUrl, { 
                    signal: controller.signal,
                    headers: { 'User-Agent': 'Mozilla/5.0 (compatible; ChatApp)' }
                });
                clearTimeout(timeoutId);
                
                if (!response.ok) return '';
                return await response.text();
            } catch (err) {
                console.error('getFileContent error:', err);
                return '';
            }
        }

        async uploadFileContent(path, content) {
            const uploadResponse = await this.request(`/resources/upload?path=${encodeURIComponent(path)}&overwrite=true`);
            const { href } = await uploadResponse.json();
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), TIMEOUT);
            try {
                const uploadResult = await fetch(href, {
                    method: 'PUT',
                    body: content,
                    headers: { 'Content-Type': 'text/plain' },
                    signal: controller.signal
                });
                clearTimeout(timeoutId);
                if (!uploadResult.ok) throw new Error(`Upload error: ${uploadResult.status}`);
            } catch (err) {
                clearTimeout(timeoutId);
                if (err.name === 'AbortError') throw new Error('Upload timeout');
                throw err;
            }
        }

        async ensureFolder(path) {
            try {
                const check = await this.request(`/resources?path=${encodeURIComponent(path)}`);
                if (check.ok) return;
            } catch (err) {
                if (err.message.includes('404')) {
                    await this.request(`/resources?path=${encodeURIComponent(path)}`, { method: 'PUT' });
                    return;
                }
                throw err;
            }
        }

        async publishFile(remotePath) {
            await this.request(`/resources/publish?path=${encodeURIComponent(remotePath)}`, { method: 'PUT' });
            const metaResponse = await this.request(`/resources?path=${encodeURIComponent(remotePath)}`);
            const meta = await metaResponse.json();
            const publicUrl = meta.public_url;
            const downloadInfoResponse = await this.request(`/public/resources/download?public_key=${encodeURIComponent(publicUrl)}`);
            const downloadInfo = await downloadInfoResponse.json();
            return { publicUrl, downloadUrl: downloadInfo.href };
        }

        async deleteFile(remotePath) {
            await this.request(`/resources?path=${encodeURIComponent(remotePath)}&permanently=true`, { method: 'DELETE' });
            return true;
        }

        async deletePublicFile(publicUrl) {
            try {
                const publicKey = publicUrl.split('/').pop();
                const resourceResp = await this.request(`/public/resources?public_key=${publicKey}`, {}, false);
                if (resourceResp.status === 404) return true;
                const resourceData = await resourceResp.json();
                const path = resourceData.path;
                return await this.deleteFile(path);
            } catch (error) {
                console.error('deletePublicFile error:', error);
                return false;
            }
        }

        async uploadFile(file, remotePath, onProgress, signal) {
            const uploadResponse = await this.request(`/resources/upload?path=${encodeURIComponent(remotePath)}&overwrite=true`);
            const { href } = await uploadResponse.json();
            return new Promise((resolve, reject) => {
                const xhr = new XMLHttpRequest();
                xhr.open('PUT', href, true);
                xhr.setRequestHeader('Content-Type', file.type || 'application/octet-stream');
                xhr.upload.addEventListener('progress', (e) => {
                    if (e.lengthComputable) onProgress(Math.round((e.loaded / e.total) * 100));
                });
                xhr.addEventListener('load', () => {
                    if (xhr.status >= 200 && xhr.status < 300) {
                        resolve();
                    } else {
                        reject(new Error(`HTTP ${xhr.status}`));
                    }
                });
                xhr.addEventListener('error', () => reject(new Error('Network error')));
                xhr.addEventListener('abort', () => reject(new DOMException('Abort', 'AbortError')));
                xhr.timeout = TIMEOUT;
                xhr.ontimeout = () => reject(new Error('Upload timeout'));
                if (signal) signal.addEventListener('abort', () => xhr.abort());
                xhr.send(file);
            });
        }
    }

    let diskClient;

    function startPolling() {
        if (pollInterval) clearInterval(pollInterval);
        if (!activeChatId) return;
        pollInterval = setInterval(async () => {
            if (!activeChatId || !diskClient) return;
            if (isUploading || isSending) return;
            try {
                await loadNewMessages();
                await checkTyping();
            } catch (e) {
                console.warn('Polling error', e);
            }
        }, POLL_INTERVAL);
    }

    function stopPolling() {
        if (pollInterval) {
            clearInterval(pollInterval);
            pollInterval = null;
        }
    }

    const loadChatsFromStorage = () => {
        try {
            const stored = localStorage.getItem('chats');
            if (stored) { 
                const parsed = JSON.parse(stored);
                if (Array.isArray(parsed)) {
                    chats = parsed;
                } else {
                    console.warn('chats data is not array');
                    chats = [];
                }
            }
        } catch (e) {
            console.error('loadChats error:', e);
            chats = [];
        }
        
        const activeId = localStorage.getItem('activeChatId');
        if (activeId && chats.some(c => c.id == activeId)) {
            activeChatId = activeId;
        } else if (chats.length) {
            activeChatId = chats[0].id;
        } else {
            activeChatId = null;
        }

        if (cancelLoginBtn) cancelLoginBtn.style.display = 'block';

        if (chats.length) {
            switchToChat(activeChatId);
            loginScreen.classList.remove('modal');
            loginScreen.style.display = 'none';
            chatScreen.style.display = 'flex';
        } else {
            loginScreen.classList.remove('modal');
            loginScreen.style.display = 'flex';
            chatScreen.style.display = 'none';
        }
        renderChatList();
    };

    const saveChats = () => {
        localStorage.setItem('chats', JSON.stringify(chats));
        if (activeChatId) localStorage.setItem('activeChatId', activeChatId);
        else localStorage.removeItem('activeChatId');
        if (cancelLoginBtn) cancelLoginBtn.style.display = 'block';
    };

    const renderChatList = () => {
        if (!chatListEl) return;
        chatListEl.innerHTML = '';
        chats.forEach(chat => {
            const unread = unreadCount.get(chat.id) || 0;
            const div = document.createElement('div');
            div.className = `chat-item ${chat.id == activeChatId ? 'active' : ''}`;
            div.dataset.id = chat.id;
            div.innerHTML = `
                <div style="display: flex; justify-content: space-between; align-items: flex-start;">
                    <div style="flex: 1; overflow: hidden;">
                        <div class="chat-name" data-revealed="false" title="Нажмите, чтобы показать ID группы">${escapeHtml(maskSeed(chat.seed))}</div>
                        <div style="font-size:0.8rem; opacity:0.8;">${escapeHtml(chat.name)}</div>
                    </div>
                    <div style="display: flex; gap: 5px; margin-left: 8px; flex-shrink: 0;">
                        <button class="info-chat" data-id="${chat.id}" title="Информация">ℹ️</button>
                        <button class="delete-chat" data-id="${chat.id}" title="Удалить чат">✖</button>
                    </div>
                </div>
                ${unread ? `<span class="unread-badge">${unread}</span>` : ''}
            `;
            chatListEl.appendChild(div);
        });
    };

    chatListEl.addEventListener('click', (e) => {
        const target = e.target;
        const chatItem = target.closest('.chat-item');
        if (!chatItem) return;

        if (target.classList.contains('chat-name')) {
            e.stopPropagation();
            const chatId = chatItem.dataset.id;
            const chat = chats.find(c => c.id === chatId);
            if (!chat) return;
            const isRevealed = target.dataset.revealed === 'true';
            if (isRevealed) {
                target.innerText = maskSeed(chat.seed);
                target.dataset.revealed = 'false';
            } else {
                target.innerText = chat.seed;
                target.dataset.revealed = 'true';
            }
            return;
        }

        if (target.classList.contains('delete-chat')) {
            e.stopPropagation();
            const id = target.dataset.id;
            if (confirm('Удалить чат?')) {
                removeChat(id);
            }
        } else if (target.classList.contains('info-chat')) {
            e.stopPropagation();
            const id = target.dataset.id;
            const chat = chats.find(c => c.id === id);
            if (chat) {
                detailName.innerText = chat.name;
                detailSeed.innerText = chat.seed;
                detailToken.innerText = chat.yandexToken;
                chatDetailsModal.style.display = 'flex';
            }
        } else {
            const id = chatItem.dataset.id;
            if (id) {
                switchToChat(id);
            }
        }
        if (sidebar && sidebar.classList.contains('open')) {
            sidebar.classList.remove('open');
            if (sidebarOverlay) sidebarOverlay.classList.remove('active');
        }
    });

    const switchToChat = async (id) => {
        if (activeChatId) {
            draftMessages.set(activeChatId, msgInput.value);
            scrollPositions.set(activeChatId, messagesEl.scrollTop);
        }

        const chat = chats.find(c => c.id == id);
        if (!chat) return;

        activeChatId = id;
        currentUser = chat.name;
        currentSeed = chat.seed;
        currentYandexToken = chat.yandexToken || DEFAULT_TOKEN;
        
        // Сбрасываем индекс прокси при смене чата
        currentProxyIndex = 0;
        proxyFailCount = 0;
        
        diskClient = new YandexDiskClient(currentYandexToken);
        displayNameEl.innerText = chat.name;
        fileRegistry.clear();
        messageList = [];
        unreadCount.set(id, 0);
        lastMessageTime = 0;
        clearQuote();
        
        await loadMessages(true);
        cleanupPinnedMessages();
        await loadAllAvatars().catch(() => {});
        
        msgInput.value = draftMessages.get(id) || '';
        setTimeout(() => {
            messagesEl.scrollTop = scrollPositions.get(id) || messagesEl.scrollHeight;
        }, 100);
        
        saveChats();
        renderChatList();
        stopPolling();
        startPolling();
        updatePinnedDisplay();
        updateCurrentUserDisplay();
    };

    const addChat = (name, seed, yandexToken) => {
        const id = Date.now().toString();
        chats.push({ id, name, seed, yandexToken });
        activeChatId = id;
        saveChats();
        renderChatList();
        switchToChat(id);
        loginScreen.classList.remove('modal');
        loginScreen.style.display = 'none';
        chatScreen.style.display = 'flex';
        showSuccess('Чат создан');
    };

    const removeChat = (id) => {
        const index = chats.findIndex(c => c.id == id);
        if (index === -1) return;
        chats.splice(index, 1);
        if (chats.length === 0) {
            stopPolling();
            loginScreen.classList.remove('modal');
            loginScreen.style.display = 'flex';
            chatScreen.style.display = 'none';
            activeChatId = null;
            localStorage.removeItem('activeChatId');
            currentUser = '';
            updateCurrentUserDisplay();
        } else {
            activeChatId = chats[0].id;
            switchToChat(activeChatId);
        }
        saveChats();
        renderChatList();
    };

    const showLoginModal = () => {
        loginScreen.classList.add('modal');
        loginScreen.style.display = 'flex';
        $('userName').value = '';
        $('seedPhrase').value = '';
        $('yandexToken').value = '';
    };

    const closeLoginModal = () => {
        loginScreen.classList.remove('modal');
        loginScreen.style.display = 'none';
    };

    const enterChat = async () => {
        const name = $('userName').value.trim();
        const seed = $('seedPhrase').value.trim();
        const token = $('yandexToken').value.trim();
        
        if (!name || !seed || !token) {
            showError("Заполните имя, сид-фразу и токен!");
            return;
        }

        if (!token.startsWith('y0_')) {
            showWarning('Токен должен начинаться с "y0_"');
        }

        const isDuplicate = chats.some(chat => chat.seed === seed);
        if (isDuplicate) {
            showError("Чат с такой сид-фразой уже существует! Присоединитесь к нему через кнопку «+».");
            return;
        }

        loginBtn.disabled = true;
        loginBtn.innerText = 'Проверка...';

        const testClient = new YandexDiskClient(token);
        
        try {
            console.log('🔍 Проверка токена...');
            
            const response = await testClient.request('/');
            console.log('✅ Токен валиден, ответ:', response.status);
            
            await testClient.ensureFolder('test_connection');
            console.log('✅ Папка создана');
            await testClient.deleteFile('test_connection');
            console.log('✅ Папка удалена');
            
            console.log('🎉 Все проверки пройдены, создаём чат');
            addChat(name, seed, token);
            
        } catch (err) {
            console.error('❌ Ошибка проверки токена:', err);
            
            if (err.message.includes('401')) {
                showError("Токен недействителен (ошибка 401). Проверьте токен.");
            } else if (err.message.includes('403')) {
                showError("Нет доступа к диску (ошибка 403). Проверьте права токена.");
            } else if (err.message.includes('Failed to fetch') || err.message.includes('NetworkError')) {
                showError("Прокси не отвечает. Проверьте подключение к интернету.");
            } else if (err.message.includes('timeout')) {
                showError("Тайм-аут запроса. Прокси слишком медленный или недоступен.");
            } else if (err.message.includes('All proxies are rate limited')) {
                showError("Все прокси временно заблокированы. Подождите 1 минуту.");
            } else {
                showError(`Ошибка: ${err.message}`);
            }
        } finally {
            loginBtn.disabled = false;
            loginBtn.innerText = 'Войти в чат';
        }
    };

    if (addChatBtn) {
        addChatBtn.addEventListener('click', () => {
            if (chats.length === 0) {
                showLoginModal();
            } else {
                joinSeedPhrase.value = '';
                joinName.value = '';
                joinToken.value = '';
                joinChatModal.style.display = 'flex';
                if (sidebar && sidebar.classList.contains('open')) {
                    sidebar.classList.remove('open');
                    if (sidebarOverlay) sidebarOverlay.classList.remove('active');
                }
            }
        });
    }

    if (joinChatBtn) {
        joinChatBtn.addEventListener('click', async () => {
            const seed = joinSeedPhrase.value.trim();
            const name = joinName.value.trim();
            const token = joinToken.value.trim();

            if (!seed || !name || !token) {
                showError('Заполните все поля');
                return;
            }

            const existingChat = chats.find(chat => chat.seed === seed);
            if (existingChat) {
                addChat(name, seed, token);
                joinChatModal.style.display = 'none';
            } else {
                showError('Чат с такой сид-фразой не найден. Возможно, вы хотели создать новую группу?');
            }
        });
    }

    if (createNewFromJoinBtn) {
        createNewFromJoinBtn.addEventListener('click', () => {
            joinChatModal.style.display = 'none';
            showLoginModal();
        });
    }

    if (closeJoinModal) {
        closeJoinModal.addEventListener('click', () => {
            joinChatModal.style.display = 'none';
        });
    }

    if (menuBtn && sidebar && sidebarOverlay) {
        console.log('✅ Инициализация меню');
        
        menuBtn.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            console.log('🍔 Меню открыто/закрыто');
            sidebar.classList.toggle('open');
            sidebarOverlay.classList.toggle('active');
        });
        
        sidebarOverlay.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            console.log('🔲 Оверлей закрыл меню');
            sidebar.classList.remove('open');
            sidebarOverlay.classList.remove('active');
        });
        
        let touchStartX = 0;
        sidebar.addEventListener('touchstart', (e) => {
            touchStartX = e.touches[0].clientX;
        }, { passive: true });
        
        sidebar.addEventListener('touchmove', (e) => {
            const touchX = e.touches[0].clientX;
            const diff = touchX - touchStartX;
            if (diff < -50) {
                sidebar.classList.remove('open');
                sidebarOverlay.classList.remove('active');
            }
        }, { passive: true });
        
    } else {
        console.error('❌ Не удалось инициализировать меню:', {
            menuBtn: !!menuBtn,
            sidebar: !!sidebar,
            sidebarOverlay: !!sidebarOverlay
        });
    }

    if (settingsBtn && settingsModal) {
        console.log('✅ Настройки: кнопка найдена, назначаем обработчик');
        
        const newBtn = settingsBtn.cloneNode(true);
        settingsBtn.parentNode.replaceChild(newBtn, settingsBtn);
        
        newBtn.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            console.log('⚙️ Кнопка настроек нажата');
            settingsModal.style.display = 'flex';
            
            if (sidebar && sidebar.classList.contains('open')) {
                sidebar.classList.remove('open');
                if (sidebarOverlay) sidebarOverlay.classList.remove('active');
            }
        });
        
        if (closeSettingsModal) {
            closeSettingsModal.addEventListener('click', (e) => {
                e.preventDefault();
                e.stopPropagation();
                console.log('❌ Закрытие настроек');
                settingsModal.style.display = 'none';
            });
        }
        
        settingsModal.addEventListener('click', (e) => {
            if (e.target === settingsModal) {
                settingsModal.style.display = 'none';
            }
        });
        
    } else {
        console.error('❌ Настройки: кнопка или модальное окно не найдены', {
            settingsBtn: !!settingsBtn,
            settingsModal: !!settingsModal
        });
    }

    const participants = new Map();

    function updateParticipants(msg) {
        if (!msg.name) return;
        const lastTime = participants.get(msg.name) || 0;
        if (msg.time > lastTime) {
            participants.set(msg.name, msg.time);
        }
    }

    function showParticipants() {
        const list = Array.from(participants.entries())
            .sort((a,b) => b[1] - a[1])
            .map(([name, time]) => `<li><span class="participant-name">${escapeHtml(name)}</span> <span class="participant-time">${new Date(time).toLocaleString()}</span></li>`)
            .join('');
        participantsList.innerHTML = list || '<li>Пока нет участников</li>';
        participantsModal.style.display = 'flex';
    }

    if (participantsBtn) {
        participantsBtn.addEventListener('click', showParticipants);
    }
    
    if (closeParticipantsModal) {
        closeParticipantsModal.addEventListener('click', () => participantsModal.style.display = 'none');
    }

    function setQuote(messageId) {
        quoteMessageId = messageId;
        const msg = messageList.find(m => m.id === messageId);
        if (msg) {
            const displayText = settings.censor ? censorText(msg.text) : msg.text;
            quoteText.innerText = `Ответ ${msg.name}: ${displayText.substring(0, 50)}${displayText.length > 50 ? '…' : ''}`;
            quoteIndicator.style.display = 'flex';
        }
    }

    function clearQuote() {
        quoteMessageId = null;
        quoteIndicator.style.display = 'none';
        quoteText.innerText = '';
    }

    if (cancelQuoteBtn) {
        cancelQuoteBtn.addEventListener('click', clearQuote);
    }

    const createMessageObject = (text, files = []) => {
        const obj = {
            id: Date.now() + '-' + Math.random().toString(36).substr(2, 8),
            name: currentUser,
            time: Date.now(),
            text,
            files: files.map(f => ({
                name: f.name,
                url: f.publicUrl,
                downloadUrl: f.downloadUrl,
                size: f.size,
                timestamp: f.timestamp,
                remotePath: f.remotePath,
                hash: f.hash
            })),
            reactions: {}
        };
        if (quoteMessageId) {
            const quoted = messageList.find(m => m.id === quoteMessageId);
            if (quoted) {
                obj.quote = { id: quoted.id, name: quoted.name, text: quoted.text };
            }
            clearQuote();
        }
        return obj;
    };

    const parseMessageLine = (line) => {
        try {
            const obj = JSON.parse(line);
            if (obj && typeof obj === 'object' && obj.name && (obj.text !== undefined || obj.files)) return obj;
        } catch {}
        const colonIndex = line.indexOf(':');
        if (colonIndex > 0) {
            const name = line.substring(0, colonIndex).trim();
            const text = line.substring(colonIndex + 1).trim();
            return { id: 'old-' + Date.now() + '-' + Math.random(), name, time: 0, text, files: [], reactions: {} };
        }
        return null;
    };

    async function computeFileHash(file) {
        if (isSecureContext && window.crypto && crypto.subtle) {
            try {
                const buffer = await file.arrayBuffer();
                const hashBuffer = await crypto.subtle.digest('SHA-256', buffer);
                const hashArray = Array.from(new Uint8Array(hashBuffer));
                return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
            } catch {
                return `${file.name}_${file.size}_${file.lastModified}`;
            }
        } else {
            return `${file.name}_${file.size}_${file.lastModified}`;
        }
    }

    const loadMessages = async (showLoading = true) => {
        try {
            const fileContent = await diskClient.getFileContent(`/${YANDEX_PATH}`);
            const lines = fileContent.split('\n').filter(l => l.trim() !== '');
            const newMessages = [];
            participants.clear();
            let maxTime = 0;
            
            for (const line of lines) {
                try {
                    const decrypted = CryptoJS.AES.decrypt(line, currentSeed).toString(CryptoJS.enc.Utf8);
                    if (!decrypted) continue;
                    const msg = parseMessageLine(decrypted);
                    if (msg) {
                        if (!msg.reactions) msg.reactions = {};
                        newMessages.push(msg);
                        updateParticipants(msg);
                        if (msg.time > maxTime) maxTime = msg.time;
                        if (msg.files) {
                            msg.files.forEach(f => {
                                const key = f.hash || `${f.name}|${f.size}`;
                                if (!fileRegistry.has(key)) fileRegistry.set(key, f);
                            });
                        }
                    }
                } catch (e) {}
            }
            
            newMessages.sort((a,b) => (a.time || 0) - (b.time || 0));
            
            if (newMessages.length > MAX_STORED_MESSAGES) {
                messageList = newMessages.slice(-MAX_STORED_MESSAGES);
            } else {
                messageList = newMessages;
            }
            
            lastMessageTime = maxTime;
            unreadCount.set(activeChatId, 0);
            
            renderMessages();
            renderChatList();
        } catch (err) {
            console.error('loadMessages error:', err);
            if (err.message.includes('404')) {
                messagesEl.innerHTML = '<center>Чат пуст. Напишите первое сообщение!</center>';
            } else if (err.message.includes('All proxies are rate limited')) {
                messagesEl.innerHTML = '<center>⚠️ Все прокси временно заблокированы. Подождите 1 минуту.</center>';
            } else {
                messagesEl.innerHTML = '<center>Ошибка загрузки. Проверьте подключение к интернету.</center>';
            }
        }
    };

    const loadNewMessages = async (retryCount = MAX_RETRIES) => {
        try {
            const content = await diskClient.getFileContent(`/${YANDEX_PATH}`);
            if (content === null || content === '') return;
            
            const lines = content.split('\n').filter(l => l.trim() !== '');
            const newMessages = [];
            let maxTime = lastMessageTime;
            
            for (const line of lines) {
                try {
                    const decrypted = CryptoJS.AES.decrypt(line, currentSeed).toString(CryptoJS.enc.Utf8);
                    if (!decrypted) continue;
                    const msg = parseMessageLine(decrypted);
                    if (msg && msg.time > lastMessageTime && !messageList.some(m => m.id === msg.id)) {
                        if (!msg.reactions) msg.reactions = {};
                        newMessages.push(msg);
                        updateParticipants(msg);
                        if (msg.time > maxTime) maxTime = msg.time;
                        if (msg.files) {
                            msg.files.forEach(f => {
                                const key = f.hash || `${f.name}|${f.size}`;
                                if (!fileRegistry.has(key)) fileRegistry.set(key, f);
                            });
                        }
                    }
                } catch (e) {}
            }
            
            if (newMessages.length > 0) {
                newMessages.sort((a,b) => (a.time || 0) - (b.time || 0));
                messageList = [...messageList, ...newMessages];
                
                if (messageList.length > MAX_STORED_MESSAGES) {
                    messageList = messageList.slice(-MAX_STORED_MESSAGES);
                }
                
                lastMessageTime = maxTime;
                
                renderMessages();
                renderChatList();
                handleNewMessages(newMessages);
                
                const newParticipants = new Set(newMessages.map(msg => msg.name));
                for (const name of newParticipants) {
                    await loadUserAvatar(name).catch(() => {});
                }
                renderMessages();
                cleanupPinnedMessages();
            }
        } catch (err) {
            console.warn('loadNewMessages error:', err);
            if (retryCount > 0 && !err.message.includes('All proxies are rate limited')) {
                await new Promise(resolve => setTimeout(resolve, 2000));
                return loadNewMessages(retryCount - 1);
            }
        }
    };

    const escapeHtml = (text) => {
        const map = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' };
        return text.replace(/[&<>"']/g, m => map[m]);
    };

    const parseMarkdown = (text) => {
        let escaped = escapeHtml(text);
        
        escaped = escaped.replace(/\[(.*?)\]\((.*?)\)/g, (match, p1, p2) => {
            if (p2.startsWith('http://') || p2.startsWith('https://')) {
                return `<a href="${p2}" target="_blank" rel="noopener noreferrer" style="color:var(--accent);">${p1}</a>`;
            }
            return p1;
        });
        
        escaped = escaped.replace(/(https?:\/\/[^\s]+)/g, (match) => {
            return `<a href="${match}" target="_blank" rel="noopener noreferrer" style="color:var(--accent);">${match}</a>`;
        });
        
        return escaped
            .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
            .replace(/\*(.*?)\*/g, '<em>$1</em>')
            .replace(/`(.*?)`/g, '<code style="background:rgba(0,0,0,0.2); padding:2px 4px; border-radius:4px;">$1</code>');
    };

    const getFileIcon = (fileName) => {
        const ext = fileName.split('.').pop().toLowerCase();
        if (['jpg','jpeg','png','gif','bmp','webp'].includes(ext)) return '🖼️';
        if (['mp4','mov','avi','mkv','webm'].includes(ext)) return '🎬';
        if (['mp3','wav','ogg','m4a'].includes(ext)) return '🎵';
        if (['pdf'].includes(ext)) return '📕';
        if (['doc','docx'].includes(ext)) return '📘';
        if (['xls','xlsx'].includes(ext)) return '📗';
        if (['zip','rar','7z','tar','gz'].includes(ext)) return '📦';
        return '📎';
    };

    const isOlderThan14Days = (timestamp) => (Date.now() - timestamp) > (FILE_EXPIRY_DAYS * 24 * 60 * 60 * 1000);

    const checkIfAtBottom = () => {
        if (!messagesEl) return true;
        const { scrollTop, scrollHeight, clientHeight } = messagesEl;
        return scrollHeight - scrollTop - clientHeight < 50;
    };

    const renderMessages = () => {
        const scrollPos = messagesEl.scrollTop;
        const wasAtBottom = isAtBottom;
        
        messagesEl.innerHTML = '';
        if (!messageList.length) {
            messagesEl.innerHTML = '<center>Нет сообщений. Напишите что-нибудь!</center>';
            return;
        }
        const fragment = document.createDocumentFragment();
        let lastDateStr = '';
        messageList.forEach(msg => {
            const msgTime = msg.time ? new Date(msg.time) : null;
            let dateStr = '';
            if (msgTime) {
                const today = new Date(); today.setHours(0,0,0,0);
                const yesterday = new Date(today); yesterday.setDate(yesterday.getDate()-1);
                const twoDaysAgo = new Date(today); twoDaysAgo.setDate(twoDaysAgo.getDate()-2);
                const msgDate = new Date(msgTime); msgDate.setHours(0,0,0,0);
                if (msgDate.getTime() === today.getTime()) dateStr = 'Сегодня';
                else if (msgDate.getTime() === yesterday.getTime()) dateStr = 'Вчера';
                else if (msgDate.getTime() === twoDaysAgo.getTime()) dateStr = 'Позавчера';
                else dateStr = msgDate.toLocaleDateString('ru-RU', {day:'2-digit', month:'2-digit', year:'numeric'});
            }
            if (dateStr && dateStr !== lastDateStr) {
                const divider = document.createElement('div');
                divider.className = 'date-divider';
                divider.innerText = dateStr;
                fragment.appendChild(divider);
                lastDateStr = dateStr;
            }
            const temp = document.createElement('div');
            temp.innerHTML = renderMessage(msg);
            fragment.appendChild(temp.firstElementChild);
        });
        messagesEl.appendChild(fragment);
        
        if (wasAtBottom) {
            messagesEl.scrollTop = messagesEl.scrollHeight;
        } else {
            messagesEl.scrollTop = scrollPos;
        }
    };

    function renderMessage(msg) {
        const isOwn = msg.name === currentUser;
        const avatarLetter = msg.name.charAt(0).toUpperCase() || '?';
        const avatarUrl = userAvatars.get(msg.name);
        
        let avatarHtml = '';
        if (avatarUrl) {
            avatarHtml = `<div class="avatar"><img src="${escapeHtml(avatarUrl)}" alt=""></div>`;
        } else {
            avatarHtml = `<div class="avatar"><span>${escapeHtml(avatarLetter)}</span></div>`;
        }
        
        let bubbleContent = '';

        if (msg.quote) {
            const quotedText = settings.censor ? censorText(msg.quote.text) : msg.quote.text;
            bubbleContent += `<div class="quote-block"><div class="quote-author">${escapeHtml(msg.quote.name)}</div><div>${escapeHtml(quotedText)}</div></div>`;
        }

        const displayText = settings.censor ? censorText(msg.text) : msg.text;
        if (msg.text) {
            bubbleContent += `<div>${parseMarkdown(displayText)}</div>`;
        }

        if (msg.files && msg.files.length) {
            for (const f of msg.files) {
                const icon = getFileIcon(f.name);
                let isDeleted = false;
                if (f.timestamp && isOlderThan14Days(f.timestamp)) {
                    diskClient.deletePublicFile(f.url).then(success => {
                        if (success) {
                            loadMessages();
                        }
                    }).catch(() => {});
                    isDeleted = true;
                }
                if (isDeleted) {
                    bubbleContent += `<div class="deleted-file">🗑️ Файл «${escapeHtml(f.name)}» удалён (более ${FILE_EXPIRY_DAYS} дней)</div>`;
                } else {
                    bubbleContent += `<div class="file-attachment">`;
                    bubbleContent += `<div class="file-info"><span class="file-icon">${icon}</span><span class="file-name">${escapeHtml(f.name)}</span></div>`;
                    
                    let proxyUrl = PROXY_LIST[currentProxyIndex];
                    let fileUrl, filePublicUrl;
                    
                    if (!proxyUrl.includes('?url=') && !proxyUrl.includes('?uri=')) {
                        proxyUrl = proxyUrl.replace(/\/$/, '');
                        fileUrl = proxyUrl + '/' + encodeURIComponent(f.downloadUrl);
                        filePublicUrl = proxyUrl + '/' + encodeURIComponent(f.url);
                    } else {
                        fileUrl = proxyUrl + encodeURIComponent(f.downloadUrl);
                        filePublicUrl = proxyUrl + encodeURIComponent(f.url);
                    }
                    
                    if (f.downloadUrl) {
                        const ext = f.name.split('.').pop().toLowerCase();
                        if (['mp4','webm','ogg','mov','avi','mkv'].includes(ext)) {
                            bubbleContent += `<div class="file-preview"><video src="${escapeHtml(fileUrl)}" controls style="max-width:100%; max-height:300px;"></video></div>`;
                        } else if (['mp3','wav','ogg','m4a'].includes(ext)) {
                            bubbleContent += `<div class="file-preview"><audio src="${escapeHtml(fileUrl)}" controls style="width:100%;"></audio></div>`;
                        } else if (['jpg','jpeg','png','gif','bmp','webp'].includes(ext)) {
                            bubbleContent += `<div class="file-preview"><img src="${escapeHtml(fileUrl)}" alt="${escapeHtml(f.name)}"></div>`;
                        } else {
                            bubbleContent += `<div class="file-preview"><a href="${escapeHtml(filePublicUrl)}" target="_blank" rel="noopener noreferrer">Открыть файл</a></div>`;
                        }
                    } else if (f.url) {
                        bubbleContent += `<div class="file-preview"><a href="${escapeHtml(filePublicUrl)}" target="_blank" rel="noopener noreferrer">Открыть</a></div>`;
                    }
                    bubbleContent += `</div>`;
                }
            }
        }

        let reactionsHtml = '';
        if (msg.reactions && Object.keys(msg.reactions).length > 0) {
            reactionsHtml = '<div class="reactions">';
            for (const [emoji, users] of Object.entries(msg.reactions)) {
                reactionsHtml += `<span class="reaction-item" data-msg-id="${msg.id}" data-emoji="${emoji}">${emoji} <span class="reaction-count">${users.length}</span></span>`;
            }
            reactionsHtml += '</div>';
        }

        const reactionPanel = `
            <div class="reaction-panel" style="display: none;" id="reaction-panel-${msg.id}">
                <button data-emoji="👍">👍</button>
                <button data-emoji="❤️">❤️</button>
                <button data-emoji="😄">😄</button>
                <button data-emoji="🎉">🎉</button>
                <button data-emoji="😢">😢</button>
                <button data-emoji="😡">😡</button>
            </div>
        `;

        const messageActions = `
            <div class="message-actions">
                ${isOwn ? `<button class="edit-btn" data-id="${msg.id}">✏️</button>` : ''}
                ${isOwn ? `<button class="delete-btn" data-id="${msg.id}">🗑️</button>` : ''}
                <button class="pin-btn" data-id="${msg.id}">📌</button>
            </div>
        `;

        const timeStr = msg.time ? new Date(msg.time).toLocaleTimeString('ru-RU', {hour:'2-digit', minute:'2-digit'}) : '';
        const bubble = `<div class="bubble" data-id="${msg.id}">${bubbleContent}${reactionsHtml}<button class="add-reaction-btn" data-msg-id="${msg.id}">+</button>${reactionPanel}${messageActions}</div><div class="message-time">${timeStr}<button class="reply-button" data-id="${msg.id}">Ответить</button></div>`;

        if (isOwn) {
            return `<div class="message-row own"><div class="message-content">${bubble}</div></div>`;
        } else {
            return `<div class="message-row other">${avatarHtml}<div class="message-content"><div class="sender-name">${escapeHtml(msg.name)}</div>${bubble}</div></div>`;
        }
    }

    messagesEl.addEventListener('click', async (e) => {
        const replyBtn = e.target.closest('.reply-button');
        if (replyBtn) {
            e.preventDefault();
            const msgId = replyBtn.dataset.id;
            if (msgId) setQuote(msgId);
        }

        const editBtn = e.target.closest('.edit-btn');
        if (editBtn) {
            const msgId = editBtn.dataset.id;
            const msg = messageList.find(m => m.id === msgId);
            if (msg && msg.name === currentUser) {
                const newText = prompt('Редактировать сообщение:', msg.text);
                if (newText !== null && newText.trim()) {
                    msg.text = newText.trim();
                    await saveMessages();
                    renderMessages();
                }
            }
        }

        const deleteBtn = e.target.closest('.delete-btn');
        if (deleteBtn) {
            const msgId = deleteBtn.dataset.id;
            const msg = messageList.find(m => m.id === msgId);
            if (msg && msg.name === currentUser) {
                if (confirm('Удалить сообщение?')) {
                    messageList = messageList.filter(m => m.id !== msgId);
                    await saveMessages();
                    renderMessages();
                    cleanupPinnedMessages();
                }
            }
        }

        const pinBtn = e.target.closest('.pin-btn');
        if (pinBtn) {
            const msgId = pinBtn.dataset.id;
            if (!(pinnedMessages instanceof Map)) {
                pinnedMessages = new Map();
            }
            const pinned = pinnedMessages.get(activeChatId) || [];
            if (!pinned.includes(msgId)) {
                pinned.push(msgId);
                pinnedMessages.set(activeChatId, pinned);
                savePinnedMessages();
                updatePinnedDisplay();
            }
        }

        const addReactionBtn = e.target.closest('.add-reaction-btn');
        if (addReactionBtn) {
            const msgId = addReactionBtn.dataset.msgId;
            const panel = document.getElementById(`reaction-panel-${msgId}`);
            if (panel) {
                panel.style.display = panel.style.display === 'flex' ? 'none' : 'flex';
            }
        }

        const reactionItem = e.target.closest('.reaction-item');
        if (reactionItem) {
            const msgId = reactionItem.dataset.msgId;
            const emoji = reactionItem.dataset.emoji;
            addReaction(msgId, emoji);
        }

        const reactionBtn = e.target.closest('.reaction-panel button');
        if (reactionBtn) {
            const panel = reactionBtn.closest('.reaction-panel');
            const msgId = panel.id.replace('reaction-panel-', '');
            const emoji = reactionBtn.dataset.emoji;
            addReaction(msgId, emoji);
            panel.style.display = 'none';
        }
    });

    function addReaction(msgId, emoji) {
        const msg = messageList.find(m => m.id === msgId);
        if (!msg) return;
        if (!msg.reactions) msg.reactions = {};
        if (!msg.reactions[emoji]) msg.reactions[emoji] = [];
        if (!msg.reactions[emoji].includes(currentUser)) {
            msg.reactions[emoji].push(currentUser);
            saveMessages();
            renderMessages();
        }
    }

    async function saveMessages() {
        try {
            const lines = messageList.map(msg => {
                const jsonStr = JSON.stringify(msg);
                return CryptoJS.AES.encrypt(jsonStr, currentSeed).toString();
            });
            const newContent = lines.join('\n');
            await diskClient.uploadFileContent(`/${YANDEX_PATH}`, newContent);
        } catch (err) {
            console.error('saveMessages error:', err);
            showError('Не удалось сохранить сообщения');
        }
    }

    messagesEl.addEventListener('touchstart', (e) => {
        const target = e.target;
        const messageRow = target.closest('.message-row');
        if (!messageRow) return;
        longPressTimer = setTimeout(() => {
            document.querySelectorAll('.message-row').forEach(row => row.classList.remove('long-press'));
            messageRow.classList.add('long-press');
            const replyBtn = messageRow.querySelector('.reply-button');
            if (replyBtn) replyBtn.style.opacity = '1';
        }, LONG_PRESS_DELAY);
    });

    messagesEl.addEventListener('touchend', () => {
        if (longPressTimer) clearTimeout(longPressTimer);
    });
    messagesEl.addEventListener('touchcancel', () => {
        if (longPressTimer) clearTimeout(longPressTimer);
    });

    document.addEventListener('click', (e) => {
        if (!e.target.closest('.message-row')) {
            document.querySelectorAll('.message-row').forEach(row => row.classList.remove('long-press'));
        }
    });

    const sendTypingIndicator = () => {
        if (!activeChatId || !diskClient) return;
        const typingFile = `typing_${activeChatId}.txt`;
        diskClient.uploadFileContent(typingFile, currentUser).catch(() => {});
        if (typingTimeouts.has(currentUser)) clearTimeout(typingTimeouts.get(currentUser));
        typingTimeouts.set(currentUser, setTimeout(() => {
            diskClient.uploadFileContent(typingFile, '').catch(() => {});
        }, TYPING_TIMEOUT));
    };

    msgInput.addEventListener('input', sendTypingIndicator);

    const checkTyping = async () => {
        if (!activeChatId || !diskClient) return;
        const typingFile = `typing_${activeChatId}.txt`;
        try {
            const content = await diskClient.getFileContent(typingFile);
            if (content && content !== currentUser) {
                typingIndicator.innerText = `${content} печатает...`;
                typingIndicator.style.display = 'block';
            } else {
                typingIndicator.style.display = 'none';
            }
        } catch (err) {
            console.log('checkTyping: файл не найден (это нормально для первого раза)');
            typingIndicator.style.display = 'none';
        }
    };

    const updatePinnedDisplay = () => {
        if (!pinnedContainer) return;
        
        if (!(pinnedMessages instanceof Map)) {
            pinnedMessages = new Map();
        }
        
        const pinned = pinnedMessages.get(activeChatId) || [];
        if (pinned.length === 0) {
            pinnedContainer.style.display = 'none';
            return;
        }
        
        pinnedContainer.style.display = 'flex';
        pinnedContainer.innerHTML = '';
        pinned.forEach(msgId => {
            const msg = messageList.find(m => m.id === msgId);
            if (!msg) return;
            const displayText = settings.censor ? censorText(msg.text) : msg.text;
            const item = document.createElement('span');
            item.className = 'pinned-message-item';
            item.innerHTML = `${displayText.substring(0, 20)}… <button class="unpin-btn" data-id="${msgId}">✖</button>`;
            pinnedContainer.appendChild(item);
        });
    };

    pinnedContainer.addEventListener('click', (e) => {
        if (e.target.classList.contains('unpin-btn')) {
            const msgId = e.target.dataset.id;
            if (!(pinnedMessages instanceof Map)) {
                pinnedMessages = new Map();
            }
            const pinned = pinnedMessages.get(activeChatId) || [];
            pinnedMessages.set(activeChatId, pinned.filter(id => id !== msgId));
            savePinnedMessages();
            updatePinnedDisplay();
        }
    });

    msgInput.addEventListener('input', () => {
        if (msgInput.value.length > MAX_MESSAGE_LENGTH) {
            msgInput.style.borderColor = '#ff4444';
            msgInput.style.backgroundColor = 'rgba(255,68,68,0.1)';
        } else {
            msgInput.style.borderColor = '';
            msgInput.style.backgroundColor = '';
        }
    });

    async function sendMessage() {
        if (isSending || isUploading) return;
        let text = msgInput.value.trim();
        if (text.length > MAX_MESSAGE_LENGTH) {
            showError(`Сообщение слишком длинное! Максимум ${MAX_MESSAGE_LENGTH} символов.`);
            return;
        }
        const filesToUpload = [...selectedFiles];
        if (!text && filesToUpload.length === 0) return;

        const filesToProcess = [];
        for (const file of filesToUpload) {
            let key;
            if (file.hash) {
                key = file.hash;
            } else {
                const hash = await computeFileHash(file);
                key = hash;
                file.hash = hash;
            }
            if (fileRegistry.has(key)) {
                filesToProcess.push(fileRegistry.get(key));
                const idx = selectedFiles.findIndex(f => f === file);
                if (idx !== -1) selectedFiles.splice(idx, 1);
            } else {
                filesToProcess.push(file);
            }
        }
        renderFilePreviews();
        if (filesToProcess.length === 0 && !text) return;

        isSending = true;
        sendBtn.disabled = true;
        const startTime = Date.now();

        try {
            if (filesToProcess.length > 0) {
                isUploading = true;
                uploadIndicator.style.display = 'flex';
                attachBtn.disabled = true;
                cancelUploadBtn.disabled = false;
                const controller = new AbortController();
                currentUploadController = controller;
                const uploadedFiles = [];
                let uploadFailed = false;
                
                for (let i = 0; i < filesToProcess.length; i++) {
                    try {
                        const item = filesToProcess[i];
                        if (controller.signal.aborted) throw new DOMException('AbortError');
                        if (item.publicUrl) {
                            uploadedFiles.push(item);
                            continue;
                        }
                        const file = item;
                        uploadStatusText.innerText = `Загрузка ${i+1}/${filesToProcess.length}: ${file.name}`;
                        uploadProgress.innerText = '0%';
                        const onProgress = (p) => uploadProgress.innerText = p + '%';
                        let fileToUpload = file;
                        if (file.type && file.type.startsWith('image/')) {
                            fileToUpload = await compressImage(file);
                        }
                        await diskClient.ensureFolder(ATTACHMENTS_FOLDER);
                        const timestamp = Date.now();
                        const safeName = fileToUpload.name.replace(/[^a-zA-Z0-9._-]/g, '_');
                        const remotePath = `${ATTACHMENTS_FOLDER}/${timestamp}_${safeName}`;
                        await diskClient.uploadFile(fileToUpload, remotePath, onProgress, controller.signal);
                        const { publicUrl, downloadUrl } = await diskClient.publishFile(remotePath);
                        const result = { 
                            publicUrl, 
                            downloadUrl, 
                            name: file.name, 
                            timestamp, 
                            remotePath, 
                            size: file.size,
                            hash: file.hash
                        };
                        const key = file.hash;
                        fileRegistry.set(key, result);
                        uploadedFiles.push(result);
                    } catch (err) {
                        console.error('File upload error:', err);
                        if (err.name !== 'AbortError') {
                            showWarning(`Не удалось загрузить файл ${filesToProcess[i].name}`);
                            uploadFailed = true;
                        }
                    }
                }
                
                if (uploadedFiles.length > 0 && !uploadFailed) {
                    const msgObj = createMessageObject(text, uploadedFiles);
                    const jsonStr = JSON.stringify(msgObj);
                    const encryptedMsg = CryptoJS.AES.encrypt(jsonStr, currentSeed).toString();
                    const oldContent = await diskClient.getFileContent(`/${YANDEX_PATH}`).catch(() => '');
                    const newContent = oldContent + (oldContent ? '\n' : '') + encryptedMsg;
                    await diskClient.uploadFileContent(`/${YANDEX_PATH}`, newContent);
                    
                    selectedFiles = selectedFiles.filter(f => !uploadedFiles.some(uf => uf.hash === f.hash));
                    renderFilePreviews();
                    msgInput.value = '';
                    msgInput.style.borderColor = '';
                    msgInput.style.backgroundColor = '';
                    
                    messageList.push(msgObj);
                    updateParticipants(msgObj);
                    if (msgObj.time > lastMessageTime) lastMessageTime = msgObj.time;
                    
                    renderMessages();
                    if (isAtBottom) messagesEl.scrollTop = messagesEl.scrollHeight;
                } else if (uploadedFiles.length === 0) {
                    showWarning('Не удалось загрузить ни одного файла');
                }
            } else {
                const msgObj = createMessageObject(text, []);
                const jsonStr = JSON.stringify(msgObj);
                const encryptedMsg = CryptoJS.AES.encrypt(jsonStr, currentSeed).toString();
                const oldContent = await diskClient.getFileContent(`/${YANDEX_PATH}`).catch(() => '');
                const newContent = oldContent + (oldContent ? '\n' : '') + encryptedMsg;
                await diskClient.uploadFileContent(`/${YANDEX_PATH}`, newContent);
                msgInput.value = '';
                msgInput.style.borderColor = '';
                msgInput.style.backgroundColor = '';
                
                messageList.push(msgObj);
                updateParticipants(msgObj);
                if (msgObj.time > lastMessageTime) lastMessageTime = msgObj.time;
                
                renderMessages();
                if (isAtBottom) messagesEl.scrollTop = messagesEl.scrollHeight;
            }
            
            if (messageList.length > MAX_STORED_MESSAGES) {
                messageList = messageList.slice(-MAX_STORED_MESSAGES);
                saveMessages();
            }
        } catch (err) {
            if (err.name !== 'AbortError') {
                console.error('sendMessage error:', err);
                showError(err.message);
            }
        } finally {
            isUploading = false;
            currentUploadController = null;
            uploadIndicator.style.display = 'none';
            attachBtn.disabled = false;
            cancelUploadBtn.disabled = true;
            const elapsed = Date.now() - startTime;
            const delay = Math.max(0, 1000 - elapsed);
            setTimeout(() => {
                isSending = false;
                sendBtn.disabled = false;
            }, delay);
        }
    }

    function handleFileSelect() {
        if (fileInput.files.length === 0) return;
        for (let file of fileInput.files) {
            if (file.size > MAX_FILE_SIZE) {
                showWarning(`Файл ${file.name} слишком большой (макс. 50 МБ)`);
                continue;
            }
            if (!selectedFiles.some(f => f.name === file.name && f.size === file.size)) {
                selectedFiles.push(file);
            }
        }
        renderFilePreviews();
        fileInput.value = '';
    }

    function removeFile(index) {
        selectedFiles.splice(index, 1);
        renderFilePreviews();
    }

    function getFileThumbnail(file, callback) {
        if (file.type.startsWith('image/')) {
            const reader = new FileReader();
            reader.onload = (e) => callback(e.target.result);
            reader.readAsDataURL(file);
        } else callback(null);
    }

    async function renderFilePreviews() {
        if (selectedFiles.length === 0) {
            filePreviewContainer.style.display = 'none';
            filePreviewContainer.innerHTML = '';
            return;
        }
        filePreviewContainer.style.display = 'flex';
        filePreviewContainer.innerHTML = '';
        for (let i = 0; i < selectedFiles.length; i++) {
            const file = selectedFiles[i];
            const thumb = await new Promise(resolve => getFileThumbnail(file, resolve));
            const fileName = escapeHtml(file.name);
            const thumbHtml = thumb ? `<img src="${thumb}" class="file-preview-thumb">` : `<div class="file-preview-thumb">📄</div>`;
            const item = document.createElement('div');
            item.className = 'file-preview-item';
            item.dataset.index = i;
            item.innerHTML = `
                ${thumbHtml}
                <span class="file-preview-name" title="${fileName}">${fileName}</span>
                <button class="file-preview-remove" data-index="${i}">✖</button>
            `;
            filePreviewContainer.appendChild(item);
        }
        filePreviewContainer.querySelectorAll('.file-preview-remove').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                const idx = e.target.dataset.index;
                if (idx !== undefined) removeFile(parseInt(idx));
            });
        });
    }

    async function compressImage(file, maxWidth = 1920, maxHeight = 1080, quality = 0.8) {
        if (!file.type.startsWith('image/')) return file;
        
        return new Promise((resolve) => {
            const reader = new FileReader();
            reader.onload = (e) => {
                const img = new Image();
                img.onload = () => {
                    let { width, height } = img;
                    if (width > height) {
                        if (width > maxWidth) { height *= maxWidth / width; width = maxWidth; }
                    } else {
                        if (height > maxHeight) { width *= maxHeight / height; height = maxHeight; }
                    }
                    const canvas = document.createElement('canvas');
                    canvas.width = width; canvas.height = height;
                    canvas.getContext('2d').drawImage(img, 0, 0, width, height);
                    canvas.toBlob(blob => resolve(new File([blob], file.name, { type: file.type })), file.type, quality);
                };
                img.src = e.target.result;
            };
            reader.readAsDataURL(file);
        });
    }

    function cancelUpload() {
        if (currentUploadController) {
            currentUploadController.abort();
            currentUploadController = null;
        }
        isUploading = false;
        isSending = false;
        sendBtn.disabled = false;
        attachBtn.disabled = false;
        uploadIndicator.style.display = 'none';
        selectedFiles = [];
        renderFilePreviews();
    }

    let touchStartY = 0;
    messagesEl.addEventListener('touchstart', (e) => {
        touchStartY = e.touches[0].clientY;
    }, { passive: true });
    messagesEl.addEventListener('touchmove', (e) => {
        if (messagesEl.scrollTop === 0) {
            const touchY = e.touches[0].clientY;
            const diff = touchY - touchStartY;
            ptrIndicator.style.display = diff > 50 ? 'block' : 'none';
        }
    }, { passive: true });
    messagesEl.addEventListener('touchend', () => {
        if (messagesEl.scrollTop === 0) {
            ptrIndicator.style.display = 'none';
            loadMessages();
        }
    });

    if (loginBtn) {
        loginBtn.addEventListener('click', enterChat);
    }
    
    if (cancelLoginBtn) {
        cancelLoginBtn.addEventListener('click', closeLoginModal);
    }
    
    if (refreshBtn) {
        refreshBtn.addEventListener('click', () => loadMessages());
    }
    
    if (attachBtn) {
        attachBtn.addEventListener('click', () => fileInput.click());
    }
    
    if (fileInput) {
        fileInput.addEventListener('change', handleFileSelect);
    }
    
    if (sendBtn) {
        sendBtn.addEventListener('click', sendMessage);
    }
    
    if (cancelUploadBtn) {
        cancelUploadBtn.addEventListener('click', cancelUpload);
    }
    
    if (msgInput) {
        msgInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                sendMessage();
            }
        });
    }
    
    if (messagesEl) {
        messagesEl.addEventListener('scroll', () => {
            isAtBottom = checkIfAtBottom();
        });
    }

    if (notificationsToggle) {
        notificationsToggle.addEventListener('click', () => {
            settings.notifications = !settings.notifications;
            saveSettings();
            showSuccess(`Уведомления ${settings.notifications ? 'включены' : 'выключены'}`);
        });
    }

    if (soundToggle) {
        soundToggle.addEventListener('click', () => {
            settings.sound = !settings.sound;
            saveSettings();
            showSuccess(`Звук ${settings.sound ? 'включён' : 'выключен'}`);
        });
    }

    if (vibrationToggle) {
        vibrationToggle.addEventListener('click', () => {
            settings.vibration = !settings.vibration;
            saveSettings();
            showSuccess(`Вибрация ${settings.vibration ? 'включена' : 'выключена'}`);
        });
    }

    if (censorToggle) {
        censorToggle.addEventListener('click', () => {
            settings.censor = !settings.censor;
            saveSettings();
            renderMessages();
            showSuccess(`Цензура ${settings.censor ? 'включена' : 'выключена'}`);
        });
    }

    if (themeToggle) {
        themeToggle.addEventListener('click', () => {
            settings.lightTheme = !settings.lightTheme;
            saveSettings();
            showSuccess(`Тема: ${settings.lightTheme ? 'светлая' : 'тёмная'}`);
        });
    }

    themeOptions.forEach(opt => {
        opt.addEventListener('click', () => {
            settings.colorTheme = opt.dataset.theme;
            saveSettings();
            showSuccess(`Цветовая тема: ${opt.innerText}`);
        });
    });

    if (resetSettingsBtn) {
        resetSettingsBtn.addEventListener('click', resetSettings);
    }

    if (changeAvatarBtn) {
        changeAvatarBtn.addEventListener('click', () => {
            avatarInput.value = '';
            avatarPreview.src = '';
            avatarPreview.style.display = 'none';
            avatarModal.style.display = 'flex';
        });
    }

    if (avatarInput) {
        avatarInput.addEventListener('change', (e) => {
            const file = e.target.files[0];
            if (file) {
                if (file.size > 2 * 1024 * 1024) {
                    showError('Файл слишком большой. Максимальный размер 2 МБ.');
                    avatarInput.value = '';
                    return;
                }
                const reader = new FileReader();
                reader.onload = (e) => {
                    avatarPreview.src = e.target.result;
                    avatarPreview.style.display = 'block';
                    avatarFile = file;
                };
                reader.readAsDataURL(file);
            }
        });
    }

    if (uploadAvatarBtn) {
        uploadAvatarBtn.addEventListener('click', async () => {
            if (!avatarFile) {
                showError('Выберите файл');
                return;
            }
            uploadAvatarBtn.disabled = true;
            uploadAvatarBtn.innerText = 'Загрузка...';
            
            const success = await uploadAvatar(avatarFile);
            
            uploadAvatarBtn.disabled = false;
            uploadAvatarBtn.innerText = 'Загрузить';
            
            if (success) {
                avatarModal.style.display = 'none';
                avatarFile = null;
                showSuccess('Аватар загружен');
            }
        });
    }

    if (removeAvatarBtn) {
        removeAvatarBtn.addEventListener('click', async () => {
            if (confirm('Удалить аватар?')) {
                removeAvatarBtn.disabled = true;
                removeAvatarBtn.innerText = 'Удаление...';
                
                const success = await removeAvatar();
                
                removeAvatarBtn.disabled = false;
                removeAvatarBtn.innerText = 'Удалить аватар';
                
                if (success) {
                    avatarModal.style.display = 'none';
                    showSuccess('Аватар удалён');
                }
            }
        });
    }

    if (closeAvatarModal) {
        closeAvatarModal.addEventListener('click', () => {
            avatarModal.style.display = 'none';
            avatarFile = null;
        });
    }

    if (closeDetailsModal) {
        closeDetailsModal.addEventListener('click', () => {
            chatDetailsModal.style.display = 'none';
        });
    }

    if (loginSettingsBtn) {
        loginSettingsBtn.addEventListener('click', () => {
            settingsModal.style.display = 'flex';
        });
    }

    window.addEventListener('click', (e) => {
        if (e.target === settingsModal) settingsModal.style.display = 'none';
        if (e.target === participantsModal) participantsModal.style.display = 'none';
        if (e.target === chatDetailsModal) chatDetailsModal.style.display = 'none';
        if (e.target === joinChatModal) joinChatModal.style.display = 'none';
        if (e.target === avatarModal) avatarModal.style.display = 'none';
    });

    // Функция проверки всех прокси
    async function checkAllProxiesHealth() {
        console.log('🔍 Проверка доступности прокси...');
        let workingCount = 0;
        
        for (let i = 0; i < PROXY_LIST.length; i++) {
            const proxy = PROXY_LIST[i];
            try {
                let testUrl = 'https://cloud-api.yandex.net/v1/disk';
                let targetUrl;
                
                if (!proxy.includes('?url=') && !proxy.includes('?uri=')) {
                    const cleanProxy = proxy.replace(/\/$/, '');
                    targetUrl = cleanProxy + '/' + encodeURIComponent(testUrl);
                } else {
                    targetUrl = proxy + encodeURIComponent(testUrl);
                }
                
                const controller = new AbortController();
                const timeoutId = setTimeout(() => controller.abort(), 5000);
                
                const response = await fetch(targetUrl, {
                    method: 'HEAD',
                    signal: controller.signal
                });
                
                clearTimeout(timeoutId);
                
                if (response.status !== 429 && response.status !== 403) {
                    workingCount++;
                    console.log(`✅ Прокси #${i + 1} работает: ${proxy}`);
                } else {
                    console.warn(`⚠️ Прокси #${i + 1} превысил лимит: ${proxy}`);
                }
            } catch {
                console.warn(`⚠️ Прокси #${i + 1} недоступен: ${proxy}`);
            }
        }
        
        if (workingCount === 0) {
            showError('⚠️ Все прокси временно недоступны. Проверьте подключение к интернету.');
        } else {
            console.log(`📊 Доступно прокси: ${workingCount}/${PROXY_LIST.length}`);
        }
    }

    // Запускаем проверку прокси через 3 секунды после загрузки
    setTimeout(checkAllProxiesHealth, 3000);
    // И каждые 5 минут
    setInterval(checkAllProxiesHealth, 5 * 60 * 1000);

    loadSettings();
    window.addEventListener('load', loadChatsFromStorage);
})();