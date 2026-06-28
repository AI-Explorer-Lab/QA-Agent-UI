<template>
  <div class="markdown-renderer">
    <template v-for="(block, blockIndex) in blocks" :key="block.type + '-' + blockIndex">
      <component :is="`h${block.level}`" v-if="block.type === 'heading'" class="markdown-heading">
        <template v-for="(part, partIndex) in block.parts" :key="partIndex">
          <button
            v-if="part.kind === 'citation'"
            class="citation-pill"
            type="button"
            @click="$emit('focus-citation', part.text)"
          >
            [{{ part.text }}]
          </button>
          <strong v-else-if="part.kind === 'strong'">{{ part.text }}</strong>
          <span v-else>{{ part.text }}</span>
        </template>
      </component>

      <p v-if="block.type === 'paragraph'" class="markdown-paragraph">
        <template v-for="(part, partIndex) in block.parts" :key="partIndex">
          <button
            v-if="part.kind === 'citation'"
            class="citation-pill"
            type="button"
            @click="$emit('focus-citation', part.text)"
          >
            [{{ part.text }}]
          </button>
          <strong v-else-if="part.kind === 'strong'">{{ part.text }}</strong>
          <span v-else>{{ part.text }}</span>
        </template>
      </p>

      <ul v-else-if="block.type === 'list'" class="markdown-list">
        <li v-for="(item, itemIndex) in block.items" :key="itemIndex">
          <template v-for="(part, partIndex) in item" :key="partIndex">
            <button
              v-if="part.kind === 'citation'"
              class="citation-pill"
              type="button"
              @click="$emit('focus-citation', part.text)"
          >
            [{{ part.text }}]
          </button>
          <strong v-else-if="part.kind === 'strong'">{{ part.text }}</strong>
          <span v-else>{{ part.text }}</span>
        </template>
      </li>
      </ul>

      <div v-else-if="block.type === 'table'" class="markdown-table-block">
        <div class="markdown-table-wrap">
          <table>
            <thead v-if="block.headers.length">
              <tr>
                <th v-for="(header, headerIndex) in block.headers" :key="headerIndex">{{ header }}</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="(row, rowIndex) in block.rows" :key="rowIndex">
                <td v-for="(cell, cellIndex) in normalizedRow(row, block.columnCount)" :key="cellIndex">
                  {{ cell }}
                </td>
              </tr>
            </tbody>
          </table>
        </div>
        <div v-if="block.citationIds.length" class="markdown-table-citations">
          <button
            v-for="citationId in block.citationIds"
            :key="citationId"
            class="citation-pill"
            type="button"
            @click="$emit('focus-citation', citationId)"
          >
            [{{ citationId }}]
          </button>
        </div>
      </div>
    </template>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'

type InlinePart = { kind: 'text' | 'citation' | 'strong'; text: string }
type MarkdownBlock =
  | { type: 'heading'; level: 1 | 2 | 3 | 4; parts: InlinePart[] }
  | { type: 'paragraph'; parts: InlinePart[] }
  | { type: 'list'; items: InlinePart[][] }
  | { type: 'table'; headers: string[]; rows: string[][]; citationIds: string[]; columnCount: number }

const props = defineProps<{
  content: string
}>()

defineEmits<{
  (event: 'focus-citation', citationId: string): void
}>()

const blocks = computed(() => parseMarkdown(props.content || ''))

function parseMarkdown(source: string): MarkdownBlock[] {
  const lines = source.replace(/\r\n/g, '\n').split('\n')
  const result: MarkdownBlock[] = []
  let index = 0

  while (index < lines.length) {
    const trimmed = lines[index].trim()
    if (!trimmed) {
      index += 1
      continue
    }

    const heading = parseHeading(trimmed)
    if (heading) {
      result.push(heading)
      index += 1
      continue
    }

    if (isTableStart(trimmed) || isTableLine(trimmed)) {
      const parsed = readTable(lines, index)
      if (parsed.block) result.push(parsed.block)
      index = parsed.nextIndex
      continue
    }

    if (isListItem(trimmed)) {
      const items: InlinePart[][] = []
      while (index < lines.length && isListItem(lines[index].trim())) {
        items.push(parseInline(stripListMarker(lines[index].trim())))
        index += 1
      }
      result.push({ type: 'list', items })
      continue
    }

    const paragraphLines: string[] = []
    while (index < lines.length) {
      const current = lines[index].trim()
      if (!current || parseHeading(current) || isTableStart(current) || isTableLine(current) || isListItem(current)) break
      paragraphLines.push(current)
      index += 1
    }
    result.push({ type: 'paragraph', parts: parseInline(paragraphLines.join('\n')) })
  }

  return result
}

