import { useState, useEffect, useCallback, useRef } from 'react'
import questions from './data/behavioral_questions.json'

// ── Constants ─────────────────────────────────────────────────────────────────

const CATEGORIES = ['All', ...Array.from(new Set(questions.map(q => q.category))).sort()]
const SPEEDS = [0.75, 0.85, 1, 1.25, 1.5, 2]

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

// ── Styles ────────────────────────────────────────────────────────────────────

const s = {
  app: { minHeight: '100vh', background: 'linear-gradient(135deg, #f8f7ff 0%, #ede9fe 100%)', paddingBottom: 40 },
  header: { background: '#fff', borderBottom: '1px solid #e5e7eb', padding: '0 20px', position: 'sticky', top: 0, zIndex: 10, boxShadow: '0 1px 4px rgba(0,0,0,0.06)' },
  headerInner: { maxWidth: 640, margin: '0 auto', height: 56, display: 'flex', alignItems: 'center', gap: 12 },
  logo: { width: 36, height: 36, borderRadius: 12, background: 'linear-gradient(135deg, #7c3aed, #4f46e5)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18 },
  title: { fontWeight: 800, fontSize: 18, color: '#1a1a2e' },
  sub: { fontSize: 12, color: '#9ca3af', fontWeight: 500 },
  body: { maxWidth: 640, margin: '0 auto', padding: '20px 16px', display: 'flex', flexDirection: 'column', gap: 16 },

  // Card
  card: (active) => ({
    background: '#fff',
    borderRadius: 20,
    border: active ? '2px solid #7c3aed' : '1px solid #e5e7eb',
    boxShadow: active ? '0 0 0 4px rgba(124,58,237,0.08)' : '0 2px 8px rgba(0,0,0,0.04)',
    overflow: 'hidden',
    transition: 'all 0.2s ease',
  }),
  cardHeader: (active) => ({
    padding: '12px 16px 10px',
    borderBottom: '1px solid #f3f4f6',
    background: active ? 'linear-gradient(135deg, #f5f3ff, #ede9fe)' : '#fafafa',
    display: 'flex',
    alignItems: 'center',
    gap: 10,
    flexWrap: 'wrap',
  }),
  catBadge: { fontSize: 11, fontWeight: 700, padding: '3px 10px', borderRadius: 999, background: '#ede9fe', color: '#7c3aed', border: '1px solid #ddd6fe' },
  counter: { marginLeft: 'auto', fontSize: 11, color: '#9ca3af', fontWeight: 600 },
  cardBody: { padding: '16px' },
  question: { fontSize: 17, fontWeight: 700, color: '#1a1a2e', lineHeight: 1.4 },
  speaking: {
    marginTop: 12,
    padding: '10px 14px',
    background: '#f5f3ff',
    borderRadius: 12,
    fontSize: 12,
    color: '#6d28d9',
    lineHeight: 1.5,
    fontStyle: 'italic',
    display: 'flex',
    alignItems: 'flex-start',
    gap: 8,
  },
  dot: {
    width: 7, height: 7, borderRadius: '50%', background: '#7c3aed',
    flexShrink: 0, marginTop: 4,
    animation: 'pulse 1s ease-in-out infinite',
  },

  // Section
  section: { background: '#fff', borderRadius: 20, border: '1px solid #e5e7eb', padding: '16px', boxShadow: '0 2px 8px rgba(0,0,0,0.04)' },
  sectionLabel: { fontSize: 11, fontWeight: 700, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 10 },

  // Pill row
  pillRow: { display: 'flex', flexWrap: 'wrap', gap: 6 },
  pill: (active, color = '#7c3aed') => ({
    padding: '5px 12px', borderRadius: 999, fontSize: 12, fontWeight: 600, cursor: 'pointer', border: '1px solid',
    background: active ? color : '#fff',
    color: active ? '#fff' : '#6b7280',
    borderColor: active ? color : '#e5e7eb',
    transition: 'all 0.15s',
  }),

  // Player
  player: { background: '#fff', borderRadius: 20, border: '1px solid #e5e7eb', padding: '20px 16px', boxShadow: '0 4px 16px rgba(124,58,237,0.08)' },
  speedRow: { display: 'flex', alignItems: 'center', gap: 6, justifyContent: 'center', marginBottom: 16 },
  speedLabel: { fontSize: 12, color: '#9ca3af', fontWeight: 600, marginRight: 4 },
  speedBtn: (active) => ({
    padding: '4px 10px', borderRadius: 8, fontSize: 12, fontWeight: 700, cursor: 'pointer',
    border: '1px solid', background: active ? '#7c3aed' : '#f9fafb',
    color: active ? '#fff' : '#6b7280', borderColor: active ? '#7c3aed' : '#e5e7eb',
    transition: 'all 0.15s',
  }),
  controls: { display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10, marginBottom: 16 },
  btn: (variant = 'ghost') => ({
    display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: 14, cursor: 'pointer', border: '1px solid',
    ...(variant === 'primary' ? {
      width: 60, height: 60, background: 'linear-gradient(135deg, #7c3aed, #4f46e5)', color: '#fff', borderColor: 'transparent', boxShadow: '0 4px 14px rgba(124,58,237,0.4)', fontSize: 24,
    } : variant === 'secondary' ? {
      width: 48, height: 48, background: '#fff', color: '#374151', borderColor: '#e5e7eb', fontSize: 20,
    } : {
      width: 38, height: 38, background: '#f9fafb', color: '#9ca3af', borderColor: '#e5e7eb', fontSize: 16,
    }),
  }),
  progress: { marginTop: 4 },
  progressBar: { height: 4, background: '#e5e7eb', borderRadius: 999, overflow: 'hidden', marginBottom: 6 },
  progressFill: (pct) => ({ height: '100%', width: `${pct}%`, background: 'linear-gradient(90deg, #7c3aed, #4f46e5)', borderRadius: 999, transition: 'width 0.3s ease' }),
  progressRow: { display: 'flex', justifyContent: 'space-between', fontSize: 11, color: '#9ca3af', fontWeight: 600 },

  // Playlist
  playlist: { background: '#fff', borderRadius: 20, border: '1px solid #e5e7eb', padding: '16px', boxShadow: '0 2px 8px rgba(0,0,0,0.04)' },
  listItem: (active) => ({
    display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px', borderRadius: 12,
    cursor: 'pointer', marginBottom: 4, border: '1px solid',
    background: active ? '#f5f3ff' : '#fff',
    borderColor: active ? '#ddd6fe' : '#f3f4f6',
    transition: 'all 0.15s',
  }),
  listNum: (active) => ({
    width: 22, height: 22, borderRadius: '50%', fontSize: 11, fontWeight: 700,
    display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
    background: active ? '#7c3aed' : '#f3f4f6',
    color: active ? '#fff' : '#9ca3af',
  }),
  listCat: { fontSize: 10, fontWeight: 700, color: '#7c3aed', background: '#ede9fe', padding: '2px 7px', borderRadius: 6, flexShrink: 0 },
  listQ: { fontSize: 12, fontWeight: 600, color: '#374151', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1 },
}

// ── Keyframe injection ────────────────────────────────────────────────────────

const style = document.createElement('style')
style.textContent = `@keyframes pulse { 0%,100%{opacity:1} 50%{opacity:0.3} }`
document.head.appendChild(style)

// ── App ───────────────────────────────────────────────────────────────────────

export default function App() {
  const [cat, setCat] = useState('All')
  const [mode, setMode] = useState('full')   // 'question' | 'full'
  const [speed, setSpeed] = useState(0.85)
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
  const playRef = useRef({ deck: [], idx: 0, speed: 1, voiceIdx: 0, mode: 'full', auto: true, loop: true })

  // Load voices and auto-select a male English voice
  useEffect(() => {
    const load = () => {
      const all = window.speechSynthesis.getVoices()
      const en = all.filter(v => v.lang.startsWith('en'))
      if (!en.length) return
      setVoices(en)
      // Prefer known female voices by name keywords
      const femaleKeywords = ['female', 'samantha', 'victoria', 'karen', 'moira', 'fiona', 'tessa', 'veena', 'zira', 'hazel', 'susan', 'kate', 'sara', 'anna', 'lisa', 'linda', 'emily', 'allison', 'ava', 'google uk english female']
      const femaleIdx = en.findIndex(v => femaleKeywords.some(k => v.name.toLowerCase().includes(k)))
      if (femaleIdx !== -1) setVoiceIdx(femaleIdx)
    }
    load()
    window.speechSynthesis.addEventListener('voiceschanged', load)
    return () => window.speechSynthesis.removeEventListener('voiceschanged', load)
  }, [])

  // Build deck on category change
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

  // ── Core speak logic ────────────────────────────────────────────────────────

  const speakQueue = useCallback((texts, pos, spd, voice, onDone) => {
    if (stopFlag.current || pos >= texts.length) {
      if (!stopFlag.current) onDone()
      return
    }
    const text = texts[pos]
    setCurrentText(text)
    const utt = new SpeechSynthesisUtterance(text)
    utt.rate = spd
    if (voice) utt.voice = voice
    utt.onend = () => speakQueue(texts, pos + 1, spd, voice, onDone)
    utt.onerror = () => { if (!stopFlag.current) onDone() }
    window.speechSynthesis.speak(utt)
  }, [])

  const playFromIdx = useCallback((d, i, spd, vi, md, auto, lp) => {
    if (i < 0 || i >= d.length) return
    const q = d[i]
    const texts = buildTexts(q, md)
    stopFlag.current = false
    setIdx(i)
    setPlaying(true)
    setPaused(false)

    const voice = voices[vi]
    speakQueue(texts, 0, spd, voice, () => {
      setCurrentText('')
      const next = i + 1
      if (auto && next < d.length) {
        playFromIdx(d, next, spd, vi, md, auto, lp)
      } else if (auto && lp && next >= d.length) {
        // Loop: restart from beginning
        playFromIdx(d, 0, spd, vi, md, auto, lp)
      } else {
        setPlaying(false)
        setPaused(false)
        setIdx(0)
      }
    })
  }, [voices, speakQueue])

  // ── Controls ────────────────────────────────────────────────────────────────

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
    stopAll()
    setIdx(next)
    setPaused(false)
    if (playing) setTimeout(() => playFromIdx(d, next, spd, vi, md, auto, lp), 50)
  }

  const restart = () => {
    stopAll()
    setIdx(0)
    setPlaying(false)
    setPaused(false)
  }

  const handleSpeedChange = (spd) => {
    setSpeed(spd)
    playRef.current.speed = spd
    if (playing && !paused) {
      stopAll()
      const { deck: d, idx: i, voiceIdx: vi, mode: md, auto, loop: lp } = playRef.current
      setTimeout(() => playFromIdx(d, i, spd, vi, md, auto, lp), 50)
    }
  }

  const jumpTo = (i) => {
    const { deck: d, speed: spd, voiceIdx: vi, mode: md, auto, loop: lp } = playRef.current
    stopAll()
    setIdx(i)
    setPaused(false)
    if (playing) setTimeout(() => playFromIdx(d, i, spd, vi, md, auto, lp), 50)
  }

  const currentQ = deck[idx] || null
  const pct = deck.length ? ((idx + 1) / deck.length) * 100 : 0

  return (
    <div style={s.app}>
      {/* Header */}
      <header style={s.header}>
        <div style={s.headerInner}>
          <div style={s.logo}>🎧</div>
          <div>
            <div style={s.title}>Behavioral Audiobook</div>
            <div style={s.sub}>Web Speech API · Works offline</div>
          </div>
        </div>
      </header>

      <div style={s.body}>

        {/* Current card */}
        {currentQ && (
          <div style={s.card(playing)}>
            <div style={s.cardHeader(playing)}>
              <span style={s.catBadge}>{currentQ.category}</span>
              {playing && !paused && <span style={{ fontSize: 11, color: '#7c3aed', fontWeight: 700 }}>▶ Speaking…</span>}
              {paused && <span style={{ fontSize: 11, color: '#f59e0b', fontWeight: 700 }}>⏸ Paused</span>}
              <span style={s.counter}>{idx + 1} / {deck.length}</span>
            </div>
            <div style={s.cardBody}>
              <div style={s.question}>{currentQ.question}</div>
              {currentText && (
                <div style={s.speaking}>
                  <span style={s.dot} />
                  <span>{currentText.length > 160 ? currentText.slice(0, 160) + '…' : currentText}</span>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Settings */}
        <div style={s.section}>
          <div style={s.sectionLabel}>Settings</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            {/* Mode */}
            <div>
              <div style={{ fontSize: 12, fontWeight: 600, color: '#6b7280', marginBottom: 8 }}>Read Mode</div>
              <div style={s.pillRow}>
                <button style={s.pill(mode === 'question')} onClick={() => { setMode('question'); stopAll(); setPlaying(false) }}>Question Only</button>
                <button style={s.pill(mode === 'full')} onClick={() => { setMode('full'); stopAll(); setPlaying(false) }}>Full Q&A (STAR)</button>
              </div>
            </div>

            {/* Voice */}
            {voices.length > 0 && (
              <div>
                <div style={{ fontSize: 12, fontWeight: 600, color: '#6b7280', marginBottom: 8 }}>Voice</div>
                <select
                  value={voiceIdx}
                  onChange={e => setVoiceIdx(Number(e.target.value))}
                  style={{ width: '100%', padding: '8px 12px', borderRadius: 10, border: '1px solid #e5e7eb', fontSize: 13, color: '#374151', background: '#fafafa', outline: 'none' }}
                >
                  {voices.map((v, i) => <option key={v.name} value={i}>{v.name} ({v.lang})</option>)}
                </select>
              </div>
            )}

            {/* Auto-advance */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <span style={{ fontSize: 12, fontWeight: 600, color: '#6b7280' }}>Auto-advance to next</span>
              <button onClick={() => setAutoAdvance(a => !a)} style={{ ...s.pill(autoAdvance), padding: '5px 16px' }}>
                {autoAdvance ? 'On' : 'Off'}
              </button>
            </div>

            {/* Loop */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div>
                <span style={{ fontSize: 12, fontWeight: 600, color: '#6b7280' }}>🔁 Loop playlist</span>
                <div style={{ fontSize: 11, color: '#9ca3af' }}>Restarts from beginning when done</div>
              </div>
              <button onClick={() => setLoop(l => !l)} style={{ ...s.pill(loop), padding: '5px 16px' }}>
                {loop ? 'On' : 'Off'}
              </button>
            </div>
          </div>
        </div>

        {/* Category filter */}
        <div style={s.section}>
          <div style={s.sectionLabel}>Category · {deck.length} questions</div>
          <div style={s.pillRow}>
            {CATEGORIES.map(c => (
              <button key={c} style={s.pill(cat === c)} onClick={() => setCat(c)}>{c}</button>
            ))}
          </div>
        </div>

        {/* Player */}
        <div style={s.player}>
          {/* Speed */}
          <div style={s.speedRow}>
            <span style={s.speedLabel}>Speed</span>
            {SPEEDS.map(sp => (
              <button key={sp} style={s.speedBtn(speed === sp)} onClick={() => handleSpeedChange(sp)}>{sp}x</button>
            ))}
          </div>

          {/* Controls */}
          <div style={s.controls}>
            <button style={s.btn('ghost')} onClick={restart} title="Restart">↩</button>
            <button style={s.btn('secondary')} onClick={() => jump(-1)} disabled={idx === 0} title="Previous">⏮</button>
            {playing && !paused
              ? <button style={s.btn('primary')} onClick={handlePause}>⏸</button>
              : <button style={s.btn('primary')} onClick={handlePlay} disabled={deck.length === 0}>▶</button>
            }
            <button style={s.btn('secondary')} onClick={() => jump(1)} disabled={idx === deck.length - 1} title="Next">⏭</button>
            <button
              style={{ ...s.btn('ghost'), fontSize: 11, fontWeight: 700, color: loop ? '#7c3aed' : '#9ca3af', width: 'auto', padding: '0 10px', height: 38 }}
              onClick={() => setLoop(l => !l)}
              title="Toggle loop"
            >
              🔁
            </button>
          </div>

          {/* Progress */}
          <div style={s.progress}>
            <div style={s.progressBar}><div style={s.progressFill(pct)} /></div>
            <div style={s.progressRow}>
              <span>{idx + 1} of {deck.length}</span>
              <span>{mode === 'question' ? 'Question only' : 'Full STAR'} · {speed}x</span>
            </div>
          </div>
        </div>

        {/* Playlist */}
        <div style={s.playlist}>
          <div style={s.sectionLabel}>Playlist</div>
          <div style={{ maxHeight: 360, overflowY: 'auto' }}>
            {deck.map((q, i) => (
              <div key={q.id} style={s.listItem(i === idx)} onClick={() => jumpTo(i)}>
                <span style={s.listNum(i === idx)}>
                  {i === idx && playing && !paused ? '▶' : i + 1}
                </span>
                <span style={s.listCat}>{q.category.slice(0, 8)}</span>
                <span style={s.listQ}>{q.question}</span>
              </div>
            ))}
          </div>
        </div>

      </div>
    </div>
  )
}
