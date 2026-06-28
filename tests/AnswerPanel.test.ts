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
    expect(rendered.container.querySelector('.answer-badges .cache-badge')).toHaveTextContent('cache miss')
    expect(screen.getByText('总耗时 54.6s')).toBeInTheDocument()
    expect(screen.getByRole('heading', { level: 2, name: '1. 公司简介' })).toHaveTextContent('1. 公司简介')
    expect(screen.getByText('芯导科技').tagName).toBe('STRONG')
    expect(screen.getByRole('table')).toHaveTextContent('上海芯导')
    await fireEvent.click(screen.getAllByRole('button', { name: '[C1]' })[0])

    expect(screen.getByTestId('answer-body')).toHaveTextContent('Company summary')
    expect(screen.getByTestId('answer-body')).not.toHaveTextContent('**芯导科技**')
    expect(rendered.emitted()['focus-citation'][0]).toEqual(['C1'])
  })
})
