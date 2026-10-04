(() => {
  'use strict';

  const TOKEN_KEY = 'sync_engine_auth_token';
  const clock = document.getElementById('clock');
  const date = document.getElementById('date');
  const temperature = document.getElementById('temperature');
  const weatherIcon = document.getElementById('weather-icon');
  const weatherPill = document.querySelector('.weather-pill');
  const contactSelect = document.getElementById('contact-select');
  const unreadCount = document.getElementById('unread-count');
  const syncStatus = document.getElementById('sync-status');
  const syncLabel = document.getElementById('sync-label');
  const notice = document.getElementById('widget-notice');
  const incomingNotice = document.getElementById('incoming-notice');
  const incomingClipboard = document.getElementById('incoming-clipboard');
  const incomingClipboardPreview = document.getElementById('incoming-clipboard-preview');
  const openChatButton = document.getElementById('open-chat-button');
  const captureButton = document.getElementById('capture-button');
  const captureLabel = document.getElementById('capture-label');
  const copyButton = document.getElementById('copy-button');
  const copyLabel = document.getElementById('copy-label');
  const copyIncomingButton = document.getElementById('copy-incoming-button');
  const cameraInput = document.getElementById('camera-input');
  const isMobile = window.matchMedia('(pointer: coarse)').matches ||
    /Android|iPhone|iPad|iPod|IEMobile|Opera Mini/i.test(navigator.userAgent);

  let token = localStorage.getItem(TOKEN_KEY);
  let currentUser = null;
  let socket = null;
  let isAuthenticated = false;
  let contacts = [];
  let receivedClipboardText = '';
  let noticeTimer = null;
  copyButton.disabled = true;

  function updateClock() {
    const now = new Date();
    clock.textContent = new Intl.DateTimeFormat(undefined, {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false
    }).format(now);
    clock.dateTime = now.toISOString();
    date.textContent = new Intl.DateTimeFormat('es-PE', {
      weekday: 'long',
      day: 'numeric',
      month: 'long',
      year: 'numeric'
    }).format(now);
  }

  function showNotice(message, kind) {
    notice.textContent = message;
    notice.dataset.kind = kind || 'info';
  }

  function setSyncState(isOnline, label) {
    syncStatus.dataset.state = isOnline ? 'online' : 'offline';
    syncLabel.textContent = label;
  }

  function updateCaptureAvailability() {
    captureButton.disabled = !contactSelect.value || !isAuthenticated;
    copyButton.disabled = !isAuthenticated || !currentUser;
  }

  function updateUnreadCount(count) {
    const visibleCount = Math.max(0, Number(count) || 0);
    unreadCount.textContent = visibleCount > 99 ? '99+' : String(visibleCount);
    unreadCount.setAttribute('aria-label', `${visibleCount} mensajes sin leer`);
  }

  async function apiGet(path) {
    const response = await fetch(path, {
      headers: { Authorization: `Bearer ${token}` }
    });
    const data = await response.json();
    if (!response.ok || data.ok === false) {
      throw new Error(data.error || `Error HTTP ${response.status}`);
    }
    return data;
  }

  async function loadUnreadCount() {
    if (!currentUser || !contacts.length) {
      updateUnreadCount(0);
      return;
    }

    const conversations = await Promise.all(contacts.map(async (contact) => {
      const data = await apiGet(`/api/messages/${encodeURIComponent(contact.syncId)}`);
      return (data.messages || []).filter((message) =>
        message.fromId === contact.syncId &&
        message.toId === currentUser.syncId &&
        message.read !== true &&
        message.status !== 'read'
      ).length;
    }));
    updateUnreadCount(conversations.reduce((sum, count) => sum + count, 0));
  }

  async function loadContacts() {
    try {
      const data = await apiGet('/api/contacts');
      contacts = (data.contacts || []).filter((contact) => contact.syncId !== currentUser.syncId);
      contactSelect.replaceChildren();

      if (!contacts.length) {
        contactSelect.add(new Option('Agrega un contacto desde el chat', ''));
        contactSelect.disabled = true;
        updateCaptureAvailability();
        updateUnreadCount(0);
        return;
      }

      contactSelect.add(new Option('Selecciona un contacto', ''));
      contacts.forEach((contact) => {
        contactSelect.add(new Option(contact.formattedName || contact.syncId, contact.syncId));
      });
      contactSelect.disabled = false;
      updateCaptureAvailability();
      await loadUnreadCount();
    } catch (error) {
      showNotice(`No se pudieron cargar los contactos: ${error.message}`, 'error');
    }
  }

  async function initializeSession() {
    token = localStorage.getItem(TOKEN_KEY);
    if (!token) {
      showNotice('Inicia sesión en SYNC ENGINE y vuelve a cargar este widget.', 'error');
      setSyncState(false, 'Inicia sesión');
      return;
    }

    try {
      const data = await apiGet('/api/auth/me');
      currentUser = data.user;
      if (!currentUser || !currentUser.syncId) {
        throw new Error('La sesión no devolvió un usuario válido');
      }
      copyButton.disabled = false;
      copyLabel.textContent = 'Copiar ID';
      await loadContacts();
      connectSocket();
    } catch (error) {
      showNotice(`No se pudo validar la sesión: ${error.message}`, 'error');
      setSyncState(false, 'Sesión inválida');
    }
  }

  function showIncomingMessage(message) {
    incomingNotice.textContent = `${message.fromName || message.fromId}: Nuevo mensaje`;
    incomingNotice.hidden = false;
    window.clearTimeout(noticeTimer);
    noticeTimer = window.setTimeout(() => {
      incomingNotice.hidden = true;
    }, 5000);
  }

  function connectSocket() {
    if (typeof window.io !== 'function') {
      setSyncState(false, 'Socket.IO no disponible');
      showNotice('No se pudo cargar el cliente de tiempo real.', 'error');
      return;
    }

    socket = window.io(window.location.origin, {
      transports: ['websocket', 'polling'],
      reconnection: true
    });
    socket.on('connect', () => {
      isAuthenticated = false;
      updateCaptureAvailability();
      setSyncState(false, 'Autenticando…');
      socket.emit('authenticate', { token });
    });
    socket.on('authenticated', () => {
      isAuthenticated = true;
      updateCaptureAvailability();
      setSyncState(true, 'Sincronizado');
    });
    socket.on('auth-error', () => {
      isAuthenticated = false;
      updateCaptureAvailability();
      setSyncState(false, 'Sesión inválida');
      showNotice('El servidor rechazó la sesión. Vuelve a iniciar sesión.', 'error');
    });
    socket.on('disconnect', () => {
      isAuthenticated = false;
      updateCaptureAvailability();
      setSyncState(false, 'Reconectando…');
    });
    socket.on('connect_error', () => {
      isAuthenticated = false;
      updateCaptureAvailability();
      setSyncState(false, 'Sin conexión');
    });
    socket.on('receive-private-message', (message) => {
      if (!message || message.fromId === currentUser.syncId) return;
      updateUnreadCount(Number(unreadCount.textContent.replace('+', '')) + 1);
      showIncomingMessage(message);
      loadUnreadCount().catch((error) => {
        showNotice(`No se pudo actualizar el contador: ${error.message}`, 'error');
      });
    });
    socket.on('messages-read-receipt', () => {
      loadUnreadCount().catch((error) => {
        showNotice(`No se pudo actualizar el contador: ${error.message}`, 'error');
      });
    });
    socket.on('clipboard-sync', (payload) => {
      if (!payload || typeof payload.text !== 'string') return;
      receivedClipboardText = payload.text;
      incomingClipboardPreview.textContent = payload.text || 'Portapapeles vacío';
      incomingClipboard.title = `Copiado desde otra sesión (${payload.fromSyncId || 'tu cuenta'})`;
      incomingClipboard.hidden = false;
    });
  }

  async function loadWeather() {
    if (!navigator.geolocation) {
      weatherPill.title = 'Ubicación no disponible';
      return;
    }

    navigator.geolocation.getCurrentPosition(async (position) => {
      try {
        const { latitude, longitude } = position.coords;
        const params = new URLSearchParams({
          latitude: String(latitude),
          longitude: String(longitude),
          current: 'temperature_2m,weather_code',
          temperature_unit: 'celsius',
          timezone: 'auto'
        });
        const response = await fetch(`https://api.open-meteo.com/v1/forecast?${params}`);
        if (!response.ok) throw new Error(`Open-Meteo respondió HTTP ${response.status}`);
        const data = await response.json();
        const current = data.current;
        if (!current || !Number.isFinite(current.temperature_2m)) {
          throw new Error('La respuesta del clima no contiene temperatura');
        }

        temperature.textContent = `${Math.round(current.temperature_2m)}°C`;
        const weather = weatherInfo(current.weather_code);
        weatherIcon.textContent = weather.icon;
        weatherPill.title = weather.label;
        weatherPill.setAttribute('aria-label', `${temperature.textContent}, ${weather.label}`);
      } catch (error) {
        weatherPill.title = 'Clima no disponible';
        showNotice(`No se pudo consultar el clima: ${error.message}`, 'error');
      }
    }, () => {
      weatherPill.title = 'Ubicación no autorizada';
    }, { enableHighAccuracy: false, maximumAge: 600000, timeout: 10000 });
  }

  function weatherInfo(code) {
    if (code === 0) return { icon: '☀️', label: 'Despejado' };
    if ([1, 2].includes(code)) return { icon: '🌤️', label: 'Parcialmente nublado' };
    if (code === 3) return { icon: '☁️', label: 'Nublado' };
    if ([45, 48].includes(code)) return { icon: '🌫️', label: 'Neblina' };
    if ([51, 53, 55, 56, 57].includes(code)) return { icon: '🌦️', label: 'Llovizna' };
    if ([61, 63, 65, 66, 67, 80, 81, 82].includes(code)) return { icon: '🌧️', label: 'Lluvia' };
    if ([71, 73, 75, 77, 85, 86].includes(code)) return { icon: '🌨️', label: 'Nieve' };
    if ([95, 96, 99].includes(code)) return { icon: '⛈️', label: 'Tormenta' };
    return { icon: '⛅', label: 'Clima local' };
  }

  async function sendCapture(blob, filename) {
    if (!socket || !socket.connected || !isAuthenticated || !currentUser) {
      throw new Error('No hay conexión de mensajería activa');
    }
    const toSyncId = contactSelect.value;
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
      throw new Error(result.error || `No se pudo subir la captura (HTTP ${response.status})`);
    }

    const file = result.file;
    const clientMsgId = `capture_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
    await new Promise((resolve, reject) => {
      const timeout = window.setTimeout(() => {
        socket.off('message-sent', onSent);
        socket.off('error-message', onError);
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

  async function captureDesktopScreen() {
    if (!navigator.mediaDevices || !navigator.mediaDevices.getDisplayMedia) {
      throw new Error('Este navegador no permite capturar pantalla');
    }
    const stream = await navigator.mediaDevices.getDisplayMedia({
      video: { frameRate: 1 },
      audio: false
    });
    try {
      const track = stream.getVideoTracks()[0];
      const settings = track.getSettings();
      const video = document.createElement('video');
      video.srcObject = stream;
      video.muted = true;
      await video.play();
      await new Promise((resolve) => window.setTimeout(resolve, 150));

      const canvas = document.createElement('canvas');
      canvas.width = settings.width || video.videoWidth;
      canvas.height = settings.height || video.videoHeight;
      if (!canvas.width || !canvas.height) throw new Error('No se obtuvo imagen de la pantalla');
      const context = canvas.getContext('2d');
      if (!context) throw new Error('No se pudo preparar la captura de pantalla');
      context.drawImage(video, 0, 0, canvas.width, canvas.height);
      const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.9));
      if (!blob) throw new Error('No se pudo generar el archivo de captura');
      await sendCapture(blob, `captura-${Date.now()}.jpg`);
    } finally {
      stream.getTracks().forEach((track) => track.stop());
    }
  }

  openChatButton.addEventListener('click', () => {
    window.open('/', '_blank', 'noopener');
  });

  copyButton.addEventListener('click', async () => {
    if (!currentUser || !isAuthenticated) {
      showNotice('Inicia sesión para copiar tu ID.', 'error');
      return;
    }
    try {
      await navigator.clipboard.writeText(currentUser.syncId);
      if (socket && socket.connected) {
        socket.emit('clipboard-sync', { text: currentUser.syncId });
      }
      copyLabel.textContent = '¡Copiado!';
      showNotice('Tu ID SYNC se copió y sincronizó con tus otras sesiones.');
      window.setTimeout(() => { copyLabel.textContent = 'Copiar ID'; }, 1800);
    } catch (error) {
      showNotice(`No se pudo acceder al portapapeles: ${error.message}`, 'error');
    }
  });

  copyIncomingButton.addEventListener('click', async () => {
    if (!receivedClipboardText) {
      showNotice('No hay texto recibido para copiar.', 'error');
      return;
    }
    try {
      await navigator.clipboard.writeText(receivedClipboardText);
      showNotice('Texto recibido copiado al portapapeles.');
    } catch (error) {
      showNotice(`No se pudo copiar el texto recibido: ${error.message}`, 'error');
    }
  });

  contactSelect.addEventListener('change', () => {
    updateCaptureAvailability();
  });

  cameraInput.addEventListener('change', async () => {
    const photo = cameraInput.files && cameraInput.files[0];
    cameraInput.value = '';
    if (!photo) return;
    captureButton.disabled = true;
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

  captureButton.addEventListener('click', async () => {
    if (!contactSelect.value) {
      showNotice('Selecciona primero un contacto.', 'error');
      return;
    }
    if (isMobile) {
      cameraInput.click();
      return;
    }

    captureButton.disabled = true;
    showNotice('Elige una pantalla o ventana para capturar…');
    try {
      await captureDesktopScreen();
      showNotice('Captura enviada correctamente.');
    } catch (error) {
      showNotice(error.message, 'error');
    } finally {
      updateCaptureAvailability();
    }
  });

  window.addEventListener('online', () => {
    if (socket && socket.connected) setSyncState(true, 'Sincronizado');
  });
  window.addEventListener('offline', () => setSyncState(false, 'Sin conexión'));

  if (isMobile) captureLabel.textContent = 'Tomar foto';
  updateClock();
  window.setInterval(updateClock, 1000);
  loadWeather();
  initializeSession();
  window.setInterval(() => {
    if (currentUser && contacts.length) {
      loadUnreadCount().catch((error) => {
        showNotice(`No se pudo actualizar el contador: ${error.message}`, 'error');
      });
    }
  }, 30000);
})();
