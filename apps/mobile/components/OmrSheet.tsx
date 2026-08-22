import { useState, useCallback, memo } from 'react'
import { View, Text, FlatList, TouchableOpacity, StyleSheet } from 'react-native'
import { Colors } from '../constants/colors'

// OMR 답안 입력부 — 학습지와 교재가 함께 쓴다.
//
// 객관식은 1~5 버블, 단답형은 아래 수식 키패드로 입력한다.
// 이미 낸 문항(locked)은 흐리게 표시하고 눌러도 바뀌지 않는다.
//
// ─── 성능 최적화 ──────────────────────────────────────────────────────────────
// ScrollView + .map() → FlatList 가상화:
//   화면 밖 문항은 렌더링하지 않아 200문항도 초기 렌더링 비용 최소화
// OmrRow → memo():
//   키 입력 시 변경된 문항(1개)만 리렌더링, 나머지는 이전 결과 재사용
// useCallback:
//   handleFocus·handleChange 참조 안정화로 OmrRow 불필요 리렌더 방지

export type OmrItem = {
  /** 화면에 보여줄 문제 번호 */
  no: number
  type: 'multiple' | 'short'
  /** 현재 입력값 */
  value: string
  /** 이미 내서 잠긴 문항 */
  locked: boolean
  /** 정답이 등록되지 않아 채점되지 않는 문항 */
  noAnswer?: boolean
}

const CHOICES = ['1', '2', '3', '4', '5']

/** 단답형 입력 키패드 — 숫자와 자주 쓰는 수학 기호 */
const KEYPAD_ROWS: string[][] = [
  ['1', '2', '3', '4', '5', '6', '7', '8', '9', '0'],
  ['/', '.', '-', '+', '=', 'x', 'y', '^', '(', ')'],
  ['√', 'π', '±', '<', '>', '≤', '≥', ',', '°', '∞'],
]

// 행 높이 상수 — getItemLayout에 전달해 스크롤 위치 계산 비용 O(1) 처리
const ROW_HEIGHT = 62 // paddingVertical(8×2) + content(44) + marginBottom(6)

// ─── 개별 문항 행 — memo() + 커스텀 비교 함수로 분리 ──────────────────────────
// ✅ 해당 문제의 값(value), 포커스(isFocused), 잠금(locked) 상태가 바뀌지 않았으면 리렌더링 원천 차단
const OmrRow = memo(function OmrRow({
  item,
  isFocused,
  onFocus,
  onChange,
}: {
  item: OmrItem
  isFocused: boolean
  onFocus: (no: number) => void
  onChange: (no: number, value: string) => void
}) {
  return (
    <View style={[s.row, isFocused && s.rowFocused, item.locked && s.rowLocked]}>
      <Text style={s.no}>{item.no}</Text>

      {item.type === 'short' ? (
        <TouchableOpacity
          style={[s.shortBox, isFocused && s.shortBoxFocused, item.locked && s.boxLocked]}
          onPress={() => { if (!item.locked) onFocus(item.no) }}
          activeOpacity={item.locked ? 1 : 0.7}
        >
          <Text style={item.value ? s.shortText : s.shortPlaceholder}>
            {item.value || '눌러서 입력 (단위 생략)'}
          </Text>
        </TouchableOpacity>
      ) : (
        <View style={s.choices}>
          {CHOICES.map(c => {
            const on = item.value === c
            return (
              <TouchableOpacity
                key={c}
                style={[s.bubble, on && s.bubbleOn, item.locked && s.bubbleLocked]}
                onPress={() => {
                  if (item.locked) return
                  onFocus(item.no)
                  onChange(item.no, on ? '' : c)
                }}
                activeOpacity={item.locked ? 1 : 0.7}
              >
                <Text style={[s.bubbleText, on && s.bubbleTextOn]}>{c}</Text>
              </TouchableOpacity>
            )
          })}
        </View>
      )}

      {item.locked && <Text style={s.tag}>제출됨</Text>}
      {!item.locked && item.noAnswer && <Text style={s.tagWarn}>정답 미등록</Text>}
    </View>
  )
}, (prev, next) => {
  return (
    prev.isFocused === next.isFocused &&
    prev.item.value === next.item.value &&
    prev.item.locked === next.item.locked &&
    prev.item.no === next.item.no &&
    prev.item.noAnswer === next.item.noAnswer &&
    prev.item.type === next.item.type
  )
})

