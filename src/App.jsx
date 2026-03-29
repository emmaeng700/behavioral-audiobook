import { useState, useEffect, useCallback, useRef } from 'react'
import './App.css'
import questions from './data/behavioral_questions.json'

// ── Offline download hook ─────────────────────────────────────────────────────

function useOfflineDownload() {
  const [status, setStatus] = useState(() => {
    try { return localStorage.getItem('offline-ready') === '1' ? 'ready' : 'idle' } catch { return 'idle' }
  })
  const [progress, setProgress] = useState(0)

  const download = useCallback(async () => {
    if (!('caches' in window)) { alert('Offline caching not supported on this browser.'); return }
    setStatus('loading')
    setProgress(0)
    try {
      const resourceEntries = performance.getEntriesByType('resource')
      const urls = [
        location.href,
        ...resourceEntries.map(e => e.name).filter(u => u.startsWith(location.origin)),
      ]
      const cache = await caches.open('audiobook-v1')
      let done = 0
      for (const url of urls) {
        try {
          const res = await fetch(url, { cache: 'reload' })
          if (res.ok) await cache.put(url, res)
        } catch {}
        done++
        setProgress(Math.round((done / urls.length) * 100))
      }
      setStatus('ready')
      try { localStorage.setItem('offline-ready', '1') } catch {}
    } catch {
      setStatus('idle')
    }
  }, [])

  return { status, progress, download }
}

// ── Constants ─────────────────────────────────────────────────────────────────

const CATEGORIES = ['All', ...Array.from(new Set(questions.map(q => q.category))).sort()]
const SPEEDS = [0.5, 0.7, 0.8, 0.9, 1, 1.25, 1.5]

// ── Text builder ──────────────────────────────────────────────────────────────

function buildTexts(q, mode) {
  const out = [`${q.category}. ${q.question}`]
  if (mode === 'full') {
    q.stories.forEach((s, i) => {
      out.push(
        `Story ${i + 1}: ${s.title}. ` +
        `Situation: ${s.situation}. ` +
        `Task: ${s.task}. ` +
        `Action: ${s.action}. ` +
        `Result: ${s.result}.`
      )
    })
  }
  return out
}

// ── App ───────────────────────────────────────────────────────────────────────

