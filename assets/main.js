class Client {
  constructor(messages) {
    this.messages = messages
  }

  prepend(data) {
    let li = document.getElementById(data.id);
    if (li)
      li.textContent = data.message.log;
    else {
      const loading = document.querySelectorAll('ul#messages>li.now-loading');
      li = document.createElement('li', { id: data.id });
      const text = document.createTextNode(data.message.log);
      li.appendChild(text);
      this.messages.prepend(li);
      for (let i = 0; i < loading.length; i++)
        this.messages.removeChild(loading[i]);
    }
  }

  connect() {
    this.webSocket = new WebSocket('wss://' + document.location.hostname);
    this.webSocket.addEventListener('close', this.connect.bind(this));
    this.webSocket.addEventListener('error', console.error);
    this.webSocket.addEventListener('open', console.log);
    this.webSocket.addEventListener('message', async msg => {
      const data = JSON.parse(await msg.data.text());
      data instanceof Array ? data.reverse().forEach(this.prepend.bind(this)) : this.prepend(data)
    });
  }
}

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

const id = 'koukoku-shadan-open-ad-jp-message'

async function say() {
  const msg = document.getElementById(id);
  const token = document.getElementById('token');
  const button = msg.nextElementSibling;
  button.setAttribute('disabled', 'disabled');
  await fetchJSON('/post', 'POST', { msg: msg.value, token: token.value });
  button.removeAttribute('disabled');
  msg.value = '';
}

window.addEventListener('DOMContentLoaded', async () => {
  const msg = document.getElementById(id);
  const button = msg.nextElementSibling;
  button.addEventListener('click', say);
  const client = new Client(document.getElementById('messages'));
  client.connect();
});
