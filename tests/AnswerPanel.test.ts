import { fireEvent, render, screen } from '@testing-library/vue'
import { describe, expect, it } from 'vitest'

import AnswerPanel from '@/components/AnswerPanel.vue'
import type { CompactAskResponse } from '@/types/qa'

const response: CompactAskResponse = {
  answer:
    '# Company summary\n## 1. 公司简介\n公司简称为 **芯导科技**。【C1】\n<TABLE_START>\n| 字段 | 内容 |\n| --- | --- |\n| 公司 | 上海芯导 |\n</TABLE_END> 【C1】\n- 历史沿革见财报 【C2】',
  decision: 'answer',
  query_type: 'summarization',
  confidence: 1,
  session_id: 'session-1',
  citations: [],
  retrieval: {
    collection_name: 'default',
    trace_id: 'trace-1',
    cache_hit: false,
    evidence_count: 2,
    citation_count: 2,
    repository_collection_count: 878,
    workflow_runner: 'langgraph',
    workflow_duration_ms: 54600,
  },
}

describe('AnswerPanel', () => {
  it('replaces broken loading placeholders before rendering', () => {
    render(AnswerPanel, {
      props: {
        response: null,
        retrieval: null,
        loading: true,
        loadingMessage: '????????',
      },
    })

    expect(screen.getByText('正在生成答案，请稍等')).toBeInTheDocument()
    expect(screen.queryByText('????????')).not.toBeInTheDocument()
  })

  it('renders markdown tables and clickable citation pills', async () => {
    const rendered = render(AnswerPanel, {
      props: {
        response,
        retrieval: response.retrieval,
      },
    })

    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Company summary')
    expect(rendered.container.querySelector('.answer-badges .cache-badge')).toHaveTextContent('cache: false')
    expect(screen.getByText('总耗时 54.6s')).toBeInTheDocument()
    expect(screen.getByRole('heading', { level: 2, name: '1. 公司简介' })).toHaveTextContent('1. 公司简介')
    expect(screen.getByText('芯导科技').tagName).toBe('STRONG')
    expect(screen.getByRole('table')).toHaveTextContent('上海芯导')
    await fireEvent.click(screen.getAllByRole('button', { name: '[C1]' })[0])

    expect(screen.getByTestId('answer-body')).toHaveTextContent('Company summary')
    expect(screen.getByTestId('answer-body')).not.toHaveTextContent('**芯导科技**')
    expect(rendered.emitted()['focus-message-citation'][0]).toEqual([
      { messageId: 'current-assistant-response', citationId: 'C1' },
    ])
  })

  it('renders a ChatGPT-style transcript with prior user and assistant turns', () => {
    render(AnswerPanel, {
      props: {
        response,
        retrieval: response.retrieval,
        messages: [
          { id: 'u1', role: 'user', content: '2025年营业收入是多少？' },
          { id: 'a1', role: 'assistant', content: '2025年营业收入为39,360.75万元 [C1]', response, retrieval: response.retrieval },
          { id: 'u2', role: 'user', content: '出处在哪里？' },
        ],
      },
    })

    expect(screen.getByTestId('conversation-thread')).toHaveTextContent('2025年营业收入是多少？')
    expect(screen.getByTestId('conversation-thread')).toHaveTextContent('2025年营业收入为39,360.75万元')
    expect(screen.getByTestId('conversation-thread')).toHaveTextContent('出处在哪里？')
    expect(screen.getByText('2 轮对话')).toBeInTheDocument()
  })

  it('selects an assistant turn and emits message-aware citation focus events', async () => {
    const firstResponse: CompactAskResponse = {
      ...response,
      answer: '绗竴杞洖绛?[C1]',
      citations: [
        {
          citation_id: 'C1',
          chunk_id: 'chunk-1',
          doc_id: 'doc-1',
          page_idx: 1,
          page_range: '1',
          heading_path: 'A',
          quote: 'A',
          confidence: 1,
        },
      ],
    }
    const secondResponse: CompactAskResponse = {
      ...response,
      answer: '绗簩杞洖绛?[C2]',
      citations: [
        {
          citation_id: 'C2',
          chunk_id: 'chunk-2',
          doc_id: 'doc-2',
          page_idx: 2,
          page_range: '2',
          heading_path: 'B',
          quote: 'B',
          confidence: 1,
        },
      ],
    }
    const rendered = render(AnswerPanel, {
      props: {
        response: secondResponse,
        retrieval: secondResponse.retrieval,
        activeMessageId: 'a2',
        messages: [
          { id: 'u1', role: 'user', content: '闂1' },
          { id: 'a1', role: 'assistant', content: firstResponse.answer, response: firstResponse, retrieval: firstResponse.retrieval },
          { id: 'u2', role: 'user', content: '闂2' },
          { id: 'a2', role: 'assistant', content: secondResponse.answer, response: secondResponse, retrieval: secondResponse.retrieval },
        ],
      },
    })

    const assistantMessages = rendered.container.querySelectorAll('.chat-message.assistant')
    expect(assistantMessages[1]).toHaveClass('active')

    await fireEvent.click(assistantMessages[0])
    expect(rendered.emitted()['select-message'][0]).toEqual(['a1'])

    await fireEvent.click(screen.getByRole('button', { name: '[C1]' }))
    expect(rendered.emitted()['focus-message-citation'][0]).toEqual([{ messageId: 'a1', citationId: 'C1' }])
  })

  it('hides synthetic trailing pending stages after the final response is available', () => {
    const cachedResponse: CompactAskResponse = {
      ...response,
      retrieval: {
        ...response.retrieval,
        cache_hit: true,
        progress_stages: [
          { phase: 'load_session', status: 'completed', duration_ms: 1 },
          { phase: 'conversation_context', status: 'completed', duration_ms: 1 },
          { phase: 'intent_slot_understanding_agent', status: 'completed', duration_ms: 1 },
          { phase: 'select_skill_from_registry', status: 'completed', duration_ms: 1 },
          { phase: 'clarify_gate', status: 'completed', duration_ms: 1 },
          { phase: 'parallel_hybrid_retrieval', status: 'completed', duration_ms: 1 },
          { phase: 'evidence_decision', status: 'completed', duration_ms: 1 },
          { phase: 'answer_generation', status: 'completed', duration_ms: 1, cache_hit: true },
        ],
      },
    }

    const rendered = render(AnswerPanel, {
      props: {
        response: cachedResponse,
        retrieval: cachedResponse.retrieval,
        loading: false,
      },
    })

    const stages = rendered.container.querySelectorAll('.progress-stage')
    expect(stages).toHaveLength(8)
    expect(stages[stages.length - 1]).toHaveClass('stage-completed')
  })

  it('does not show synthetic trailing stages while streaming an available final response', () => {
    const cachedResponse: CompactAskResponse = {
      ...response,
      retrieval: {
        ...response.retrieval,
        cache_hit: true,
        progress_stages: [
          { phase: 'load_session', status: 'completed', duration_ms: 1 },
          { phase: 'conversation_context', status: 'completed', duration_ms: 1 },
          { phase: 'intent_slot_understanding_agent', status: 'completed', duration_ms: 1 },
          { phase: 'select_skill_from_registry', status: 'completed', duration_ms: 1 },
          { phase: 'clarify_gate', status: 'completed', duration_ms: 1 },
          { phase: 'parallel_hybrid_retrieval', status: 'completed', duration_ms: 1 },
          { phase: 'evidence_decision', status: 'completed', duration_ms: 1 },
          { phase: 'answer_generation', status: 'completed', duration_ms: 1, cache_hit: true },
        ],
      },
    }

    const rendered = render(AnswerPanel, {
      props: {
        response: cachedResponse,
        retrieval: cachedResponse.retrieval,
        loading: true,
      },
    })

    const stages = rendered.container.querySelectorAll('.progress-stage')
    expect(stages).toHaveLength(8)
    expect(stages[stages.length - 1]).toHaveClass('stage-completed')
  })
})
