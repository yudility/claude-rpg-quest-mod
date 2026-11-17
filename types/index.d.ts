export type Quest = {
  id: string
  sec: string
  t: string
  d?: string
  xp?: number
  boss?: boolean
  done?: boolean
  due?: string // YYYY-MM-DD 마감
  doneAt?: string // YYYY-MM-DD 완료한 날
  // quest-work 스킬이 남긴 결과
  work?: { status: 'running' | 'ready' | 'skip' | 'failed'; note: string; draft?: boolean; at?: string }
}
// archivedXp: 파일에서 지운 완료 항목의 XP 합 (레벨은 누적)
export type QuestFile = { date?: string; tasks: Quest[]; archivedXp?: number }
// ~/.quest/hero.json: 캐릭터 색 + 화면 테마
export type Settings = {
  theme?: 'dark' | 'light' | 'system'
  heroClass?: 'knight' | 'warrior' | 'mage' | 'ranger'
  hair?: string
  eyes?: string
  skin?: string
  outfit?: string
  shirt?: string
  pants?: string
  cape?: string
  trim?: string
}

declare module 'claude-code' {
  interface PluginState {
    'quest-board': {
      data: QuestFile | null
      combo: number
      isAdding: boolean
      isPicking: boolean
      isDeleting: boolean
      isEditPicking: boolean
      editingId: string
      settings: Settings
      isEditingHair: boolean
      picked: string[]
    }
  }
}
