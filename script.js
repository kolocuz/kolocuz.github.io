fetch('links.json')
  .then(res => {
    if (!res.ok) throw new Error('Не загрузилось');
    return res.json();
  })
  .then(links => {
    const hub = document.getElementById('hub');
    if (!links.length) {
      hub.innerHTML = '<div class="empty">Тут пока пусто</div>';
      return;
    }
    hub.innerHTML = links.map(link => `
      <a href="${link.url}" class="card" target="_blank" rel="noopener noreferrer">
        <img
          src="${link.image}"
          alt=""
          class="card-img"
          loading="lazy"
          onerror="this.remove()"
        >
        <div class="card-body">
          <div class="card-title">${link.title}</div>
          <div class="card-desc">${link.description}</div>
        </div>
      </a>
    `).join('');
  })
  .catch(() => {
    document.getElementById('hub').innerHTML =
      '<div class="empty">Что-то не загрузилось</div>';
  });