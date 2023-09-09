const id = 'koukoku-shadan-open-ad-jp-message'

async function fetchJSON(url, method, value) {
  const init = {
    cache: 'no-cache',
    credentials: 'same-origin',
    headers: {
      'Content-Type': 'application/json',
    },
    method,
    mode: 'cors',
    redirect: 'follow',
    referrerPolicy: 'no-referrer',
  };
  if (method !== 'GET')
    init.body = JSON.stringify(value);
  const response = await fetch(url, init);
  return await response.json();
}

async function fetchMessages() {
  const body = await fetchJSON('/messages', 'GET');
  const messages = document.getElementById('messages');
  while (messages.childElementCount)
    messages.firstElementChild.remove();
  for (const message of body) {
    const text = document.createTextNode(message);
    const item = document.createElement('li');
    item.appendChild(text);
    messages.prepend(item);
  }
}

async function say() {
  const msg = document.getElementById(id);
  const token = document.getElementById('token');
  const button = msg.nextElementSibling;
  button.setAttribute('disabled', 'disabled');
  await fetchJSON('/post', 'POST', { msg: msg.value, token: token.value });
  button.removeAttribute('disabled');
  msg.value = '';
  setTimeout(fetchMessages, 1000);
}

window.addEventListener('DOMContentLoaded', async () => {
  const msg = document.getElementById(id);
  const button = msg.nextElementSibling;
  button.addEventListener('click', say);
  await fetchMessages();
});
