import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'

import type { Quest, QuestFile, Settings } from '../types'
import { dueLabel, parseTitle, todayOf, visibleTasks } from './dates'
import { BOARD, CLASS_NAME, MONSTER_NAME, SCENE_H, SCENE_W, monsterOf, sceneCells } from './scene'
import type { Monster, Scheme } from './scene'

// ~/.quest/tasks.json 이 단일 데이터. quest TUI·Claude가 밖에서 고쳐도 폴링으로 따라간다.
const PANE = 'quest'
const LEVEL_XP = 120
const POLL_MS = 3000
// 마우스·Tab이 안 먹는 터미널(Orca)에서도 체크되게 항목마다 단축키
const HOTKEYS = '123456789bcfghijklmnopstuvyz' // a 추가 · d 삭제 · e 수정 · r 메일로 갱신 · w 작업 맡기기 · x 취소
const REFRESH_PROMPT = `퀘스트 보드 갱신해줘.
1. Gmail에서 지난 7일 받은편지함·보낸편지함, Google Calendar에서 오늘~이번 주 일정을 읽는다.
2. 내가 해야 할 일만 뽑아 등급을 매긴다.
   - BOSS(boss:true, xp 100~150): 오늘 마감이거나 고객사가 답을 기다리는 일
   - 메인(xp 30~90): 이번 주 안에 해야 하고 일정·계약에 영향이 있는 일
   - 사이드(xp 10~50): 내부 처리, 미리 준비해 두면 좋은 일
   - 잡몹(xp 5): 1분 안에 끝나는 일
   내가 보내고 상대 답장을 기다리는 건은 넣지 않는다.
3. ~/.quest/tasks.json을 새로 쓴다. 형식: {"date":"오늘 YYYY-MM-DD","tasks":[{"id":영문 kebab-case,"sec":등급,"boss":bool,"t":제목(상대 이름 포함),"d":보충 설명,"xp":숫자,"done":bool,"due":"YYYY-MM-DD 마감(메일·일정에 있으면)","doneAt":"YYYY-MM-DD"}]}
   - 지금 파일의 항목은 id·due를 유지해 이어 넣는다. 오늘 완료(doneAt이 오늘)는 그대로 두고, 그 전에 완료된 건 뺀다. 메일상 끝난 걸로 확인되면 done:true, doneAt:오늘.
   - 뺀 완료 항목들의 xp 합을 최상위 "archivedXp"에 더한다(레벨은 누적). 기존 archivedXp 값은 유지.
   - 순서는 BOSS → 메인 → 사이드 → 잡몹 → 완료.
4. 다 쓰고 나서 추가·완료 처리·빠진 항목을 짧게 알려준다.`

const data = atom({ plugin: 'quest-board', key: 'data' } as const, null)
const combo = atom({ plugin: 'quest-board', key: 'combo' } as const, 0)
const isAdding = atom({ plugin: 'quest-board', key: 'isAdding' } as const, false)
const isPicking = atom({ plugin: 'quest-board', key: 'isPicking' } as const, false)
const picked = atom({ plugin: 'quest-board', key: 'picked' } as const, [])
const isDeleting = atom({ plugin: 'quest-board', key: 'isDeleting' } as const, false)
const isEditPicking = atom({ plugin: 'quest-board', key: 'isEditPicking' } as const, false)
const editingId = atom({ plugin: 'quest-board', key: 'editingId' } as const, '')
const settings = atom({ plugin: 'quest-board', key: 'settings' } as const, {} as Settings)
const isEditingHair = atom({ plugin: 'quest-board', key: 'isEditingHair' } as const, false)
const SETTINGS_PANE = 'quest-settings'

