/**
 * Auto-chains the read-only Candidate Analysis after a completed Job Analysis,
 * for both single-add and batch intake. Profile confirmation and Include/Skip
 * decisions remain explicit user actions; an enqueue failure here never fails
 * the already-completed Job Analysis run.
 */
export async function autoChainCandidateAnalysis(
  jobApplicationId: number,
  enqueue: (id: number) => Promise<unknown> = async (id) => {
    const { enqueueCandidateAnalysis } = await import('./analysis-queue')
    await enqueueCandidateAnalysis(id)
  },
): Promise<void> {
  try {
    await enqueue(jobApplicationId)
  } catch (error) {
    console.error('Auto candidate analysis enqueue failed', error)
  }
}
