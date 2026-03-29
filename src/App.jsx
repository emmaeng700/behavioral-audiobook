import { useState, useEffect, useCallback, useRef } from 'react'
import './App.css'
import questions from './data/behavioral_questions.json'
import { idbGet, idbSet } from './idb.js'

// ── Audio cache (in-memory blob URLs) ────────────────────────────────────────
const blobCache = new Map()

async function getAudioUrl(text, voice, speed) {
  const key = `${voice}|${speed}|${text}`

  // 1. Memory cache
  if (blobCache.has(key)) return { url: blobCache.get(key), fromCache: true }

  // 2. IndexedDB (offline cache)
  try {
    const stored = await idbGet(key)
    if (stored) {
      const url = URL.createObjectURL(new Blob([stored], { type: 'audio/mpeg' }))
      blobCache.set(key, url)
      return { url, fromCache: true }
    }
  } catch {}

  // 3. Fetch from OpenAI via API route
  const res = await fetch('/api/tts', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ text, voice, speed }),
  })

  if (!res.ok) throw new Error(await res.text())

  const buffer = await res.arrayBuffer()

  // Store in IndexedDB for offline use
  try { await idbSet(key, buffer) } catch {}

  const url = URL.createObjectURL(new Blob([buffer], { type: 'audio/mpeg' }))
  blobCache.set(key, url)
  return { url, fromCache: false }
}

// ── Offline download hook ─────────────────────────────────────────────────────
function useOfflineDownload(deck, mode, voice, speed) {
  const [status, setStatus] = useState(() => {
    try { return localStorage.getItem('offline-ready') === '1' ? 'ready' : 'idle' } catch { return 'idle' }
  })
  const [progress, setProgress] = useState(0)

  const download = useCallback(async () => {
    const texts = []
    deck.forEach(q => {
      texts.push(`${q.category}. ${q.question}`)
      if (mode === 'full') {
        q.stories.forEach((s, i) => {
          texts.push(
            `Story ${i + 1}: ${s.title}. Situation: ${s.situation}. ` +
            `Task: ${s.task}. Action: ${s.action}. Result: ${s.result}.`
          )
        })
      }
    })

    setStatus('loading')
    setProgress(0)
    let done = 0

    for (const text of texts) {
      try { await getAudioUrl(text, voice, speed) } catch {}
      done++
      setProgress(Math.round((done / texts.length) * 100))
    }

    setStatus('ready')
    try { localStorage.setItem('offline-ready', '1') } catch {}
  }, [deck, mode, voice, speed])

  return { status, progress, download }
}

// ── Constants ─────────────────────────────────────────────────────────────────
const CATEGORIES = ['All', ...Array.from(new Set(questions.map(q => q.category))).sort()]
const SPEEDS     = [0.5, 0.7, 0.8, 0.9, 1, 1.1, 1.25]
const VOICES     = [
  { id: 'nova',    label: 'Nova — Female, warm'        },
  { id: 'shimmer', label: 'Shimmer — Female, soft'     },
  { id: 'alloy',   label: 'Alloy — Neutral, clear'     },
  { id: 'echo',    label: 'Echo — Male, smooth'        },
  { id: 'onyx',    label: 'Onyx — Male, deep'          },
  { id: 'fable',   label: 'Fable — British, expressive'},
]

// ── Text builder ──────────────────────────────────────────────────────────────
function buildSegments(q, mode) {
  const segs = [`${q.category}. ${q.question}`]
  if (mode === 'full') {
    q.stories.forEach((s, i) => {
      segs.push(
        `Story ${i + 1}: ${s.title}. Situation: ${s.situation}. ` +
        `Task: ${s.task}. Action: ${s.action}. Result: ${s.result}.`
      )
    })
  }
  return segs
}

