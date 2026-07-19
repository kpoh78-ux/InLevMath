'use client'
import { useCallback, useEffect, useState } from 'react'
import {
  View, Text, ScrollView, TouchableOpacity,
  StyleSheet, RefreshControl, ActivityIndicator,
} from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { apiFetch } from '../../store/api'
import { useAuth } from '../../store/authStore'
import { Colors } from '../../constants/colors'

type RewardItem = {
  id: string; name: string; emoji: string
  rarity: string; type: string; pointValue: number; description: string
}

type InventoryEntry = {
  id: string; quantity: number; status: string; reason: string; grantedAt: string
  item: RewardItem
}

type PointTx = {
  id: string; amount: number; reason: string; type: string; createdAt: string
}

type Inventory = {
  name: string; rewardPoints: number
  rewards: InventoryEntry[]; pointHistory: PointTx[]
}

const RARITY: Record<string, { border: string; label: string; labelColor: string; bg: string }> = {
  common:    { border: '#6b7280', label: '일반', labelColor: '#9ca3af', bg: '#374151' },
  rare:      { border: '#3b82f6', label: '레어', labelColor: '#60a5fa', bg: '#1e3a5f' },
  epic:      { border: '#a855f7', label: '에픽', labelColor: '#c084fc', bg: '#3b1d5e' },
  legendary: { border: '#c9aa71', label: '전설', labelColor: '#fbbf24', bg: '#3d2c0a' },
}

