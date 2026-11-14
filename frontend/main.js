// ============ CONFIG ============
const API_URL = "https://startup-finder.ru";
function imgUrl(path) {
    if (!path) return '';
    return path.startsWith('/') ? API_URL + path : path;
}
const PAGE_SIZE = 15;
const CATEGORY_LABELS = { web: 'Web', mobile: 'Mobile', ai: 'AI', telegram: 'Telegram', gamedev: 'GameDev', roblox: 'Roblox', other: 'Другое' };

// ============ STATE ============
let state = {
    user: null,
    token: localStorage.getItem('token'),
    startups: [],
    currentFilter: { stack: [], payment: 'all', vacancy: '', category: 'all' },
    currentPage: 'home',
    editingStartupId: null,
    deletingStartupId: null,
    pendingVerifyEmail: null,
    pendingResetEmail: null,
    filterStacks: [],
    expandedStartups: new Set(),
    authLoaded: false,
    people: [],
    currentMainTab: 'projects',
};

let currentOffset = 0;
let hasMoreStartups = true;
let isLoadingMore = false;

// ============ INIT ============
document.addEventListener('DOMContentLoaded', async () => {
    initTheme();
    initIcons();
    initTagInputs();
    initCharCounters();
    initModalKeys();
    await loadUser();
    await loadStartups(true);
    updateMyStartupsCount();
    initRouteHandler();
});

// ============ ICONS ============
function initIcons() {
    if (window.lucide) {
        lucide.createIcons();
    } else {
        setTimeout(initIcons, 100);
    }
}
function refreshIcons() {
    if (window.lucide) lucide.createIcons();
}

// ============ THEME ============
function initTheme() {
    const saved = localStorage.getItem('theme') || 'system';
    applyTheme(saved);
}
function applyTheme(theme) {
    localStorage.setItem('theme', theme);
    const isDark = theme === 'dark' || (theme === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches);
    document.documentElement.classList.toggle('dark', isDark);
    document.querySelectorAll('.theme-icon-light').forEach(el => el.classList.toggle('hidden', isDark));
    document.querySelectorAll('.theme-icon-dark').forEach(el => el.classList.toggle('hidden', !isDark));
}
function setTheme(theme) { applyTheme(theme); closeThemeMenu(); }
function toggleThemeMenu() {
    const menu = document.getElementById('themeMenu');
    const btn = document.getElementById('themeBtn');
    const isHidden = menu.classList.toggle('hidden');
    btn.setAttribute('aria-expanded', !isHidden);
}
function closeThemeMenu() {
    document.getElementById('themeMenu').classList.add('hidden');
    document.getElementById('themeBtn').setAttribute('aria-expanded', 'false');
}
window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
    if (localStorage.getItem('theme') === 'system') applyTheme('system');
});

// ============ ROUTING ============
const PAGE_ROUTES = { home: '/', create: '/create', profile: '/profile', myStartups: '/my-startups', settings: '/settings' };

function initRouteHandler() {
    window.addEventListener('popstate', handleRoute);
    document.addEventListener('click', (e) => {
        const a = e.target.closest('a');
        if (!a) return;
        const href = a.getAttribute('href') || '';
        if (a.target === '_blank' || a.hasAttribute('download') || !href.startsWith('/')) return;
        e.preventDefault();
        if (window.location.pathname !== href) {
            window.history.pushState({}, '', href);
        }
        handleRoute();
    });
    handleRoute();
}
function handleRoute() {
    // Совместимость со старыми ссылками вида #/profile
    if (window.location.hash.startsWith('#/')) {
        window.history.replaceState({}, '', window.location.hash.slice(1));
    }
    const path = window.location.pathname;
    if (path === '/' || path === '/home') {
        navigate('home', false);
        // Определяем вкладку из URL: /?tab=people → «Люди», иначе «Проекты»
        const tab = new URLSearchParams(window.location.search).get('tab');
        switchMainTab(tab === 'people' ? 'people' : 'projects');
    }
    else if (path === '/create') navigate('create', false);
    else if (path === '/profile') navigate('profile', false);
    else if (path === '/my-startups') navigate('myStartups', false);
    else if (path === '/settings') navigate('settings', false);
    else if (path.startsWith('/user/')) showUserProfile(parseInt(path.split('/')[2], 10));
    else navigate('home', false);
}
function navigate(page, updateUrl = true) {
    if (updateUrl) {
        const url = PAGE_ROUTES[page] || '/';
        if (window.location.pathname !== url) window.history.pushState({}, '', url);
    }
    if ((page === 'create' || page === 'profile' || page === 'myStartups' || page === 'settings') && !state.user) {
        openModal('loginModal');
        return;
    }
    document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
    const pageEl = document.getElementById(page + 'Page');
    if (pageEl) { pageEl.classList.add('active'); state.currentPage = page; }
    window.scrollTo({ top: 0, behavior: 'smooth' });
    if (page === 'profile') loadProfileData();
    if (page === 'myStartups') loadMyStartupsPage();
    if (page === 'create') resetCreateForm();
    updateLoadMoreButton();
    refreshIcons();
}

function switchMainTab(tab) {
    state.currentMainTab = tab;
    // Запоминаем вкладку в URL, чтобы при загрузке страницы
    // автоматически открывалась нужная секция.
    if (window.location.pathname === '/') {
        window.history.replaceState({}, '', tab === 'people' ? '/?tab=people' : '/');
    }
    const projectsSection = document.getElementById('projectsSection');
    const peopleSection = document.getElementById('peopleSection');
    const isDark = document.documentElement.classList.contains('dark');

    const projBtns = [document.getElementById('tabProjects'), document.getElementById('tabProjects2')].filter(Boolean);
    const peopleBtns = [document.getElementById('tabPeople'), document.getElementById('tabPeople2')].filter(Boolean);

    const setActive = (btn) => {
        btn.style.backgroundColor = isDark ? '#374151' : '#ffffff';
        btn.style.color = isDark ? '#ffffff' : '#111827';
        btn.style.boxShadow = '0 1px 2px 0 rgba(0, 0, 0, 0.05)';
    };
    const setInactive = (btn) => {
        btn.style.backgroundColor = 'transparent';
        btn.style.color = isDark ? '#9ca3af' : '#6b7280';
        btn.style.boxShadow = 'none';
    };

    if (tab === 'projects') {
        projectsSection.classList.remove('hidden');
        peopleSection.classList.add('hidden');
        projBtns.forEach(setActive);
        peopleBtns.forEach(setInactive);
    } else {
        projectsSection.classList.add('hidden');
        peopleSection.classList.remove('hidden');
        peopleBtns.forEach(setActive);
        projBtns.forEach(setInactive);
        if (state.people.length === 0) loadPeople();
    }
}
// ============ AUTH ============
async function loadUser() {
    if (!state.token) {
        state.authLoaded = true;
        document.body.classList.remove('auth-loading');
        updateAuthUI();
        return;
    }
    try {
        const res = await fetch(`${API_URL}/api/me`, { headers: { 'Authorization': `Bearer ${state.token}` } });
        if (!res.ok) throw new Error('Invalid token');
        state.user = await res.json();
        state.authLoaded = true;
        document.body.classList.remove('auth-loading');
        updateAuthUI();
    } catch (e) {
        state.token = null;
        state.user = null;
        localStorage.removeItem('token');
        state.authLoaded = true;
        document.body.classList.remove('auth-loading');
        updateAuthUI();
    }
}
function updateAuthUI() {
    const authBtns = document.getElementById('authButtons');
    const profileMenu = document.getElementById('profileMenu');
    const mobileAuth = document.getElementById('mobileAuthButtons');
    const mobileAuthMenu = document.getElementById('mobileAuthMenu');
    const guestInfoBtn = document.getElementById('guestInfoBtn');
    
    if (state.user) {
        authBtns.classList.add('hidden'); authBtns.classList.remove('md:flex');
        profileMenu.classList.remove('hidden'); profileMenu.classList.add('md:flex');
        mobileAuth.classList.add('hidden'); mobileAuthMenu.classList.remove('hidden');
        const initial = (state.user.name || state.user.email || 'U')[0].toUpperCase();
        const avatarHtml = state.user.avatar_url 
            ? `<img src="${imgUrl(state.user.avatar_url)}" class="w-full h-full object-cover" alt="">` 
            : initial;
        document.getElementById('userAvatar').innerHTML = avatarHtml;
        document.getElementById('profileAvatar').innerHTML = avatarHtml;
        document.getElementById('userNameNav').textContent = state.user.name || state.user.email;
        document.getElementById('profileName').textContent = state.user.name || state.user.email;
        guestInfoBtn.classList.add('hidden');
    } else {
        authBtns.classList.remove('hidden'); authBtns.classList.add('md:flex');
        profileMenu.classList.add('hidden'); profileMenu.classList.remove('md:flex');
        mobileAuth.classList.remove('hidden'); mobileAuthMenu.classList.add('hidden');
        guestInfoBtn.classList.remove('hidden');
    }
}
function toggleProfileMenu() {
    const menu = document.getElementById('profileDropdown');
    const btn = document.querySelector('#profileMenu > button');
    const isHidden = menu.classList.toggle('hidden');
    if (btn) btn.setAttribute('aria-expanded', !isHidden);
}
function toggleMobileMenu() { document.getElementById('mobileMenu').classList.toggle('hidden'); }

