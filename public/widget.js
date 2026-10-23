(() => {
  'use strict';

  const TOKEN_KEY = 'sync_engine_auth_token';
  const MAX_ANNOUNCEMENTS = 5;

  // Referencias DOM
  const clock = document.getElementById('clock');
  const date = document.getElementById('date');
  const temperature = document.getElementById('temperature');
  const weatherIcon = document.getElementById('weather-icon');
  const weatherPill = document.getElementById('weather-pill');
  const syncStatus = document.getElementById('sync-status');
  const syncLabel = document.getElementById('sync-label');
  const unreadCount = document.getElementById('unread-count');
  const messagesWord = document.getElementById('messages-word');
  const messagesCounter = document.getElementById('messages-counter');
  const callsCount = document.getElementById('calls-count');
  const callsWord = document.getElementById('calls-word');
  const callsButton = document.getElementById('calls-counter');
  const trails = document.getElementById('trails');
  const settingsButton = document.getElementById('settings-button');
  const settingsPanel = document.getElementById('settings-panel');
  const toggleNotifications = document.getElementById('toggle-notifications');
  const toggleFlash = document.getElementById('toggle-flash');
  const announcementsList = document.getElementById('announcements-list');
  const quickReplyForm = document.getElementById('quick-reply-form');
  const quickReplyInput = document.getElementById('quick-reply-input');
  const openChatButton = document.getElementById('open-chat-button');
  const authOverlay = document.getElementById('auth-overlay');
  const widgetLoginBtn = document.getElementById('widget-login-btn');
  const notice = document.getElementById('widget-notice');
  const incomingNotice = document.getElementById('incoming-notice');

  // Elementos de compatibilidad (TEST 13 y utilidades)
  const contactSelect = document.getElementById('contact-select');
  const captureButton = document.getElementById('capture-button');
  const captureLabel = document.getElementById('capture-label');
  const copyButton = document.getElementById('copy-button');
  const copyLabel = document.getElementById('copy-label');
  const copyIncomingButton = document.getElementById('copy-incoming-button');
  const incomingClipboard = document.getElementById('incoming-clipboard');
  const incomingClipboardPreview = document.getElementById('incoming-clipboard-preview');
  const cameraInput = document.getElementById('camera-input');
  const modeSelector = document.getElementById('mode-selector');
  const widgetContainer = document.getElementById('widget-container');

  // Estado del Widget
  let token = localStorage.getItem(TOKEN_KEY);
  let currentUser = null;
  let socket = null;
  let isAuthenticated = false;
  let announcements = [];
  let unreadCounter = 0;
  let callsCounter = 0;
  let notificationsEnabled = localStorage.getItem('sync_widget_notifications') !== 'off';
  let flashEnabled = localStorage.getItem('sync_widget_flash') !== 'off';
  let contacts = [];
  let receivedClipboardText = '';
  let noticeTimer = null;
  let clockInterval = null;
  let unreadPollInterval = null;
  let callCounter = 0;

  const MODE_KEY = 'sync_engine_widget_mode';
  const VALID_MODES = new Set(['mode-1', 'mode-2', 'mode-3', 'mode-4', 'mode-5', 'mode-6', 'mode-7', 'mode-8', 'mode-9', 'mode-10']);

  function setModeBinding(name, value) {
    document.querySelectorAll(`[data-bind="${name}"]`).forEach((element) => {
      element.textContent = String(value);
    });
  }

  function applyWidgetMode(mode) {
    const nextMode = VALID_MODES.has(mode) ? mode : 'mode-1';
    if (widgetContainer) widgetContainer.dataset.widgetMode = nextMode;
    localStorage.setItem(MODE_KEY, nextMode);
    if (modeSelector) modeSelector.value = nextMode;
  }

  // 1. Reloj y fecha (hora de Lima, igual que el widget nativo)
  const TIME_ZONE = 'America/Lima';
  function updateClock() {
    if (!clock || !date) return;
    const now = new Date();
    clock.textContent = new Intl.DateTimeFormat('es-PE', {
      timeZone: TIME_ZONE, hour: '2-digit', minute: '2-digit', hourCycle: 'h23'
    }).format(now);
    date.textContent = new Intl.DateTimeFormat('es-PE', {
      timeZone: TIME_ZONE, weekday: 'long', day: 'numeric', month: 'short'
    }).format(now).replace(/\./g, '').replace(',', '');
  }

  // Estelas de luz animadas; se detienen con prefers-reduced-motion
  const TRAIL_COLORS = ['#3ecfff', '#e7f8ff', '#79b7ff', '#ffffff', '#ff4fd8', '#ff9ad4', '#ff3d78', '#ff3b42', '#ffc4a0'];
  const TRAIL_COUNT = 16;
  const SVG_NS = 'http://www.w3.org/2000/svg';
  const trailPaths = [];
  const reduceMotion = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  function trailPath(y, index, tick) {
    const t = tick / 24;
    const sway = Math.sin(t + index * 0.45) * 22;
    const curl = 78 + Math.cos(t * 0.7 + index * 0.2) * 6;
    const y3 = y - curl;
    return `M-30 ${y + sway} C 180 ${y + sway * 0.35}, 460 ${y - curl * 0.28 + sway}, 680 ${y3} S 900 ${y3 - 12}, 1040 ${y3 + 6}`;
  }

  function drawTrails(tick) {
    trailPaths.forEach((path, index) => path.setAttribute('d', trailPath(120 + index * 13, index, tick)));
  }

  function initTrails() {
    const group = document.getElementById('trail-group');
    if (!group) return;
    for (let i = 0; i < TRAIL_COUNT; i += 1) {
      const path = document.createElementNS(SVG_NS, 'path');
      path.setAttribute('stroke', TRAIL_COLORS[i % TRAIL_COLORS.length]);
      path.setAttribute('stroke-width', i % 3 === 0 ? '4.5' : '2.5');
      path.setAttribute('opacity', i % 4 === 0 ? '0.82' : '0.55');
      path.setAttribute('vector-effect', 'non-scaling-stroke');
      group.appendChild(path);
      trailPaths.push(path);
    }
    drawTrails(0);
    if (reduceMotion) return;
    let last = 0;
    let tick = 0;
    const frame = (time) => {
      if (time - last >= 80) {
        last = time;
        tick += 1;
        if (!document.hidden) drawTrails(tick);
      }
      window.requestAnimationFrame(frame);
    };
    window.requestAnimationFrame(frame);
  }

  function flashTrails() {
    if (!flashEnabled || !trails) return;
    trails.classList.add('flash');
    window.setTimeout(() => trails.classList.remove('flash'), 700);
  }

  function renderCounters() {
    if (unreadCount) unreadCount.textContent = unreadCounter > 99 ? '99+' : String(unreadCounter);
    if (messagesWord) messagesWord.textContent = unreadCounter === 1 ? 'mensaje' : 'mensajes';
    if (callsCount) callsCount.textContent = String(callsCounter);
    if (callsWord) callsWord.textContent = callsCounter === 1 ? 'llamada' : 'llamadas';
    if (messagesCounter) messagesCounter.setAttribute('aria-label', `${unreadCounter} mensajes sin leer`);
    if (callsButton) callsButton.setAttribute('aria-label', `${callsCounter} llamadas`);
  }

  // 2. Avisos y Estado
  function showNotice(message, kind) {
    if (!notice) return;
    notice.textContent = message;
    notice.dataset.kind = kind || 'info';
  }

  function setSyncState(isOnline, label) {
    if (!syncStatus || !syncLabel) return;
    syncStatus.dataset.state = isOnline ? 'online' : 'offline';
    syncLabel.textContent = label;
  }

  function updateUnreadBadge(count) {
    const previous = unreadCounter;
    unreadCounter = Math.max(0, Number(count) || 0);
    renderCounters();
    if (unreadCounter > previous) {
      flashTrails();
      if (messagesCounter) {
        messagesCounter.classList.remove('pop');
        void messagesCounter.offsetWidth;
        messagesCounter.classList.add('pop');
      }
    }

    // Sincronizar badge con la extensión de navegador si está disponible
    if (typeof chrome !== 'undefined' && chrome.runtime && typeof chrome.runtime.sendMessage === 'function') {
      try {
        chrome.runtime.sendMessage({ type: 'UPDATE_UNREAD', count: unreadCounter });
      } catch (_) {}
    }
  }

  function showIncomingNotice(message) {
    if (!incomingNotice) return;
    incomingNotice.textContent = message;
    incomingNotice.hidden = false;
    window.clearTimeout(noticeTimer);
    noticeTimer = window.setTimeout(() => {
      incomingNotice.hidden = true;
    }, 4500);
  }

  // 3. API Helpers
  async function apiGet(path) {
    const res = await fetch(path, {
      headers: { Authorization: `Bearer ${token}` }
    });
    const data = await res.json();
    if (!res.ok || data.ok === false) {
      throw new Error(data.error || `Error HTTP ${res.status}`);
    }
    return data;
  }

  // 4. Renderizado del Feed de Anuncios (Píldoras)
  function escapeHtml(str) {
    return String(str || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function renderAnnouncements() {
    if (!announcementsList) return;
    announcementsList.innerHTML = '';

    if (!announcements.length) {
      const empty = document.createElement('div');
      empty.className = 'empty-announcements';
      empty.innerHTML = '<span>Sin anuncios recientes en #anuncios</span>';
      announcementsList.appendChild(empty);
      return;
    }

    announcements.forEach((msg) => {
      const pill = document.createElement('article');
      pill.className = 'announcement-pill';

      const sender = escapeHtml(msg.senderName || msg.fromName || msg.senderSyncId || msg.fromId || 'Equipo');
      const timeStr = msg.createdAt || msg.timestamp 
        ? new Date(msg.createdAt || msg.timestamp).toLocaleTimeString('es-PE', { hour: '2-digit', minute: '2-digit' })
        : 'Ahora';
      const text = escapeHtml(msg.text || (msg.fileData ? `📎 ${msg.fileData.name || 'Archivo'}` : 'Mensaje'));

      pill.innerHTML = `
        <div class="pill-meta">
          <span class="pill-sender font-bold">${sender}</span>
          <span class="pill-time">${timeStr}</span>
        </div>
        <p class="pill-text">${text}</p>
      `;

      pill.addEventListener('click', () => {
        window.open('/?view=anuncios', '_blank', 'noopener');
      });

      announcementsList.appendChild(pill);
    });
  }

  function addAnnouncement(msg) {
    if (!msg) return;
    // Evitar duplicados por ID
    if (msg.id && announcements.some(a => a.id === msg.id)) return;

    announcements.unshift(msg);
    if (announcements.length > MAX_ANNOUNCEMENTS) {
      announcements = announcements.slice(0, MAX_ANNOUNCEMENTS);
    }
    renderAnnouncements();
  }

  async function loadAnnouncements() {
    try {
      // Intentar cargar mensajes de chan-anuncios
      const res = await fetch('/api/channels/chan-anuncios/messages', {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (res.ok) {
        const data = await res.json();
        if (data && Array.isArray(data.messages)) {
          announcements = data.messages.slice(-MAX_ANNOUNCEMENTS).reverse();
          renderAnnouncements();
        }
      }
    } catch (_) {}
  }

  // 5. Notificaciones Nativas Duales (Chrome Extension & Web/PWA)
  function initNativeNotifications() {
    if ('Notification' in window && Notification.permission === 'default') {
      Notification.requestPermission().catch(() => {});
    }
  }

  function dispatchNativeNotification(title, message) {
    if (!notificationsEnabled) return;
    if (!document.hidden) return; // Solo si el widget o pestaña no tiene el foco

    // Despacho vía Chrome Extension API si está corriendo como extensión
    if (typeof chrome !== 'undefined' && chrome.notifications && typeof chrome.notifications.create === 'function') {
      try {
        chrome.notifications.create({
          type: 'basic',
          iconUrl: '/assets/logo.png',
          title: title || 'SYNC ENGINE | #anuncios',
          message: message || 'Nuevo anuncio recibido',
          priority: 2
        });
        return;
      } catch (_) {}
    }

    // Despacho vía Web Notifications API estándar
    if ('Notification' in window && Notification.permission === 'granted') {
      try {
        const notif = new Notification(title || 'SYNC ENGINE | #anuncios', {
          body: message || 'Nuevo anuncio recibido',
          icon: '/assets/logo.png',
          badge: '/assets/logo.png'
        });
        notif.onclick = () => {
          window.focus();
          window.open('/?view=anuncios', '_blank', 'noopener');
        };
      } catch (_) {}
    }
  }

  // 6. Conexión Socket.IO y Gestión de Eventos
  function connectSocket() {
    if (typeof window.io !== 'function') {
      setSyncState(false, 'Socket.IO no disponible');
      return;
    }

    if (socket) {
      socket.disconnect();
      socket = null;
    }

    socket = window.io(window.location.origin, {
      transports: ['websocket', 'polling'],
      reconnection: true,
      reconnectionDelay: 1000,
      reconnectionAttempts: 10
    });

    socket.on('connect', () => {
      isAuthenticated = false;
      setSyncState(false, 'Autenticando…');
      socket.emit('authenticate', { token });
    });

    socket.on('authenticated', () => {
      isAuthenticated = true;
      setSyncState(true, 'Sincronizado');
      showNotice('');

      // Unirse al canal principal #anuncios
      socket.emit('join-channel', { channelId: '#anuncios' });

      loadAnnouncements();
      loadContacts();
      updateCaptureAvailability();
    });

    socket.on('auth-error', () => {
      isAuthenticated = false;
      setSyncState(false, 'Sesión inválida');
      showAuthOverlay(true);
    });

    socket.on('disconnect', () => {
      isAuthenticated = false;
      setSyncState(false, 'Reconectando…');
    });

    socket.on('connect_error', () => {
      isAuthenticated = false;
      setSyncState(false, 'Sin conexión');
    });

    // Escucha de mensajes en tiempo real para el canal (#anuncios)
    const onChannelMessage = (msg) => {
      if (!msg) return;
      addAnnouncement(msg);
      updateUnreadBadge(unreadCounter + 1);

      const sender = msg.senderName || msg.fromName || msg.senderSyncId || 'Equipo';
      const text = msg.text || (msg.fileData ? `📎 ${msg.fileData.name || 'Archivo'}` : 'Nuevo anuncio');
      showIncomingNotice(`📢 ${sender}: ${text}`);
      dispatchNativeNotification(`📢 ${sender} en #anuncios`, text);
    };

    socket.on('channel-message-received', onChannelMessage);
    socket.on('channel-message', onChannelMessage);

    // Soporte para eventos de mensajes privados y espejo de notificaciones
    socket.on('receive-private-message', (msg) => {
      if (!msg || msg.fromId === (currentUser && currentUser.syncId)) return;
      updateUnreadBadge(unreadCounter + 1);
      const sender = msg.fromName || msg.fromId;
      const text = msg.type === 'file' ? '📎 Archivo enviado' : msg.text;
      showIncomingNotice(`💬 ${sender}: ${text}`);
      dispatchNativeNotification(`💬 ${sender}`, text);
    });

    socket.on('call-made', (data) => {
      callsCounter += 1;
      renderCounters();
      flashTrails();
      const caller = (data && (data.fromName || data.callerName || data.fromId)) || 'Alguien';
      showIncomingNotice(`Llamada de ${caller}`);
      dispatchNativeNotification(`Llamada de ${caller}`, 'Llamada entrante');
    });

    socket.on('clipboard-sync', (payload) => {
      if (!payload || typeof payload.text !== 'string') return;
      receivedClipboardText = payload.text;
      if (incomingClipboardPreview) incomingClipboardPreview.textContent = payload.text;
      if (incomingClipboard) incomingClipboard.hidden = false;
      showIncomingNotice('📋 Portapapeles sincronizado');
    });
  }

  // 7. Autenticación Inteligente y Popups
  function showAuthOverlay(visible) {
    if (!authOverlay) return;
    if (visible) {
      authOverlay.classList.remove('hidden');
    } else {
      authOverlay.classList.add('hidden');
    }
  }

  async function initializeSession() {
    token = localStorage.getItem(TOKEN_KEY);
    if (!token) {
      showAuthOverlay(true);
      setSyncState(false, 'Inicia sesión');
      return;
    }

    try {
      const data = await apiGet('/api/auth/me');
      currentUser = data.user;
      if (!currentUser || !currentUser.syncId) {
        throw new Error('Sesión no válida');
      }
      showAuthOverlay(false);
      connectSocket();
    } catch (_) {
      showAuthOverlay(true);
      setSyncState(false, 'Sesión expirada');
    }
  }

  if (widgetLoginBtn) {
    widgetLoginBtn.addEventListener('click', () => {
      const loginUrl = window.location.origin + '/?popup=widget';
      const popup = window.open(loginUrl, 'sync_engine_login', 'width=460,height=640,resizable=yes');
      if (popup) popup.focus();
    });
  }

  // Captura de token vía window.postMessage o evento storage
  window.addEventListener('message', (event) => {
    if (event.data && typeof event.data === 'object') {
      const receivedToken = event.data.token || (event.data.payload && event.data.payload.token);
      if (receivedToken) {
        localStorage.setItem(TOKEN_KEY, receivedToken);
        token = receivedToken;
        initializeSession();
      }
    }
  });

  window.addEventListener('storage', (event) => {
    if (event.key === TOKEN_KEY && event.newValue) {
      token = event.newValue;
      initializeSession();
    }
  });

  // 8. Envío Rápido al Canal #anuncios
  if (quickReplyForm && quickReplyInput) {
    quickReplyForm.addEventListener('submit', (e) => {
      e.preventDefault();
      const text = quickReplyInput.value.trim();
      if (!text) return;
      if (!socket || !isAuthenticated) {
        showNotice('Conexión no lista para enviar.', 'error');
        return;
      }

      socket.emit('send-channel-message', {
        channelId: '#anuncios',
        text: text,
        type: 'text'
      });

      quickReplyInput.value = '';
      quickReplyInput.blur();
    });
  }

  // 9. Abrir la app principal y ajustes
  function openApp(view) {
    window.open(view ? `/?view=${view}` : '/', '_blank', 'noopener');
  }

  if (openChatButton) {
    openChatButton.addEventListener('click', () => {
      callsCounter = 0;
      updateUnreadBadge(0);
      openApp('');
    });
  }

  if (messagesCounter) messagesCounter.addEventListener('click', () => openApp('anuncios'));
  if (callsButton) {
    callsButton.addEventListener('click', () => {
      callsCounter = 0;
      renderCounters();
    });
  }

  function bindSwitch(button, enabled, storageKey, onChange) {
    if (!button) return;
    button.setAttribute('aria-checked', String(enabled()));
    button.addEventListener('click', () => {
      const next = !enabled();
      onChange(next);
      localStorage.setItem(storageKey, next ? 'on' : 'off');
      button.setAttribute('aria-checked', String(next));
    });
  }

  bindSwitch(toggleNotifications, () => notificationsEnabled, 'sync_widget_notifications', (value) => {
    notificationsEnabled = value;
    if (value && 'Notification' in window && Notification.permission === 'default') {
      Notification.requestPermission().catch(() => {});
    }
  });
  bindSwitch(toggleFlash, () => flashEnabled, 'sync_widget_flash', (value) => { flashEnabled = value; });

  if (settingsButton && settingsPanel) {
    settingsButton.addEventListener('click', () => {
      const open = settingsPanel.hidden;
      settingsPanel.hidden = !open;
      settingsButton.setAttribute('aria-pressed', String(open));
    });
  }

  // 10. Compatibilidad con Funciones Existentes (TEST 13 y Media)
  function updateCaptureAvailability() {
    if (captureButton && contactSelect) {
      captureButton.disabled = !contactSelect.value || !isAuthenticated;
    }
    if (copyButton) {
      copyButton.disabled = !isAuthenticated || !currentUser;
    }
  }

  async function loadContacts() {
    if (!contactSelect) return;
    try {
      const data = await apiGet('/api/contacts');
      contacts = (data.contacts || []).filter((c) => !currentUser || c.syncId !== currentUser.syncId);
      contactSelect.replaceChildren();

      if (!contacts.length) {
        contactSelect.add(new Option('Sin contactos', ''));
        contactSelect.disabled = true;
        updateCaptureAvailability();
        return;
      }

      contactSelect.add(new Option('Selecciona un contacto', ''));
      contacts.forEach((contact) => {
        contactSelect.add(new Option(contact.formattedName || contact.syncId, contact.syncId));
      });
      contactSelect.disabled = false;
      updateCaptureAvailability();
    } catch (_) {}
  }

  async function sendCapture(blob, filename) {
    if (!socket || !socket.connected || !isAuthenticated || !currentUser) {
      throw new Error('No hay conexión de mensajería activa');
    }
    const toSyncId = contactSelect ? contactSelect.value : '';
    if (!toSyncId) throw new Error('Selecciona primero un contacto');

    const formData = new FormData();
    formData.append('file', blob, filename);
    const response = await fetch('/api/upload', {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
      body: formData
    });
    const result = await response.json();
    if (!response.ok || !result.ok || !result.file) {
      throw new Error(result.error || `No se pudo subir la captura`);
    }

    const file = result.file;
    const clientMsgId = `capture_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
    await new Promise((resolve, reject) => {
      const timeout = window.setTimeout(() => {
        cleanup();
        reject(new Error('Tiempo de espera agotado al confirmar el envío'));
      }, 15000);
      const cleanup = () => {
        window.clearTimeout(timeout);
        socket.off('message-sent', onSent);
        socket.off('error-message', onError);
      };
      const onSent = (data) => {
        if (data && data.id === clientMsgId) {
          cleanup();
          resolve();
        }
      };
      const onError = (data) => {
        cleanup();
        reject(new Error(data && data.message ? data.message : 'No se pudo enviar la captura'));
      };

      socket.on('message-sent', onSent);
      socket.on('error-message', onError);
      socket.emit('send-private-message', {
        clientMsgId,
        toSyncId,
        type: 'file',
        fileData: {
          name: file.name || filename,
          size: file.size || blob.size,
          type: file.type || blob.type,
          url: file.url,
          data: file.url,
          isHd: false
        }
      });
    });
  }

  if (contactSelect) {
    contactSelect.addEventListener('change', updateCaptureAvailability);
  }

  if (cameraInput) {
    cameraInput.addEventListener('change', async () => {
      const photo = cameraInput.files && cameraInput.files[0];
      cameraInput.value = '';
      if (!photo) return;
      if (captureButton) captureButton.disabled = true;
      showNotice('Enviando foto…');
      try {
        await sendCapture(photo, photo.name || `foto-${Date.now()}.jpg`);
        showNotice('Foto enviada correctamente.');
      } catch (error) {
        showNotice(error.message, 'error');
      } finally {
        updateCaptureAvailability();
      }
    });
  }

  if (copyButton) {
    copyButton.addEventListener('click', async () => {
      if (!currentUser || !isAuthenticated) return;
      try {
        await navigator.clipboard.writeText(currentUser.syncId);
        if (socket && socket.connected) {
          socket.emit('clipboard-sync', { text: currentUser.syncId });
        }
        if (copyLabel) copyLabel.textContent = '¡Copiado!';
        showNotice('ID copiado al portapapeles.');
        window.setTimeout(() => { if (copyLabel) copyLabel.textContent = 'Copiar ID'; }, 1800);
      } catch (_) {}
    });
  }

  if (copyIncomingButton) {
    copyIncomingButton.addEventListener('click', async () => {
      if (!receivedClipboardText) return;
      try {
        await navigator.clipboard.writeText(receivedClipboardText);
        showNotice('Texto recibido copiado.');
      } catch (_) {}
    });
  }

  // 11. Clima Glanceable
  async function loadWeather() {
    if (!navigator.geolocation || !weatherPill || !temperature) return;
    navigator.geolocation.getCurrentPosition(async (pos) => {
      try {
        const { latitude, longitude } = pos.coords;
        const res = await fetch(`https://api.open-meteo.com/v1/forecast?latitude=${latitude}&longitude=${longitude}&current=temperature_2m,weather_code&temperature_unit=celsius&timezone=auto`);
        if (!res.ok) return;
        const data = await res.json();
        if (data && data.current && Number.isFinite(data.current.temperature_2m)) {
          temperature.textContent = `${Math.round(data.current.temperature_2m)}°`;
        }
      } catch (_) {}
    }, () => {}, { timeout: 8000, maximumAge: 600000 });
  }

  // Limpieza en desmontaje para evitar fugas de memoria
  window.addEventListener('beforeunload', () => {
    if (clockInterval) clearInterval(clockInterval);
    if (unreadPollInterval) clearInterval(unreadPollInterval);
    if (socket) {
      socket.disconnect();
      socket = null;
    }
  });

  // 12. Arranque
  updateClock();
  clockInterval = setInterval(updateClock, 1000);
  initTrails();
  renderCounters();
  initNativeNotifications();
<<<<<<< HEAD
  loadWeather();
  if (modeSelector) modeSelector.addEventListener('change', () => applyWidgetMode(modeSelector.value));
  applyWidgetMode(localStorage.getItem(MODE_KEY) || 'mode-1');
=======
>>>>>>> origin/main
  initializeSession();
})();
