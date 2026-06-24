import OpenAI from 'openai'
import { config } from '../config.js'

// OpenRouter: free tier, no per-request token cap
// https://openrouter.ai — sign up with email only
const client = new OpenAI({
  baseURL: 'https://openrouter.ai/api/v1',
  apiKey: config.OPENROUTER_API_KEY,
})

export async function generate(prompt: string): Promise<string> {
  const completion = await client.chat.completions.create({
    model: 'meta-llama/llama-3.3-70b-instruct:free',
    messages: [{ role: 'user', content: prompt }],
    temperature: 0,
  })
  return completion.choices[0]?.message?.content ?? ''
}

// Extract and parse JSON from model response, handling preamble text and code fences
export function parseJson<T>(raw: string): T {
  // Strip markdown code fences
  let text = raw.replace(/```(?:json)?\n?/g, '').replace(/```/g, '').trim()

  // Find the first [ or { — skip any preamble text the model adds
  const start = text.search(/[\[{]/)
  if (start > 0) text = text.slice(start)

  // Find the last matching ] or } to strip trailing text
  const lastArr = text.lastIndexOf(']')
  const lastObj = text.lastIndexOf('}')
  const end = Math.max(lastArr, lastObj)
  if (end !== -1 && end < text.length - 1) text = text.slice(0, end + 1)

  try {
    return JSON.parse(text) as T
  } catch (e) {
    console.error('[parseJson] raw response (first 500 chars):', raw.slice(0, 500))
    throw e
  }
}
