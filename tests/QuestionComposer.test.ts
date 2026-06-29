import { createPinia, setActivePinia } from 'pinia'
import { fireEvent, render, screen } from '@testing-library/vue'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import QuestionComposer from '@/components/QuestionComposer.vue'
import { useQaStore } from '@/stores/qaStore'

describe('QuestionComposer', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
  })

  it('submits the current question when Enter is pressed', async () => {
    const store = useQaStore()
    const askSpy = vi.spyOn(store, 'ask').mockResolvedValue()

    render(QuestionComposer)

    const textarea = screen.getByRole('textbox', { name: '问题' })
    await fireEvent.update(textarea, '测试问题')
    await fireEvent.keyDown(textarea, { key: 'Enter' })

    expect(askSpy).toHaveBeenCalledTimes(1)
  })

  it('keeps Shift+Enter available for line breaks', async () => {
    const store = useQaStore()
    const askSpy = vi.spyOn(store, 'ask').mockResolvedValue()

    render(QuestionComposer)

    const textarea = screen.getByRole('textbox', { name: '问题' })
    await fireEvent.update(textarea, '第一行')
    await fireEvent.keyDown(textarea, { key: 'Enter', shiftKey: true })

    expect(askSpy).not.toHaveBeenCalled()
  })
})