// ── App ───────────────────────────────────────────────────────────────────────
export default function App() {
  const [cat,         setCat]         = useState('All')
  const [mode,        setMode]        = useState('full')
  const [speed,       setSpeed]       = useState(0.9)
  const [voice,       setVoice]       = useState('nova')
  const [autoAdvance, setAutoAdvance] = useState(true)
  const [loop,        setLoop]        = useState(true)
  const [apiErr,      setApiErr]      = useState('')

  const [deck,    setDeck]    = useState([])
  const [idx,     setIdx]     = useState(0)
  const [playing, setPlaying] = useState(false)
  const [paused,  setPaused]  = useState(false)
  const [loading, setLoading] = useState(false) // fetching audio
  const [curSeg,  setCurSeg]  = useState('')

  const audioRef  = useRef(null)  // current Audio element
  const stopFlag  = useRef(false)
  const playRef   = useRef({ deck: [], idx: 0, speed: 0.9, voice: 'nova', mode: 'full', auto: true, loop: true })

  const { status: offlineStatus, progress: offlineProgress, download: downloadOffline } =
    useOfflineDownload(deck, mode, voice, speed)

  // Build deck on category change
  useEffect(() => {
    const filtered = cat === 'All' ? questions : questions.filter(q => q.category === cat)
    stopAll()
    setDeck(filtered)
    setIdx(0)
    setPlaying(false)
    setPaused(false)
    setCurSeg('')
  }, [cat])

  // Sync refs
  useEffect(() => {
    playRef.current = { deck, idx, speed, voice, mode, auto: autoAdvance, loop }
  }, [deck, idx, speed, voice, mode, autoAdvance, loop])

  useEffect(() => () => stopAll(), [])

  const stopAll = useCallback(() => {
    stopFlag.current = true
    if (audioRef.current) { audioRef.current.pause(); audioRef.current = null }
    setLoading(false)
    setCurSeg('')
  }, [])

  // ── Play a queue of text segments ─────────────────────────────────────────

  const speakQueue = useCallback(async (segs, pos, spd, vc, onDone) => {
    if (stopFlag.current || pos >= segs.length) {
      if (!stopFlag.current) onDone()
      return
    }

    const text = segs[pos]
    setCurSeg(text)
    setLoading(true)
    setApiErr('')

    let url
    try {
      const result = await getAudioUrl(text, vc, spd)
      url = result.url
    } catch (err) {
      setApiErr('OpenAI API unavailable — check your API key on Vercel.')
      setLoading(false)
      setPlaying(false)
      return
    }

    if (stopFlag.current) return

    setLoading(false)

    const audio = new Audio(url)
    audioRef.current = audio
    audio.playbackRate = 1 // speed baked in by API
    audio.onended  = () => speakQueue(segs, pos + 1, spd, vc, onDone)
    audio.onerror  = () => { if (!stopFlag.current) onDone() }
    audio.play().catch(() => { if (!stopFlag.current) onDone() })
  }, [])

  const playFromIdx = useCallback((d, i, spd, vc, md, auto, lp) => {
    if (i < 0 || i >= d.length) return
    stopFlag.current = false
    setIdx(i); setPlaying(true); setPaused(false)

    speakQueue(buildSegments(d[i], md), 0, spd, vc, () => {
      setCurSeg('')
      const next = i + 1
      if (auto && next < d.length)  playFromIdx(d, next, spd, vc, md, auto, lp)
      else if (auto && lp)          playFromIdx(d, 0,    spd, vc, md, auto, lp)
      else { setPlaying(false); setPaused(false); setIdx(0) }
    })
  }, [speakQueue])

  // ── Controls ──────────────────────────────────────────────────────────────

  const handlePlay = () => {
    if (paused && audioRef.current) { audioRef.current.play(); setPaused(false); setPlaying(true); return }
    stopAll()
    const { deck: d, idx: i, speed: spd, voice: vc, mode: md, auto, loop: lp } = playRef.current
    setTimeout(() => playFromIdx(d, i, spd, vc, md, auto, lp), 50)
  }

  const handlePause = () => {
    if (audioRef.current) audioRef.current.pause()
    setPaused(true); setPlaying(false)
  }

  const jump = (dir) => {
    const { deck: d, speed: spd, voice: vc, mode: md, auto, loop: lp } = playRef.current
    const next = Math.max(0, Math.min(d.length - 1, idx + dir))
    stopAll(); setIdx(next); setPaused(false)
    if (playing) setTimeout(() => playFromIdx(d, next, spd, vc, md, auto, lp), 50)
  }

  const restart = () => { stopAll(); setIdx(0); setPlaying(false); setPaused(false) }

  const handleSpeedChange = (spd) => {
    setSpeed(spd); playRef.current.speed = spd
    if (playing && !paused) {
      stopAll()
      const { deck: d, idx: i, voice: vc, mode: md, auto, loop: lp } = playRef.current
      setTimeout(() => playFromIdx(d, i, spd, vc, md, auto, lp), 50)
    }
  }

  const jumpTo = (i) => {
    const { deck: d, speed: spd, voice: vc, mode: md, auto, loop: lp } = playRef.current
    stopAll(); setIdx(i); setPaused(false)
    if (playing) setTimeout(() => playFromIdx(d, i, spd, vc, md, auto, lp), 50)
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
            <div className="header-sub">OpenAI TTS · Natural voice</div>
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

        {/* API error */}
        {apiErr && (
          <div className="api-error">
            ⚠️ {apiErr}
          </div>
        )}

        {/* ── Current card ── */}
        {currentQ && (
          <div className={`card ${playing ? 'active' : ''}`}>
            <div className={`card-header ${playing ? 'active' : ''}`}>
              <span className="cat-badge">{currentQ.category}</span>
              {loading             && <span className="status-tag loading">⏳ Loading…</span>}
              {playing && !loading && !paused && <span className="status-tag speaking">▶ Speaking…</span>}
              {paused              && <span className="status-tag paused">⏸ Paused</span>}
              <span className="card-counter">{idx + 1} / {deck.length}</span>
            </div>
            <div className="card-body">
              <div className="question">{currentQ.question}</div>
              {curSeg && (
                <div className="speaking-preview">
                  <span className="pulse-dot" />
                  <span>{curSeg.length > 160 ? curSeg.slice(0, 160) + '…' : curSeg}</span>
                </div>
              )}
            </div>
          </div>
        )}

        {/* ── Player ── */}
        <div className="player">
          <div className="speed-row">
            <span className="speed-label">Speed</span>
            {SPEEDS.map(sp => (
              <button key={sp} className={`speed-btn ${speed === sp ? 'active' : ''}`} onClick={() => handleSpeedChange(sp)}>
                {sp}x
              </button>
            ))}
          </div>

          <div className="controls">
            <button className="btn-ghost" onClick={restart} title="Restart">↩</button>
            <button className="btn-secondary" onClick={() => jump(-1)} disabled={idx === 0}>⏮</button>
            {playing && !paused
              ? <button className="btn-primary" onClick={handlePause}>⏸</button>
              : <button className={`btn-primary ${loading ? 'btn-loading' : ''}`} onClick={handlePlay} disabled={deck.length === 0 || loading}>
                  {loading ? <span className="spin-icon spin-white" /> : '▶'}
                </button>
            }
            <button className="btn-secondary" onClick={() => jump(1)} disabled={idx === deck.length - 1}>⏭</button>
            <button className={`btn-loop ${loop ? 'active' : ''}`} onClick={() => setLoop(l => !l)} title="Loop">🔁</button>
          </div>

          <div className="progress-bar"><div className="progress-fill" style={{ width: `${pct}%` }} /></div>
          <div className="progress-row">
            <span>{idx + 1} of {deck.length}</span>
            <span>{mode === 'question' ? 'Questions only' : 'Full STAR'} · {speed}x · {voice}</span>
          </div>
        </div>

        {/* ── Settings ── */}
        <div className="section">
          <div className="section-label">Settings</div>

          {/* Voice */}
          <div style={{ marginBottom: 14 }}>
            <div className="setting-label">Voice</div>
            <div className="pill-row">
              {VOICES.map(v => (
                <button
                  key={v.id}
                  className={`pill ${voice === v.id ? 'active' : ''}`}
                  onClick={() => { setVoice(v.id); stopAll(); setPlaying(false) }}
                >
                  {v.label}
                </button>
              ))}
            </div>
          </div>

          {/* Mode */}
          <div style={{ marginBottom: 14 }}>
            <div className="setting-label">Read Mode</div>
            <div className="pill-row">
              <button className={`pill ${mode === 'question' ? 'active' : ''}`} onClick={() => { setMode('question'); stopAll(); setPlaying(false) }}>Question Only</button>
              <button className={`pill ${mode === 'full'     ? 'active' : ''}`} onClick={() => { setMode('full');     stopAll(); setPlaying(false) }}>Full Q&A (STAR)</button>
            </div>
          </div>

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

        {/* ── Category ── */}
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
