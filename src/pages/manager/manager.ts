/**
 * The card manager.
 *
 * An extension page shares the extension's origin, so it reads and writes the same IndexedDB
 * the background page uses — no message plumbing needed for what is essentially a table.
 */
import {
  allCards,
  deleteCard,
  importCards,
  restoreCard,
  type Card,
} from '../../lib/store/db'
import {
  backupFilename,
  BackupError,
  parseBackup,
  toBackup,
  toCsv,
} from '../../lib/store/export'

let cards: Card[] = []
const selected = new Set<string>()

/** Deleted cards are kept here until the next action, so Undo has something to put back. */
let undoable: Card[] = []

function el<T extends HTMLElement>(id: string): T {
  const node = document.getElementById(id)
  if (!node) throw new Error(`manager: #${id} is missing`)
  return node as T
}

function matches(card: Card, query: string): boolean {
  if (query === '') return true
  const haystack = [card.front, card.back, card.context ?? '', card.sourceTitle ?? '']
    .join(' ')
    .toLowerCase()
  return haystack.includes(query)
}

function visibleCards(): Card[] {
  const query = el<HTMLInputElement>('search').value.trim().toLowerCase()
  return cards.filter((card) => matches(card, query)).sort((a, b) => b.createdAt - a.createdAt)
}

function formatDate(at: number): string {
  return new Date(at).toLocaleDateString()
}

function status(message: string, undo?: () => void): void {
  const node = el('status')
  node.replaceChildren(document.createTextNode(message))

  if (undo) {
    const button = document.createElement('button')
    button.className = 'status__undo'
    button.type = 'button'
    button.textContent = 'Undo'
    button.addEventListener('click', () => void undo())
    node.append(button)
  }

  node.hidden = false
}

function clearStatus(): void {
  el('status').hidden = true
  undoable = []
}

function render(): void {
  const rows = el('rows')
  const list = visibleCards()

  rows.replaceChildren(...list.map(renderRow))
  el('count').textContent = `${cards.length} saved`
  el('empty').hidden = cards.length !== 0

  const bulk = el('bulk')
  bulk.hidden = selected.size === 0
  el('bulk-count').textContent = `${selected.size} selected`
  el<HTMLInputElement>('pick-all').checked = list.length > 0 && selected.size === list.length
}

function renderRow(card: Card): HTMLTableRowElement {
  const row = document.createElement('tr')

  const pick = document.createElement('input')
  pick.type = 'checkbox'
  pick.checked = selected.has(card.id)
  pick.setAttribute('aria-label', `Select ${card.front}`)
  pick.addEventListener('change', () => {
    if (pick.checked) selected.add(card.id)
    else selected.delete(card.id)
    render()
  })
  row.append(cell(pick))

  const front = editable(card.front, 'cell cell--front', (value) => update(card, { front: value }))
  const frontCell = cell(front)
  if (card.context) frontCell.append(text('div', 'context', card.context))
  if (card.sourceUrl) frontCell.append(sourceLink(card))
  row.append(frontCell)

  row.append(cell(editable(card.back, 'cell', (value) => update(card, { back: value }))))
  row.append(cell(document.createTextNode(`${card.langFrom} → ${card.langTo}`), 'cards__meta'))
  row.append(cell(document.createTextNode(formatDate(card.createdAt)), 'cards__meta'))

  const remove = document.createElement('button')
  remove.className = 'rowbutton'
  remove.type = 'button'
  remove.textContent = '×'
  remove.title = `Delete ${card.front}`
  remove.setAttribute('aria-label', `Delete ${card.front}`)
  remove.addEventListener('click', () => void removeCards([card]))
  row.append(cell(remove))

  return row
}

function cell(child: Node, className = ''): HTMLTableCellElement {
  const td = document.createElement('td')
  if (className) td.className = className
  td.append(child)
  return td
}

function text(tag: string, className: string, content: string): HTMLElement {
  const node = document.createElement(tag)
  node.className = className
  node.textContent = content
  return node
}

function sourceLink(card: Card): HTMLAnchorElement {
  const link = document.createElement('a')
  link.className = 'source'
  link.href = card.sourceUrl ?? '#'
  link.target = '_blank'
  link.rel = 'noreferrer'
  link.textContent = card.sourceTitle || card.sourceUrl || ''
  return link
}

function editable(value: string, className: string, save: (next: string) => void): HTMLInputElement {
  const input = document.createElement('input')
  input.className = className
  input.value = value
  input.addEventListener('change', () => save(input.value.trim()))
  input.addEventListener('keydown', (event) => {
    if (event.key === 'Enter') input.blur()
  })
  return input
}

async function update(card: Card, patch: Partial<Card>): Promise<void> {
  const next = { ...card, ...patch, updatedAt: Date.now() }
  // restoreCard is a plain put; the name reads oddly here but the behaviour is exactly right.
  await restoreCard(next.id, next)
  await reload()
}

/** Deletion is undoable rather than confirmed: a dialog on every row would be its own chore. */
async function removeCards(doomed: Card[]): Promise<void> {
  for (const card of doomed) {
    await deleteCard(card.id)
    selected.delete(card.id)
  }

  undoable = doomed
  await reload()

  const what = doomed.length === 1 ? `“${doomed[0]!.front}” deleted.` : `${doomed.length} cards deleted.`
  status(what, async () => {
    for (const card of undoable) await restoreCard(card.id, card)
    clearStatus()
    await reload()
  })
}

function download(content: string, filename: string, type: string): void {
  const url = URL.createObjectURL(new Blob([content], { type }))
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  link.click()
  // Revoking immediately can cancel the download in some builds; a tick is enough.
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

async function reload(): Promise<void> {
  cards = await allCards()
  render()
}

async function onImportFile(file: File): Promise<void> {
  try {
    const { cards: incoming, skipped } = parseBackup(await file.text())
    const { added, replaced } = await importCards(incoming)
    await reload()

    const parts = [`${added} added`, `${replaced} updated`]
    if (skipped > 0) parts.push(`${skipped} unreadable and skipped`)
    status(`Imported: ${parts.join(', ')}.`)
  } catch (error) {
    status(error instanceof BackupError ? error.message : `Import failed: ${String(error)}`)
  }
}

async function init(): Promise<void> {
  el('search').addEventListener('input', render)

  el<HTMLInputElement>('pick-all').addEventListener('change', (event) => {
    const checked = (event.target as HTMLInputElement).checked
    selected.clear()
    if (checked) for (const card of visibleCards()) selected.add(card.id)
    render()
  })

  el('delete-selected').addEventListener('click', () => {
    void removeCards(cards.filter((card) => selected.has(card.id)))
  })

  el('export-json').addEventListener('click', () => {
    download(
      JSON.stringify(toBackup(cards), null, 2),
      backupFilename('json'),
      'application/json',
    )
  })

  el('export-csv').addEventListener('click', () => {
    download(toCsv(cards), backupFilename('csv'), 'text/csv')
  })

  const file = el<HTMLInputElement>('import-file')
  el('import').addEventListener('click', () => file.click())
  file.addEventListener('change', () => {
    const chosen = file.files?.[0]
    if (chosen) void onImportFile(chosen)
    file.value = ''
  })

  await reload()
}

void init()
