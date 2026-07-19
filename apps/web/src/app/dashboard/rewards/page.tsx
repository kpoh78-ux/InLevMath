'use client'

import { useEffect, useState, useCallback } from 'react'
import { apiFetch } from '@/lib/api'

const RARITY_STYLE: Record<string, { border: string; bg: string; label: string; glow: string }> = {
  common:    { border: '#6b7280', bg: '#f9fafb',   label: '일반',   glow: '' },
  rare:      { border: '#3b82f6', bg: '#eff6ff',   label: '희귀',   glow: '0 0 8px rgba(59,130,246,0.4)' },
  epic:      { border: '#8b5cf6', bg: '#f5f3ff',   label: '영웅',   glow: '0 0 8px rgba(139,92,246,0.4)' },
  legendary: { border: '#f59e0b', bg: '#fffbeb',   label: '전설',   glow: '0 0 12px rgba(245,158,11,0.5)' },
}

type RewardItem = {
  id: string; name: string; description: string; emoji: string
  type: string; rarity: string; pointValue: number; createdAt: string
}

type Student = { id: string; name: string; grade: string; rewardPoints: number }

type InventoryEntry = {
  id: string; quantity: number; status: string; reason: string; grantedAt: string; redeemedAt: string | null
  item: RewardItem
}

const EMOJIS = ['🎁','🏆','⭐','🎖️','💎','🌟','🔥','👑','🎯','📚','✏️','🎮','🍕','🧃','🎪','🎠']

const ITEM_FORM_INIT = { name: '', description: '', emoji: '🎁', type: 'virtual', rarity: 'common', pointValue: 0 }