const xpOf = (t: Quest) => t.xp ?? 10
// 게시판 색
const PAPER = '#e8d4a8'
const INK = '#4a2e1c'
const WOOD = '#9a5e36'
const GOLD = '#e0b04a'
const SECTION_COLORS: Record<string, string> = {
  BOSS: '#b13e53',
  메인: '#c8702a',
  사이드: '#2a7a8a',
  잡몹: '#4a8a3a',
  추가: '#6a5a8a',
  완료: '#5a5a6a',
}
const HAIR: [string, string][] = [
  ['보라', '#9b5fd0'],
  ['갈색', '#7a4a2a'],
  ['금발', '#e8c060'],
  ['검정', '#2a2433'],
  ['은발', '#c8ccd8'],
  ['분홍', '#e88ab8'],
  ['파랑', '#4a8ad8'],
]
const EYES: [string, string][] = [
  ['검정', '#1a1420'],
  ['빨강', '#e0303a'],
  ['파랑', '#3a6ad8'],
  ['초록', '#3a9a4a'],
]
const OUTFITS: [string, Settings][] = [
  ['기본 (남색·와인)', { outfit: '#33407a', shirt: '#f0e6d2', pants: '#2a2433', cape: '#7a2a3a', trim: '#e0b04a' }],
  ['숲 레인저', { outfit: '#3e6b48', shirt: '#e8dcc0', pants: '#4a3a2a', cape: '#5a3a24', trim: '#c8a050' }],
  ['흑기사', { outfit: '#2e2a38', shirt: '#9aa0aa', pants: '#1e1a24', cape: '#8e2c2a', trim: '#c0c8d0' }],
]
// 직업을 고르면 어울리는 옷 색도 같이 바뀐다
const CLASSES: [Settings['heroClass'] & string, Settings][] = [
  ['knight', { outfit: '#5a6a8a', shirt: '#c8ccd8', pants: '#2a2433', cape: '#7a2a3a', trim: '#e0b04a' }],
  ['warrior', { outfit: '#6e4028', shirt: '#d8b088', pants: '#3a2a2a', cape: '#b13e53', trim: '#c0c8d0' }],
  ['mage', { outfit: '#3a2a6a', shirt: '#e8dcc0', pants: '#2a2433', cape: '#2a1e4a', trim: '#e0b04a' }],
  ['ranger', { outfit: '#3e6b48', shirt: '#e8dcc0', pants: '#4a3a2a', cape: '#4a5a2a', trim: '#c8a050' }],
]
const SECTION_MONSTER: Record<string, string> = { BOSS: '킹슬라임', 메인: '버섯', 사이드: '슬라임', 잡몹: '슬라임', 추가: '슬라임' }
const earned = (ts: Quest[]) => ts.filter(t => t.done).reduce((s, t) => s + xpOf(t), 0)
// 레벨용 누적 XP: 숨겨진 완료 + 파일에서 지운 완료까지
const totalXp = (file: QuestFile) => (file.archivedXp ?? 0) + earned(file.tasks)
const bar = (frac: number, width: number) => {
  const n = Math.round(frac * width)
  return '█'.repeat(n) + '░'.repeat(width - n)
}

let path = ''
let lastText = ''
// 전투 화면 애니메이션 (모듈 변수: 리로드되면 처음부터)
let tick = 0
let attackAt = 0
let defeated: Monster = 'none'
let defeatedId = ''
let gainAt = 0
let gainXp = 0
let settingsText = ''
let systemDark = true // 테마 '시스템 자동'일 때 macOS 화면 모드
let reloads = 0
let bandSite = '' // 입력창 위 띠의 requestId (blit 주소)

function currentMonster(file: QuestFile | null, today: string): [Monster, string] {
  if (!file) return ['none', '']
  const ts = visibleTasks(file.tasks, file.date, today).filter(t => !t.done)
  const nxt = ts.find(t => t.boss) ?? ts[0]
  return [monsterOf(nxt?.sec, nxt?.boss), nxt?.id ?? '']
}

async function schemeOf($: EngineInterface): Promise<Scheme> {
  const theme = ((await read($, settings)) as Settings).theme ?? 'dark'
  if (theme === 'system') return systemDark ? 'dark' : 'light'
  return theme
}

// macOS 화면 모드: 다크면 AppleInterfaceStyle=Dark, 라이트면 키가 없다
async function checkSystem($: EngineInterface) {
  const r = await $.process.run(['defaults', 'read', '-g', 'AppleInterfaceStyle'], { timeoutMs: 2000 }).catch(() => undefined)
  if (r) systemDark = r.stdout.trim() === 'Dark'
}