async function handleLogin(e) {
    e.preventDefault();
    const btn = document.getElementById('loginSubmitBtn');
    const email = document.getElementById('loginEmail').value;
    const password = document.getElementById('loginPassword').value;
    btn.disabled = true;
    btn.innerHTML = '<span class="inline-block w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin"></span>';
    try {
        const res = await fetch(`${API_URL}/api/login`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email, password })
        });
        const data = await res.json();
        if (!res.ok) {
            if (res.status === 403) {
                closeModal('loginModal');
                state.pendingVerifyEmail = email;
                document.getElementById('verifyEmail').textContent = email;
                openModal('verifyModal');
                showToast('Подтвердите email для входа', 'info');
            } else { showToast(data.error?.message || 'Ошибка входа', 'error'); }
            return;
        }
        state.token = data.token;
        localStorage.setItem('token', data.token);
        await loadUser();
        closeModal('loginModal');
        showToast('Добро пожаловать!', 'success');
        document.getElementById('loginEmail').value = '';
        document.getElementById('loginPassword').value = '';
    } catch (err) { showToast('Ошибка соединения с сервером', 'error'); }
    finally { btn.disabled = false; btn.textContent = 'Войти'; }
}
async function handleRegister(e) {
    e.preventDefault();
    const btn = document.getElementById('registerSubmitBtn');
    const email = document.getElementById('registerEmail').value;
    const password = document.getElementById('registerPassword').value;
    btn.disabled = true;
    btn.innerHTML = '<span class="inline-block w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin"></span>';
    try {
        const res = await fetch(`${API_URL}/api/register`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email, password })
        });
        const data = await res.json();
        if (!res.ok) { showToast(data.error?.message || 'Ошибка регистрации', 'error'); return; }
        closeModal('registerModal');
        state.pendingVerifyEmail = email;
        document.getElementById('verifyEmail').textContent = email;
        openModal('verifyModal');
        showToast('Код отправлен на почту', 'success');
        document.getElementById('registerEmail').value = '';
        document.getElementById('registerPassword').value = '';
    } catch (err) { showToast('Ошибка соединения с сервером', 'error'); }
    finally { btn.disabled = false; btn.textContent = 'Создать аккаунт'; }
}
async function handleVerify(e) {
    e.preventDefault();
    const btn = document.getElementById('verifySubmitBtn');
    const code = document.getElementById('verifyCode').value;
    btn.disabled = true;
    btn.innerHTML = '<span class="inline-block w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin"></span>';
    try {
        const res = await fetch(`${API_URL}/api/verify`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email: state.pendingVerifyEmail, code })
        });
        const data = await res.json();
        if (!res.ok) { showToast(data.error?.message || 'Неверный код', 'error'); return; }
        state.token = data.token;
        localStorage.setItem('token', data.token);
        await loadUser();
        closeModal('verifyModal');
        showToast('Email подтверждён! Добро пожаловать!', 'success');
        document.getElementById('verifyCode').value = '';
        state.pendingVerifyEmail = null;
    } catch (err) { showToast('Ошибка соединения с сервером', 'error'); }
    finally { btn.disabled = false; btn.textContent = 'Подтвердить'; }
}
async function handleForgotPassword(e) {
    e.preventDefault();
    const btn = document.getElementById('forgotSubmitBtn');
    const email = document.getElementById('forgotEmail').value;
    btn.disabled = true;
    btn.innerHTML = '<span class="inline-block w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin"></span>';
    try {
        const res = await fetch(`${API_URL}/api/forgot-password`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email })
        });
        const data = await res.json();
        if (!res.ok) { showToast(data.error?.message || 'Ошибка', 'error'); return; }
        closeModal('forgotModal');
        state.pendingResetEmail = email;
        document.getElementById('resetEmail').textContent = email;
        openModal('resetModal');
        showToast(data.message, 'success');
    } catch (err) { showToast('Ошибка соединения с сервером', 'error'); }
    finally { btn.disabled = false; btn.textContent = 'Получить код'; }
}
async function handleResetPassword(e) {
    e.preventDefault();
    const btn = document.getElementById('resetSubmitBtn');
    const code = document.getElementById('resetCode').value;
    const newPassword = document.getElementById('resetNewPassword').value;
    const confirmPassword = document.getElementById('resetConfirmPassword').value;
    if (newPassword !== confirmPassword) { showToast('Пароли не совпадают', 'error'); return; }
    btn.disabled = true;
    btn.innerHTML = '<span class="inline-block w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin"></span>';
    try {
        const res = await fetch(`${API_URL}/api/reset-password`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email: state.pendingResetEmail, code, newPassword })
        });
        const data = await res.json();
        if (!res.ok) { showToast(data.error?.message || 'Ошибка', 'error'); return; }
        closeModal('resetModal');
        showToast('Пароль успешно изменён!', 'success');
        openModal('loginModal');
        document.getElementById('resetCode').value = '';
        document.getElementById('resetNewPassword').value = '';
        document.getElementById('resetConfirmPassword').value = '';
        state.pendingResetEmail = null;
    } catch (err) { showToast('Ошибка соединения с сервером', 'error'); }
    finally { btn.disabled = false; btn.textContent = 'Сменить пароль'; }
}
function confirmLogout() { document.getElementById('profileDropdown').classList.add('hidden'); openModal('logoutModal'); }
function handleLogout() {
    state.token = null; state.user = null;
    localStorage.removeItem('token');
    state.authLoaded = true;
    document.body.classList.remove('auth-loading');
    updateAuthUI();
    closeModal('logoutModal');
    navigate('home');
    showToast('Вы вышли из аккаунта', 'success');
}

// ============ НАСТРОЙКИ ============
function updateThemeButtons() {
    const current = localStorage.getItem('theme') || 'system';
    document.querySelectorAll('[data-theme-btn]').forEach(btn => {
        const active = btn.dataset.themeBtn === current;
        btn.classList.toggle('border-brand-500', active);
        btn.classList.toggle('bg-brand-50', active);
        btn.classList.toggle('dark:bg-brand-950/40', active);
        btn.classList.toggle('border-gray-200', !active);
        btn.classList.toggle('dark:border-gray-700', !active);
    });
    refreshIcons();
}

