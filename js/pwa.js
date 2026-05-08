(function () {
    const DISMISS_KEY = 'wny_pwa_install_dismissed_v1';
    const DISMISS_MS = 1000 * 60 * 60 * 24 * 3;
    const IOS_HELP_OPEN_KEY = 'wny_pwa_ios_help_open_v1';
    const PAGE_SCOPE = window.location.pathname.includes('/app/') || window.location.pathname.includes('/archive/')
        ? '../'
        : './';

    let deferredInstallPrompt = null;
    let bannerEl = null;

    function isStandaloneMode() {
        return window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true;
    }

    function isMobileDevice() {
        const ua = navigator.userAgent || '';
        const touchCapable = navigator.maxTouchPoints > 0 || window.matchMedia('(pointer: coarse)').matches;
        const mobileUa = /android|iphone|ipod|ipad|mobile/i.test(ua);
        const narrowViewport = window.matchMedia('(max-width: 920px)').matches;
        return touchCapable && (mobileUa || narrowViewport);
    }

    function isIosSafari() {
        const ua = navigator.userAgent || '';
        const isIos = /iphone|ipad|ipod/i.test(ua);
        const isWebkit = /webkit/i.test(ua);
        const isOtherBrowser = /crios|fxios|edgios|opios/i.test(ua);
        return isIos && isWebkit && !isOtherBrowser;
    }

    function wasDismissedRecently() {
        try {
            const raw = localStorage.getItem(DISMISS_KEY);
            if (!raw) return false;
            return Date.now() - Number(raw) < DISMISS_MS;
        } catch (_) {
            return false;
        }
    }

    function markDismissed() {
        try {
            localStorage.setItem(DISMISS_KEY, String(Date.now()));
        } catch (_) {}
    }

    function applyPwaBodyClasses() {
        const standalone = isStandaloneMode();
        document.documentElement.classList.toggle('is-pwa-standalone', standalone);
        document.body.classList.toggle('pwa-mobile-browser', isMobileDevice() && !standalone);
        document.body.classList.toggle('pwa-standalone', standalone);
    }

    function getBannerMode() {
        if (deferredInstallPrompt) return 'prompt';
        if (isIosSafari() && !isStandaloneMode()) return 'ios';
        return null;
    }

    function buildBanner(mode) {
        const wrapper = document.createElement('div');
        wrapper.id = 'pwa-install-banner';
        wrapper.className = 'pwa-install-banner hidden';

        const iosExpanded = sessionStorage.getItem(IOS_HELP_OPEN_KEY) === 'true';
        const title = mode === 'ios'
            ? 'เพิ่ม WNY App ลงหน้าจอหลัก'
            : 'ติดตั้ง WNY App บนมือถือ';
        const text = mode === 'ios'
            ? 'เมื่อเพิ่มลงหน้าจอหลักแล้ว ระบบจะเปิดแบบเต็มจอและใช้งานใกล้เคียงแอปมากขึ้น'
            : 'เปิดใช้งานระบบนี้เหมือนแอปบนมือถือได้เลย ทั้งเข้าเร็วขึ้นและลดแถบ browser ด้านบน';
        const steps = mode === 'ios'
            ? `
                <ol class="pwa-install-banner__steps${iosExpanded ? '' : ' hidden'}" id="pwa-ios-steps">
                    <li>แตะปุ่มแชร์ของ Safari</li>
                    <li>เลือก "เพิ่มไปยังหน้าจอหลัก"</li>
                    <li>กด "เพิ่ม" แล้วเปิด WNY App จากไอคอนบนมือถือ</li>
                </ol>
              `
            : '';
        const primaryLabel = mode === 'ios' ? 'ดูวิธีติดตั้ง' : 'ติดตั้งแบบแอป';

        wrapper.innerHTML = `
            <button type="button" class="pwa-install-banner__dismiss" aria-label="ปิด">×</button>
            <div class="pwa-install-banner__body">
                <div class="pwa-install-banner__eyebrow">📱 ใช้บนมือถือได้เหมือนแอป</div>
                <div class="pwa-install-banner__title">${title}</div>
                <div class="pwa-install-banner__text">${text}</div>
                ${steps}
                <div class="pwa-install-banner__actions">
                    <button type="button" class="pwa-install-banner__button pwa-install-banner__button--primary" data-pwa-action="primary">${primaryLabel}</button>
                    <button type="button" class="pwa-install-banner__button pwa-install-banner__button--secondary" data-pwa-action="secondary">ใช้ผ่านเว็บต่อ</button>
                </div>
            </div>
            <div class="pwa-install-banner__status">PWA จะเปิดโหมดเหมือนแอปเมื่อใช้งานผ่านมือถือเท่านั้น</div>
        `;
        return wrapper;
    }

    function ensureBanner(mode) {
        if (bannerEl) return bannerEl;
        bannerEl = buildBanner(mode);
        document.body.appendChild(bannerEl);

        bannerEl.querySelector('.pwa-install-banner__dismiss')?.addEventListener('click', () => {
            markDismissed();
            hideBanner();
        });
        bannerEl.querySelector('[data-pwa-action="secondary"]')?.addEventListener('click', () => {
            markDismissed();
            hideBanner();
        });
        bannerEl.querySelector('[data-pwa-action="primary"]')?.addEventListener('click', async () => {
            if (mode === 'ios') {
                const stepsEl = bannerEl.querySelector('#pwa-ios-steps');
                if (stepsEl) {
                    const hidden = stepsEl.classList.toggle('hidden');
                    try {
                        sessionStorage.setItem(IOS_HELP_OPEN_KEY, hidden ? 'false' : 'true');
                    } catch (_) {}
                }
                return;
            }
            if (!deferredInstallPrompt) return;
            deferredInstallPrompt.prompt();
            const result = await deferredInstallPrompt.userChoice.catch(() => null);
            if (result && result.outcome !== 'accepted') {
                return;
            }
            deferredInstallPrompt = null;
            markDismissed();
            hideBanner();
        });

        return bannerEl;
    }

    function showBanner() {
        const mode = getBannerMode();
        if (!mode || !isMobileDevice() || isStandaloneMode() || wasDismissedRecently()) return;
        ensureBanner(mode).classList.remove('hidden');
    }

    function hideBanner() {
        if (!bannerEl) return;
        bannerEl.classList.add('hidden');
    }

    async function registerServiceWorker() {
        if (!('serviceWorker' in navigator) || !isMobileDevice()) return;
        const isAllowedContext = window.location.protocol === 'https:' || /^(localhost|127\.0\.0\.1)$/.test(window.location.hostname);
        if (!isAllowedContext) return;

        try {
            const registration = await navigator.serviceWorker.register(PAGE_SCOPE + 'sw.js', { scope: PAGE_SCOPE });
            if (registration && typeof registration.update === 'function') {
                void registration.update();
            }
        } catch (error) {
            console.warn('PWA service worker registration failed:', error);
        }
    }

    function init() {
        applyPwaBodyClasses();
        registerServiceWorker();
        showBanner();
    }

    window.addEventListener('beforeinstallprompt', (event) => {
        if (!isMobileDevice()) return;
        event.preventDefault();
        deferredInstallPrompt = event;
        showBanner();
    });

    window.addEventListener('appinstalled', () => {
        deferredInstallPrompt = null;
        hideBanner();
        markDismissed();
    });

    window.addEventListener('resize', applyPwaBodyClasses);

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init, { once: true });
    } else {
        init();
    }
})();