async function animate($: EngineInterface) {
  tick += 1
  const now = await $.clock.now()
  const sinceAttack = now - attackAt
  const isAttacking = sinceAttack < 1200
  const [monster, seed] = isAttacking ? [defeated, defeatedId] : currentMonster(await read($, data), todayOf(now))
  if (!bandSite) return
  const cells = sceneCells({
    monster,
    tick,
    attackMs: isAttacking ? sinceAttack : undefined,
    hero: await read($, settings),
    seed,
    gain: { xp: gainXp, ms: now - gainAt },
    scheme: await schemeOf($),
  })
  await $.ui.blit({ requestId: bandSite, key: 'scene', cells }).catch(() => undefined)
}

const heroPath = () => path.replace(/tasks\.json$/, 'hero.json')

async function saveSettings($: EngineInterface, patch: Settings) {
  const next = { ...(await read($, settings)), ...patch }
  const text = JSON.stringify(next, null, 2)
  await $.fs.write(heroPath(), text)
  settingsText = text
  await update($, settings, () => next)
}

async function openSettings($: EngineInterface) {
  await $.ui.open({ id: SETTINGS_PANE, title: '설정', focus: true, closeOnEscape: true })
}

async function reload($: EngineInterface) {
  const heroText = await $.fs.read(heroPath()).catch(() => '')
  if (heroText !== settingsText) {
    try {
      const parsed = heroText ? (JSON.parse(heroText) as Settings) : {}
      settingsText = heroText
      await update($, settings, () => parsed)
    } catch {
      // 고치는 중인 hero.json 은 다음 폴링에서
    }
  }
  if (reloads++ % 10 === 0) await checkSystem($) // 30초마다
  const text = await $.fs.read(path).catch(() => '')
  if (!text || text === lastText) return
  try {
    const parsed = JSON.parse(text) as QuestFile
    lastText = text
    await update($, data, () => ({ date: parsed.date, tasks: parsed.tasks ?? [], archivedXp: parsed.archivedXp ?? 0 }))
  } catch {
    // ponytail: 쓰는 도중 읽힌 반쪽 JSON은 다음 폴링에서 다시 읽는다
  }
}

async function toggle($: EngineInterface, id: string) {
  await reload($) // 밖에서 바뀐 걸 덮어쓰지 않게 최신본 위에서 토글
  const file = await read($, data)
  if (!file) return
  const tasks = file.tasks
  const t = tasks.find(x => x.id === id)
  if (!t) return
  const today = todayOf(await $.clock.now())
  const levelBefore = Math.floor(totalXp(file) / LEVEL_XP)
  const next = tasks.map(x =>
    x.id !== id ? x : x.done ? { ...x, done: false, doneAt: undefined } : { ...x, done: true, doneAt: today },
  )
  const shown = visibleTasks(next, file.date, today)
  const newFile = { ...file, tasks: next }
  const text = JSON.stringify(newFile, null, 2)
  await $.fs.write(path, text)
  lastText = text
  await update($, data, () => newFile)

  if (t.done) {
    await update($, combo, () => 0)
    return
  }
  attackAt = await $.clock.now()
  defeated = monsterOf(t.sec, t.boss)
  defeatedId = t.id
  gainAt = attackAt
  gainXp = xpOf(t)
  const c = (await read($, combo)) + 1
  await update($, combo, () => c)
  const levelAfter = Math.floor(totalXp(newFile) / LEVEL_XP)
  if (shown.every(x => x.done)) $.ui.toast('🎉 STAGE CLEAR! 오늘 퀘스트 전부 완료', { timeoutMs: 6000 })
  else if (t.boss) $.ui.toast(`⚔ BOSS DEFEATED!  +${xpOf(t)} XP`)
  else if (levelAfter > levelBefore) $.ui.toast(`⬆ LEVEL UP!  LV.${levelAfter + 1}`)
  else if (c % 3 === 0) $.ui.toast(`🔥 ${c} COMBO!  +${xpOf(t)} XP`)
  else $.ui.toast(`+${xpOf(t)} XP`, { timeoutMs: 1500 })
}

