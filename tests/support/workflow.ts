/** Bound asynchronous Engine assertions without triggering work from status reads. */
export async function waitFor(check: () => boolean, timeout = 5000) {
  const deadline = Date.now() + timeout
  while (!check()) {
    if (Date.now() >= deadline) throw new Error('Timed out waiting for the analysis workflow.')
    await Bun.sleep(10)
  }
}
