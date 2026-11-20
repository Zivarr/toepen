import { Button } from './Button'
import { Dialog } from './Dialog'

export function ConfirmDialog(props: {
  title: string
  message: string
  confirmLabel?: string
  danger?: boolean
  onConfirm: () => void
  onCancel: () => void
}) {
  return (
    <Dialog title={props.title} onClose={props.onCancel}>
      <p>{props.message}</p>
      <div class="dialog-actions">
        <Button variant="ghost" onClick={props.onCancel}>
          Annuleren
        </Button>
        <Button variant={props.danger ? 'danger' : 'primary'} onClick={props.onConfirm}>
          {props.confirmLabel ?? 'OK'}
        </Button>
      </div>
    </Dialog>
  )
}
