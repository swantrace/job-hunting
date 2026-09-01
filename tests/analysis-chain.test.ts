import { describe, expect, mock, test } from 'bun:test'
import { autoChainCandidateAnalysis } from '../src/lib/analysis-chain'

describe('auto-chained candidate analysis', () => {
  test('enqueues candidate analysis for the completed job analysis application', async () => {
    const enqueue = mock(async () => ({ run: { id: 1 }, reused: false }))
    await autoChainCandidateAnalysis(7, enqueue)
    expect(enqueue).toHaveBeenCalledWith(7)
  })

  test('swallows an enqueue failure so the job analysis run stays completed', async () => {
    const enqueue = mock(async () => {
      throw new Error('boom')
    })
    await expect(autoChainCandidateAnalysis(7, enqueue)).resolves.toBeUndefined()
    expect(enqueue).toHaveBeenCalledWith(7)
  })
})
