# claude-rpg-quest-mod ⚔️

할 일을 RPG 퀘스트로 바꿔 주는 **Claude Code mod**. 입력창 위에 픽셀아트 방치형 전투 화면이 뜨고, 퀘스트를 체크할 때마다 캐릭터가 몬스터를 처치하고 경험치를 얻습니다.

> A Claude Code mod that turns your to-do list into an idle pixel-art RPG above the prompt.

![전투 화면 미리보기: 다크(기사 vs 킹슬라임) / 라이트(마법사 vs 버섯)](assets/preview.png)

오른쪽 게시판에는 실제 화면에서 레벨·XP·다음 퀘스트와 `[퀘스트 목록]` `[설정]` 버튼이 겹쳐 그려집니다.

## 설치

Claude Code 터미널에서:

```
/plugin install quest-board --marketplace yudility/claude-rpg-quest-mod
```

`Add marketplace?`에 `y`, 범위는 **user**(모든 세션)를 고르면 됩니다. 셸에서는:

```
claude plugin install quest-board --marketplace yudility/claude-rpg-quest-mod
```

데스크톱 앱에서는 프롬프트 옆 `+` → Plugins → Add marketplace에 `yudility/claude-rpg-quest-mod` → Add plugin.

## 퀘스트 데이터 — `~/.quest/tasks.json`

mod는 이 파일 하나를 읽고 씁니다. 다른 도구(직접 편집, 스크립트, Claude에게 "오늘 할 일 퀘스트로 만들어줘")가 고쳐도 3초 안에 화면에 반영돼요.

```json
{
  "date": "2026-11-16",
  "tasks": [
    { "id": "client-deck", "sec": "BOSS", "boss": true, "t": "고객사 교안 전달", "d": "오늘 마감", "xp": 150, "due": "2026-11-16" },
    { "id": "contract", "sec": "메인", "t": "계약서 확인", "xp": 60 },
    { "id": "invite", "sec": "잡몹", "t": "캘린더 초대 수락", "xp": 5 }
  ]
}
```

| 필드 | 뜻 |
| --- | --- |
| `id` | 고유 키 (영문 kebab-case) |
| `sec` | 등급: `BOSS` · `메인` · `사이드` · `잡몹` · `추가` · `완료` |
| `boss` | 보스 여부 (킹슬라임으로 나옴) |
| `t` / `d` | 제목 / 보충 설명 |
| `xp` | 보상 경험치 (레벨당 120) |
| `due` | 마감 `YYYY-MM-DD` → `[오늘]` `[D-3]` `[지남]` 표시 |
| `done` / `doneAt` | 완료 여부 / 완료한 날 (다음 날부터 숨김) |
| `work` | `quest-work` 스킬이 남긴 결과 메모 |
| `archivedXp` (최상위) | 파일에서 지운 완료 항목의 XP 합. 레벨은 이 값 + 남아 있는 완료 항목 XP로 누적 계산 |

## 화면과 조작

- **입력창 위**: 숲 배경 픽셀 전투 화면. 오른쪽 게시판에 레벨·XP·다음 퀘스트와 `[퀘스트 목록]` `[설정]` 버튼, 왼쪽에서 캐릭터가 3초마다 자동으로 몬스터를 친다(방치형).
  퀘스트를 체크하면 몬스터를 처치하고 머리 위에 초록색 `+XP`가 뜬다.
  몬스터는 다음 퀘스트 등급에 따라 슬라임(잡몹·사이드·추가) / 버섯(메인) / 킹슬라임(BOSS).
  `Ctrl+X` → `Ctrl+A`로 접고 편다.
- **퀘스트 패널**: `/quest` 또는 띠의 `[퀘스트 목록]`(한 번 더 누르면 닫힘).
  항목 앞 키로 체크 · `a` 추가(제목 끝에 `11/20` 붙이면 마감) · `e` 수정(누른 뒤 항목 키, 제목·마감을 고쳐 Enter) · `d` 삭제(누른 뒤 항목 키) · `r` 메일로 갱신 · `w` 작업 맡기기(누른 뒤 항목 키로 고르고 `w` 다시) · `x` 취소 · `Esc` 닫기
- **명령**: `/quest`, `/quest-refresh`, `/quest-settings`

## 설정 창

`/quest-settings` 또는 게시판의 `[설정]`.

