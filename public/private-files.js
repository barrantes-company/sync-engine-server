(() => {
  'use strict';
  let preparedToken = null;
  let preparing = null;

  // Native img/audio/video/download requests cannot set a Bearer header. Bootstrap
  // the server's HttpOnly, file-path-scoped transport of the existing token instead.
  function prepare(token) {
    if (!token) return Promise.reject(new Error('Sesión requerida para leer archivos'));
    if (preparedToken === token && preparing) return preparing;
    preparedToken = token;
    preparing = fetch('/api/files/access', {
      method: 'POST', credentials: 'same-origin', cache: 'no-store',
      headers: { Authorization: 'Bearer ' + token }
    }).then(async (response) => {
      if (!response.ok) throw new Error('No se pudo habilitar el acceso a archivos privados');
      return response.json();
    }).catch((error) => {
      preparedToken = null;
      preparing = null;
      throw error;
    });
    return preparing;
  }

  function clear() {
    preparedToken = null;
    preparing = null;
    return fetch('/api/files/access/clear', { method: 'POST', credentials: 'same-origin', cache: 'no-store' });
  }

  window.SyncPrivateFiles = { prepare, clear };
})();