async function handleDeleteAccount() {
    const btn = document.getElementById('deleteAccountBtn');
    btn.disabled = true;
    btn.textContent = 'Удаляем...';
    try {
        const res = await fetch(`${API_URL}/api/users/${state.user.id}`, {
            method: 'DELETE',
            headers: { 'Authorization': `Bearer ${state.token}` }
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) {
            showToast(data.error?.message || 'Не удалось удалить аккаунт', 'error');
            return;
        }
        state.token = null;
        state.user = null;
        localStorage.removeItem('token');
        state.authLoaded = true;
        document.body.classList.remove('auth-loading');
        closeModal('deleteAccountModal');
        updateAuthUI();
        navigate('home');
        showToast('Аккаунт удалён. Нам будет вас не хватать!', 'success');
    } catch (err) {
        showToast('Ошибка соединения с сервером', 'error');
    } finally {
        btn.disabled = false;
        btn.textContent = 'Удалить';
    }
}

// ============ STARTUPS (СЕРВЕРНАЯ ПАГИНАЦИЯ) ============
function buildStartupsUrl(offset = 0, limit = PAGE_SIZE) {
    const params = new URLSearchParams({
        limit: limit.toString(),
        offset: offset.toString(),
        payment: state.currentFilter.payment,
        category: state.currentFilter.category
    });
    if (state.currentFilter.stack.length > 0) {
        params.set('stack', state.currentFilter.stack.join(','));
    }
    return `${API_URL}/api/startups?${params.toString()}`;
}

async function loadStartups(reset = false) {
    if (reset) {
        currentOffset = 0;
        state.startups = [];
        document.getElementById('projectsGrid').innerHTML = '';
        document.getElementById('projectsEmpty').classList.add('hidden');
        document.getElementById('projectsLoading').classList.remove('hidden');
        updateLoadMoreButton();
    }
    if (isLoadingMore) return;
    isLoadingMore = true;
    const moreBtn = document.getElementById('loadMoreBtn');
    if (moreBtn) moreBtn.disabled = true;
    const loader = document.getElementById('loadMoreLoader');
    if (loader) loader.classList.remove('hidden');
    try {
        const res = await fetch(buildStartupsUrl(currentOffset), {
            headers: authHeaders()
        });
        if (!res.ok) throw new Error();
        const data = await res.json();
        if (reset) {
            state.startups = data.startups;
        } else {
            state.startups = [...state.startups, ...data.startups];
        }
        hasMoreStartups = data.hasMore;
        currentOffset += data.startups.length;
        if (data.startups.length > 0) {
            const grid = document.getElementById('projectsGrid');
            const fragment = document.createDocumentFragment();
            data.startups.forEach((s, idx) => {
                const div = document.createElement('div');
                div.innerHTML = renderStartupCard(s, !reset);
                fragment.appendChild(div.firstElementChild);
            });
            grid.appendChild(fragment);
            refreshIcons();
        }
        if (reset && state.startups.length === 0) {
            document.getElementById('projectsEmpty').classList.remove('hidden');
        }
        updateLoadMoreButton();
    } catch (err) {
        showToast('Не удалось загрузить проекты', 'error');
    } finally {
        isLoadingMore = false;
        if (moreBtn) moreBtn.disabled = false;
        if (loader) loader.classList.add('hidden');
        document.getElementById('projectsLoading').classList.add('hidden');
    }
}

async function loadPeople() {
    const grid = document.getElementById('peopleGrid');
    const empty = document.getElementById('peopleEmpty');
    try {
        const res = await fetch(`${API_URL}/api/users?isOpenToWork=true`);
        if (!res.ok) throw new Error();
        const data = await res.json();
        state.people = Array.isArray(data) ? data : (data.users || []);
        if (state.people.length === 0) {
            grid.innerHTML = '';
            empty.classList.remove('hidden');
        } else {
            empty.classList.add('hidden');
            grid.innerHTML = state.people.map(u => renderPeopleCard(u)).join('');
            refreshIcons();
        }
    } catch (err) {
        showToast('Не удалось загрузить участников', 'error');
    }
}

function renderPeopleCard(user) {
    const stackItems = user.stack ? user.stack.split(',').map(s => s.trim()).filter(Boolean) : [];
    const levelLabels = { 1: 'Junior', 2: 'Middle', 3: 'Senior', 4: 'Lead' };
    const initial = (user.name || 'U')[0].toUpperCase();
    
    return `
    <article class="bg-white dark:bg-gray-900 rounded-2xl border border-gray-100 dark:border-gray-800 shadow-sm p-6 md:p-8">
        <div class="flex items-start gap-4 mb-4">
            <a href="/user/${user.id}" target="_self" class="flex-shrink-0" aria-label="Профиль ${escapeHtml(user.name || 'участника')}">
            <div class="w-14 h-14 rounded-full bg-gradient-to-br from-brand-400 to-brand-600 flex items-center justify-center text-white text-xl font-semibold flex-shrink-0">
                ${user.avatar_url ? `<img src="${imgUrl(user.avatar_url)}" class="w-full h-full object-cover rounded-full" alt="">` : initial}
            </div>
            </a>
            <div class="flex-1 min-w-0">
                <a href="/user/${user.id}" target="_self" class="hover:text-brand-600 dark:hover:text-brand-400 transition-colors"><h3 class="text-lg font-semibold text-gray-900 dark:text-white">${escapeHtml(user.name || 'Без имени')}</h3></a>
                ${user.role ? `<p class="text-sm text-gray-500 dark:text-gray-400">${escapeHtml(user.role)}</p>` : ''}
                ${user.desired_role ? `<p class="text-sm text-brand-600 dark:text-brand-400">Ищет: ${escapeHtml(user.desired_role)}</p>` : ''}
            </div>
        </div>
        
        ${user.description ? `<p class="text-sm text-gray-600 dark:text-gray-400 mb-4 line-clamp-3">${escapeHtml(user.description)}</p>` : ''}
        
        ${stackItems.length ? `
        <div class="flex flex-wrap gap-2 mb-4">
            ${stackItems.map(s => `<span class="px-2.5 py-1 bg-gray-50 dark:bg-gray-800 text-gray-600 dark:text-gray-400 text-xs font-normal rounded-md border border-gray-100 dark:border-gray-700">${escapeHtml(s)}</span>`).join('')}
        </div>` : ''}
        
        <div class="flex items-center justify-between pt-4 border-t border-gray-100 dark:border-gray-800">
            <div class="flex items-center gap-2 text-sm text-gray-500">
                ${user.level ? `<span class="px-2 py-0.5 bg-brand-50 dark:bg-brand-950/40 text-brand-700 dark:text-brand-400 rounded text-xs font-medium">${levelLabels[user.level] || ''}</span>` : ''}
                ${user.experience ? `<span>${user.experience} лет опыта</span>` : ''}
            </div>
            <a href="/user/${user.id}" target="_self" class="text-sm font-semibold text-brand-600 dark:text-brand-400 hover:underline">Профиль</a>
        </div>
    </article>
    `;
}

async function handlePeopleSearch() {
    const q = document.getElementById('peopleSearchInput').value.trim().toLowerCase();
    if (!q) { loadPeople(); return; }
    const filtered = state.people.filter(u => 
        (u.role || '').toLowerCase().includes(q) ||
        (u.stack || '').toLowerCase().includes(q) ||
        (u.name || '').toLowerCase().includes(q) ||
        (u.desired_role || '').toLowerCase().includes(q)
    );
    const grid = document.getElementById('peopleGrid');
    const empty = document.getElementById('peopleEmpty');
    if (filtered.length === 0) {
        grid.innerHTML = '';
        empty.classList.remove('hidden');
    } else {
        empty.classList.add('hidden');
        grid.innerHTML = filtered.map(u => renderPeopleCard(u)).join('');
        refreshIcons();
    }
}

function updateLoadMoreButton() {
    const wrap = document.getElementById('loadMoreWrap');
    if (!wrap) return;
    const show = hasMoreStartups && state.startups.length > 0 && state.currentPage === 'home';
    wrap.classList.toggle('hidden', !show);
}

function parseArray(val) {
    let arr;
    if (Array.isArray(val)) {
        arr = val;
    } else if (!val) {
        return [];
    } else if (typeof val === 'string') {
        const s = val.trim();
        if (s.startsWith('{') && s.endsWith('}') && !s.includes('":')) {
            arr = s.slice(1, -1).split(',')
                .map(x => x.trim().replace(/^"|"$/g, '').replace(/\\"/g, '"'))
                .filter(Boolean);
        } else {
            try {
                const parsed = JSON.parse(s);
                arr = Array.isArray(parsed) ? parsed : [parsed];
            } catch (e) {
                arr = s.split(',').map(x => x.trim());
            }
        }
    } else {
        return [];
    }
    const out = [];
    for (const item of arr) {
        if (typeof item === 'string' && (item.trim().startsWith('{') || item.trim().startsWith('['))) {
            try {
                const inner = JSON.parse(item);
                if (Array.isArray(inner)) { out.push(...inner); continue; }
                if (inner) { out.push(String(inner)); continue; }
            } catch (e) {}
        }
        if (item) out.push(item);
    }
    return out.filter(Boolean).map(String);
}

function cleanTelegram(val) {
    if (!val) return '';
    return val.trim().replace(/^@/, '');
}

function hasExpandableContent(startup) {
    const contacts = parseArray(startup.contacts);
    const hasContacts = contacts.length > 0 || !!startup.telegram || !!startup.contacts_hidden;
    const desc = (startup.description || '').trim();
    return hasContacts || desc.length > 120;
}

function toggleExpand(startupId, btnEl) {
    const card = btnEl ? btnEl.closest('article') : document.getElementById(`startup-card-${startupId}`);
    if (!card) return;
    const isExpanded = state.expandedStartups.has(startupId);
    const descEl = card.querySelector('.startup-desc');
    const expandContent = card.querySelector('.expand-content');
    const btn = card.querySelector('.expand-btn');
    const btnText = card.querySelector('.expand-btn-text');
    const btnIcon = card.querySelector('.expand-btn-icon');

    if (isExpanded) {
        state.expandedStartups.delete(startupId);
        if (descEl) descEl.classList.add('line-clamp-3');
        if (expandContent) expandContent.classList.remove('expanded');
        if (btn) btn.setAttribute('aria-expanded', 'false');
        if (btnText) btnText.textContent = 'Подробнее';
        if (btnIcon) btnIcon.setAttribute('data-lucide', 'chevron-down');
    } else {
        state.expandedStartups.add(startupId);
        if (descEl) descEl.classList.remove('line-clamp-3');
        if (expandContent) expandContent.classList.add('expanded');
        if (btn) btn.setAttribute('aria-expanded', 'true');
        if (btnText) btnText.textContent = 'Скрыть';
        if (btnIcon) btnIcon.setAttribute('data-lucide', 'chevron-up');
    }
    refreshIcons();
}

async function viewStartupInFeed(startupId) {
    state.expandedStartups.clear();
    state.expandedStartups.add(startupId);
    state.currentFilter = { stack: [], payment: 'all', vacancy: '', category: 'all' };
    document.getElementById('filterCategory').value = 'all';
    document.querySelectorAll('.filter-chip').forEach(chip => {
        const f = chip.dataset.filter;
        if (f === 'all') {
            chip.classList.add('bg-brand-500', 'text-white');
            chip.classList.remove('bg-white', 'dark:bg-gray-900', 'border', 'border-gray-200', 'dark:border-gray-800');
        } else {
            chip.classList.remove('bg-brand-500', 'text-white');
            chip.classList.add('bg-white', 'dark:bg-gray-900', 'border', 'border-gray-200', 'dark:border-gray-800');
        }
    });
    document.getElementById('activeFiltersCount').classList.add('hidden');
    navigate('home');
    try {
        const res = await fetch(`${API_URL}/api/startups?limit=200&offset=0&payment=all`, {
            headers: authHeaders()
        });
        if (res.ok) {
            const data = await res.json();
            state.startups = data.startups || [];
            currentOffset = state.startups.length;
            hasMoreStartups = data.hasMore;
            const grid = document.getElementById('projectsGrid');
            grid.innerHTML = '';
            if (state.startups.length > 0) {
                grid.innerHTML = state.startups.map(s => renderStartupCard(s, true)).join('');
                refreshIcons();
            }
            const projectsSection = document.getElementById('projectsSection');
            if (projectsSection) projectsSection.scrollIntoView({ behavior: 'smooth', block: 'start' });
            setTimeout(() => {
                const card = document.getElementById(`startup-card-${startupId}`);
                if (card) {
                    card.classList.add('startup-highlight');
                    setTimeout(() => card.classList.remove('startup-highlight'), 2000);
                }
            }, 300);
        }
    } catch (e) { console.error(e); }
}
function updateMyStartupsCount() {
    if (!state.user || !state.startups) return;
    const count = state.startups.filter(s => Number(s.user_id) === Number(state.user.id)).length;
    const badge = document.getElementById('myStartupsCount');
    if (badge) {
        badge.textContent = count;
    }
}

function renderStartupCard(startup, animate = true) {
    const stacks = parseArray(startup.stack);
    const vacancies = parseArray(startup.vacancies);
    const contacts = parseArray(startup.contacts);
    const initial = (startup.name || 'P')[0].toUpperCase();
    const timeAgo = getTimeAgo(startup.created_at);
    const isExpanded = state.expandedStartups.has(startup.id);
    const isOwner = state.user && Number(state.user.id) === Number(startup.user_id);
    const authorName = startup.author_name || 'Участник';
    const authorInitial = authorName[0].toUpperCase();
    const authorLink = isOwner ? '/profile' : `/user/${startup.user_id}`;
    const expandable = hasExpandableContent(startup);
    const animClass = animate ? 'stagger-item' : '';

    const fullDesc = escapeHtml(startup.description || '');

    return `
    <article id="startup-card-${startup.id}" class="${animClass} startup-card bg-white dark:bg-gray-900 rounded-2xl border border-gray-100 dark:border-gray-800 shadow-sm hover:shadow-md transition-all duration-300 overflow-hidden group">
        <div class="startup-card-body p-6 md:p-10">

            <div class="startup-row flex items-start gap-4 mb-5">
                ${startup.image_url ? `
                <div class="w-16 h-16 rounded-full overflow-hidden flex-shrink-0 bg-gray-50 dark:bg-gray-800 ring-1 ring-gray-100 dark:ring-gray-700">
                   <img src="${imgUrl(startup.image_url)}" alt="${escapeHtml(startup.name)}" class="w-full h-full object-cover" fetchpriority="high">
                </div>
                ` : `
                <div class="w-16 h-16 rounded-xl bg-gray-100 dark:bg-gray-800 flex items-center justify-center text-gray-500 dark:text-gray-400 font-semibold text-2xl flex-shrink-0 ring-1 ring-gray-100 dark:ring-gray-700">
                    ${initial}
                </div>
                `}

                <div class="flex-1 min-w-0 pt-1">
                    <div class="startup-card-head">
                        <h3 class="text-xl font-semibold tracking-tight text-gray-900 dark:text-white break-words leading-tight">
                            ${escapeHtml(startup.name)}
                        </h3>
                        <div class="flex flex-col items-end gap-1.5 flex-shrink-0" style="align-self:flex-start">
                        ${startup.is_paid
                         ? '<span class="inline-flex items-center gap-1 px-2.5 py-1 bg-green-500/10 text-green-600 dark:text-green-400 text-xs font-semibold rounded-full" style="white-space:nowrap"><i data-lucide="wallet" class="w-3 h-3"></i>С оплатой</span>'
: '<span class="inline-flex items-center gap-1 px-2.5 py-1 bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 text-xs font-semibold rounded-full" style="white-space:nowrap"><i data-lucide="handshake" class="w-3 h-3"></i>Без оплаты</span>'
                        }
                        ${startup.category && CATEGORY_LABELS[startup.category] ? `<span class="inline-flex items-center px-2.5 py-1 bg-brand-50 dark:bg-brand-950/40 text-brand-700 dark:text-brand-400 text-xs font-semibold rounded-full" style="white-space:nowrap">${CATEGORY_LABELS[startup.category]}</span>` : ''}
                        </div>
                    </div>
                    <p class="text-xs font-normal text-gray-400 dark:text-gray-500">${timeAgo}</p>
                </div>
            </div>

            <div class="startup-row mb-6">
                <p class="startup-desc text-sm text-gray-600 dark:text-gray-400 leading-relaxed break-words ${isExpanded ? '' : 'line-clamp-3'}">
                    ${fullDesc}
                </p>
            </div>

            <a href="${authorLink}" target="_self" class="startup-row flex items-center gap-2.5 mb-6 group/author" aria-label="Профиль автора">
                <div class="w-7 h-7 rounded-full bg-gray-200 dark:bg-gray-700 flex items-center justify-center text-gray-600 dark:text-gray-300 text-xs font-semibold overflow-hidden flex-shrink-0 ring-2 ring-white dark:ring-gray-900">
                    ${startup.author_avatar ? `<img src="${imgUrl(startup.author_avatar)}" class="w-full h-full object-cover" alt="">` : authorInitial}
                </div>
                <span class="text-sm font-normal text-gray-700 dark:text-gray-300 group-hover/author:text-brand-500 transition-colors">
                    ${escapeHtml(authorName)}
                </span>
            </a>

            ${stacks.length > 0 ? `
            <div class="startup-row flex flex-wrap gap-2 mb-6">
                ${stacks.map(s => `<span class="px-2.5 py-1 bg-gray-50 dark:bg-gray-800 text-gray-600 dark:text-gray-400 text-xs font-normal rounded-md border border-gray-100 dark:border-gray-700">${escapeHtml(s)}</span>`).join('')}
            </div>` : ''}

            ${vacancies.length > 0 ? `
            <div class="startup-row startup-vacancies mb-6 p-4 bg-gray-50 dark:bg-gray-800/50 rounded-xl border border-gray-100 dark:border-gray-800">
                <div class="flex items-center gap-2 mb-3">
                    <i data-lucide="users" class="w-4 h-4 text-gray-500 dark:text-gray-400"></i>
                    <span class="text-xs font-semibold text-gray-900 dark:text-white uppercase tracking-wider">Ищут в команду</span>
                </div>
                <div class="flex flex-wrap gap-2">
                    ${vacancies.map(v => `
                    <span class="inline-flex items-center gap-1.5 px-3 py-1.5 bg-white dark:bg-gray-900 rounded-lg border border-gray-200 dark:border-gray-700 text-sm font-normal text-gray-700 dark:text-gray-300 shadow-sm">
                        <i data-lucide="briefcase" class="w-3.5 h-3.5 text-gray-400"></i>
                        ${escapeHtml(v)}
                    </span>
                    `).join('')}
                </div>
            </div>` : ''}

            <div class="expand-content ${isExpanded ? 'expanded' : ''} startup-row">
                <div class="pt-5 border-t border-gray-100 dark:border-gray-800 space-y-3">
                    ${contacts.length > 0 || startup.telegram ? `
                    <div>
                        <div class="text-[11px] font-semibold text-gray-400 uppercase tracking-widest mb-3">Контакты</div>
                        <div class="space-y-2">
                        ${startup.telegram ? `
<a href="https://t.me/${escapeHtml(cleanTelegram(startup.telegram))}" target="_blank" rel="noopener noreferrer" class="telegram-link flex items-center gap-3 p-3 bg-blue-50 rounded-xl hover:bg-blue-100 transition-colors group/link">
    <div class="telegram-icon w-8 h-8 rounded-lg bg-blue-500 flex items-center justify-center flex-shrink-0 shadow-sm shadow-blue-500/20">
        <i data-lucide="send" class="w-4 h-4 text-white"></i>
    </div>
    <div class="flex-1 min-w-0">
        <div class="text-[10px] font-semibold text-blue-600 dark:text-blue-400 uppercase tracking-wider">Telegram</div>
        <div class="text-sm font-normal text-gray-900 dark:text-white truncate">@${escapeHtml(cleanTelegram(startup.telegram))}</div>
    </div>
    <i data-lucide="arrow-up-right" class="w-4 h-4 text-gray-400 flex-shrink-0 group-hover/link:text-blue-500 transition-colors"></i>
</a>` : ''}
                            ${contacts.map(c => renderContactLink(c)).join('')}
                        </div>
                    </div>` : (startup.contacts_hidden ? `
                    <div>
                        <div class="text-[11px] font-semibold text-gray-400 uppercase tracking-widest mb-3">Контакты</div>
                        <button onclick="openModal('registerModal')" class="w-full flex items-center gap-3 p-3 bg-brand-50 dark:bg-brand-950/40 rounded-xl border border-brand-200 dark:border-brand-800/40 hover:bg-brand-100 dark:hover:bg-brand-950/60 transition-colors">
                            <i data-lucide="eye" class="w-4 h-4 text-brand-500 flex-shrink-0"></i>
                            <span class="text-sm font-semibold text-brand-700 dark:text-brand-300">Зарегистрируйтесь, чтобы увидеть контакты</span>
                        </button>
                    </div>` : '')}
                </div>
            </div>

            <div class="startup-row flex flex-wrap items-center gap-3 pt-5 border-t border-gray-100 dark:border-gray-800 mt-2">
               ${expandable ? `
                <button onclick="toggleExpand(${startup.id}, this)" class="expand-btn flex-1 px-4 py-2.5 bg-gray-50 dark:bg-gray-800 hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-300 rounded-xl text-sm font-semibold transition-colors flex items-center justify-center gap-1.5" aria-expanded="${isExpanded}">
                <i data-lucide="${isExpanded ? 'chevron-up' : 'chevron-down'}" class="expand-btn-icon w-4 h-4"></i>
                <span class="expand-btn-text">${isExpanded ? 'Скрыть' : 'Подробнее'}</span>
                </button>
                    ` : '<div class="flex-1"></div>'}

                ${isOwner ? `
                <div class="flex items-center gap-2">
                    <button onclick="openEditStartup(${startup.id})" class="p-2.5 text-gray-500 hover:text-gray-900 dark:text-gray-400 dark:hover:text-white hover:bg-gray-100 dark:hover:bg-gray-800 rounded-xl transition-colors" aria-label="Редактировать">
                        <i data-lucide="pencil" class="w-4 h-4"></i>
                    </button>
                    <button onclick="confirmDeleteStartup(${startup.id})" class="p-2.5 text-gray-500 hover:text-red-600 dark:text-gray-400 dark:hover:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/30 rounded-xl transition-colors" aria-label="Удалить">
                        <i data-lucide="trash-2" class="w-4 h-4"></i>
                    </button>
                </div>
                ` : ''}
            </div>

        </div>
    </article>
    `;
}

function renderContactLink(contact) {
    const c = contact.trim();
    if (!c) return '';
    let href = '#', icon = 'link', label = c;
    if (c.startsWith('@')) { href = `https://t.me/${c.slice(1)}`; icon = 'send'; label = 'Telegram: ' + c; }
    else if (c.includes('@') && c.includes('.')) { href = `mailto:${c}`; icon = 'mail'; label = c; }
    else if (c.includes('vk.com')) { href = c.startsWith('http') ? c : `https://${c}`; icon = 'users'; }
    else if (c.includes('github.com')) { href = c.startsWith('http') ? c : `https://${c}`; icon = 'code'; }
    else if (c.startsWith('http')) { href = c; }
    return `
    <a href="${href}" target="_blank" rel="noopener noreferrer" class="flex items-center gap-3 p-3 bg-gray-50 dark:bg-gray-800/50 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors">
        <div class="w-8 h-8 rounded-lg bg-brand-50 dark:bg-brand-950/40 flex items-center justify-center flex-shrink-0">
            <i data-lucide="${icon}" class="w-4 h-4 text-brand-500"></i>
        </div>
        <div class="flex-1 min-w-0">
            <div class="text-sm font-normal truncate">${escapeHtml(label)}</div>
        </div>
        <i data-lucide="external-link" class="w-4 h-4 text-gray-400 flex-shrink-0"></i>
    </a>
    `;
}
function getTimeAgo(dateStr) {
    if (!dateStr) return '';
    const date = new Date(dateStr);
    const now = new Date();
    const diff = Math.floor((now - date) / 1000);
    if (diff < 60) return 'только что';
    if (diff < 3600) return `${Math.floor(diff/60)} мин. назад`;
    if (diff < 86400) return `${Math.floor(diff/3600)} ч. назад`;
    if (diff < 604800) return `${Math.floor(diff/86400)} дн. назад`;
    return date.toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' });
}

// ============ FILTERS ============
function setQuickFilter(filter) {
    state.currentFilter.payment = filter;
    document.querySelectorAll('.filter-chip').forEach(chip => {
        const f = chip.dataset.filter;
        if (f === filter) {
            chip.classList.add('bg-brand-500', 'text-white');
            chip.classList.remove('bg-white', 'dark:bg-gray-900', 'border', 'border-gray-200', 'dark:border-gray-800');
        } else {
            chip.classList.remove('bg-brand-500', 'text-white');
            chip.classList.add('bg-white', 'dark:bg-gray-900', 'border', 'border-gray-200', 'dark:border-gray-800');
        }
    });
    loadStartups(true);
}

function openFiltersModal() { openModal('filtersModal'); renderFilterStackTags(); refreshIcons(); }
function renderFilterStackTags() {
    const container = document.getElementById('filterStackTags');
    container.innerHTML = state.filterStacks.map((s, i) => `
        <span class="tag">
            ${escapeHtml(s)}
            <button type="button" onclick="removeFilterStack(${i})" aria-label="Удалить фильтр"><i data-lucide="x" class="w-3 h-3"></i></button>
        </span>
    `).join('');
    refreshIcons();
}
function removeFilterStack(idx) { state.filterStacks.splice(idx, 1); renderFilterStackTags(); }

function applyFilters() {
    state.currentFilter.stack = [...state.filterStacks];
    const payment = document.querySelector('input[name="paymentFilter"]:checked').value;
    state.currentFilter.payment = payment;
    const category = document.getElementById('filterCategory').value;
    state.currentFilter.category = category;
    const vacancy = document.getElementById('filterVacancyInput').value.trim();
    state.currentFilter.vacancy = vacancy;
    document.querySelectorAll('.filter-chip').forEach(chip => {
        const f = chip.dataset.filter;
        if (f === payment) {
            chip.classList.add('bg-brand-500', 'text-white');
            chip.classList.remove('bg-white', 'dark:bg-gray-900', 'border', 'border-gray-200', 'dark:border-gray-800');
        } else {
            chip.classList.remove('bg-brand-500', 'text-white');
            chip.classList.add('bg-white', 'dark:bg-gray-900', 'border', 'border-gray-200', 'dark:border-gray-800');
        }
    });
    closeModal('filtersModal');
    const count = state.filterStacks.length + (payment !== 'all' ? 1 : 0) + (category !== 'all' ? 1 : 0);
    const badge = document.getElementById('activeFiltersCount');
    if (count > 0) { badge.textContent = count; badge.classList.remove('hidden'); }
    else { badge.classList.add('hidden'); }
    loadStartups(true);
}

function resetFilters() {
    state.filterStacks = [];
    state.currentFilter.stack = [];
    state.currentFilter.payment = 'all';
    state.currentFilter.category = 'all';
    document.querySelector('input[name="paymentFilter"][value="all"]').checked = true;
    document.getElementById('filterCategory').value = 'all';
    document.getElementById('filterStackInput').value = '';
    renderFilterStackTags();
    document.getElementById('activeFiltersCount').classList.add('hidden');
    loadStartups(true);
}

// ============ CREATE STARTUP ============
function handleCreateClick() { if (!state.user) { openModal('loginModal'); return; } navigate('create'); }
function resetCreateForm() {
    document.getElementById('createForm').reset();
    document.getElementById('createDescCount').textContent = '0';
    document.getElementById('createContactsError').classList.add('hidden');
}

function validateFileSize(inputId, maxMB = 5) {
    const file = document.getElementById(inputId)?.files[0];
    if (file && file.size > maxMB * 1024 * 1024) {
        showToast(`Файл слишком большой. Максимум ${maxMB} МБ.`, 'error');
        document.getElementById(inputId).value = '';
        return false;
    }
    return true;
}

async function handleCreateSubmit(e) {
    e.preventDefault();
    if (!state.user) { openModal('loginModal'); return; }

    // Контакты и вакансии вводятся одной строкой через запятую
    const contactInput = document.getElementById('createContacts');
    const contacts = contactInput.value.split(',').map(v => v.trim()).filter(Boolean);

    const vacancyInput = document.getElementById('createVacancies');
    const vacancies = vacancyInput.value.split(',').map(v => v.trim()).filter(Boolean);

    const telegram = cleanTelegram(document.getElementById('createTelegram').value);
    if (!telegram && contacts.length === 0) {
        document.getElementById('createContactsError').classList.remove('hidden');
        showToast('Укажите хотя бы один способ связи', 'error');
        return;
    }
    if (vacancies.length === 0) {
        showToast('Укажите хотя бы одну вакансию', 'error');
        vacancyInput.focus();
        return;
    }
    document.getElementById('createContactsError').classList.add('hidden');
    if (!validateFileSize('createImage', 5)) return;

    const btn = document.getElementById('createSubmitBtn');
    btn.disabled = true;
    btn.innerHTML = '<span class="inline-block w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin"></span> Публикация...';

    const formData = new FormData();
    formData.append('name', document.getElementById('createName').value);
    formData.append('description', document.getElementById('createDescription').value);
    formData.append('is_paid', document.getElementById('createIsPaid').checked);
    formData.append('category', document.getElementById('createCategory').value);
    formData.append('stack', document.getElementById('createStack').value);
    formData.append('telegram', telegram);
    formData.append('vacancies', JSON.stringify(vacancies));
    formData.append('contacts', JSON.stringify(contacts));
    
    const imageFile = document.getElementById('createImage')?.files[0];
    if (imageFile) formData.append('image', imageFile);

    try {
        const res = await fetch(`${API_URL}/api/startups`, {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${state.token}` },
            body: formData
        });
        if (!res.ok) { const err = await res.json(); throw new Error(err.error?.message || 'Ошибка'); }
        showToast('Проект опубликован!', 'success');
        navigate('home');
        loadStartups(true);
    } catch (err) { showToast(err.message || 'Не удалось создать проект', 'error'); }
    finally {
        btn.disabled = false;
        btn.innerHTML = '<i data-lucide="send" class="w-4 h-4 inline"></i> Опубликовать';
        refreshIcons();
    }
}

// ============ MY STARTUPS ============
async function loadProfileData() {
    if (!state.user) return;

    const nameEl = document.getElementById('profileNameBig');
    if (nameEl) nameEl.textContent = state.user.name || 'Без имени';

    const descEl = document.getElementById('profileDescription');
    if (descEl) descEl.textContent = state.user.description || 'Описание пока не добавлено';

    // ===== Открыт к предложениям =====
    const openToWorkLine = document.getElementById('profileOpenToWorkLine');
    if (openToWorkLine) {
        const desiredRoleEl = document.getElementById('profileDesiredRole');
        if (desiredRoleEl) desiredRoleEl.textContent = state.user.desired_role ? ` · ${state.user.desired_role}` : '';
        openToWorkLine.classList.toggle('hidden', !state.user.is_open_to_work);
        refreshIcons();
    }

    // ===== Профессиональная информация =====
    const profBlock = document.getElementById('profileProfessional');
    const roleLine = document.getElementById('profileRoleLine');
    const roleValue = document.getElementById('profileRoleValue');
    const levelLine = document.getElementById('profileLevelLine');
    const levelValue = document.getElementById('profileLevelValue');
    const stackSection = document.getElementById('profileStackSection');
    const stackTags = document.getElementById('profileStackTags');
    const githubLine = document.getElementById('profileGithubLine');
    const githubLink = document.getElementById('profileGithubLink');

    if (profBlock) {
        const hasProf = state.user.role || state.user.level || state.user.experience || state.user.stack || state.user.github;
        profBlock.classList.toggle('hidden', !hasProf);

        // Роль
        if (state.user.role) {
            roleValue.textContent = state.user.role;
            roleLine.classList.remove('hidden');
        } else {
            roleLine.classList.add('hidden');
        }

        // Уровень + опыт
        const levelLabels = { 1: 'Junior', 2: 'Middle', 3: 'Senior', 4: 'Lead' };
        const levelParts = [];
        if (state.user.level && levelLabels[state.user.level]) levelParts.push(levelLabels[state.user.level]);
        if (state.user.experience) {
            const n = state.user.experience;
            const mod10 = n % 10, mod100 = n % 100;
            const word = (mod10 === 1 && mod100 !== 11) ? 'год'
                : (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) ? 'года'
                : 'лет';
            levelParts.push(`${n} ${word} опыта`);
        }
        if (levelParts.length) {
            levelValue.textContent = levelParts.join(' · ');
            levelLine.classList.remove('hidden');
        } else {
            levelLine.classList.add('hidden');
        }

        // Стек
        if (state.user.stack) {
            const items = state.user.stack.split(',').map(s => s.trim()).filter(Boolean);
            stackTags.innerHTML = items.map(s =>
                `<span class="px-2.5 py-1 bg-gray-50 dark:bg-gray-800 text-gray-600 dark:text-gray-400 text-xs font-normal rounded-md border border-gray-100 dark:border-gray-700">${escapeHtml(s)}</span>`
            ).join('');
            stackSection.classList.remove('hidden');
        } else {
            stackSection.classList.add('hidden');
        }

        // GitHub
        if (state.user.github) {
            githubLink.textContent = `github.com/${state.user.github}`;
            githubLink.href = `https://github.com/${encodeURIComponent(state.user.github)}`;
            githubLine.classList.remove('hidden');
        } else {
            githubLine.classList.add('hidden');
        }

        refreshIcons();
    }

    // ===== Контакты =====
    const contacts = parseArray(state.user.contacts);

    const contactsCountEl = document.getElementById('profileContactsCount');
    if (contactsCountEl) contactsCountEl.textContent = contacts.length;

    const contactsList = document.getElementById('profileContactsList');
    if (contactsList) {
        if (contacts.length === 0) {
            contactsList.innerHTML = '<span class="text-sm text-gray-500 italic">Контакты не указаны</span>';
        } else {
            contactsList.innerHTML = contacts.map(c => `
                <a href="${getContactHref(c)}" target="_blank" rel="noopener noreferrer" class="inline-flex items-center gap-1.5 px-3 py-1.5 bg-brand-50 dark:bg-brand-950/40 text-brand-700 dark:text-brand-400 rounded-lg text-sm font-normal hover:bg-brand-100 dark:hover:bg-brand-950/60 transition-colors">
                    <i data-lucide="${getContactIcon(c)}" class="w-3.5 h-3.5"></i>
                    ${escapeHtml(c)}
                </a>
            `).join('');
            refreshIcons();
        }
    }

    // ===== Загрузка стартапов =====
    try {
        const res = await fetch(`${API_URL}/api/startups?limit=100&offset=0`, {
            headers: authHeaders()
        });
        if (res.ok) {
            const data = await res.json();
            const arr = Array.isArray(data) ? data : (data.startups || []);
            const myStartups = arr.filter(s => Number(s.user_id) === Number(state.user.id));

            const profileStartupsCountEl = document.getElementById('profileStartupsCount');
            if (profileStartupsCountEl) profileStartupsCountEl.textContent = myStartups.length;

            const myStartupsCountEl = document.getElementById('myStartupsCount');
            if (myStartupsCountEl) myStartupsCountEl.textContent = myStartups.length;

            const totalVacancies = myStartups.reduce((sum, s) => sum + parseArray(s.vacancies).length, 0);
            const profileVacanciesCountEl = document.getElementById('profileVacanciesCount');
            if (profileVacanciesCountEl) profileVacanciesCountEl.textContent = totalVacancies;

            const grid = document.getElementById('myStartupsGrid');
            const empty = document.getElementById('myStartupsEmpty');

            if (grid && empty) {
                if (myStartups.length === 0) {
                    grid.innerHTML = '';
                    empty.classList.remove('hidden');
                } else {
                    empty.classList.add('hidden');
                    grid.innerHTML = myStartups.map(s => renderMyStartupCard(s)).join('');
                    refreshIcons();
                }
            }
        }
    } catch (err) {
        console.error('Ошибка загрузки стартапов в профиле:', err);
    }
}

// ============ ПУБЛИЧНЫЙ ПРОФИЛЬ УЧАСТНИКА ============
async function showUserProfile(id) {
    if (!id) return navigate('home');
    if (state.user && Number(state.user.id) === Number(id)) return navigate('profile');

    document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
    document.getElementById('userProfilePage').classList.add('active');
    state.currentPage = 'userProfile';
    window.scrollTo({ top: 0 });

    const contentEl = document.getElementById('userProfileContent');
    const startupsEl = document.getElementById('userProfileStartups');
    contentEl.innerHTML = '<div class="skeleton h-64 rounded-xl"></div>';
    startupsEl.innerHTML = '';

    try {
        const res = await fetch(`${API_URL}/api/users/${id}`, {
            headers: authHeaders()
        });
        if (!res.ok) throw new Error();
        const { user, startups } = await res.json();
        const initial = (user.name || 'U')[0].toUpperCase();
        const contacts = parseArray(user.contacts);

        // ===== Профессиональная информация =====
        const levelLabels = { 1: 'Junior', 2: 'Middle', 3: 'Senior', 4: 'Lead' };

        const levelParts = [];
        if (user.level && levelLabels[user.level]) levelParts.push(levelLabels[user.level]);
        if (user.experience) {
            const n = user.experience;
            const mod10 = n % 10, mod100 = n % 100;
            const word = (mod10 === 1 && mod100 !== 11) ? 'год'
                : (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) ? 'года'
                : 'лет';
            levelParts.push(`${n} ${word} опыта`);
        }

        const stackItems = user.stack
            ? user.stack.split(',').map(s => s.trim()).filter(Boolean)
            : [];

        const hasProf = user.role || levelParts.length || stackItems.length || user.github;

        const profHtml = hasProf ? `
        <div class="mt-8">
            <h3 class="text-[11px] font-semibold text-gray-400 uppercase tracking-widest mb-3">Профессиональная информация</h3>
            <div class="space-y-3">
                ${user.role ? `
                <p class="text-sm md:text-base text-gray-600 dark:text-gray-400 leading-relaxed">
                    <span class="text-gray-400 dark:text-gray-500">Роль:</span>
                    <span class="text-gray-900 dark:text-white font-semibold">${escapeHtml(user.role)}</span>
                </p>` : ''}

                ${levelParts.length ? `
                <p class="text-sm md:text-base text-gray-600 dark:text-gray-400 leading-relaxed">
                    <span class="text-gray-400 dark:text-gray-500">Уровень:</span>
                    <span class="text-gray-900 dark:text-white font-semibold">${escapeHtml(levelParts.join(' · '))}</span>
                </p>` : ''}

                ${stackItems.length ? `
                <div>
                    <p class="text-sm md:text-base text-gray-600 dark:text-gray-400 leading-relaxed mb-2">
                        <span class="text-gray-400 dark:text-gray-500">Стек:</span>
                    </p>
                    <div class="flex flex-wrap gap-1.5">
                        ${stackItems.map(s => `<span class="px-2.5 py-1 bg-gray-50 dark:bg-gray-800 text-gray-600 dark:text-gray-400 text-xs font-normal rounded-md border border-gray-100 dark:border-gray-700">${escapeHtml(s)}</span>`).join('')}
                    </div>
                </div>` : ''}

                ${user.github ? `
                <p class="text-sm md:text-base leading-relaxed">
                    <span class="text-gray-400 dark:text-gray-500">GitHub:</span>
                    <a href="https://github.com/${encodeURIComponent(user.github)}" target="_blank" rel="noopener noreferrer" class="text-brand-600 dark:text-brand-400 font-semibold hover:underline">github.com/${escapeHtml(user.github)}</a>
                </p>` : ''}
            </div>
        </div>` : '';

        contentEl.innerHTML = `
        <div class="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 overflow-hidden stagger-item">
            <div class="h-24 bg-gradient-to-br from-brand-400 to-brand-600"></div>
            <div class="px-6 md:px-8 pb-8">
                <div class="w-24 h-24 rounded-xl bg-gradient-to-br from-brand-400 to-brand-600 flex items-center justify-center text-white text-3xl font-bold border-4 border-white dark:border-gray-900 overflow-hidden -mt-12 mb-4">
                    ${user.avatar_url ? `<img src="${imgUrl(user.avatar_url)}" class="w-full h-full object-cover" alt="">` : initial}
                </div>
                <h1 class="text-2xl font-bold">${escapeHtml(user.name || 'Участник')}</h1>
                ${user.is_open_to_work ? `
                <div class="mt-3"><span class="inline-flex items-center gap-1.5 px-3 py-1 bg-green-50 dark:bg-green-950/40 text-green-700 dark:text-green-400 text-xs font-medium rounded-full"><i data-lucide="check-circle" class="w-3 h-3"></i>Открыт к предложениям${user.desired_role ? ` · ${escapeHtml(user.desired_role)}` : ''}</span></div>` : ''}
                <p class="text-gray-700 dark:text-gray-300 leading-relaxed mt-3 break-words">${escapeHtml(user.description || 'Описание не добавлено')}</p>
                ${profHtml}
                ${contacts.length ? `
                <div class="flex flex-wrap gap-2 mt-6">
                    ${contacts.map(c => `
                    <a href="${getContactHref(c)}" target="_blank" rel="noopener noreferrer" class="inline-flex items-center gap-1.5 px-3 py-1.5 bg-brand-50 dark:bg-brand-950/40 text-brand-700 dark:text-brand-400 rounded-lg text-sm font-normal hover:bg-brand-100 dark:hover:bg-brand-950/60 transition-colors">
                        <i data-lucide="${getContactIcon(c)}" class="w-3.5 h-3.5"></i>${escapeHtml(c)}
                    </a>`).join('')}
                </div>` : ''}
            </div>
        </div>`;

        startupsEl.innerHTML = (startups && startups.length)
            ? startups.map(s => renderStartupCard(s, true)).join('')
            : '<p class="text-sm text-gray-500 italic">У участника пока нет проектов</p>';
        refreshIcons();
    } catch (e) {
        showToast('Не удалось загрузить профиль', 'error');
        navigate('home');
    }
}

function renderMyStartupCard(startup) {
    const vacancies = parseArray(startup.vacancies);
    return `
    <div class="stagger-item bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 p-5">
        <div class="flex items-start justify-between gap-2 mb-3">
            <h3 class="font-bold break-words">${escapeHtml(startup.name)}</h3>
            ${startup.is_paid ? '<span class="text-xs px-2 py-0.5 bg-green-50 dark:bg-green-950/40 text-green-700 dark:text-green-400 rounded font-semibold flex-shrink-0 inline-flex items-center gap-1"><i data-lucide="wallet" class="w-3 h-3"></i>Оплата</span>' : ''}
        </div>
        <p class="text-sm text-gray-600 dark:text-gray-400 line-clamp-2 mb-4 break-words">${escapeHtml(startup.description || '')}</p>
        ${vacancies.length > 0 ? `
        <div class="mb-4 p-3 bg-gradient-to-br from-brand-50 to-orange-50 dark:from-brand-950/30 dark:to-orange-950/20 rounded-lg border border-brand-200 dark:border-brand-800/30">
            <div class="flex items-center gap-2 mb-2">
                <i data-lucide="users" class="w-4 h-4 text-brand-500"></i>
                <span class="text-sm font-bold text-gray-900 dark:text-white">${vacancies.length} ${vacancies.length === 1 ? 'вакансия' : vacancies.length < 5 ? 'вакансии' : 'вакансий'}</span>
            </div>
            <div class="flex flex-wrap gap-1.5">
                ${vacancies.map(v => `<span class="text-xs px-2.5 py-1 bg-white dark:bg-gray-900 text-gray-900 dark:text-white rounded-md border border-brand-200 dark:border-brand-800/30 font-normal">${escapeHtml(v)}</span>`).join('')}
            </div>
        </div>` : ''}
        <div class="flex gap-2">
            <button onclick="viewStartupInFeed(${startup.id})" class="flex-1 px-3 py-2 bg-brand-50 dark:bg-brand-950/40 text-brand-600 dark:text-brand-400 rounded-lg text-sm font-semibold hover:bg-brand-100 dark:hover:bg-brand-950/60 transition-colors flex items-center justify-center gap-1.5 btn-hover">
                <i data-lucide="arrow-right" class="w-3.5 h-3.5"></i>
                Подробнее
            </button>
            <button onclick="openEditStartup(${startup.id})" class="px-3 py-2 bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 rounded-lg text-sm font-normal hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors btn-hover" aria-label="Редактировать">
                <i data-lucide="edit-2" class="w-3.5 h-3.5"></i>
            </button>
            <button onclick="confirmDeleteStartup(${startup.id})" class="px-3 py-2 bg-red-50 dark:bg-red-950/30 text-red-600 dark:text-red-400 rounded-lg text-sm font-normal hover:bg-red-100 dark:hover:bg-red-950/50 transition-colors btn-hover" aria-label="Удалить">
                <i data-lucide="trash-2" class="w-3.5 h-3.5"></i>
            </button>
        </div>
    </div>
    `;
}

async function loadMyStartupsPage() {
    if (!state.user) return;
    try {
        const res = await fetch(`${API_URL}/api/startups?limit=100&offset=0`, {
            headers: authHeaders()
        });
        if (!res.ok) return;
        const data = await res.json();
        
        const myStartups = (data.startups || []).filter(s => Number(s.user_id) === Number(state.user.id));
        
        document.getElementById('myStartupsTotal').textContent = myStartups.length;
        const grid = document.getElementById('myStartupsPageGrid');
        const empty = document.getElementById('myStartupsPageEmpty');
        if (myStartups.length === 0) {
            grid.innerHTML = '';
            empty.classList.remove('hidden');
        } else {
            empty.classList.add('hidden');
            grid.innerHTML = myStartups.map(s => renderStartupCard(s, true)).join('');
            refreshIcons();
        }
    } catch (err) { console.error(err); }
}

// ============ EDIT STARTUP ============
function openEditStartup(id) {
    const startup = state.startups.find(s => s.id === id);
    if (!startup) return;
    state.editingStartupId = id;
    document.getElementById('editStartupId').value = id;
    document.getElementById('editStartupName').value = startup.name || '';
    document.getElementById('editStartupDescription').value = startup.description || '';
    document.getElementById('editDescCount').textContent = (startup.description || '').length;
    document.getElementById('editStartupIsPaid').checked = !!startup.is_paid;
    document.getElementById('editStartupCategory').value = startup.category || 'other';
    document.getElementById('editStartupStack').value = Array.isArray(startup.stack) ? startup.stack.join(', ') : (startup.stack || '');
    document.getElementById('editStartupTelegram').value = startup.telegram || '';
    document.getElementById('editVacancies').value = parseArray(startup.vacancies).join(', ');
    document.getElementById('editContacts').value = parseArray(startup.contacts).join(', ');
    openModal('editStartupModal');
    refreshIcons();
}

async function handleEditStartupSubmit(e) {
    e.preventDefault();
    const vacancies = document.getElementById('editVacancies').value.split(',').map(v => v.trim()).filter(Boolean);
    if(vacancies.length === 0) {
        showToast("Нельзя сохранить проект без указания хотя бы одной вакансии ", "error");
        return;
    }
    if (!validateFileSize('editStartupImage', 5)) return;
    const formData = new FormData();
    formData.append('name', document.getElementById('editStartupName').value);
    formData.append('description', document.getElementById('editStartupDescription').value);
    formData.append('is_paid', document.getElementById('editStartupIsPaid').checked);
    formData.append('category', document.getElementById('editStartupCategory').value);
    formData.append('stack', document.getElementById('editStartupStack').value);
    formData.append('telegram', cleanTelegram(document.getElementById('editStartupTelegram').value));
    formData.append('vacancies', JSON.stringify(vacancies));
    formData.append('contacts', JSON.stringify(document.getElementById('editContacts').value.split(',').map(c => c.trim()).filter(Boolean)));
    const imageFile = document.getElementById('editStartupImage')?.files[0];
    if (imageFile) formData.append('image', imageFile);

    try {
        const res = await fetch(`${API_URL}/api/startups/${state.editingStartupId}`, {
            method: 'PUT',
            headers: { 'Authorization': `Bearer ${state.token}` },
            body: formData
        });
        if (!res.ok) throw new Error('Ошибка сохранения');
        showToast('Проект обновлён', 'success');
        closeModal('editStartupModal');
        loadStartups(true);
        if (state.currentPage === 'profile') loadProfileData();
        if (state.currentPage === 'myStartups') loadMyStartupsPage();
    } catch (err) { showToast(err.message || 'Не удалось сохранить', 'error'); }
}

// ============ DELETE STARTUP ============
function confirmDeleteStartup(id) { state.deletingStartupId = id; openModal('deleteStartupModal'); }
async function handleDeleteStartup() {
    try {
        const res = await fetch(`${API_URL}/api/startups/${state.deletingStartupId}`, {
            method: 'DELETE',
            headers: { 'Authorization': `Bearer ${state.token}` }
        });
        if (!res.ok) throw new Error('Ошибка удаления');
        showToast('Проект удалён', 'success');
        closeModal('deleteStartupModal');
        state.deletingStartupId = null;
        loadStartups(true);
        if (state.currentPage === 'profile') loadProfileData();
        if (state.currentPage === 'myStartups') loadMyStartupsPage();
    } catch (err) { showToast(err.message || 'Не удалось удалить', 'error'); }
}

// ============ EDIT PROFILE ============
function openEditProfileModal() {
    if (!state.user) return;

    document.getElementById('editProfileImage').value = '';
    document.getElementById('editProfileName').value = state.user.name || '';
    document.getElementById('editProfileDescription').value = state.user.description || '';
    document.getElementById('editProfileDescCount').textContent = (state.user.description || '').length;

    document.getElementById('editProfileRole').value = state.user.role || '';
    document.getElementById('editProfileStack').value = state.user.stack || '';
    document.getElementById('editProfileExperience').value = state.user.experience ?? '';
    document.getElementById('editProfileLevel').value = state.user.level ?? '';
    document.getElementById('editProfileGithub').value = state.user.github || '';
    document.getElementById('editProfileIsOpenToWork').checked = !!state.user.is_open_to_work;
    document.getElementById('editProfileDesiredRole').value = state.user.desired_role || '';

    document.getElementById('editProfileContacts').value = parseArray(state.user.contacts).join(', ');

    openModal('editProfileModal');
    refreshIcons();
}

async function handleEditProfileSubmit(e) {
    e.preventDefault();
    if (!validateFileSize('editProfileImage', 5)) return;

    const profileContacts = document.getElementById('editProfileContacts').value.split(',').map(c => c.trim()).filter(Boolean);
    const formData = new FormData();
    formData.append('name', document.getElementById('editProfileName').value);
    formData.append('description', document.getElementById('editProfileDescription').value);
    formData.append('contacts', JSON.stringify(profileContacts));

    formData.append('role', document.getElementById('editProfileRole').value.trim());
    formData.append('stack', document.getElementById('editProfileStack').value.trim());
    formData.append('experience', document.getElementById('editProfileExperience').value);
    formData.append('level', document.getElementById('editProfileLevel').value);
    formData.append('github', document.getElementById('editProfileGithub').value.trim());
    formData.append('is_open_to_work', document.getElementById('editProfileIsOpenToWork').checked);
    formData.append('desired_role', document.getElementById('editProfileDesiredRole').value.trim());

    const avatarFile = document.getElementById('editProfileImage')?.files[0];
    if (avatarFile) formData.append('image', avatarFile);

    try {
        const res = await fetch(`${API_URL}/api/profile`, {
            method: 'PUT',
            headers: { 'Authorization': `Bearer ${state.token}` },
            body: formData
        });
        if (!res.ok) {
            const err = await res.json().catch(() => ({}));
            throw new Error(err.error?.message || 'Ошибка сохранения');
        }
        state.user = await res.json();
        state.user.contacts = profileContacts;
        updateAuthUI();
        closeModal('editProfileModal');
        showToast('Профиль обновлён', 'success');
        loadProfileData();
    } catch (err) { showToast(err.message || 'Не удалось сохранить', 'error'); }
}

// ============ TAG INPUTS ============
function initTagInputs() {
    document.getElementById('filterStackInput')?.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
            e.preventDefault();
            const val = e.target.value.trim();
            if (val && !state.filterStacks.map(x => x.toLowerCase()).includes(val.toLowerCase())) {
                state.filterStacks.push(val);
                renderFilterStackTags();
                e.target.value = '';
            }
        }
    });
}

function initCharCounters() {
    document.getElementById('createDescription')?.addEventListener('input', (e) => { document.getElementById('createDescCount').textContent = e.target.value.length; });
    document.getElementById('editStartupDescription')?.addEventListener('input', (e) => { document.getElementById('editDescCount').textContent = e.target.value.length; });
    document.getElementById('editProfileDescription')?.addEventListener('input', (e) => { document.getElementById('editProfileDescCount').textContent = e.target.value.length; });
}

// ============ MODALS (с фокус-трапом и Escape) ============
function openModal(id) {
    const modal = document.getElementById(id);
    if (!modal) return;
    modal.classList.remove('hidden');
    document.body.style.overflow = 'hidden';
    if (!modal._triggerElement) modal._triggerElement = document.activeElement;
    setTimeout(() => {
        const focusable = modal.querySelectorAll('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])');
        if (focusable.length) {
            focusable[0].focus();
            initFocusTrap(modal, focusable);
        }
    }, 50);
    modal._esc = (e) => { if (e.key === 'Escape') closeModal(id); };
    document.addEventListener('keydown', modal._esc);
}

function closeModal(id) {
    const modal = document.getElementById(id);
    if (!modal) return;
    modal.classList.add('hidden');
    document.body.style.overflow = '';
    if (modal._triggerElement && modal._triggerElement.focus) {
        modal._triggerElement.focus();
        delete modal._triggerElement;
    }
    if (modal._esc) {
        document.removeEventListener('keydown', modal._esc);
        delete modal._esc;
    }
    if (modal._trapHandler) {
        modal.removeEventListener('keydown', modal._trapHandler);
        delete modal._trapHandler;
    }
}

function initFocusTrap(modal, focusable) {
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    modal._trapHandler = (e) => {
        if (e.key !== 'Tab') return;
        if (e.shiftKey && document.activeElement === first) {
            e.preventDefault();
            last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
            e.preventDefault();
            first.focus();
        }
    };
    modal.addEventListener('keydown', modal._trapHandler);
}

function initModalKeys() {
    document.addEventListener('click', (e) => {
        if (e.target.classList.contains('modal-backdrop')) {
            const modalId = e.target.id;
            if (modalId) closeModal(modalId);
        }
    });
    document.addEventListener('click', (e) => {
    if (!e.target.closest('#themeBtn') && !e.target.closest('#themeMenu')) closeThemeMenu();
    if (!e.target.closest('#guestInfoBtn')) closeGuestInfoMenu();
    if (!e.target.closest('#profileMenu')) document.getElementById('profileDropdown').classList.add('hidden');
});
}

// ============ TOAST ============
function showToast(message, type = 'info') {
    const container = document.getElementById('toastContainer');
    const toast = document.createElement('div');
    const colors = { success: 'bg-green-500', error: 'bg-red-500', info: 'bg-brand-500' };
    const icons = { success: 'check-circle', error: 'alert-circle', info: 'info' };
    toast.className = `toast pointer-events-auto flex items-center gap-3 px-4 py-3 bg-white dark:bg-gray-900 rounded-lg shadow-lg border border-gray-200 dark:border-gray-800 min-w-[280px] max-w-md`;
    toast.innerHTML = `
        <div class="w-8 h-8 rounded-lg ${colors[type]} flex items-center justify-center flex-shrink-0">
            <i data-lucide="${icons[type]}" class="w-4 h-4 text-white"></i>
        </div>
        <p class="text-sm font-normal flex-1 break-words">${escapeHtml(message)}</p>
    `;
    container.appendChild(toast);
    refreshIcons();
    setTimeout(() => toast.remove(), 3000);
}

// ============ UTILS ============
function escapeHtml(str) {
    if (!str) return '';
    return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#039;');
}

function authHeaders() {
    return state.token ? { 'Authorization': `Bearer ${state.token}` } : {};
}

function getContactHref(c) {
    const safe = c.replace(/["'<>\\\s]/g, '');
    if (safe.startsWith('@')) return `https://t.me/${safe.slice(1)}`;
    if (safe.includes('@') && safe.includes('.')) return `mailto:${safe}`;
    if (safe.startsWith('http')) return safe;
    return `https://${safe}`;
}
function getContactIcon(c) {
    if (c.startsWith('@')) return 'send';
    if (c.includes('@')) return 'mail';
    if (c.includes('github')) return 'code';
    if (c.includes('vk')) return 'users';
    return 'link';
}

const buttonInput = document.getElementById("buttonInput");
buttonInput.addEventListener("click", () => {
    search();
});
function handleSearch() { search(); }
async function search() {
    const input = document.getElementById("searchInput");
    const query = input.value.trim();
    if (!query) { loadStartups(true); return; }
    try {
        const res = await fetch(`${API_URL}/api/search?q=${encodeURIComponent(query)}`, {
            headers: authHeaders()
        });
        if (!res.ok) throw new Error('Ошибка поиска');
        const data = await res.json();
        const list = Array.isArray(data) ? data : (data.startups || []);
        const info = document.getElementById('searchResultsInfo');
        const infoText = document.getElementById('searchResultsText');
        if (info && infoText) {
            const n = list.length;
            const mod10 = n % 10, mod100 = n % 100;
            const word = (mod10 === 1 && mod100 !== 11) ? 'проект'
                : (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) ? 'проекта'
                : 'проектов';
            const verb = (word === 'проект') ? 'Найден' : 'Найдено';
            infoText.textContent = `${verb} ${n} ${word} по запросу «${query}»`;
            info.classList.remove('hidden');
        }
        const grid = document.getElementById('projectsGrid');
        grid.innerHTML = list.map(s => renderStartupCard(s, true)).join('');
        refreshIcons();
        document.getElementById('loadMoreWrap')?.classList.add('hidden');
        document.getElementById('projectsEmpty').classList.toggle('hidden', list.length > 0);
        document.getElementById('projectsSection')?.scrollIntoView({ behavior: 'smooth' });
    } catch (error) {
        showToast('Ошибка поиска', 'error');
    }
}

// ============ OFFLINE BANNER ============
const banner = document.getElementById('offline-banner');

window.addEventListener('offline', () => {
    banner.classList.remove('hidden');
    banner.classList.add('flex');
});
window.addEventListener('online', () => {
    banner.classList.add('hidden');
    banner.classList.remove('flex');
});

if (!navigator.onLine) {
    banner.classList.remove('hidden');
    banner.classList.add('flex');
}

function toggleGuestInfoMenu() {
    const menu = document.getElementById('guestInfoMenu');
    const btn = document.querySelector('#guestInfoBtn > button');
    const isHidden = menu.classList.toggle('hidden');
    if (btn) btn.setAttribute('aria-expanded', !isHidden);
}

function closeGuestInfoMenu() {
    const menu = document.getElementById('guestInfoMenu');
    if (menu) menu.classList.add('hidden');
    const btn = document.querySelector('#guestInfoBtn > button');
    if (btn) btn.setAttribute('aria-expanded', 'false');
}