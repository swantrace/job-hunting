import type { Child } from 'hono/jsx'

export type FieldBaseProps = {
  id?: string
  namespace?: string
  name: string
  label: string
  value?: string | number | null
  required?: boolean
  disabled?: boolean
  placeholder?: string
  help?: string
  error?: string
  message?: string
  labelAction?: Child
}

export type InputFieldProps = FieldBaseProps & {
  type?: string
  list?: string
  maxLength?: number
  externalUrl?: string | null
  dataPrimaryInput?: boolean
}

export type SelectFieldProps = FieldBaseProps & {
  multiple?: boolean
  children: Child
}

export type TextareaFieldProps = FieldBaseProps & {
  rows?: number
  maxLength?: number
}

export type FileFieldProps = FieldBaseProps & {
  accept?: string
  multiple?: boolean
}
