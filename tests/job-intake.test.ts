import { describe, expect, mock, test } from 'bun:test'
import { stripScriptsAndStyles } from '../src/lib/job-intake-fetch'
import { processJobIntakeItem } from '../src/lib/job-intake-queue'

describe('job posting extraction', () => {
  test('strips scripts, styles, and markup while decoding entities', () => {
    const html = [
      '<html><head><style>.x{color:red}</style></head>',
      '<body><script>alert(1)</script>',
      '<h1>Senior Engineer</h1>',
      '<p>Build FHIR &amp; SMART apps.</p></body></html>',
    ].join('')
    const text = stripScriptsAndStyles(html)
    expect(text).toContain('Senior Engineer')
    expect(text).toContain('Build FHIR & SMART apps.')
    expect(text).not.toContain('alert(1)')
    expect(text).not.toContain('<script')
    expect(text).not.toContain('<style')
  })
})

describe('job intake item processing', () => {
  test('marks a blocked URL as needs-pasted-text without calling the model path', async () => {
    const markNeeds = mock(() => {})
    const markReady = mock(() => {})
    const enqueueAnalysis = mock(async () => ({
      run: null,
      reused: false,
      reason: 'missing-posting',
    }))
    mock.module('../src/db/job-intake', () => ({
      getJobIntakeItem: () => ({
        id: 1,
        kind: 'url',
        raw: 'https://blocked.example.com/job',
        normalizedUrl: 'https://blocked.example.com/job',
        status: 'pending',
      }),
      markJobIntakeItemProcessing: () => {},
      markJobIntakeItemNeedsPastedText: markNeeds,
      markJobIntakeItemReady: markReady,
      markJobIntakeItemFailed: () => {},
      createIntakeApplication: () => ({ applicationId: 1, postingId: 1 }),
    }))
    mock.module('../src/lib/job-intake-fetch', () => ({
      fetchJobPostingText: mock(async () => ({ ok: false, reason: 'The site returned HTTP 403.' })),
    }))
    mock.module('../src/lib/job-analysis-queue', () => ({
      enqueueJobAnalysis: enqueueAnalysis,
    }))

    await processJobIntakeItem(1)

    expect(markNeeds).toHaveBeenCalledWith(1, 'The site returned HTTP 403.')
    expect(markReady).not.toHaveBeenCalled()
    expect(enqueueAnalysis).not.toHaveBeenCalled()
  })

  test('creates an application and queues analysis for pasted text', async () => {
    const markNeeds = mock(() => {})
    const markReady = mock(() => {})
    const enqueueAnalysis = mock(async () => ({ run: { id: 1 }, reused: false }))
    const createApplication = mock(() => ({ applicationId: 7, postingId: 9 }))
    mock.module('../src/db/job-intake', () => ({
      getJobIntakeItem: () => ({
        id: 2,
        kind: 'text',
        raw: 'Senior Engineer at Example Co.',
        normalizedUrl: null,
        status: 'pending',
      }),
      markJobIntakeItemProcessing: () => {},
      markJobIntakeItemNeedsPastedText: markNeeds,
      markJobIntakeItemReady: markReady,
      markJobIntakeItemFailed: () => {},
      createIntakeApplication: createApplication,
    }))
    mock.module('../src/lib/job-intake-fetch', () => ({
      fetchJobPostingText: mock(async () => ({ ok: true, text: 'text' })),
    }))
    mock.module('../src/lib/job-analysis-queue', () => ({
      enqueueJobAnalysis: enqueueAnalysis,
    }))

    await processJobIntakeItem(2)

    expect(createApplication).toHaveBeenCalled()
    expect(enqueueAnalysis).toHaveBeenCalledWith(9)
    expect(markReady).toHaveBeenCalledWith(2, {
      jobApplicationId: 7,
      jobPostingId: 9,
      extractedText: 'Senior Engineer at Example Co.',
    })
    expect(markNeeds).not.toHaveBeenCalled()
  })
})