function parseHeading(line: string): MarkdownBlock | null {
  const match = /^(#{1,4})\s+(.+)$/.exec(line)
  if (!match) return null
  return {
    type: 'heading',
    level: match[1].length as 1 | 2 | 3 | 4,
    parts: parseInline(match[2].trim()),
  }
}

function readTable(lines: string[], startIndex: number): { block: MarkdownBlock | null; nextIndex: number } {
  const tableRows: string[][] = []
  const citationIds = new Set<string>()
  let index = startIndex

  while (index < lines.length) {
    const rawLine = lines[index].trim()
    const citationMatches = rawLine.matchAll(CITATION_PATTERN)
    for (const match of citationMatches) {
      citationIds.add(match[1])
    }

    if (isTableEnd(rawLine)) {
      index += 1
      break
    }

    const cleaned = cleanupTableLine(rawLine)
    if (isTableLine(cleaned)) {
      tableRows.push(splitTableRow(cleaned))
      index += 1
      continue
    }

    if (isTableStart(rawLine)) {
      index += 1
      continue
    }

    if (tableRows.length > 0) break
    index += 1
  }

  const meaningfulRows = tableRows.filter((row) => !isSeparatorRow(row))
  if (!meaningfulRows.length) return { block: null, nextIndex: index }

  const hasHeaderSeparator = tableRows.length > 1 && isSeparatorRow(tableRows[1])
  const headers = hasHeaderSeparator ? meaningfulRows[0] : []
  const rows = hasHeaderSeparator ? meaningfulRows.slice(1) : meaningfulRows
  const columnCount = Math.max(headers.length, ...rows.map((row) => row.length), 1)

  return {
    block: { type: 'table', headers, rows, citationIds: Array.from(citationIds), columnCount },
    nextIndex: index,
  }
}

function parseInline(text: string): InlinePart[] {
  const parts: InlinePart[] = []
  let lastIndex = 0
  for (const match of text.matchAll(CITATION_PATTERN)) {
    if (match.index > lastIndex) {
      parts.push(...parseStrong(text.slice(lastIndex, match.index)))
    }
    parts.push({ kind: 'citation', text: match[1] })
    lastIndex = match.index + match[0].length
  }
  if (lastIndex < text.length) {
    parts.push(...parseStrong(text.slice(lastIndex)))
  }
  return parts.length ? parts : [{ kind: 'text', text }]
}

function parseStrong(text: string): InlinePart[] {
  const parts: InlinePart[] = []
  const pattern = /\*\*([^*]+)\*\*/g
  let lastIndex = 0

  for (const match of text.matchAll(pattern)) {
    if (match.index > lastIndex) {
      parts.push({ kind: 'text', text: text.slice(lastIndex, match.index) })
    }
    parts.push({ kind: 'strong', text: match[1] })
    lastIndex = match.index + match[0].length
  }

  if (lastIndex < text.length) {
    parts.push({ kind: 'text', text: text.slice(lastIndex) })
  }

  return parts.length ? parts : [{ kind: 'text', text }]
}

function cleanupTableLine(line: string): string {
  return stripListMarker(line)
    .replace(/<\/?TABLE_(START|END)>/g, '')
    .replace(CITATION_PATTERN, '')
    .trim()
}

const CITATION_PATTERN = /(?:\[|【|［)(C\d+)(?:\]|】|］)/g

function splitTableRow(line: string): string[] {
  const trimmed = line.trim().replace(/^\|/, '').replace(/\|$/, '')
  return trimmed.split('|').map((cell) => cell.trim())
}

function normalizedRow(row: string[], columnCount: number): string[] {
  return Array.from({ length: columnCount }, (_, index) => row[index] || '')
}

function isTableStart(line: string): boolean {
  return /<TABLE_START>/i.test(line)
}

function isTableEnd(line: string): boolean {
  return /<\/TABLE_END>/i.test(line)
}

function isTableLine(line: string): boolean {
  const cleaned = cleanupTableLine(line)
  return cleaned.startsWith('|') && cleaned.endsWith('|') && cleaned.includes('|')
}

function isSeparatorRow(row: string[]): boolean {
  return row.length > 0 && row.every((cell) => /^:?-{3,}:?$/.test(cell.trim()))
}

function isListItem(line: string): boolean {
  return /^([-*]|\d+\.)\s+/.test(line) && !isTableStart(line)
}

function stripListMarker(line: string): string {
  return line.replace(/^([-*]|\d+\.)\s+/, '')
}
</script>
