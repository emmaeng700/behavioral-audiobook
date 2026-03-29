export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end()

  const { text, voice = 'nova', speed = 1 } = req.body
  if (!text || typeof text !== 'string') return res.status(400).json({ error: 'text required' })

  const apiKey = process.env.OPENAI_API_KEY
  if (!apiKey) return res.status(503).json({ error: 'OPENAI_API_KEY not configured on server' })

  try {
    const response = await fetch('https://api.openai.com/v1/audio/speech', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'tts-1',
        input: text.slice(0, 4096), // OpenAI max
        voice,
        speed,
      }),
    })

    if (!response.ok) {
      const msg = await response.text()
      return res.status(response.status).json({ error: msg })
    }

    const buffer = await response.arrayBuffer()
    res.setHeader('Content-Type', 'audio/mpeg')
    res.setHeader('Cache-Control', 'public, max-age=604800') // 7 days
    res.send(Buffer.from(buffer))
  } catch (err) {
    res.status(500).json({ error: String(err) })
  }
}
