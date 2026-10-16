function checkboxes() {
  return [...document.querySelectorAll<HTMLInputElement>('#board [data-application-selection]')]
}

export function updateApplicationSelection() {
  const inputs = checkboxes()
  const selected = new Set(inputs.filter((input) => input.checked).map((input) => input.value))
  const total = new Set(inputs.map((input) => input.value)).size
  const all = document.querySelector<HTMLInputElement>('[data-select-all-applications]')
  if (all) {
    all.checked = total > 0 && selected.size === total
    all.indeterminate = selected.size > 0 && selected.size < total
  }
  const count = document.querySelector('[data-application-selection-count]')
  if (count) count.textContent = `${selected.size} selected`
  const run = document.querySelector<HTMLButtonElement>('[data-run-batch-analysis]')
  if (run) run.disabled = selected.size === 0 || selected.size > 200
}

document.addEventListener('change', (event) => {
  const input = event.target
  if (!(input instanceof HTMLInputElement)) return
  if (input.matches('[data-select-all-applications]')) {
    for (const checkbox of checkboxes()) checkbox.checked = input.checked
  } else if (input.matches('[data-application-selection]')) {
    // Desktop and mobile render the same item. Keep both controls synchronized.
    for (const checkbox of checkboxes()) {
      if (checkbox.value === input.value) checkbox.checked = input.checked
    }
  } else return
  updateApplicationSelection()
})

document.addEventListener('click', (event) => {
  if (
    !(event.target instanceof Element) ||
    !event.target.closest('[data-clear-application-selection]')
  )
    return
  for (const checkbox of checkboxes()) checkbox.checked = false
  updateApplicationSelection()
})