async function addQuest($: EngineInterface, title: string) {
  await update($, isAdding, () => false)
  const t = title.trim()
  if (!t) return
  await reload($)
  const file = (await read($, data)) ?? { tasks: [] }
  const now = await $.clock.now()
  const quest: Quest = { id: `t${now}`, sec: '추가', ...parseTitle(t, todayOf(now)), xp: 20 }
  const newFile = { ...file, tasks: [...file.tasks, quest] }
  const text = JSON.stringify(newFile, null, 2)
  await $.fs.write(path, text)
  lastText = text
  await update($, data, () => newFile)
  $.ui.toast(`➕ 퀘스트 추가: ${t}`, { timeoutMs: 1500 })
}

async function startAdding($: EngineInterface) {
  await update($, isAdding, () => true)
  await $.ui.focus({ requestId: PANE, key: 'new' }).catch(() => undefined)
}

// w: 고르기 시작 → 키로 고르고 → w 다시 누르면 quest-work 스킬에 넘김
async function work($: EngineInterface) {
  if (!(await read($, isPicking))) {
    await update($, isPicking, () => true)
    await update($, picked, () => [])
    return
  }
  const ids = await read($, picked)
  await cancelPick($)
  if (ids.length === 0) return
  $.ui.toast(`🗡 퀘스트 ${ids.length}개 작업 맡겼어요`)
  submitPrompt($, `quest-work 스킬로 이 퀘스트들 작업해줘: ${ids.join(', ')}`)
}

// 프롬프트는 Claude 가 한가해질 때 들어가므로 기다리지 않는다 (키 처리 10초 제한)
function submitPrompt($: EngineInterface, text: string) {
  void $.prompt
    .submit({ text, asUser: true })
    .then(r => {
      if (r.drop) $.ui.toast('요청이 들어가지 않았어요')
    })
    .catch(err => $.ui.toast(`요청 실패: ${String(err)}`))
}

// e: 고칠 항목 고르기 → 제목·마감이 채워진 입력칸 → Enter로 저장
async function startEditing($: EngineInterface) {
  await update($, isEditPicking, () => true)
}

async function chooseEdit($: EngineInterface, id: string) {
  await update($, isEditPicking, () => false)
  await update($, editingId, () => id)
  await $.ui.focus({ requestId: PANE, key: 'edit' }).catch(() => undefined)
}

async function saveEdit($: EngineInterface, id: string, value: string) {
  await update($, editingId, () => '')
  const v = value.trim()
  if (!v) return
  await reload($)
  const file = await read($, data)
  if (!file) return
  const { t, due } = parseTitle(v, todayOf(await $.clock.now()))
  const tasks = file.tasks.map(x => {
    if (x.id !== id) return x
    const { due: _old, ...rest } = x
    return due ? { ...rest, t, due } : { ...rest, t }
  })
  const newFile = { ...file, tasks }
  const text = JSON.stringify(newFile, null, 2)
  await $.fs.write(path, text)
  lastText = text
  await update($, data, () => newFile)
  $.ui.toast(`✏️ 수정: ${t}`, { timeoutMs: 1500 })
}

async function startDeleting($: EngineInterface) {
  await update($, isDeleting, () => true)
}

async function removeQuest($: EngineInterface, id: string) {
  await update($, isDeleting, () => false)
  await reload($)
  const file = await read($, data)
  const t = file?.tasks.find(x => x.id === id)
  if (!file || !t) return
  // 완료한 걸 지우면 그 XP는 누적에 남긴다
  const archivedXp = (file.archivedXp ?? 0) + (t.done ? xpOf(t) : 0)
  const newFile = { ...file, tasks: file.tasks.filter(x => x.id !== id), archivedXp }
  const text = JSON.stringify(newFile, null, 2)
  await $.fs.write(path, text)
  lastText = text
  await update($, data, () => newFile)
  $.ui.toast(`🗑 삭제: ${t.t}`, { timeoutMs: 2000 })
}

async function cancelPick($: EngineInterface) {
  await update($, isDeleting, () => false)
  await update($, isEditPicking, () => false)
  await update($, editingId, () => '')
  await update($, isPicking, () => false)
  await update($, picked, () => [])
}

