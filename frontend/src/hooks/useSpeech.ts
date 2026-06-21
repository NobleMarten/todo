import { useCallback, useRef, useState } from 'react'

/** Web Speech API wrapper. Returns listening state + start/stop controls. */
export function useSpeech(onResult: (text: string) => void) {
  const [listening, setListening] = useState(false)
  const [supported] = useState(
    () =>
      typeof window !== 'undefined' &&
      !!((window as any).SpeechRecognition || (window as any).webkitSpeechRecognition),
  )
  const recRef = useRef<any>(null)

  const start = useCallback(() => {
    const SR = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition
    if (!SR) return

    const rec = new SR()
    rec.continuous = false
    rec.interimResults = false
    rec.lang = ''

    rec.onstart = () => setListening(true)
    rec.onend = () => setListening(false)
    rec.onerror = () => setListening(false)
    rec.onresult = (e: any) => {
      const text = e.results[0][0].transcript.trim()
      if (text) onResult(text)
    }

    recRef.current = rec
    rec.start()
  }, [onResult])

  const stop = useCallback(() => {
    recRef.current?.stop()
    setListening(false)
  }, [])

  return { listening, supported, start, stop }
}
