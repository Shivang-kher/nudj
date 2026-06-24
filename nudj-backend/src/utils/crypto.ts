import { createCipheriv, createDecipheriv, randomBytes } from 'crypto'
import { config } from '../config.js'

export function encrypt(text: string): string {
  const key = Buffer.from(config.ENCRYPTION_KEY, 'hex')
  const iv = randomBytes(16)
  const cipher = createCipheriv('aes-256-gcm', key, iv)
  const encrypted = Buffer.concat([cipher.update(text, 'utf8'), cipher.final()])
  const tag = cipher.getAuthTag()
  return Buffer.concat([iv, tag, encrypted]).toString('base64')
}

export function decrypt(data: string): string {
  const buf = Buffer.from(data, 'base64')
  const key = Buffer.from(config.ENCRYPTION_KEY, 'hex')
  const iv = buf.subarray(0, 16)
  const tag = buf.subarray(16, 32)
  const encrypted = buf.subarray(32)
  const decipher = createDecipheriv('aes-256-gcm', key, iv)
  decipher.setAuthTag(tag)
  return decipher.update(encrypted) + decipher.final('utf8')
}