export function OmrSheet({
  items, onChange,
}: {
  items: OmrItem[]
  onChange: (no: number, value: string) => void
}) {
  const [focusedNo, setFocusedNo] = useState<number | null>(null)

  const focusedItem = items.find(i => i.no === focusedNo) ?? null
  const showKeypad = focusedItem !== null && focusedItem.type === 'short' && !focusedItem.locked

  // 참조 안정화 — OmrRow에 전달 시 불필요한 리렌더 방지
  const handleFocus  = useCallback((no: number) => setFocusedNo(no), [])
  const handleChange = useCallback((no: number, value: string) => onChange(no, value), [onChange])

  const press = (key: string) => {
    if (!focusedItem || focusedItem.locked) return
    onChange(focusedItem.no, focusedItem.value + key)
  }
  const backspace = () => {
    if (!focusedItem || focusedItem.locked) return
    onChange(focusedItem.no, focusedItem.value.slice(0, -1))
  }

  // focusedNo 바뀔 때만 renderItem 재생성
  const renderItem = useCallback(({ item }: { item: OmrItem }) => (
    <OmrRow
      item={item}
      isFocused={focusedNo === item.no}
      onFocus={handleFocus}
      onChange={handleChange}
    />
  ), [focusedNo, handleFocus, handleChange])

  // 고정 높이를 미리 알려줘 스크롤 위치 계산 비용 제거
  const getItemLayout = useCallback((_: unknown, index: number) => ({
    length: ROW_HEIGHT,
    offset: ROW_HEIGHT * index,
    index,
  }), [])

  return (
    <>
      {/* ScrollView + .map() → FlatList 가상화: 화면 밖 문항은 렌더링 생략 */}
      <FlatList
        data={items}
        keyExtractor={item => String(item.no)}
        renderItem={renderItem}
        getItemLayout={getItemLayout}
        extraData={focusedNo}           // focusedNo 바뀔 때 FlatList 갱신
        contentContainerStyle={{ padding: 14, paddingBottom: 24 }}
        style={{ flex: 1 }}
        removeClippedSubviews           // 화면 밖 뷰 메모리 해제
        windowSize={7}                  // 뷰포트 위아래 3.5페이지씩 유지
        initialNumToRender={15}         // 초기 15개만 렌더링
        maxToRenderPerBatch={10}        // 배치당 추가 렌더링 10개
      />

      {showKeypad && (
        <View style={s.keypad}>
          <View style={s.keypadHead}>
            <Text style={s.keypadTitle}>{focusedItem.no}번 답 입력</Text>
            <TouchableOpacity onPress={() => setFocusedNo(null)}>
              <Text style={s.keypadClose}>닫기</Text>
            </TouchableOpacity>
          </View>
          {KEYPAD_ROWS.map((row, r) => (
            <View key={r} style={s.keyRow}>
              {row.map(k => (
                <TouchableOpacity key={k} style={s.key} onPress={() => press(k)} activeOpacity={0.7}>
                  <Text style={s.keyText}>{k}</Text>
                </TouchableOpacity>
              ))}
            </View>
          ))}
          <View style={s.keyRow}>
            <TouchableOpacity style={[s.key, s.keyWide]} onPress={backspace} activeOpacity={0.7}>
              <Text style={s.keyText}>⌫ 지우기</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[s.key, s.keyWide]}
              onPress={() => onChange(focusedItem.no, '')}
              activeOpacity={0.7}
            >
              <Text style={s.keyText}>전체 지우기</Text>
            </TouchableOpacity>
          </View>
        </View>
      )}
    </>
  )
}

const s = StyleSheet.create({
  row: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    paddingVertical: 8, paddingHorizontal: 10, marginBottom: 6,
    borderRadius: 12, backgroundColor: 'rgba(255,255,255,0.04)',
  },
  rowFocused: { backgroundColor: 'rgba(108,92,231,0.18)' },
  rowLocked: { opacity: 0.55 },
  no: { color: Colors.subtext, fontSize: 13, fontWeight: '700', width: 34, textAlign: 'right' },

  choices: { flexDirection: 'row', gap: 8, flex: 1 },
  bubble: {
    width: 44, height: 44, borderRadius: 22, borderWidth: 2,
    borderColor: 'rgba(255,255,255,0.2)', alignItems: 'center', justifyContent: 'center',
  },
  bubbleOn: { backgroundColor: Colors.primary, borderColor: Colors.primary },
  bubbleLocked: { opacity: 0.9 },
  bubbleText: { color: Colors.subtext, fontSize: 15, fontWeight: '700' },
  bubbleTextOn: { color: '#fff' },

  shortBox: {
    flex: 1, minHeight: 44, borderRadius: 10, borderWidth: 2,
    borderColor: 'rgba(255,255,255,0.2)', paddingHorizontal: 12, justifyContent: 'center',
  },
  shortBoxFocused: { borderColor: Colors.primary },
  boxLocked: { borderColor: 'rgba(255,255,255,0.12)' },
  shortText: { color: Colors.white, fontSize: 16, fontWeight: '600' },
  shortPlaceholder: { color: Colors.subtext, fontSize: 13 },

  tag: { color: Colors.subtext, fontSize: 10, fontWeight: '700' },
  tagWarn: { color: Colors.gold, fontSize: 10, fontWeight: '700' },

  keypad: {
    backgroundColor: 'rgba(255,255,255,0.06)', paddingHorizontal: 8, paddingTop: 8, paddingBottom: 10,
    borderTopWidth: 1, borderTopColor: 'rgba(255,255,255,0.1)',
  },
  keypadHead: {
    flexDirection: 'row', justifyContent: 'space-between',
    alignItems: 'center', paddingHorizontal: 6, paddingBottom: 6,
  },
  keypadTitle: { color: Colors.white, fontSize: 13, fontWeight: '700' },
  keypadClose: { color: Colors.primary, fontSize: 13, fontWeight: '700' },
  keyRow: { flexDirection: 'row', gap: 4, marginBottom: 4 },
  key: {
    flex: 1, height: 46, borderRadius: 8, backgroundColor: 'rgba(255,255,255,0.1)',
    alignItems: 'center', justifyContent: 'center',
  },
  keyWide: { flex: 5 },
  keyText: { color: Colors.white, fontSize: 16, fontWeight: '600' },
})