- 화면 테마: `1` 다크(밤 숲) · `2` 라이트(구름 낀 낮) · `3` 시스템 자동(macOS 화면 모드를 30초마다 확인)
- 직업: `4` 기사(칼+방패) · `5` 전사(쌍도끼) · `6` 마법사(지팡이, 구슬을 쏜다) · `7` 레인저(활, 화살을 쏜다). 고르면 직업에 어울리는 옷 색으로 바뀐다
- 머리색: `a`~`g` 프리셋, `o` 직접 입력(#RRGGBB)
- 눈색: `h`~`k`
- 옷 조합: `l` 기본 · `m` 숲 레인저 · `n` 흑기사

## 캐릭터 색 바꾸기 (파일로)

설정 창이 쓰는 파일은 `~/.quest/hero.json`이다. 직접 고쳐도 3초 안에 바뀐다. `theme`은 `dark` · `light` · `system`. 색은 `#RRGGBB`. 빼거나 잘못 쓴 값은 기본색.

```json
{
  "hair": "#9b5fd0",
  "eyes": "#1a1420",
  "skin": "#f2c79b",
  "outfit": "#33407a",
  "shirt": "#f0e6d2",
  "pants": "#2a2433",
  "cape": "#7a2a3a",
  "trim": "#e0b04a"
}
```

| 키 | 부위 | 비고 |
| --- | --- | --- |
| `hair` | 머리 | 그림자는 자동 |
| `eyes` | 눈 | |
| `skin` | 피부 | |
| `outfit` | 겉옷(코트) | 그림자는 자동 |
| `shirt` | 셔츠·옷깃 | |
| `pants` | 바지 | |
| `cape` | 망토 | |
| `trim` | 단추·버클 장식 | |

어울리는 조합 예시:

- **기본(보라 머리·검은 눈)**: 남색 코트 `#33407a` + 크림 셔츠 + 와인 망토 `#7a2a3a` + 금 장식
- **숲 레인저**: 코트 `#3e6b48`, 망토 `#5a3a24`, 장식 `#c8a050`
- **흑기사**: 코트 `#2e2a38`, 셔츠 `#9aa0aa`, 망토 `#8e2c2a`, 장식 `#c0c8d0`

## 같이 들어 있는 것

- **`quest-work` 스킬**: 퀘스트 패널에서 `w`로 고른 퀘스트를 서브에이전트로 나눠 병렬 처리합니다. 연결된 메일·드라이브·캘린더에서 맥락을 찾고, 답장이 필요하면 **초안만** 만듭니다(발송·완료 체크·일정 변경은 하지 않음).
- **`r` 메일로 갱신**: Claude에게 최근 메일·일정을 읽고 `tasks.json`을 다시 쓰도록 요청합니다. 메일 커넥터가 연결돼 있어야 해요.

## 개선에 참여하기

PR 환영합니다! 새 직업, 몬스터, 배경, 테마 같은 아이디어도 이슈로 남겨 주세요.

```
git clone https://github.com/yudility/claude-rpg-quest-mod
cd claude-rpg-quest-mod
claude --plugin-dir .          # 이 폴더의 mod를 불러온 세션 (저장하면 다시 불러옴)
claude plugin validate .       # 엔진이 거부할 것이 없는지
claude plugin test .           # hooks/*.test.ts(x)
```

| 파일 | 하는 일 |
| --- | --- |
| `hooks/register.tsx` | 이벤트 훅: 입력창 위 화면, 퀘스트 패널, 설정 창, 명령, `tasks.json` 읽기·쓰기 |
| `hooks/scene.ts` | 픽셀아트: 배경(다크·라이트), 게시판, 직업별 캐릭터, 몬스터, 공격 연출 |
| `hooks/dates.ts` | 마감 표시, 지난 완료 숨김, 제목 끝 날짜 파싱 |
| `types/index.d.ts` | 데이터 타입과 `$.state` 계약 |
| `skills/quest-work/` | 작업 맡기기 스킬 |

스프라이트는 `scene.ts` 안의 문자열 그림이에요. 글자 하나가 픽셀 하나이고, 글자→색은 `COLORS` 표를 봅니다(`.`은 투명). 새 직업은 `heroSprite()`에 레이어(무기·모자 등)를 더하면 됩니다.

## 라이선스

MIT
