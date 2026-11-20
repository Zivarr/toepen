import { useEffect, useState } from 'preact/hooks'

/** Shows a short message from anywhere via toast(). Mount <ToastHost /> once. */
export function toast(message: string): void {
  window.dispatchEvent(new CustomEvent('toepen:toast', { detail: message }))
}

export function ToastHost() {
  const [msg, setMsg] = useState<string | null>(null)
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined
    const on = (e: Event) => {
      setMsg((e as CustomEvent<string>).detail)
      clearTimeout(timer)
      timer = setTimeout(() => setMsg(null), 3500)
    }
    window.addEventListener('toepen:toast', on)
    return () => {
      window.removeEventListener('toepen:toast', on)
      clearTimeout(timer)
    }
  }, [])
  return msg ? (
    <div class="toast" role="status">
      {msg}
    </div>
  ) : null
}
