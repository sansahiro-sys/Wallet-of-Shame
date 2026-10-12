import { useEffect, type ReactNode } from 'react'
import { useI18n } from '../i18n'
import { Icon } from './Icon'

interface Props {
  open: boolean
  onClose: () => void
  title?: string
  children: ReactNode
}

export function Sheet({ open, onClose, title, children }: Props) {
  const { t } = useI18n()

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      window.removeEventListener('keydown', onKey)
      document.body.style.overflow = prev
    }
  }, [open, onClose])

  if (!open) return null

  return (
    <div className="anim-fade fixed inset-0 z-50 flex items-end justify-center">
      <button
        aria-label={t('common.close')}
        onClick={onClose}
        className="absolute inset-0 cursor-default bg-scrim backdrop-blur-sm"
      />
      <div className="anim-sheet relative max-h-[92vh] w-full max-w-md overflow-y-auto rounded-t-3xl border-t border-crimson/40 bg-ink-2 pb-8 shadow-[0_-24px_60px_rgba(0,0,0,0.8)]">
        <div className="sticky top-0 z-10 flex items-center justify-between gap-3 border-b border-white/5 bg-ink-2/95 px-4 pb-3 pt-4 backdrop-blur">
          <div className="absolute left-1/2 top-1.5 h-1 w-10 -translate-x-1/2 rounded-full bg-white/15" />
          <h2 className="mt-1 font-display text-lg text-bone">{title}</h2>
          <button
            onClick={onClose}
            aria-label={t('common.close')}
            className="mt-1 rounded-lg p-1.5 text-ash transition hover:bg-white/5 hover:text-bone"
          >
            <Icon name="close" />
          </button>
        </div>
        <div className="px-4 pt-4">{children}</div>
      </div>
    </div>
  )
}