export default function RewardsPage() {
  const [items, setItems]           = useState<RewardItem[]>([])
  const [students, setStudents]     = useState<Student[]>([])
  const [selectedStudent, setSelectedStudent] = useState<Student | null>(null)
  const [inventory, setInventory]   = useState<InventoryEntry[]>([])
  const [pointHistory, setPointHistory] = useState<{ id:string;amount:number;reason:string;type:string;createdAt:string }[]>([])
  const [showItemForm, setShowItemForm] = useState(false)
  const [itemForm, setItemForm]     = useState(ITEM_FORM_INIT)
  const [showPointModal, setShowPointModal] = useState(false)
  const [pointForm, setPointForm]   = useState({ amount: '', reason: '', sign: '+' })
  const [showGrantModal, setShowGrantModal] = useState(false)
  const [grantReason, setGrantReason] = useState('')
  const [grantItemId, setGrantItemId] = useState('')
  const [saving, setSaving]         = useState(false)
  const [tab, setTab]               = useState<'items' | 'students'>('items')

  const loadItems = useCallback(async () => {
    const res = await apiFetch('/api/rewards/items')
    if (res.ok) setItems(await res.json())
  }, [])

  const loadStudents = useCallback(async () => {
    const res = await apiFetch('/api/students')
    if (res.ok) {
      const data = await res.json()
      setStudents(data.filter((s: any) => s.status !== 'withdrawn').map((s: any) => ({
        id: s.id, name: s.name, grade: s.grade, rewardPoints: s.rewardPoints ?? 0,
      })))
    }
  }, [])

  const loadInventory = useCallback(async (studentId: string) => {
    const res = await apiFetch(`/api/rewards/students/${studentId}/inventory`)
    if (res.ok) {
      const d = await res.json()
      setInventory(d.rewards ?? [])
      setPointHistory(d.pointHistory ?? [])
      // 포인트 갱신
      setStudents(prev => prev.map(s => s.id === studentId ? { ...s, rewardPoints: d.rewardPoints } : s))
      if (selectedStudent?.id === studentId) {
        setSelectedStudent(prev => prev ? { ...prev, rewardPoints: d.rewardPoints } : prev)
      }
    }
  }, [selectedStudent?.id])

  useEffect(() => { loadItems(); loadStudents() }, [loadItems, loadStudents])
  useEffect(() => { if (selectedStudent) loadInventory(selectedStudent.id) }, [selectedStudent, loadInventory])

  // 아이템 생성
  const handleCreateItem = async () => {
    if (!itemForm.name.trim()) { alert('이름을 입력하세요'); return }
    setSaving(true)
    const res = await apiFetch('/api/rewards/items', { method: 'POST', body: JSON.stringify(itemForm) })
    setSaving(false)
    if (res.ok) { setShowItemForm(false); setItemForm(ITEM_FORM_INIT); loadItems() }
  }

  // 아이템 삭제
  const handleDeleteItem = async (itemId: string) => {
    if (!confirm('이 아이템을 삭제할까요?')) return
    await apiFetch('/api/rewards/items', { method: 'DELETE', body: JSON.stringify({ itemId }) })
    loadItems()
  }

  // 아이템 지급
  const handleGrant = async () => {
    if (!selectedStudent || !grantItemId) return
    setSaving(true)
    await apiFetch(`/api/rewards/students/${selectedStudent.id}/grant`, {
      method: 'POST',
      body: JSON.stringify({ itemId: grantItemId, reason: grantReason }),
    })
    setSaving(false)
    setShowGrantModal(false); setGrantReason(''); setGrantItemId('')
    loadInventory(selectedStudent.id)
  }

  // 포인트 추가/차감
  const handlePoints = async () => {
    if (!selectedStudent || !pointForm.amount || !pointForm.reason) return
    const amount = parseInt(pointForm.amount) * (pointForm.sign === '-' ? -1 : 1)
    setSaving(true)
    await apiFetch(`/api/rewards/students/${selectedStudent.id}/points`, {
      method: 'POST',
      body: JSON.stringify({ amount, reason: pointForm.reason, type: 'manual' }),
    })
    setSaving(false)
    setShowPointModal(false); setPointForm({ amount: '', reason: '', sign: '+' })
    loadInventory(selectedStudent.id); loadStudents()
  }

  // 실물 수령 처리
  const handleRedeem = async (rewardId: string) => {
    if (!selectedStudent || !confirm('실물 보상을 수령 처리할까요?')) return
    await apiFetch(`/api/rewards/students/${selectedStudent.id}/redeem`, {
      method: 'POST', body: JSON.stringify({ rewardId }),
    })
    loadInventory(selectedStudent.id)
  }

  const rs = (r: string) => RARITY_STYLE[r] ?? RARITY_STYLE.common

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold text-gray-900">보상 관리</h1>
        <div className="flex border border-gray-200 rounded-lg overflow-hidden text-sm">
          {(['items','students'] as const).map(t => (
            <button key={t} onClick={() => setTab(t)}
              className={`px-4 py-2 font-medium transition-colors ${tab===t ? 'bg-indigo-600 text-white' : 'text-gray-500 hover:bg-gray-50'}`}>
              {t === 'items' ? '🎁 아이템 관리' : '👥 학생 보관창고'}
            </button>
          ))}
        </div>
      </div>

      {/* ── 아이템 관리 탭 ── */}
      {tab === 'items' && (
        <div className="space-y-4">
          <div className="flex justify-end">
            <button onClick={() => setShowItemForm(true)}
              className="bg-indigo-600 text-white text-sm font-semibold px-4 py-2 rounded-lg hover:bg-indigo-700 transition-colors">
              + 새 아이템 만들기
            </button>
          </div>

          {/* 아이템 생성 폼 */}
          {showItemForm && (
            <div className="bg-white border border-indigo-200 rounded-2xl p-5 space-y-4">
              <h3 className="font-bold text-gray-900">새 보상 아이템</h3>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-xs text-gray-500 mb-1 block">아이템 이름 *</label>
                  <input className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
                    value={itemForm.name} onChange={e => setItemForm(f => ({ ...f, name: e.target.value }))}
                    placeholder="예) 황금 연필, 문화상품권 1만원" />
                </div>
                <div>
                  <label className="text-xs text-gray-500 mb-1 block">아이콘</label>
                  <div className="flex flex-wrap gap-1.5">
                    {EMOJIS.map(em => (
                      <button key={em} onClick={() => setItemForm(f => ({ ...f, emoji: em }))}
                        className={`text-xl w-9 h-9 rounded-lg flex items-center justify-center transition-colors
                          ${itemForm.emoji === em ? 'bg-indigo-100 ring-2 ring-indigo-400' : 'bg-gray-50 hover:bg-gray-100'}`}>
                        {em}
                      </button>
                    ))}
                  </div>
                </div>
                <div>
                  <label className="text-xs text-gray-500 mb-1 block">설명 (효과)</label>
                  <input className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
                    value={itemForm.description} onChange={e => setItemForm(f => ({ ...f, description: e.target.value }))}
                    placeholder="예) 모든 능력치가 5% 증가합니다." />
                </div>
                <div>
                  <label className="text-xs text-gray-500 mb-1 block">함께 지급할 포인트</label>
                  <input type="number" min={0}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
                    value={itemForm.pointValue} onChange={e => setItemForm(f => ({ ...f, pointValue: Number(e.target.value) }))} />
                </div>
                <div>
                  <label className="text-xs text-gray-500 mb-1 block">종류</label>
                  <select className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm bg-white"
                    value={itemForm.type} onChange={e => setItemForm(f => ({ ...f, type: e.target.value }))}>
                    <option value="virtual">가상 (디지털 뱃지/칭호)</option>
                    <option value="physical">실물 (실제 지급 보상)</option>
                  </select>
                </div>
                <div>
                  <label className="text-xs text-gray-500 mb-1 block">희귀도</label>
                  <select className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm bg-white"
                    value={itemForm.rarity} onChange={e => setItemForm(f => ({ ...f, rarity: e.target.value }))}>
                    <option value="common">일반 (회색)</option>
                    <option value="rare">희귀 (파랑)</option>
                    <option value="epic">영웅 (보라)</option>
                    <option value="legendary">전설 (금색)</option>
                  </select>
                </div>
              </div>
              <div className="flex gap-2 pt-1">
                <button onClick={() => { setShowItemForm(false); setItemForm(ITEM_FORM_INIT) }}
                  className="flex-1 border border-gray-300 text-gray-600 rounded-lg py-2 text-sm hover:bg-gray-50">취소</button>
                <button onClick={handleCreateItem} disabled={saving}
                  className="flex-1 bg-indigo-600 text-white rounded-lg py-2 text-sm font-semibold hover:bg-indigo-700 disabled:opacity-50">
                  {saving ? '저장 중...' : '아이템 생성'}
                </button>
              </div>
            </div>
          )}

          {/* 아이템 목록 */}
          {items.length === 0 && !showItemForm ? (
            <div className="bg-white rounded-xl border border-gray-200 py-16 text-center text-gray-400">
              <p className="text-3xl mb-2">🎁</p>
              <p className="text-sm">아직 보상 아이템이 없습니다.</p>
              <p className="text-xs mt-1">학생에게 지급할 아이템을 만들어 보세요!</p>
            </div>
          ) : (
            <div className="grid grid-cols-3 gap-3">
              {items.map(item => {
                const s = rs(item.rarity)
                return (
                  <div key={item.id} className="bg-white rounded-xl p-4 relative"
                    style={{ border: `2px solid ${s.border}`, boxShadow: s.glow, background: s.bg }}>
                    <div className="flex items-start justify-between mb-2">
                      <span className="text-3xl">{item.emoji}</span>
                      <div className="flex gap-1.5">
                        <span className="text-[10px] font-bold px-1.5 py-0.5 rounded"
                          style={{ background: s.border + '20', color: s.border }}>{s.label}</span>
                        {item.type === 'physical' && (
                          <span className="text-[10px] bg-amber-100 text-amber-700 font-bold px-1.5 py-0.5 rounded">실물</span>
                        )}
                      </div>
                    </div>
                    <p className="font-bold text-gray-900 text-sm">{item.name}</p>
                    {item.description && <p className="text-xs text-gray-400 mt-1 line-clamp-2">{item.description}</p>}
                    {item.pointValue > 0 && (
                      <p className="text-xs text-amber-600 font-semibold mt-1.5">+{item.pointValue}P 지급</p>
                    )}
                    <button onClick={() => handleDeleteItem(item.id)}
                      className="absolute top-2 right-2 text-gray-300 hover:text-red-400 text-lg leading-none">×</button>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      )}

      {/* ── 학생 보관창고 탭 ── */}
      {tab === 'students' && (
        <div className="grid grid-cols-4 gap-5 items-start">
          {/* 학생 목록 */}
          <div className="col-span-1 bg-white rounded-xl border border-gray-200 overflow-hidden">
            <div className="px-4 py-3 bg-gray-50 border-b border-gray-100">
              <p className="text-xs font-bold text-gray-500">학생 선택</p>
            </div>
            {students.map(s => (
              <button key={s.id} onClick={() => setSelectedStudent(s)}
                className={`w-full flex items-center justify-between px-4 py-3 border-b border-gray-50 hover:bg-gray-50 transition-colors text-left
                  ${selectedStudent?.id === s.id ? 'bg-indigo-50' : ''}`}>
                <div>
                  <p className={`text-sm font-semibold ${selectedStudent?.id === s.id ? 'text-indigo-700' : 'text-gray-800'}`}>{s.name}</p>
                  <p className="text-[11px] text-gray-400">{s.grade}</p>
                </div>
                <span className="text-xs font-bold text-amber-600">{s.rewardPoints}P</span>
              </button>
            ))}
          </div>

          {/* 선택된 학생 보관창고 */}
          <div className="col-span-3 space-y-4">
            {!selectedStudent ? (
              <div className="bg-white rounded-xl border border-gray-200 py-20 text-center text-gray-400">
                <p className="text-3xl mb-2">👈</p>
                <p className="text-sm">왼쪽에서 학생을 선택하세요.</p>
              </div>
            ) : (
              <>
                {/* 학생 헤더 */}
                <div className="bg-white rounded-xl border border-gray-200 p-4 flex items-center justify-between">
                  <div>
                    <h2 className="font-bold text-gray-900">{selectedStudent.name} 학생의 보관창고</h2>
                    <p className="text-xs text-gray-400 mt-0.5">{selectedStudent.grade}</p>
                  </div>
                  <div className="flex items-center gap-3">
                    <div className="text-center">
                      <p className="text-2xl font-black text-amber-600">{selectedStudent.rewardPoints}
                        <span className="text-sm font-bold text-gray-400 ml-0.5">P</span>
                      </p>
                      <p className="text-[11px] text-gray-400">보유 포인트</p>
                    </div>
                    <button onClick={() => setShowPointModal(true)}
                      className="text-xs border border-amber-300 text-amber-700 hover:bg-amber-50 px-3 py-1.5 rounded-lg transition-colors font-medium">
                      ± 포인트
                    </button>
                    <button onClick={() => setShowGrantModal(true)}
                      className="text-xs bg-indigo-600 text-white hover:bg-indigo-700 px-3 py-1.5 rounded-lg transition-colors font-semibold">
                      🎁 아이템 지급
                    </button>
                  </div>
                </div>

                {/* 보관창고 그리드 */}
                <div className="bg-white rounded-xl border border-gray-200 p-5">
                  <p className="text-xs font-bold text-gray-500 mb-4">보유 아이템 ({inventory.filter(r=>r.status==='owned').length}개)</p>
                  {inventory.filter(r => r.status === 'owned').length === 0 ? (
                    <div className="py-10 text-center text-gray-300 text-sm">보유 중인 아이템이 없습니다.</div>
                  ) : (
                    <div className="grid grid-cols-4 gap-3">
                      {inventory.filter(r => r.status === 'owned').map(r => {
                        const s = rs(r.item.rarity)
                        return (
                          <div key={r.id} className="rounded-xl p-3 relative"
                            style={{ border: `2px solid ${s.border}`, boxShadow: s.glow, background: s.bg }}>
                            <div className="text-2xl text-center mb-1">{r.item.emoji}</div>
                            <p className="text-xs font-bold text-gray-800 text-center leading-tight">{r.item.name}</p>
                            {r.quantity > 1 && (
                              <span className="absolute top-1.5 right-1.5 bg-indigo-500 text-white text-[10px] font-bold rounded-full w-4 h-4 flex items-center justify-center">
                                {r.quantity}
                              </span>
                            )}
                            {r.item.type === 'physical' && (
                              <button onClick={() => handleRedeem(r.id)}
                                className="w-full mt-2 text-[10px] bg-amber-500 text-white rounded py-0.5 font-semibold hover:bg-amber-600">
                                수령처리
                              </button>
                            )}
                          </div>
                        )
                      })}
                    </div>
                  )}
                </div>

                {/* 수령 완료 아이템 */}
                {inventory.filter(r => r.status === 'redeemed').length > 0 && (
                  <div className="bg-white rounded-xl border border-gray-200 p-5">
                    <p className="text-xs font-bold text-gray-400 mb-3">수령 완료 ({inventory.filter(r=>r.status==='redeemed').length}개)</p>
                    <div className="grid grid-cols-4 gap-3">
                      {inventory.filter(r => r.status === 'redeemed').map(r => (
                        <div key={r.id} className="rounded-xl p-3 opacity-50 bg-gray-50 border border-gray-200">
                          <div className="text-2xl text-center mb-1 grayscale">{r.item.emoji}</div>
                          <p className="text-xs font-bold text-gray-500 text-center">{r.item.name}</p>
                          <p className="text-[10px] text-gray-400 text-center mt-0.5">수령완료</p>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* 포인트 내역 */}
                {pointHistory.length > 0 && (
                  <div className="bg-white rounded-xl border border-gray-200 p-5">
                    <p className="text-xs font-bold text-gray-500 mb-3">포인트 내역</p>
                    <div className="space-y-2">
                      {pointHistory.map(tx => (
                        <div key={tx.id} className="flex items-center justify-between text-sm">
                          <span className="text-gray-600">{tx.reason}</span>
                          <span className={`font-bold ${tx.amount > 0 ? 'text-emerald-600' : 'text-rose-500'}`}>
                            {tx.amount > 0 ? '+' : ''}{tx.amount}P
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      )}

      {/* ── 포인트 모달 ── */}
      {showPointModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-2xl p-6 w-80 space-y-4 shadow-2xl">
            <h3 className="font-bold text-gray-900">포인트 추가 / 차감</h3>
            <div className="flex gap-2">
              {(['+','-'] as const).map(s => (
                <button key={s} onClick={() => setPointForm(f => ({ ...f, sign: s }))}
                  className={`flex-1 py-2 rounded-lg font-bold text-lg transition-colors
                    ${pointForm.sign === s
                      ? (s === '+' ? 'bg-emerald-500 text-white' : 'bg-rose-500 text-white')
                      : 'bg-gray-100 text-gray-400'}`}>
                  {s}
                </button>
              ))}
            </div>
            <input type="number" min={1} placeholder="포인트 값"
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
              value={pointForm.amount} onChange={e => setPointForm(f => ({ ...f, amount: e.target.value }))} />
            <input type="text" placeholder="사유 (예: 시험 성적 우수)"
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
              value={pointForm.reason} onChange={e => setPointForm(f => ({ ...f, reason: e.target.value }))} />
            <div className="flex gap-2 pt-1">
              <button onClick={() => { setShowPointModal(false); setPointForm({ amount:'',reason:'',sign:'+' }) }}
                className="flex-1 border border-gray-300 text-gray-600 rounded-lg py-2 text-sm">취소</button>
              <button onClick={handlePoints} disabled={saving}
                className="flex-1 bg-indigo-600 text-white rounded-lg py-2 text-sm font-semibold disabled:opacity-50">
                {saving ? '처리 중...' : '확인'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── 아이템 지급 모달 ── */}
      {showGrantModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-2xl p-6 w-96 space-y-4 shadow-2xl">
            <h3 className="font-bold text-gray-900">아이템 지급</h3>
            <div className="grid grid-cols-3 gap-2 max-h-52 overflow-y-auto">
              {items.map(item => {
                const s = rs(item.rarity)
                return (
                  <button key={item.id} onClick={() => setGrantItemId(item.id)}
                    className="rounded-xl p-3 text-center transition-all"
                    style={{
                      border: `2px solid ${grantItemId === item.id ? '#6366f1' : s.border}`,
                      background: grantItemId === item.id ? '#eef2ff' : s.bg,
                      boxShadow: grantItemId === item.id ? '0 0 0 3px rgba(99,102,241,0.3)' : s.glow,
                    }}>
                    <div className="text-2xl">{item.emoji}</div>
                    <p className="text-[11px] font-bold text-gray-700 mt-1 leading-tight">{item.name}</p>
                  </button>
                )
              })}
            </div>
            <input type="text" placeholder="지급 사유 (예: 시험 100점)"
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
              value={grantReason} onChange={e => setGrantReason(e.target.value)} />
            <div className="flex gap-2 pt-1">
              <button onClick={() => { setShowGrantModal(false); setGrantReason(''); setGrantItemId('') }}
                className="flex-1 border border-gray-300 text-gray-600 rounded-lg py-2 text-sm">취소</button>
              <button onClick={handleGrant} disabled={saving || !grantItemId}
                className="flex-1 bg-indigo-600 text-white rounded-lg py-2 text-sm font-semibold disabled:opacity-50">
                {saving ? '지급 중...' : '지급하기'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
