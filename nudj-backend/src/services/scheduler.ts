// Cron jobs — stub for Week 4
import cron from 'node-cron'

export function startScheduler(): void {
  // 9am IST daily (IST = UTC+5:30 → 03:30 UTC)
  cron.schedule('30 3 * * *', async () => {
    console.log('[cron] daily alert job — not yet implemented')
  })

  // Weekly digest — every Monday 9am IST
  cron.schedule('30 3 * * 1', async () => {
    console.log('[cron] weekly digest — not yet implemented')
  })

  // Monthly summary — 1st of month 9am IST
  cron.schedule('30 3 1 * *', async () => {
    console.log('[cron] monthly summary — not yet implemented')
  })

  console.log('[scheduler] jobs registered')
}
