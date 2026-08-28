import type { Filters } from '../../../src/db/queries'
import { AiParser } from '../AiParser'
import { Icon } from '../ui/Icon'

export function AiParserModal({ filters }: { filters: Filters }) {
  return (
    <dialog id="ai_parser_modal" class="modal">
      <div class="modal-box max-w-2xl">
        <form method="dialog">
          <button class="btn btn-sm btn-circle btn-ghost absolute right-2 top-2" aria-label="Close">
            <Icon name="close" />
          </button>
        </form>
        <h3 class="text-lg font-bold">Parse a job post</h3>
        <div class="py-2">
          <AiParser filters={filters} />
        </div>
      </div>
      <form method="dialog" class="modal-backdrop">
        <button>close</button>
      </form>
    </dialog>
  )
}
