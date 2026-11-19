import type { ComponentChildren, JSX } from 'preact'

type Props = JSX.IntrinsicElements['button'] & {
  variant?: 'primary' | 'secondary' | 'danger' | 'ghost'
  children?: ComponentChildren
}

export function Button({ variant = 'primary', class: cls, children, ...rest }: Props) {
  return (
    <button type="button" class={`btn btn-${variant} ${cls ?? ''}`} {...rest}>
      {children}
    </button>
  )
}
