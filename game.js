(() => {
  'use strict'

  const W = 960, H = 540, GROUND = 420, FINISH = 7900
  const canvas = document.querySelector('#game')
  const ctx = canvas.getContext('2d')
  const ui = {
    overlay: document.querySelector('#overlay'), title: document.querySelector('#overlay-title'),
    copy: document.querySelector('#overlay-copy'), start: document.querySelector('#start-button'),
    startLabel: document.querySelector('#start-label'), keyHint: document.querySelector('#key-hint'),
    rings: document.querySelector('#ring-count'), score: document.querySelector('#score-count'),
    hearts: document.querySelector('#hearts'), best: document.querySelector('#best-score'),
    progress: document.querySelector('#progress-fill'), runner: document.querySelector('#progress-runner'),
    distance: document.querySelector('#distance-label'), pause: document.querySelector('#pause-button'),
    pauseBadge: document.querySelector('#pause-badge'), toast: document.querySelector('#toast'),
    sound: document.querySelector('#sound-toggle'), soundIcon: document.querySelector('#sound-icon'),
    announcer: document.querySelector('#game-announcer')
  }
  const state = {
    mode: 'ready', lastTime: 0, player: { x: 220, y: GROUND - 23, vy: 0, r: 23, roll: false, invulnerable: 0 },
    speed: 0, distance: 0, rings: 0, score: 0, health: 3, worldTime: 0,
    ringItems: [], hazards: [], soundOn: true, audio: null, toastTimer: 0, dust: [],
    best: loadBest()
  }

  function loadBest() {
    try { return Number(localStorage.getItem('blue-rush-best')) || 0 } catch { return 0 }
  }
  function saveBest() {
    if (state.score <= state.best) return
    state.best = state.score
    try { localStorage.setItem('blue-rush-best', String(state.best)) } catch { /* storage can be disabled */ }
  }
  function pad(value, size) { return String(Math.max(0, Math.floor(value))).padStart(size, '0') }
  function randomFor(seed) {
    let n = seed >>> 0
    return () => { n = (n * 1664525 + 1013904223) >>> 0; return n / 4294967296 }
  }

  function buildCourse() {
    state.ringItems = []
    state.hazards = []
    const rand = randomFor(90210)
    for (let section = 0; section < 15; section++) {
      const start = 570 + section * 485
      const style = Math.floor(rand() * 3)
      const count = 4 + Math.floor(rand() * 3)
      const arcHeight = 75 + rand() * 25
      for (let i = 0; i < count; i++) {
        state.ringItems.push({ x: start + i * 31, y: GROUND - arcHeight - Math.sin((i / Math.max(1, count - 1)) * Math.PI) * 15, taken: false, phase: rand() * 6 })
      }
      if (section > 0) {
        const x = start + 210 + rand() * 75
        state.hazards.push({ x, width: style === 1 ? 62 : 46 + rand() * 18, type: style === 1 ? 'crate' : style === 2 ? 'bot' : 'spikes', wobble: rand() * 6, passed: false })
        if (section % 4 === 3) state.hazards.push({ x: x + 83, width: 52, type: 'spikes', wobble: 0, passed: false })
      }
    }
    for (let i = 0; i < 10; i++) state.ringItems.push({ x: 7650 + i * 27, y: GROUND - 100, taken: false, phase: i * .7 })
    state.hazards.sort((a, b) => a.x - b.x)
  }

  function reset() {
    state.mode = 'running'; state.player = { x: 220, y: GROUND - 23, vy: 0, r: 23, roll: false, invulnerable: 0 }
    state.speed = 290; state.distance = 0; state.rings = 0; state.score = 0; state.health = 3; state.worldTime = 0; state.dust = []
    buildCourse(); updateHud(); setOverlay(false); syncPause(); say('Run started. Jump over hazards and collect rings.');
  }
  function startOrResume() {
    if (state.mode === 'paused') { state.mode = 'running'; setOverlay(false); syncPause(); return }
    if (state.mode === 'ready' || state.mode === 'over' || state.mode === 'won') reset()
  }
  function setOverlay(show) { ui.overlay.classList.toggle('hidden', !show) }
  function syncPause() {
    const playing = state.mode === 'running' || state.mode === 'paused'
    ui.pause.hidden = !playing
    ui.pauseBadge.hidden = state.mode !== 'paused'
    ui.pause.setAttribute('aria-label', state.mode === 'paused' ? 'Resume game' : 'Pause game')
    ui.pause.textContent = state.mode === 'paused' ? '▶' : 'Ⅱ'
  }
  function say(message) { ui.announcer.textContent = message }
  function updateHud() {
    ui.rings.textContent = pad(state.rings, 3)
    ui.score.textContent = pad(state.score, 6)
    ui.best.textContent = pad(state.best, 6)
    ui.hearts.innerHTML = [0, 1, 2].map(i => `<i class="${i >= state.health ? 'off' : ''}"></i>`).join('')
    ui.hearts.setAttribute('aria-label', `${state.health} energy`)
    const progress = Math.min(1, state.distance / FINISH)
    ui.progress.style.width = `${progress * 100}%`
    ui.runner.style.left = `${progress * 100}%`
    ui.distance.textContent = `${(state.distance / 1000).toFixed(1)} km`
  }

  function showMessage(message) {
    ui.toast.textContent = message
    ui.toast.classList.add('show')
    clearTimeout(state.toastTimer)
    state.toastTimer = setTimeout(() => ui.toast.classList.remove('show'), 780)
  }
  function tone(frequency, duration = .08, type = 'sine', volume = .045) {
    if (!state.soundOn) return
    try {
      state.audio ||= new (window.AudioContext || window.webkitAudioContext)()
      if (state.audio.state === 'suspended') state.audio.resume()
      const oscillator = state.audio.createOscillator(), gain = state.audio.createGain()
      oscillator.type = type; oscillator.frequency.value = frequency
      gain.gain.setValueAtTime(volume, state.audio.currentTime)
      gain.gain.exponentialRampToValueAtTime(.001, state.audio.currentTime + duration)
      oscillator.connect(gain); gain.connect(state.audio.destination)
      oscillator.start(); oscillator.stop(state.audio.currentTime + duration)
    } catch { /* audio is an optional flourish */ }
  }
  function jump() {
    if (state.mode === 'ready' || state.mode === 'over' || state.mode === 'won') { startOrResume(); return }
    if (state.mode !== 'running') return
    if (state.player.y >= GROUND - state.player.r - 1) {
      state.player.vy = -690; state.player.roll = false; tone(420, .09, 'triangle', .035)
    }
  }
  function togglePause() {
    if (state.mode === 'running') { state.mode = 'paused'; configureOverlay(); setOverlay(true); syncPause() }
    else if (state.mode === 'paused') startOrResume()
  }
  function configureOverlay() {
    if (state.mode === 'paused') {
      ui.title.innerHTML = 'Take a<br><em>breather.</em>'; ui.copy.textContent = 'Your run is paused. Catch your breath, then get back out there.'
      ui.startLabel.textContent = 'RESUME RUN'; ui.keyHint.innerHTML = '<kbd>ESC</kbd> OR CLICK PAUSE TO RESUME'
    } else if (state.mode === 'over') {
      ui.title.innerHTML = 'One more<br><em>run?</em>'; ui.copy.textContent = `You made it ${(state.distance / 1000).toFixed(1)} km and banked ${state.rings} rings. The shoreline is calling.`
      ui.startLabel.textContent = 'TRY AGAIN'; ui.keyHint.innerHTML = 'PRESS <kbd>ENTER</kbd> TO GO AGAIN'
    } else if (state.mode === 'won') {
      ui.title.innerHTML = 'Coastline<br><em>conquered.</em>'; ui.copy.textContent = `Finish line crossed with ${state.rings} rings. That was seriously fast.`
      ui.startLabel.textContent = 'RUN IT BACK'; ui.keyHint.innerHTML = 'PRESS <kbd>ENTER</kbd> TO RUN IT BACK'
    }
  }

  function tick(dt) {
    if (state.mode !== 'running') return
    state.worldTime += dt
    const p = state.player
    state.speed = Math.min(430, state.speed + dt * 5.2)
    state.distance += state.speed * dt
    p.x = 220 + state.distance
    p.vy += 1780 * dt
    p.y += p.vy * dt
    const floor = GROUND - (p.roll ? 15 : p.r)
    if (p.y > floor) { p.y = floor; p.vy = 0 }
    if (p.invulnerable > 0) p.invulnerable -= dt

    for (const ring of state.ringItems) {
      if (ring.taken || ring.x < p.x - 90 || ring.x > p.x + 70) continue
      const dx = ring.x - p.x, dy = ring.y - (p.y + (p.roll ? 8 : 0))
      if (dx * dx + dy * dy < (p.r + 15) ** 2) {
        ring.taken = true; state.rings++; state.score += 100; tone(760 + (state.rings % 4) * 90, .07, 'sine', .035)
        if (state.rings % 5 === 0) showMessage('RING STREAK  +500')
      }
    }
    for (const hazard of state.hazards) {
      if (hazard.passed || hazard.x + hazard.width < p.x - 40 || hazard.x > p.x + 35) continue
      const horizontal = p.x + 15 > hazard.x && p.x - 15 < hazard.x + hazard.width
      const grounded = p.y + p.r > GROUND - 48
      if (horizontal && grounded && !p.roll && p.invulnerable <= 0) hitHazard(hazard)
      else if (p.x > hazard.x + hazard.width) hazard.passed = true
    }
    state.score = Math.floor(state.distance / 4) + state.rings * 100
    if (Math.random() < dt * 10 && p.y >= GROUND - p.r - 1) state.dust.push({ x: p.x - 20, y: GROUND - 5, life: .45, size: 2 + Math.random() * 4 })
    for (const mote of state.dust) { mote.x -= state.speed * dt * .7; mote.life -= dt }
    state.dust = state.dust.filter(mote => mote.life > 0)
    if (state.distance >= FINISH) finishRun()
    updateHud()
  }
  function hitHazard(hazard) {
    hazard.passed = true
    const p = state.player
    p.invulnerable = 1.4; p.vy = -300
    if (state.rings) { const loss = Math.min(10, state.rings); state.rings -= loss; showMessage(`OUCH!  -${loss} RINGS`) }
    else state.health--
    tone(150, .22, 'sawtooth', .045)
    if (!state.health) {
      state.mode = 'over'; saveBest(); updateHud(); configureOverlay(); setOverlay(true); syncPause(); say('Run over. Press enter or tap try again.')
    } else {
      if (!state.rings) state.health = Math.max(0, state.health)
      if (!state.health) { state.mode = 'over'; saveBest(); configureOverlay(); setOverlay(true); syncPause() }
      updateHud()
    }
  }
  function finishRun() {
    state.mode = 'won'; state.distance = FINISH; state.score = Math.floor(FINISH / 4) + state.rings * 100
    saveBest(); updateHud(); configureOverlay(); setOverlay(true); syncPause(); tone(880, .35, 'triangle', .06); say('Finish line crossed. Coastline conquered!')
  }

  function roundedRect(x, y, w, h, radius) {
    ctx.beginPath(); ctx.roundRect(x, y, w, h, radius)
  }
  function drawCloud(x, y, scale = 1) {
    ctx.save(); ctx.translate(x, y); ctx.scale(scale, scale); ctx.fillStyle = '#eaffff99'
    ctx.beginPath(); ctx.ellipse(0, 7, 37, 10, 0, 0, Math.PI * 2); ctx.ellipse(-17, 1, 17, 13, 0, 0, Math.PI * 2); ctx.ellipse(3, -5, 20, 17, 0, 0, Math.PI * 2); ctx.ellipse(22, 3, 16, 11, 0, 0, Math.PI * 2); ctx.fill(); ctx.restore()
  }
  function drawPalm(x, base, scale = 1, shade = '#2c8791') {
    ctx.save(); ctx.translate(x, base); ctx.scale(scale, scale); ctx.strokeStyle = shade; ctx.lineWidth = 8; ctx.lineCap = 'round'
    ctx.beginPath(); ctx.moveTo(0, 0); ctx.quadraticCurveTo(-8, -54, 2, -111); ctx.stroke()
    ctx.fillStyle = shade
    for (let i = 0; i < 7; i++) {
      const a = -Math.PI * .92 + i * Math.PI * .3
      ctx.save(); ctx.rotate(a); ctx.beginPath(); ctx.ellipse(29, -111, 32, 7, -.1, 0, Math.PI * 2); ctx.fill(); ctx.restore()
    }
    ctx.beginPath(); ctx.arc(2, -110, 8, 0, Math.PI * 2); ctx.fill(); ctx.restore()
  }
  function drawBackground() {
    const sky = ctx.createLinearGradient(0, 0, 0, GROUND)
    sky.addColorStop(0, '#78d6e5'); sky.addColorStop(.58, '#a8e7d8'); sky.addColorStop(1, '#e2f1bd')
    ctx.fillStyle = sky; ctx.fillRect(0, 0, W, H)
    const sun = ctx.createRadialGradient(755, 116, 10, 755, 116, 124)
    sun.addColorStop(0, '#fff8c6bb'); sun.addColorStop(.28, '#fff0a35e'); sun.addColorStop(1, '#fff0a300')
    ctx.fillStyle = sun; ctx.fillRect(610, 0, 290, 260)
    ctx.fillStyle = '#fff6c4'; ctx.beginPath(); ctx.arc(755, 116, 38, 0, Math.PI * 2); ctx.fill()
    const drift = state.distance * .13
    for (let i = 0; i < 5; i++) {
      const x = ((i * 238 - drift * .55) % 1190 + 1190) % 1190 - 100
      drawCloud(x, 68 + (i % 3) * 55, .65 + (i % 2) * .22)
    }
    ctx.fillStyle = '#6fc9c3'
    ctx.beginPath(); ctx.moveTo(0, 300)
    for (let x = 0; x <= W; x += 8) ctx.lineTo(x, 306 + Math.sin((x + drift * .35) / 85) * 20 + Math.sin((x - drift * .2) / 171) * 13)
    ctx.lineTo(W, GROUND); ctx.lineTo(0, GROUND); ctx.closePath(); ctx.fill()
    ctx.fillStyle = '#61b8b8'
    ctx.beginPath(); ctx.moveTo(0, 338)
    for (let x = 0; x <= W; x += 8) ctx.lineTo(x, 339 + Math.sin((x + drift * .55) / 105) * 17 + Math.cos((x - drift * .2) / 210) * 9)
    ctx.lineTo(W, GROUND); ctx.lineTo(0, GROUND); ctx.closePath(); ctx.fill()
    const palmShift = (state.distance * .28) % 520
    for (let i = -1; i < 4; i++) drawPalm(i * 390 - palmShift + 150, 369, .72 + (i % 2) * .1, i % 2 ? '#258995' : '#318e92')
    ctx.fillStyle = '#67d6d3'; ctx.fillRect(0, 363, W, 57)
    for (let i = 0; i < 9; i++) {
      const x = ((i * 147 - state.distance * .64) % 1100 + 1100) % 1100 - 60
      ctx.fillStyle = i % 2 ? '#c8f5dd77' : '#e5f5c388'; ctx.fillRect(x, 376 + (i % 3) * 11, 38 + (i % 4) * 17, 2)
    }
  }
  function drawGround() {
    ctx.fillStyle = '#70c94f'; ctx.fillRect(0, GROUND, W, 10)
    ctx.fillStyle = '#b7eb67'; ctx.fillRect(0, GROUND, W, 4)
    ctx.fillStyle = '#a86d42'; ctx.fillRect(0, GROUND + 10, W, H - GROUND)
    ctx.fillStyle = '#875239'; ctx.fillRect(0, GROUND + 34, W, H - GROUND - 34)
    const offset = (state.distance * .9) % 96
    for (let row = 0; row < 3; row++) {
      const y = GROUND + 19 + row * 22, shift = (offset + row * 33) % 96
      for (let x = -110; x < W + 100; x += 96) {
        ctx.fillStyle = row % 2 ? '#d38b4e' : '#ce8249'
        roundedRect(x - shift, y, 56, 9, 3); ctx.fill()
      }
    }
    const dash = (state.distance * 1.8) % 53
    for (let x = -55; x < W + 50; x += 53) {
      ctx.fillStyle = '#e8fb9b'; ctx.globalAlpha = .8; ctx.fillRect(x - dash, GROUND + 2, 13, 2); ctx.globalAlpha = 1
    }
  }
  function drawRing(ring) {
    const x = ring.x - state.distance, pulse = 1 + Math.sin(state.worldTime * 5 + ring.phase) * .07
    if (x < -40 || x > W + 40) return
    ctx.save(); ctx.translate(x, ring.y); ctx.scale(pulse, 1); ctx.shadowColor = '#ffdb69'; ctx.shadowBlur = 10
    ctx.strokeStyle = '#fff3a0'; ctx.lineWidth = 5; ctx.beginPath(); ctx.ellipse(0, 0, 10, 14, 0, 0, Math.PI * 2); ctx.stroke()
    ctx.shadowBlur = 0; ctx.strokeStyle = '#eea934'; ctx.lineWidth = 2; ctx.beginPath(); ctx.ellipse(0, 0, 5, 9, 0, 0, Math.PI * 2); ctx.stroke(); ctx.restore()
  }
  function drawHazard(hazard) {
    const x = hazard.x - state.distance, y = GROUND
    if (x < -100 || x > W + 100) return
    ctx.save(); ctx.translate(x, y)
    if (hazard.type === 'spikes') {
      ctx.fillStyle = '#f15e69'; ctx.strokeStyle = '#922f50'; ctx.lineWidth = 2
      ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(11, -32); ctx.lineTo(22, 0); ctx.lineTo(34, -37); ctx.lineTo(47, 0); ctx.lineTo(hazard.width, 0); ctx.closePath(); ctx.fill(); ctx.stroke()
      ctx.fillStyle = '#ffc875'; ctx.fillRect(4, -3, hazard.width - 8, 4)
    } else if (hazard.type === 'crate') {
      ctx.fillStyle = '#db784b'; ctx.strokeStyle = '#8b4b42'; ctx.lineWidth = 3; roundedRect(0, -42, hazard.width, 42, 6); ctx.fill(); ctx.stroke()
      ctx.strokeStyle = '#f8bf68'; ctx.lineWidth = 4; ctx.beginPath(); ctx.moveTo(8, -34); ctx.lineTo(hazard.width - 8, -8); ctx.moveTo(hazard.width - 8, -34); ctx.lineTo(8, -8); ctx.stroke()
    } else {
      const bob = Math.sin(state.worldTime * 8 + hazard.wobble) * 2
      ctx.translate(0, bob); ctx.fillStyle = '#e36c57'; ctx.strokeStyle = '#773b59'; ctx.lineWidth = 3
      roundedRect(0, -34, hazard.width, 29, 13); ctx.fill(); ctx.stroke()
      ctx.fillStyle = '#fff0bd'; ctx.beginPath(); ctx.arc(13, -22, 5, 0, Math.PI * 2); ctx.arc(30, -22, 5, 0, Math.PI * 2); ctx.fill()
      ctx.fillStyle = '#243c56'; ctx.beginPath(); ctx.arc(14, -22, 2, 0, Math.PI * 2); ctx.arc(31, -22, 2, 0, Math.PI * 2); ctx.fill()
      ctx.strokeStyle = '#773b59'; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(9, -5); ctx.lineTo(5, 0); ctx.moveTo(35, -5); ctx.lineTo(39, 0); ctx.stroke()
    }
    ctx.restore()
  }

  function drawPlayer() {
    const p = state.player
    if (p.invulnerable > 0 && Math.floor(p.invulnerable * 12) % 2 === 0) return
    ctx.save()
    ctx.translate(220, p.y)

    if (p.roll) {
      ctx.rotate(state.worldTime * 14)
      ctx.fillStyle = '#4aaeff'; ctx.beginPath(); ctx.arc(0, 0, 19, 0, Math.PI * 2); ctx.fill()
      ctx.strokeStyle = '#0753a9'; ctx.lineWidth = 5; ctx.beginPath(); ctx.arc(0, 0, 14, -1.1, 1.2); ctx.stroke()
      ctx.fillStyle = '#d8eaf8'; ctx.beginPath(); ctx.ellipse(-7, -7, 8, 5, -.5, 0, Math.PI * 2); ctx.fill()
    } else {
      ctx.fillStyle = '#168ce0'; ctx.beginPath(); ctx.ellipse(0, 2, 23, 27, -.12, 0, Math.PI * 2); ctx.fill()
      ctx.fillStyle = '#45b3f3'; ctx.beginPath(); ctx.ellipse(-5, -8, 16, 19, -.18, 0, Math.PI * 2); ctx.fill()
      ctx.fillStyle = '#082c62'; ctx.beginPath(); ctx.ellipse(-18, 10, 7, 14, -.25, 0, Math.PI * 2); ctx.fill()
      ctx.fillStyle = '#183c70'; ctx.beginPath(); ctx.moveTo(-20, -12); ctx.lineTo(-35, -27); ctx.lineTo(-10, -24); ctx.closePath(); ctx.fill()
      ctx.fillStyle = '#183c70'; ctx.beginPath(); ctx.moveTo(-15, -22); ctx.lineTo(-29, -42); ctx.lineTo(-5, -29); ctx.closePath(); ctx.fill()
      ctx.fillStyle = '#f2f0df'; ctx.beginPath(); ctx.ellipse(11, -13, 8, 11, -.2, 0, Math.PI * 2); ctx.fill()
      ctx.fillStyle = '#07182f'; ctx.beginPath(); ctx.arc(14, -13, 3, 0, Math.PI * 2); ctx.fill()
      ctx.fillStyle = '#e8edcf'; ctx.beginPath(); ctx.ellipse(-15, 24, 13, 7, -.15, 0, Math.PI * 2); ctx.fill()
      ctx.fillStyle = '#ed6e62'; ctx.beginPath(); ctx.ellipse(13, 25, 12, 7, .12, 0, Math.PI * 2); ctx.fill()
    }
    ctx.restore()

    ctx.save(); ctx.translate(220, p.y)
    ctx.fillStyle = '#123c4d33'; ctx.beginPath(); ctx.ellipse(0, GROUND - p.y + 3, p.roll ? 24 : 20, 5, 0, 0, Math.PI * 2); ctx.fill()
    ctx.restore()
  }

  function drawDust() {
    for (const mote of state.dust) {
      const x = mote.x - state.distance + 220
      ctx.globalAlpha = Math.max(0, mote.life * 1.8)
      ctx.fillStyle = '#e8f3b4'; ctx.beginPath(); ctx.arc(x, mote.y, mote.size, 0, Math.PI * 2); ctx.fill()
    }
    ctx.globalAlpha = 1
  }

  function drawFinish() {
    const x = FINISH - state.distance
    if (x < -100 || x > W + 100) return
    ctx.save(); ctx.translate(x, 0)
    ctx.fillStyle = '#6a4c3d'; ctx.fillRect(-5, GROUND - 170, 10, 170)
    ctx.fillStyle = '#f0f5d9'; ctx.fillRect(-32, GROUND - 186, 64, 34)
    ctx.fillStyle = '#0d2b43'; ctx.font = '800 10px Outfit, sans-serif'; ctx.textAlign = 'center'; ctx.fillText('FINISH', 0, GROUND - 164)
    for (let row = 0; row < 5; row++) for (let col = 0; col < 4; col++) {
      ctx.fillStyle = (row + col) % 2 ? '#f5f3d5' : '#3e6680'; ctx.fillRect(-28 + col * 14, GROUND - 152 + row * 14, 14, 14)
    }
    ctx.restore()
  }

  function render() {
    ctx.clearRect(0, 0, W, H)
    drawBackground(); drawGround()
    for (const ring of state.ringItems) if (!ring.taken) drawRing(ring)
    for (const hazard of state.hazards) drawHazard(hazard)
    drawFinish(); drawDust(); drawPlayer()
  }

  function animation(time) {
    if (!state.lastTime) state.lastTime = time
    const dt = Math.min(.033, (time - state.lastTime) / 1000)
    state.lastTime = time
    tick(dt)
    render()
    requestAnimationFrame(animation)
  }

  function setRoll(value) {
    if (state.mode !== 'running') return
    state.player.roll = value
  }

  window.addEventListener('keydown', event => {
    if (['ArrowUp', 'ArrowDown', ' ', 'Enter', 'Escape'].includes(event.key)) event.preventDefault()
    if (event.key === 'Escape') { togglePause(); return }
    if (event.key === 'Enter') {
      if (state.mode === 'paused') togglePause()
      else startOrResume()
      return
    }
    if (event.key === 'ArrowUp' || event.key === ' ' || event.key === 'w' || event.key === 'W') jump()
    if (event.key === 'ArrowDown' || event.key === 's' || event.key === 'S') setRoll(true)
  })
  window.addEventListener('keyup', event => {
    if (event.key === 'ArrowDown' || event.key === 's' || event.key === 'S') setRoll(false)
  })

  ui.start.addEventListener('click', () => { if (state.mode === 'paused') startOrResume(); else startOrResume() })
  ui.pause.addEventListener('click', togglePause)
  document.querySelector('#restart-button').addEventListener('click', () => reset())
  ui.sound.addEventListener('click', () => {
    state.soundOn = !state.soundOn
    ui.soundIcon.textContent = state.soundOn ? '♪' : '×'
    ui.sound.querySelector('.sound-label').textContent = state.soundOn ? 'SOUND ON' : 'SOUND OFF'
    if (state.soundOn) tone(540, .08, 'sine', .04)
  })

  const jumpControl = document.querySelector('#jump-control')
  const rollControl = document.querySelector('#roll-control')
  jumpControl.addEventListener('pointerdown', event => { event.preventDefault(); jump() })
  rollControl.addEventListener('pointerdown', event => { event.preventDefault(); setRoll(true) })
  rollControl.addEventListener('pointerup', () => setRoll(false))
  rollControl.addEventListener('pointercancel', () => setRoll(false))
  rollControl.addEventListener('pointerleave', event => { if (event.buttons === 0) setRoll(false) })

  canvas.addEventListener('pointerdown', event => {
    event.preventDefault()
    jump()
  })

  buildCourse()
  updateHud()
  syncPause()
  render()
  requestAnimationFrame(animation)
})()