export default function InventoryScreen() {
  const { user } = useAuth()
  const [inventory, setInventory] = useState<Inventory | null>(null)
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [showHistory, setShowHistory] = useState(false)
  const [activeTab, setActiveTab] = useState<'all' | 'owned' | 'redeemed'>('all')

  const fetchInventory = useCallback(async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true)
    try {
      // 학생 본인 ID로 인벤토리 조회 - 학생은 자기 자신만 볼 수 있음
      // user.studentId 또는 별도 /api/student/inventory 엔드포인트 필요
      const res = await apiFetch('/api/student/inventory')
      if (res.ok) setInventory(await res.json())
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }, [])

  useEffect(() => { fetchInventory() }, [fetchInventory])

  const filtered = (inventory?.rewards ?? []).filter(e => {
    if (activeTab === 'owned')   return e.status === 'owned'
    if (activeTab === 'redeemed') return e.status === 'redeemed'
    return true
  })

  if (loading) {
    return (
      <SafeAreaView style={styles.safe}>
        <View style={styles.center}>
          <ActivityIndicator size="large" color={Colors.gold} />
          <Text style={styles.loadingText}>보관창고 불러오는 중...</Text>
        </View>
      </SafeAreaView>
    )
  }

  return (
    <SafeAreaView style={styles.safe}>
      <ScrollView
        style={styles.scroll}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={() => fetchInventory(true)}
            tintColor={Colors.gold} colors={[Colors.gold]} />
        }
      >
        {/* ── 헤더 (상태창 스타일) ── */}
        <View style={styles.statusHeader}>
          <View style={styles.statusDeco} />
          <View style={styles.statusTitleRow}>
            <Text style={styles.statusDiamondL}>❖</Text>
            <Text style={styles.statusTitle}>보  관  창  고</Text>
            <Text style={styles.statusDiamondR}>❖</Text>
          </View>
          <View style={styles.statusDeco} />
        </View>

        {/* ── 포인트 카드 ── */}
        <View style={styles.pointCard}>
          <View>
            <Text style={styles.pointLabel}>안녕하세요, {user?.name} 학생</Text>
            <Text style={styles.pointSub}>보유 포인트</Text>
          </View>
          <View style={styles.pointRight}>
            <Text style={styles.pointIcon}>💎</Text>
            <Text style={styles.pointValue}>{inventory?.rewardPoints ?? 0}</Text>
            <Text style={styles.pointUnit}>P</Text>
          </View>
        </View>

        {/* ── 탭 필터 ── */}
        <View style={styles.tabRow}>
          {(['all', 'owned', 'redeemed'] as const).map(tab => (
            <TouchableOpacity
              key={tab}
              style={[styles.tab, activeTab === tab && styles.tabActive]}
              onPress={() => setActiveTab(tab)}
            >
              <Text style={[styles.tabText, activeTab === tab && styles.tabTextActive]}>
                {tab === 'all' ? '전체' : tab === 'owned' ? '보유중' : '수령완료'}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* ── 아이템 그리드 ── */}
        <View style={styles.sectionBox}>
          {filtered.length === 0 ? (
            <View style={styles.emptyBox}>
              <Text style={styles.emptyIcon}>🎒</Text>
              <Text style={styles.emptyText}>
                {activeTab === 'redeemed' ? '수령한 보상이 없습니다' : '아직 아이템이 없습니다'}
              </Text>
              <Text style={styles.emptySubText}>퀘스트를 완수하면 선생님께 보상을 받을 수 있어요!</Text>
            </View>
          ) : (
            <View style={styles.grid}>
              {filtered.map(entry => {
                const r = RARITY[entry.item.rarity] ?? RARITY.common
                const redeemed = entry.status === 'redeemed'
                return (
                  <View key={entry.id} style={[styles.itemBox, { borderColor: r.border, backgroundColor: r.bg }, redeemed && styles.itemBoxRedeemed]}>
                    {entry.quantity > 1 && (
                      <View style={styles.qtyBadge}>
                        <Text style={styles.qtyText}>×{entry.quantity}</Text>
                      </View>
                    )}
                    {redeemed && (
                      <View style={styles.redeemedOverlay}>
                        <Text style={styles.redeemedText}>수령완료</Text>
                      </View>
                    )}
                    <Text style={styles.itemEmoji}>{entry.item.emoji}</Text>
                    <Text style={styles.itemName} numberOfLines={2}>{entry.item.name}</Text>
                    <Text style={[styles.rarityLabel, { color: r.labelColor }]}>{r.label}</Text>
                    {entry.item.type === 'physical' && !redeemed && (
                      <View style={styles.physicalBadge}>
                        <Text style={styles.physicalText}>실물</Text>
                      </View>
                    )}
                  </View>
                )
              })}
            </View>
          )}
        </View>

        {/* ── 포인트 내역 ── */}
        {(inventory?.pointHistory?.length ?? 0) > 0 && (
          <View style={styles.sectionBox}>
            <TouchableOpacity style={styles.historyToggle} onPress={() => setShowHistory(v => !v)}>
              <Text style={styles.historyToggleText}>포인트 획득 내역</Text>
              <Text style={styles.historyToggleArrow}>{showHistory ? '▲' : '▼'}</Text>
            </TouchableOpacity>
            {showHistory && (
              <View style={styles.historyList}>
                {inventory!.pointHistory.map(tx => (
                  <View key={tx.id} style={styles.historyRow}>
                    <Text style={styles.historyReason} numberOfLines={1}>{tx.reason}</Text>
                    <Text style={[styles.historyAmount, { color: tx.amount > 0 ? Colors.success : Colors.danger }]}>
                      {tx.amount > 0 ? '+' : ''}{tx.amount}P
                    </Text>
                  </View>
                ))}
              </View>
            )}
          </View>
        )}

        <View style={{ height: 40 }} />
      </ScrollView>
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: Colors.bg },
  scroll: { flex: 1 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12 },
  loadingText: { color: Colors.subtext, fontSize: 14 },

  // 상태창 헤더
  statusHeader: {
    marginHorizontal: 20, marginTop: 16, marginBottom: 16,
    backgroundColor: '#0d1b3e', borderWidth: 2, borderColor: '#c9aa71', borderRadius: 12, overflow: 'hidden',
  },
  statusDeco: { height: 3, backgroundColor: '#c9aa71', opacity: 0.7 },
  statusTitleRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    paddingVertical: 12, gap: 8,
  },
  statusTitle: {
    color: '#ffd700', fontSize: 18, fontWeight: '900', letterSpacing: 4,
    textShadowColor: 'rgba(255,215,0,0.5)', textShadowOffset: { width: 0, height: 0 }, textShadowRadius: 8,
  },
  statusDiamondL: { color: '#c9aa71', fontSize: 14 },
  statusDiamondR: { color: '#c9aa71', fontSize: 14 },

  // 포인트 카드
  pointCard: {
    marginHorizontal: 20, marginBottom: 16,
    backgroundColor: '#0d1b3e', borderRadius: 16, borderWidth: 2, borderColor: '#c9aa71',
    padding: 18, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
  },
  pointLabel: { color: Colors.white, fontSize: 14, fontWeight: '700', marginBottom: 2 },
  pointSub: { color: '#a0c4e8', fontSize: 12 },
  pointRight: { flexDirection: 'row', alignItems: 'flex-end', gap: 2 },
  pointIcon: { fontSize: 20, marginBottom: 2 },
  pointValue: {
    color: '#ffd700', fontSize: 28, fontWeight: '900',
    textShadowColor: 'rgba(255,215,0,0.5)', textShadowOffset: { width: 0, height: 0 }, textShadowRadius: 8,
  },
  pointUnit: { color: '#c9aa71', fontSize: 16, fontWeight: '700', marginBottom: 3 },

  // 탭
  tabRow: { flexDirection: 'row', gap: 8, marginHorizontal: 20, marginBottom: 14 },
  tab: {
    flex: 1, paddingVertical: 8, borderRadius: 10, backgroundColor: Colors.card,
    borderWidth: 1, borderColor: Colors.border, alignItems: 'center',
  },
  tabActive: { backgroundColor: '#1e1b4b', borderColor: '#6366f1' },
  tabText: { color: Colors.subtext, fontSize: 13, fontWeight: '600' },
  tabTextActive: { color: '#a5b4fc' },

  // 섹션 박스
  sectionBox: {
    marginHorizontal: 20, marginBottom: 14,
    backgroundColor: '#0d1b3e', borderRadius: 16, borderWidth: 1, borderColor: 'rgba(201,170,113,0.3)',
    overflow: 'hidden',
  },

  // 빈 상태
  emptyBox: { alignItems: 'center', paddingVertical: 40, paddingHorizontal: 20 },
  emptyIcon: { fontSize: 40, marginBottom: 12 },
  emptyText: { color: Colors.white, fontSize: 14, fontWeight: '600', marginBottom: 6 },
  emptySubText: { color: Colors.subtext, fontSize: 12, textAlign: 'center', lineHeight: 18 },

  // 아이템 그리드
  grid: { flexDirection: 'row', flexWrap: 'wrap', padding: 12, gap: 8 },
  itemBox: {
    width: '22%', aspectRatio: 0.8, borderRadius: 12, borderWidth: 2,
    alignItems: 'center', justifyContent: 'center', padding: 6,
    position: 'relative', overflow: 'hidden',
  },
  itemBoxRedeemed: { opacity: 0.55 },
  itemEmoji: { fontSize: 22, marginBottom: 4 },
  itemName: { color: Colors.white, fontSize: 9, fontWeight: '700', textAlign: 'center', lineHeight: 12 },
  rarityLabel: { fontSize: 9, fontWeight: '600', marginTop: 2 },
  qtyBadge: {
    position: 'absolute', top: 3, right: 4,
    backgroundColor: 'rgba(251,191,36,0.9)', borderRadius: 6, paddingHorizontal: 3,
  },
  qtyText: { color: '#1a1a1a', fontSize: 9, fontWeight: '800' },
  redeemedOverlay: {
    position: 'absolute', inset: 0, backgroundColor: 'rgba(0,0,0,0.55)',
    alignItems: 'center', justifyContent: 'center',
  },
  redeemedText: { color: '#9ca3af', fontSize: 9, fontWeight: '700' },
  physicalBadge: {
    marginTop: 2, backgroundColor: 'rgba(251,146,60,0.25)', borderRadius: 4, paddingHorizontal: 4, paddingVertical: 1,
  },
  physicalText: { color: '#fb923c', fontSize: 8, fontWeight: '700' },

  // 포인트 내역
  historyToggle: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    padding: 14, borderBottomWidth: 1, borderBottomColor: 'rgba(201,170,113,0.2)',
  },
  historyToggleText: { color: '#c9aa71', fontSize: 14, fontWeight: '700' },
  historyToggleArrow: { color: '#c9aa71', fontSize: 12 },
  historyList: { paddingHorizontal: 16, paddingVertical: 8 },
  historyRow: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: 'rgba(255,255,255,0.05)',
  },
  historyReason: { flex: 1, color: 'rgba(255,255,255,0.6)', fontSize: 12, marginRight: 12 },
  historyAmount: { fontSize: 13, fontWeight: '800' },
})
