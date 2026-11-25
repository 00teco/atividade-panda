(function () {
  // ===== Configurações =====
  var NEED = 5;    // acertos para subir de nível
  var MAXLV = 5;   // número de níveis
  var LIVES = 3;   // vidas

  var $ = function (id) { return document.getElementById(id); };
  var S = {};      // estado do jogo

  function rnd(a, b) { return Math.floor(Math.random() * (b - a + 1)) + a; }
  function pick(arr) { return arr[rnd(0, arr.length - 1)]; }

  // ===== 1. Geração de perguntas (dificuldade por nível) =====
  function gen(op, lv) {
    var a, b, ans, txt;
    var R = { 1: [1, 9], 2: [5, 20], 3: [10, 50], 4: [20, 99], 5: [50, 200] }[lv];

    if (op === '+') {
      a = rnd(R[0], R[1]); b = rnd(R[0], R[1]);
      ans = a + b; txt = a + ' + ' + b;
    } else if (op === '-') {
      a = rnd(R[0], R[1]); b = rnd(R[0], R[1]);
      if (b > a) { var t = a; a = b; b = t; } // nunca resultado negativo
      ans = a - b; txt = a + ' − ' + b;
    } else if (op === '*') {
      var M = { 1: [2, 5, 1, 5], 2: [2, 9, 2, 9], 3: [2, 12, 2, 12], 4: [6, 15, 3, 12], 5: [11, 25, 3, 12] }[lv];
      a = rnd(M[0], M[1]); b = rnd(M[2], M[3]);
      ans = a * b; txt = a + ' × ' + b;
    } else {
      // divisão: parte do resultado para garantir que seja exata
      var D = { 1: [2, 5, 1, 5], 2: [2, 9, 2, 9], 3: [2, 12, 2, 12], 4: [3, 15, 3, 12], 5: [6, 25, 5, 15] }[lv];
      b = rnd(D[0], D[1]);
      var q = rnd(D[2], D[3]);
      a = b * q; ans = q; txt = a + ' ÷ ' + b;
    }

    // alternativas erradas plausíveis (perto da resposta certa)
    var set = {}; set[ans] = 1;
    var opts = [ans], tries = 0;
    var span = Math.max(3, Math.round(ans * 0.2));
    while (opts.length < 4 && tries < 100) {
      tries++;
      var w = ans + pick([-1, 1]) * rnd(1, span);
      if (w >= 0 && !set[w]) { set[w] = 1; opts.push(w); }
    }
    while (opts.length < 4) {
      var z = ans + opts.length + tries++;
      if (!set[z]) { set[z] = 1; opts.push(z); }
    }
    opts.sort(function () { return Math.random() - 0.5; }); // embaralha
    return { txt: txt, ans: ans, opts: opts };
  }

  // ===== 2. Sons (WebAudio, opcional) =====
  var ac = null;
  function beep(freq, dur, type) {
    try {
      ac = ac || new (window.AudioContext || window.webkitAudioContext)();
      var o = ac.createOscillator(), g = ac.createGain();
      o.type = type || 'sine'; o.frequency.value = freq; g.gain.value = 0.08;
      o.connect(g); g.connect(ac.destination); o.start();
      g.gain.exponentialRampToValueAtTime(0.001, ac.currentTime + dur);
      o.stop(ac.currentTime + dur);
    } catch (e) { /* sem áudio: segue o jogo */ }
  }
  function sndOk() { beep(660, 0.15); setTimeout(function () { beep(880, 0.2); }, 120); }
  function sndNo() { beep(200, 0.35, 'sawtooth'); }

  // ===== 3. Recorde (localStorage protegido) =====
  function getBest() { try { return +localStorage.getItem('pandaBest') || 0; } catch (e) { return 0; } }
  function setBest(v) { try { localStorage.setItem('pandaBest', v); } catch (e) {} }
  function showBest() {
    var b = getBest();
    $('best').textContent = b ? '🏅 Recorde: ' + b + ' pontos' : '';
  }

  // ===== 4. Telas e fluxo =====
  function show(id) {
    ['menu', 'game', 'end'].forEach(function (x) {
      $(x).classList.toggle('hide', x !== id);
    });
  }

  function start(op) {
    S = { op: op, lastOp: op, lv: 1, hit: 0, score: 0, streak: 0, lives: LIVES, lock: false, total: 0, right: 0 };
    show('game');
    renderHud();
    movePanda();
    next();
  }

  function renderHud() {
    $('lvl').textContent = 'Nível ' + S.lv + '/' + MAXLV;
    $('score').textContent = '⭐ ' + S.score;
    $('streak').textContent = '🔥 ' + S.streak;
    var h = '';
    for (var i = 0; i < LIVES; i++) h += i < S.lives ? '❤️' : '🖤';
    $('lives').textContent = h;
    $('prog').style.width = (S.hit / NEED * 100) + '%';
  }

  function movePanda() {
    var w = $('scene').clientWidth - 130;
    $('panda').style.left = (6 + Math.max(0, w) * (S.hit / NEED)) + 'px';
    $('panda').style.fontSize = (48 + S.lv * 6) + 'px'; // panda cresce a cada nível
  }

  function next() {
    S.lock = false;
    $('msg').textContent = '';
    var op = S.op === 'mix' ? pick(['+', '-', '*', '/']) : S.op;
    S.q = gen(op, S.lv);
    $('question').textContent = S.q.txt + ' = ?';
    var box = $('answers');
    box.innerHTML = '';
    S.q.opts.forEach(function (v, i) {
      var b = document.createElement('button');
      b.textContent = v;
      b.dataset.v = v;
      b.setAttribute('aria-label', 'Opção ' + (i + 1) + ': ' + v);
      b.addEventListener('click', function () { answer(b); });
      box.appendChild(b);
    });
  }

  // reinicia uma animação CSS
  function fx(el, cls) { el.classList.remove(cls); void el.offsetWidth; el.classList.add(cls); }

  function floatTxt(t) {
    var s = document.createElement('span');
    s.className = 'float';
    s.textContent = t;
    s.style.left = ($('panda').offsetLeft + 20) + 'px';
    s.style.bottom = '70px';
    $('scene').appendChild(s);
    setTimeout(function () { s.remove(); }, 1000);
  }

  // ===== 5. Verificação da resposta + pontuação =====
  function answer(btn) {
    if (S.lock) return;
    S.lock = true;
    S.total++;
    var v = +btn.dataset.v, btns = $('answers').children;

    if (v === S.q.ans) {
      // ACERTO
      S.right++; S.hit++; S.streak++;
      var pts = 10 + Math.min(S.streak, 5) * 2 + S.lv * 2; // bônus de sequência e de nível
      S.score += pts;
      btn.classList.add('ok');
      sndOk();
      $('msg').textContent = pick(['Nham nham! 🎋', 'Delícia! 🐼', 'Acertou! Que fome boa!', 'Muito bem! 🎉']);
      floatTxt('+' + pts + ' 🎋');
      fx($('panda'), 'hop');
      renderHud();
      movePanda();
      if (S.hit >= NEED) setTimeout(levelUp, 900);
      else setTimeout(next, 1100);
    } else {
      // ERRO
      S.streak = 0; S.lives--;
      btn.classList.add('no');
      sndNo();
      for (var i = 0; i < btns.length; i++) {
        if (+btns[i].dataset.v === S.q.ans) btns[i].classList.add('ok'); // mostra a correta
      }
      $('msg').textContent = 'Ops! A resposta era ' + S.q.ans + '. O panda perdeu uma vida 💔';
      fx($('scene'), 'shake');
      renderHud();
      if (S.lives <= 0) setTimeout(function () { finish(false); }, 1600);
      else setTimeout(next, 2000);
    }
  }

  function levelUp() {
    if (S.lv >= MAXLV) { finish(true); return; }
    S.lv++; S.hit = 0;
    $('msg').textContent = '🎉 Nível ' + S.lv + '! O panda cresceu!';
    renderHud();
    movePanda();
    fx($('panda'), 'hop');
    setTimeout(next, 1400);
  }

  function finish(win) {
    var acc = S.total ? Math.round(S.right / S.total * 100) : 0;
    var best = getBest();
    var newRec = S.score > best;
    if (newRec) setBest(S.score);
    $('endEmoji').textContent = win ? '🏆' : '😴';
    $('endTitle').textContent = win ? 'O panda comeu todo o bambu!' : 'O panda ficou com sono…';
    $('endText').innerHTML = 'Pontos: <b>' + S.score + '</b> · Acertos: <b>' + S.right + '/' + S.total +
      '</b> (' + acc + '%)' + (newRec ? '<br>🏅 Novo recorde!' : '');
    show('end');
  }

  // ===== 6. Eventos =====
  document.querySelectorAll('.op').forEach(function (b) {
    b.addEventListener('click', function () { start(b.dataset.op); });
  });
  $('again').addEventListener('click', function () { start(S.lastOp || 'mix'); });
  $('toMenu').addEventListener('click', function () { showBest(); show('menu'); });
  $('quit').addEventListener('click', function () { showBest(); show('menu'); });

  // teclas 1 a 4 escolhem a alternativa
  document.addEventListener('keydown', function (e) {
    if ($('game').classList.contains('hide')) return;
    var n = parseInt(e.key, 10);
    if (n >= 1 && n <= 4) {
      var b = $('answers').children[n - 1];
      if (b) answer(b);
    }
  });
  window.addEventListener('resize', function () { if (S.op) movePanda(); });

  showBest();
})();
