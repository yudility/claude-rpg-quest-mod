import { expect, test } from 'claude-code/testing'

const FILE = {
  date: '2026-11-16',
  tasks: [
    { id: 'fw', sec: 'BOSS', boss: true, t: '고객사 교안 전달', xp: 150 },
    { id: 'm1', sec: '메인', t: '계약서 확인', xp: 60 },
  ],
}

test('w → 항목 고르기 → w 로 작업을 맡긴다', async ($, on) => {
  const state: Record<string, unknown> = { data: FILE, combo: 0, isAdding: false, isPicking: false, isDeleting: false, picked: [] }
  on('state.get', (_: any, e: any) => ({ value: { value: state[(e.key ?? e.ref?.key) as string], version: 1 } }))
  on('state.set', (_: any, e: any) => {
    state[(e.key ?? e.ref?.key) as string] = e.value
    return { value: { isSet: true, version: 2 } }
  })
  on('clock.now', () => ({ value: Date.parse('2026-11-16T03:00:00Z') }))
  const submitted: string[] = []
  on('prompt.submit', (_: any, e: any) => {
    submitted.push(e.text)
    return { text: e.text }
  })
  on('ui.toast', () => ({ value: undefined }))
  const PANE = {
    plugin: 'quest-board', component: 'Pane', requestId: 'quest', surface: 'terminal',
    props: { title: 'Quest', isFocused: true, bodyColumns: 60, placement: 'dock', scroll: { offset: 0, bodyRows: 40 }, view: {} },
  } as any
  const ui = await $.ui.mount(PANE)
  await ui.press({ key: 'work' })
  await ui.redraw()
  await ui.press({ key: 'm1' })
  await ui.redraw()
  await ui.press({ key: 'work' })
  expect(submitted.length).toBe(1)
  expect(submitted[0]).toContain('m1')
  await ui.unmount()
})

test('d → 항목 키로 퀘스트를 지운다', async ($, on) => {
  const state: Record<string, unknown> = { data: FILE, combo: 0, isAdding: false, isPicking: false, isDeleting: false, picked: [] }
  on('state.get', (_: any, e: any) => ({ value: { value: state[(e.key ?? e.ref?.key) as string], version: 1 } }))
  on('state.set', (_: any, e: any) => {
    state[(e.key ?? e.ref?.key) as string] = e.value
    return { value: { isSet: true, version: 2 } }
  })
  on('clock.now', () => ({ value: Date.parse('2026-11-16T03:00:00Z') }))
  on('ui.toast', () => ({ value: undefined }))
  on('fs.read', () => ({ value: JSON.stringify(FILE) }))
  const written: string[] = []
  on('fs.write', (_: any, e: any) => {
    written.push(e.text)
    return { value: undefined }
  })
  on('env.get', () => ({ value: '/home/test' }))
  on('command.register', () => ({ value: { command: 'quest' } }))
  on('clock.every', () => ({ value: undefined }))
  on('session.start', (_: any, e: any) => ({ cwd: e.cwd }))
  await $.session.start({ cwd: '/', surface: 'terminal', isInteractive: true } as any)
  const ui = await $.ui.mount({
    plugin: 'quest-board', component: 'Pane', requestId: 'quest', surface: 'terminal',
    props: { title: 'Quest', isFocused: true, bodyColumns: 60, placement: 'dock', scroll: { offset: 0, bodyRows: 40 }, view: {} },
  } as any)
  await ui.press({ key: 'delete' })
  await ui.redraw()
  await ui.press({ key: 'm1' })
  const saved = JSON.parse(written.at(-1)!)
  expect(saved.tasks.map((t: any) => t.id)).toEqual(['fw'])
  expect(saved.archivedXp).toBe(0) // 완료 안 한 걸 지우면 누적 XP 그대로
  await ui.unmount()
})

test('설정 창: 라이트 테마와 머리색을 고르면 hero.json 에 저장된다', async ($, on) => {
  const state: Record<string, unknown> = { settings: {}, isEditingHair: false }
  const written: { path: string; text: string }[] = []
  on('state.get', (_: any, e: any) => ({ value: { value: state[(e.key ?? e.ref?.key) as string], version: 1 } }))
  on('state.set', (_: any, e: any) => {
    state[(e.key ?? e.ref?.key) as string] = e.value
    return { value: { isSet: true, version: 2 } }
  })
  on('env.get', () => ({ value: '/home/test' }))
  on('command.register', () => ({ value: { command: 'x' } }))
  on('clock.every', () => ({ value: undefined }))
  on('clock.now', () => ({ value: 0 }))
  // 쓴 파일을 다시 읽으면 쓴 내용이 나온다 (폴링 reload 가 설정을 되돌리지 않는지)
  on('fs.read', (_: any, e: any) => ({ value: written.filter(w => w.path === e.path).at(-1)?.text ?? '' }))
  on('process.run', () => ({ value: { exitCode: 1, stdout: '', stderr: '', isStdoutTruncated: false, isStderrTruncated: false } }))
  on('session.start', (_: any, e: any) => ({ cwd: e.cwd }))
  on('fs.write', (_: any, e: any) => {
    written.push({ path: e.path, text: e.text })
    return { value: undefined }
  })
  await $.session.start({ cwd: '/', surface: 'terminal', isInteractive: true } as any)
  const ui = await $.ui.mount({
    plugin: 'quest-board', component: 'Pane', requestId: 'quest-settings', surface: 'terminal',
    props: { title: '설정', isFocused: true, bodyColumns: 60, placement: 'dock', scroll: { offset: 0, bodyRows: 40 }, view: {} },
  } as any)
  await ui.press({ key: 'theme-light' })
  await ui.redraw()
  await ui.press({ key: 'hair-4' })
  const last = written.at(-1)!
  expect(last.path).toBe('/home/test/.quest/hero.json')
  expect(JSON.parse(last.text)).toEqual({ theme: 'light', hair: '#c8ccd8' })
  await ui.unmount()
})