export default function App() {
  const { status: offlineStatus, progress: offlineProgress, download: downloadOffline } = useOfflineDownload()

  const [cat, setCat] = useState('All')
  const [mode, setMode] = useState('full')
  const [speed, setSpeed] = useState(0.8)
  const [autoAdvance, setAutoAdvance] = useState(true)
  const [loop, setLoop] = useState(true)

  const [deck, setDeck] = useState([])
  const [idx, setIdx] = useState(0)
  const [playing, setPlaying] = useState(false)
  const [paused, setPaused] = useState(false)
  const [currentText, setCurrentText] = useState('')

  const [voices, setVoices] = useState([])
  const [voiceIdx, setVoiceIdx] = useState(0)

  const stopFlag = useRef(false)
  const playRef = useRef({ deck: [], idx: 0, speed: 0.8, voiceIdx: 0, mode: 'full', auto: true, loop: true })

  // Load voices — filter out novelty/gimmick voices, auto-select best female
  useEffect(() => {
    const load = () => {
      const all = window.speechSynthesis.getVoices()

      // Novelty/robot/sound-effect voices — skip these entirely
      const JUNK = ['bad news','bahh','bells','boing','bubbles','cellos','good news',
        'jester','junior','kathy','organ','ralph','superstar','trinoids','whisper',
        'wobble','zarvox','albert','fred']

      const good = all.filter(v =>
        v.lang.startsWith('en') &&
        !JUNK.some(j => v.name.toLowerCase().includes(j))
      )
      if (!good.length) return
      setVoices(good)

      // Priority order for best-sounding female voices on Mac/iOS/Chrome
      const FEMALE_PRIORITY = [
        'flo (english (united states))',   // macOS modern — best female US
        'shelley (english (united states))',
        'sandy (english (united states))',
        'google uk english female',        // Chrome — excellent online
        'karen',                           // macOS AU — natural
        'moira',                           // macOS IE — natural
        'tessa',                           // macOS ZA — natural
        'samantha',                        // macOS classic fallback
        'flo', 'shelley', 'sandy',         // any locale variant
      ]

      for (const name of FEMALE_PRIORITY) {
        const i = good.findIndex(v => v.name.toLowerCase().includes(name))
        if (i !== -1) { setVoiceIdx(i); return }
      }
    }
    load()
    window.speechSynthesis.addEventListener('voiceschanged', load)
    return () => window.speechSynthesis.removeEventListener('voiceschanged', load)
  }, [])

  // Build deck
  useEffect(() => {
    const filtered = cat === 'All' ? questions : questions.filter(q => q.category === cat)
    stopAll()
    setDeck(filtered)
    setIdx(0)
    setPlaying(false)
    setPaused(false)
    setCurrentText('')
  }, [cat])

  // Sync refs
  useEffect(() => {
    playRef.current = { deck, idx, speed, voiceIdx, mode, auto: autoAdvance, loop }
  }, [deck, idx, speed, voiceIdx, mode, autoAdvance, loop])

  const stopAll = useCallback(() => {
    stopFlag.current = true
    window.speechSynthesis?.cancel()
    setCurrentText('')
  }, [])

  useEffect(() => () => window.speechSynthesis?.cancel(), [])

  // ── Speak ─────────────────────────────────────────────────────────────────

  const speakQueue = useCallback((texts, pos, spd, voice, onDone) => {
    if (stopFlag.current || pos >= texts.length) {
      if (!stopFlag.current) onDone()
      return
    }
    setCurrentText(texts[pos])
    const utt = new SpeechSynthesisUtterance(texts[pos])
    utt.rate = spd
    if (voice) utt.voice = voice
    utt.onend = () => speakQueue(texts, pos + 1, spd, voice, onDone)
    utt.onerror = () => { if (!stopFlag.current) onDone() }
    window.speechSynthesis.speak(utt)
  }, [])

  const playFromIdx = useCallback((d, i, spd, vi, md, auto, lp) => {
    if (i < 0 || i >= d.length) return
    stopFlag.current = false
    setIdx(i); setPlaying(true); setPaused(false)
    speakQueue(buildTexts(d[i], md), 0, spd, voices[vi], () => {
      setCurrentText('')
      const next = i + 1
      if (auto && next < d.length)       playFromIdx(d, next, spd, vi, md, auto, lp)
      else if (auto && lp)               playFromIdx(d, 0, spd, vi, md, auto, lp)
      else { setPlaying(false); setPaused(false); setIdx(0) }
    })
  }, [voices, speakQueue])

  // ── Controls ──────────────────────────────────────────────────────────────

  const handlePlay = () => {
    if (paused) { window.speechSynthesis.resume(); setPaused(false); setPlaying(true); return }
    stopAll()
    const { deck: d, idx: i, speed: spd, voiceIdx: vi, mode: md, auto, loop: lp } = playRef.current
    setTimeout(() => playFromIdx(d, i, spd, vi, md, auto, lp), 50)
  }

  const handlePause = () => { window.speechSynthesis.pause(); setPaused(true); setPlaying(false) }

  const jump = (dir) => {
    const { deck: d, speed: spd, voiceIdx: vi, mode: md, auto, loop: lp } = playRef.current
    const next = Math.max(0, Math.min(d.length - 1, idx + dir))
    stopAll(); setIdx(next); setPaused(false)
    if (playing) setTimeout(() => playFromIdx(d, next, spd, vi, md, auto, lp), 50)
  }

  const restart = () => { stopAll(); setIdx(0); setPlaying(false); setPaused(false) }

  const handleSpeedChange = (spd) => {
    setSpeed(spd); playRef.current.speed = spd
    if (playing && !paused) {
      stopAll()
      const { deck: d, idx: i, voiceIdx: vi, mode: md, auto, loop: lp } = playRef.current
      setTimeout(() => playFromIdx(d, i, spd, vi, md, auto, lp), 50)
    }
  }

  const jumpTo = (i) => {
    const { deck: d, speed: spd, voiceIdx: vi, mode: md, auto, loop: lp } = playRef.current
    stopAll(); setIdx(i); setPaused(false)
    if (playing) setTimeout(() => playFromIdx(d, i, spd, vi, md, auto, lp), 50)
  }

  const currentQ = deck[idx] || null
  const pct = deck.length ? ((idx + 1) / deck.length) * 100 : 0

  return (
    <div className="app">
      {/* ── Header ── */}
      <header className="header">
        <div className="header-inner">
          <div className="logo">🎧</div>
          <div className="header-text">
            <div className="header-title">Behavioral Audiobook</div>
            <div className="header-sub">Web Speech · Works offline</div>
          </div>
          <button
            className={`offline-btn ${offlineStatus}`}
            onClick={offlineStatus === 'idle' ? downloadOffline : undefined}
            disabled={offlineStatus === 'loading'}
          >
            {offlineStatus === 'ready'   && '✓ Offline Ready'}
            {offlineStatus === 'loading' && <><span className="spin-icon" />{offlineProgress > 0 ? `${offlineProgress}%` : 'Saving…'}</>}
            {offlineStatus === 'idle'    && '⬇ Save Offline'}
          </button>
        </div>
      </header>

      <div className="body">

        {/* ── Current card ── */}
        {currentQ && (
          <div className={`card ${playing ? 'active' : ''}`}>
            <div className={`card-header ${playing ? 'active' : ''}`}>
              <span className="cat-badge">{currentQ.category}</span>
              {playing && !paused && <span className="status-tag speaking">▶ Speaking…</span>}
              {paused              && <span className="status-tag paused">⏸ Paused</span>}
              <span className="card-counter">{idx + 1} / {deck.length}</span>
            </div>
            <div className="card-body">
              <div className="question">{currentQ.question}</div>
              {currentText && (
                <div className="speaking-preview">
                  <span className="pulse-dot" />
                  <span>{currentText.length > 160 ? currentText.slice(0, 160) + '…' : currentText}</span>
                </div>
              )}
            </div>
          </div>
        )}

        {/* ── Player ── */}
        <div className="player">
          {/* Speed */}
          <div className="speed-row">
            <span className="speed-label">Speed</span>
            {SPEEDS.map(sp => (
              <button key={sp} className={`speed-btn ${speed === sp ? 'active' : ''}`} onClick={() => handleSpeedChange(sp)}>
                {sp}x
              </button>
            ))}
          </div>

          {/* Controls */}
          <div className="controls">
            <button className="btn-ghost" onClick={restart} title="Restart">↩</button>
            <button className="btn-secondary" onClick={() => jump(-1)} disabled={idx === 0}>⏮</button>
            {playing && !paused
              ? <button className="btn-primary" onClick={handlePause}>⏸</button>
              : <button className="btn-primary" onClick={handlePlay} disabled={deck.length === 0}>▶</button>
            }
            <button className="btn-secondary" onClick={() => jump(1)} disabled={idx === deck.length - 1}>⏭</button>
            <button className={`btn-loop ${loop ? 'active' : ''}`} onClick={() => setLoop(l => !l)} title="Loop">🔁</button>
          </div>

          {/* Progress */}
          <div className="progress-bar"><div className="progress-fill" style={{ width: `${pct}%` }} /></div>
          <div className="progress-row">
            <span>{idx + 1} of {deck.length}</span>
            <span>{mode === 'question' ? 'Question only' : 'Full STAR'} · {speed}x</span>
          </div>
        </div>

        {/* ── Settings ── */}
        <div className="section">
          <div className="section-label">Settings</div>

          {/* Mode */}
          <div style={{ marginBottom: 12 }}>
            <div className="setting-label">Read Mode</div>
            <div className="pill-row">
              <button className={`pill ${mode === 'question' ? 'active' : ''}`} onClick={() => { setMode('question'); stopAll(); setPlaying(false) }}>Question Only</button>
              <button className={`pill ${mode === 'full' ? 'active' : ''}`}     onClick={() => { setMode('full');     stopAll(); setPlaying(false) }}>Full Q&A (STAR)</button>
            </div>
          </div>

          {/* Voice */}
          {voices.length > 0 && (
            <div style={{ marginBottom: 12 }}>
              <div className="setting-label">Voice</div>
              <select className="voice-select" value={voiceIdx} onChange={e => setVoiceIdx(Number(e.target.value))}>
                {voices.map((v, i) => <option key={v.name} value={i}>{v.name} ({v.lang})</option>)}
              </select>
            </div>
          )}

          {/* Auto-advance + Loop */}
          <div className="setting-row">
            <div><div className="setting-label">Auto-advance</div></div>
            <button className={`pill toggle ${autoAdvance ? 'active' : ''}`} onClick={() => setAutoAdvance(a => !a)}>{autoAdvance ? 'On' : 'Off'}</button>
          </div>
          <div className="setting-row" style={{ marginTop: 10 }}>
            <div>
              <div className="setting-label">🔁 Loop playlist</div>
              <div className="setting-sub">Restarts when done</div>
            </div>
            <button className={`pill toggle ${loop ? 'active' : ''}`} onClick={() => setLoop(l => !l)}>{loop ? 'On' : 'Off'}</button>
          </div>
        </div>

        {/* ── Category filter ── */}
        <div className="section">
          <div className="section-label">Category · {deck.length} questions</div>
          <div className="pill-row">
            {CATEGORIES.map(c => (
              <button key={c} className={`pill ${cat === c ? 'active' : ''}`} onClick={() => setCat(c)}>{c}</button>
            ))}
          </div>
        </div>

        {/* ── Playlist ── */}
        <div className="section">
          <div className="section-label">Playlist</div>
          <div className="playlist-scroll">
            {deck.map((q, i) => (
              <div key={q.id} className={`list-item ${i === idx ? 'active' : ''}`} onClick={() => jumpTo(i)}>
                <span className={`list-num ${i === idx ? 'active' : ''}`}>
                  {i === idx && playing && !paused ? '▶' : i + 1}
                </span>
                <span className="list-cat">{q.category}</span>
                <span className="list-q">{q.question}</span>
              </div>
            ))}
          </div>
        </div>

      </div>
    </div>
  )
}