async function pick($: EngineInterface, id: string) {
  await update($, picked, ids => (ids.includes(id) ? ids.filter(x => x !== id) : [...ids, id]))
}

function refresh($: EngineInterface) {
  $.ui.toast('📬 메일함 확인해서 퀘스트 갱신 요청했어요')
  submitPrompt($, REFRESH_PROMPT)
}

// 띠의 [퀘스트 목록]: 열려 있으면 닫고, 닫혀 있으면 연다
async function togglePane($: EngineInterface) {
  const panes = await $.ui.panes()
  if (panes.some(p => p.id === PANE)) return $.ui.close({ id: PANE })
  return openPane($)
}

async function openPane($: EngineInterface) {
  const opened = await $.ui.open({ id: PANE, title: 'Quest', focus: true, closeOnEscape: true })
  if (!opened.isPlaced) $.ui.toast(`퀘스트 패널을 못 띄웠어요: ${opened.reason}`)
}

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    path = `${await $.env.get('HOME')}/.quest/tasks.json`
    lastText = ''
    await reload($)
    $.clock.every(POLL_MS, () => reload($))
    $.clock.every(200, () => animate($))
    await $.command.register({ name: 'quest', description: '퀘스트 보드 패널 열기' })
    await $.command.register({ name: 'quest-refresh', description: '메일함 확인해서 퀘스트 목록 갱신' })
    await $.command.register({ name: 'quest-settings', description: '퀘스트 보드 설정 (테마·캐릭터 색)' })
    return next(e)
  })

  on('command.run', { command: 'quest' }, async $ => {
    await openPane($)
    return { text: '퀘스트 보드를 열었어요. 항목 앞 키로 체크, a 추가, d 삭제, r 메일로 갱신, w 작업 맡기기, Esc 닫기.' }
  })

  on('command.run', { command: 'quest-settings' }, async $ => {
    await openSettings($)
    return { text: '설정 창을 열었어요. 앞의 키로 고르고 Esc로 닫기.' }
  })

  on('command.run', { command: 'quest-refresh' }, async $ => {
    await refresh($)
    return { text: '메일함 확인해서 퀘스트 목록을 갱신할게요.' }
  })

  // 입력창 위: 픽셀 전투 화면. 왼쪽 게시판(베이지) 위에 상태 글자를 겹쳐 그린다
  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    const file = await read($, data)
    if (e.props.hasSurvey || !file || file.tasks.length === 0) return next(e)
    const { Box, Text, Button } = $.ui.resolve(e)
    const today = todayOf(await $.clock.now())
    const ts = visibleTasks(file.tasks, file.date, today)
    const xp = totalXp(file)
    const done = ts.filter(t => t.done).length
    const nxt = ts.find(t => t.boss && !t.done) ?? ts.find(t => !t.done)
    const monster = monsterOf(nxt?.sec, nxt?.boss)
    const due = dueLabel(nxt?.due, today)
    const c = await read($, combo)
    const isPixel = e.surface === 'terminal' && !e.props.isCollapsed

    const hud = (paper?: string) => {
      const ink = paper ? INK : undefined
      const t = (color: string | undefined) => (paper ? color : undefined)
      return (
        <Box flexDirection="column" width={paper ? BOARD.width - 4 : undefined} backgroundColor={paper} paddingX={paper ? 2 : 0}>
          {paper && <Text backgroundColor={paper}> </Text>}
          <Text backgroundColor={paper} color={ink}>
            <Text backgroundColor={paper} color={t('#a06a10') ?? 'yellow'} bold>
              ⚔ LV.{Math.floor(xp / LEVEL_XP) + 1}{' '}
            </Text>
            <Text backgroundColor={paper} color={t('#3a8a3a') ?? 'green'}>
              {bar((xp % LEVEL_XP) / LEVEL_XP, 10)}
            </Text>
            <Text backgroundColor={paper} color={ink}>
              {' '}
              {xp % LEVEL_XP}/{LEVEL_XP}XP
            </Text>
          </Text>
          <Text backgroundColor={paper} color={t('#7a5a40')} dimColor={!paper}>
            {done}/{ts.length} 완료{c > 0 ? ` · COMBO ${c}` : ''}
          </Text>
          <Text backgroundColor={paper}> </Text>
          {nxt ? (
            <Text backgroundColor={paper} color={nxt.boss ? (t('#a02a2a') ?? 'red') : (t('#2a6a3a') ?? 'green')} bold>
              VS {MONSTER_NAME[monster]}
            </Text>
          ) : (
            <Text backgroundColor={paper} color={t('#a06a10') ?? 'yellow'} bold>
              🎉 STAGE CLEAR
            </Text>
          )}
          {nxt && (
            <Text backgroundColor={paper} color={ink} wrap="truncate-end">
              {nxt.t}
            </Text>
          )}
          <Text backgroundColor={paper} color={t('#a02a2a') ?? 'red'}>
            {due ? `마감 ${due}` : ' '}
          </Text>
          <Text backgroundColor={paper}> </Text>
          <Box backgroundColor={paper} columnGap={2}>
            <Button key="open" label="퀘스트 목록" onPress={() => togglePane($)} />
            <Button key="settings" label="설정" onPress={() => openSettings($)} />
          </Box>
        </Box>
      )
    }

    // 픽셀 화면(Raster)은 터미널에서만, 띠가 접혀 있지 않을 때만
    if (!isPixel || e.surface !== 'terminal') return <Box>{hud()}</Box>
    const { Raster } = $.ui.resolve(e)
    bandSite = e.requestId
    const cells = sceneCells({ monster, tick, hero: await read($, settings), seed: nxt?.id, scheme: await schemeOf($) })

    return (
      <Box>
        <Raster key="scene" columns={SCENE_W} rows={SCENE_H / 2} cells={cells} />
        <Box position="absolute" top={1} left={BOARD.left + 2}>
          {hud(PAPER)}
        </Box>
      </Box>
    )
  })

  // 전체 목록 패널: 게시판처럼
  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    const { Box, Text, Button, Input } = $.ui.resolve(e)
    const file = await read($, data)
    if (!file) return <Text dimColor>~/.quest/tasks.json 을 읽지 못했어요.</Text>
    const today = todayOf(await $.clock.now())
    const ts = visibleTasks(file.tasks, file.date, today)
    const xp = totalXp(file)
    const c = await read($, combo)
    const adding = await read($, isAdding)
    const picking = await read($, isPicking)
    const pickedIds = await read($, picked)
    const deleting = await read($, isDeleting)
    const editPicking = await read($, isEditPicking)
    const editing = await read($, editingId)
    const bosses = ts.filter(t => t.boss && !t.done).length
    const secs = [...new Set(ts.map(t => t.sec))]
    const order = secs.flatMap(sec => ts.filter(t => t.sec === sec).map(t => t.id))
    const firstOpen = ts.find(t => !t.done)?.id

    return (
      <Box flexDirection="column" borderStyle="round" borderColor={WOOD} paddingX={1}>
        <Box justifyContent="space-between">
          <Text color={GOLD} bold>
            📜 QUEST BOARD
          </Text>
          <Text dimColor>{today}</Text>
        </Box>
        <Text>
          <Text color={GOLD} bold>
            LV.{Math.floor(xp / LEVEL_XP) + 1}{' '}
          </Text>
          <Text color="#6aa84f">{bar((xp % LEVEL_XP) / LEVEL_XP, 16)}</Text>
          <Text> {xp % LEVEL_XP}/{LEVEL_XP}XP</Text>
          <Text dimColor>
            {'  '}
            {ts.filter(t => t.done).length}/{ts.length} 완료 · BOSS {bosses} · COMBO {c}
          </Text>
        </Text>
        <Text color={WOOD}>{'─'.repeat(Math.max(10, ((e.props as { bodyColumns?: number }).bodyColumns ?? 40) - 4))}</Text>
        {editPicking ? (
          <Box>
            <Text color="cyan">고칠 퀘스트의 키를 누르세요 · </Text>
            <Button key="cancel" plain hotkey="x" label="취소" onPress={() => cancelPick($)} />
          </Box>
        ) : deleting ? (
          <Box>
            <Text color="red">지울 퀘스트의 키를 누르세요 · </Text>
            <Button key="cancel" plain hotkey="x" label="취소" onPress={() => cancelPick($)} />
          </Box>
        ) : picking ? (
          <Box>
            <Text color="cyan">맡길 퀘스트를 키로 고르세요 ({pickedIds.length}개) · </Text>
            <Button key="work" plain hotkey="w" label="맡기기" onPress={() => work($)} />
            <Text dimColor> · </Text>
            <Button key="cancel" plain hotkey="x" label="취소" onPress={() => cancelPick($)} />
          </Box>
        ) : (
          <Box>
            <Button key="add" plain hotkey="a" label="추가" onPress={() => startAdding($)} />
            <Text dimColor> · </Text>
            <Button key="refresh" plain hotkey="r" label="메일로 갱신" onPress={() => refresh($)} />
            <Text dimColor> · </Text>
            <Button key="work" plain hotkey="w" label="작업 맡기기" onPress={() => work($)} />
            <Text dimColor> · </Text>
            <Button key="edit" plain hotkey="e" label="수정" onPress={() => startEditing($)} />
            <Text dimColor> · </Text>
            <Button key="delete" plain hotkey="d" label="삭제" onPress={() => startDeleting($)} />
            <Text dimColor> · Esc 닫기</Text>
          </Box>
        )}
        {adding && (
          <Input
            key="new"
            label="새 퀘스트: "
            placeholder="제목 (마감 있으면 끝에 11/20) 후 Enter"
            submitLabel="추가"
            autoFocus
            onSubmit={value => addQuest($, value)}
          />
        )}
        {secs.map(sec => (
          <Box flexDirection="column" key={`sec-${sec}`} marginTop={1}>
            <Text>
              <Text backgroundColor={SECTION_COLORS[sec] ?? '#5a5a6a'} color="#ffffff" bold>
                {' '}
                {sec}{' '}
              </Text>
              <Text color={SECTION_COLORS[sec] ?? '#5a5a6a'}>
                {' '}
                {SECTION_MONSTER[sec] ?? ''}
              </Text>
            </Text>
            {ts.filter(t => t.sec === sec).map(t => (
              <Box flexDirection="column" key={`row-${t.id}`}>
                <Button
                  key={t.id}
                  plain
                  hotkey={HOTKEYS[order.indexOf(t.id)]}
                  autoFocus={t.id === firstOpen ? true : undefined}
                  dimColor={t.done}
                  onPress={() =>
                    editPicking ? chooseEdit($, t.id) : deleting ? removeQuest($, t.id) : picking ? pick($, t.id) : toggle($, t.id)
                  }
                >
                  <Text color={t.done ? '#6aa84f' : WOOD}>
                    {picking ? (pickedIds.includes(t.id) ? '[▶] ' : '[ ] ') : t.done ? '[✔] ' : '[ ] '}
                  </Text>
                  {t.t}
                  {!t.done && dueLabel(t.due, today) && (
                    <Text color={dueLabel(t.due, today)!.startsWith('D-') ? 'cyan' : 'red'}> [{dueLabel(t.due, today)}]</Text>
                  )}
                  <Text color={GOLD} dimColor={t.done}>
                    {' '}
                    +{xpOf(t)}
                  </Text>
                </Button>
                {editing === t.id && (
                  <Input
                    key="edit"
                    label="수정: "
                    value={t.due ? `${t.t} ${t.due}` : t.t}
                    submitLabel="저장"
                    autoFocus
                    onSubmit={value => saveEdit($, t.id, value)}
                  />
                )}
                {t.d && !t.done && (
                  <Text dimColor wrap="truncate-end">
                    {'    '}
                    {t.d}
                  </Text>
                )}
                {t.work && !t.done && (
                  <Text color={t.work.status === 'failed' ? 'red' : 'cyan'} wrap="truncate-end">
                    {'    '}
                    {t.work.status === 'running' ? '⏳ 작업 중' : t.work.draft ? '📝 초안 준비됨' : '📎'} {t.work.note}
                  </Text>
                )}
              </Box>
            ))}
          </Box>
        ))}
      </Box>
    )
  })

  // 설정 창: 테마, 머리·눈 색, 옷 조합
  on('ui.render', { component: 'Pane', requestId: SETTINGS_PANE }, async ($, e) => {
    const { Box, Text, Button, Input } = $.ui.resolve(e)
    const cur = (await read($, settings)) as Settings
    const editing = await read($, isEditingHair)
    const theme = cur.theme ?? 'dark'
    const mark = (isOn: boolean) => (isOn ? '▶' : ' ')
    const swatch = (hex: string) => <Text color={hex}>██</Text>
    const row = (label: string, items: { key: string; hotkey: string; name: string; hex?: string; isOn: boolean; press: () => unknown }[]) => (
      <Box flexDirection="column" marginTop={1}>
        <Text color={GOLD} bold>
          {label}
        </Text>
        <Box flexWrap="wrap" columnGap={2}>
          {items.map(it => (
            <Button key={it.key} plain hotkey={it.hotkey} onPress={() => it.press()}>
              {mark(it.isOn)}
              {it.hex ? swatch(it.hex) : ''} {it.name}
            </Button>
          ))}
        </Box>
      </Box>
    )

    return (
      <Box flexDirection="column" borderStyle="round" borderColor={WOOD} paddingX={1}>
        <Text color={GOLD} bold>
          ⚙ 설정
        </Text>
        <Text dimColor>앞의 키로 고르기 · Esc 닫기 · 저장: ~/.quest/hero.json</Text>
        {row(
          '화면 테마',
          (
            [
              ['dark', '1', '다크 (밤 숲)'],
              ['light', '2', '라이트 (구름 낀 낮)'],
              ['system', '3', '시스템 자동'],
            ] as const
          ).map(([value, hotkey, name]) => ({
            key: `theme-${value}`,
            hotkey,
            name,
            isOn: theme === value,
            press: () => saveSettings($, { theme: value }),
          })),
        )}
        {row(
          '직업',
          CLASSES.map(([cls, colors], i) => ({
            key: `class-${cls}`,
            hotkey: '4567'[i]!,
            name: CLASS_NAME[cls],
            hex: colors.outfit,
            isOn: (cur.heroClass ?? 'knight') === cls,
            press: () => saveSettings($, { heroClass: cls, ...colors }),
          })),
        )}
        {row(
          '머리색',
          HAIR.map(([name, hex], i) => ({
            key: `hair-${i}`,
            hotkey: 'abcdefg'[i]!,
            name,
            hex,
            isOn: cur.hair === hex,
            press: () => saveSettings($, { hair: hex }),
          })),
        )}
        <Box>
          <Button key="hair-custom" plain hotkey="o" label="직접 입력 (#코드)" onPress={() => update($, isEditingHair, () => true)} />
          <Text dimColor> 지금: {cur.hair ?? '기본'}</Text>
        </Box>
        {editing && (
          <Input
            key="hair-input"
            label="머리색 #RRGGBB: "
            placeholder="#9b5fd0"
            submitLabel="적용"
            autoFocus
            onSubmit={async value => {
              await update($, isEditingHair, () => false)
              const v = value.trim()
              if (/^#?[0-9a-f]{6}$/i.test(v)) await saveSettings($, { hair: v.startsWith('#') ? v : `#${v}` })
              else $.ui.toast('#RRGGBB 형식으로 입력해 주세요')
            }}
          />
        )}
        {row(
          '눈색',
          EYES.map(([name, hex], i) => ({
            key: `eyes-${i}`,
            hotkey: 'hijk'[i]!,
            name,
            hex,
            isOn: cur.eyes === hex,
            press: () => saveSettings($, { eyes: hex }),
          })),
        )}
        {row(
          '옷 조합',
          OUTFITS.map(([name, colors], i) => ({
            key: `outfit-${i}`,
            hotkey: 'lmn'[i]!,
            name,
            hex: colors.outfit,
            isOn: cur.outfit === colors.outfit && cur.cape === colors.cape,
            press: () => saveSettings($, colors),
          })),
        )}
      </Box>
    )
  })

}
