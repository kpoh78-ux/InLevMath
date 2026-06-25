import { useState } from 'react'
import {
  View, Text, FlatList, TouchableOpacity,
  StyleSheet, TextInput, Alert, Modal, ScrollView, ActivityIndicator,
} from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { Colors } from '../../constants/colors'
import { APP_LIMITS, MISSION_LABELS, MissionType } from '@inlevmath/shared'
import { LevelBadge } from '../../components/LevelBadge'

type Student = {
  id: string; name: string; phone: string; school: string; grade: string
  level: number; currentMission: MissionType; lastActive: string
  comprehension: number; reasoning: number; calculation: number
}

const MOCK_STUDENTS: Student[] = [
  { id: 's1', name: '홍길동', phone: '01012345678', school: '오성중학교', grade: '중2', level: 3, currentMission: 'basic_problem',    lastActive: '오늘',   comprehension: 72, reasoning: 58, calculation: 45 },
  { id: 's2', name: '김철수', phone: '01023456789', school: '한빛중학교', grade: '중1', level: 1, currentMission: 'concept_learning', lastActive: '어제',   comprehension: 40, reasoning: 20, calculation: 15 },
  { id: 's3', name: '이영희', phone: '01034567890', school: '오성중학교', grade: '중3', level: 5, currentMission: 'top_problem',      lastActive: '오늘',   comprehension: 91, reasoning: 88, calculation: 85 },
  { id: 's4', name: '박지민', phone: '01045678901', school: '한빛중학교', grade: '중2', level: 2, currentMission: 'concept_problem',  lastActive: '3일 전', comprehension: 65, reasoning: 40, calculation: 32 },
]

const GRADE_OPTIONS = ['중1', '중2', '중3', '고1', '고2', '고3']

export default function StudentsScreen() {
  const [students, setStudents] = useState<Student[]>(MOCK_STUDENTS)
  const [search, setSearch] = useState('')
  const [showAddModal, setShowAddModal] = useState(false)
  const [addLoading, setAddLoading] = useState(false)

  const [newName, setNewName]     = useState('')
  const [newPhone, setNewPhone]   = useState('')
  const [newSchool, setNewSchool] = useState('')
  const [newGrade, setNewGrade]   = useState('')

  const filtered = students.filter(s =>
    s.name.includes(search) ||
    s.school.includes(search) ||
    MISSION_LABELS[s.currentMission].includes(search)
  )

  const resetForm = () => { setNewName(''); setNewPhone(''); setNewSchool(''); setNewGrade('') }

  const handleAddStudent = async () => {
    if (!newName.trim() || !newPhone.trim() || !newSchool.trim() || !newGrade.trim()) {
      Alert.alert('입력 오류', '이름, 핸드폰번호, 학교, 학년을 모두 입력해주세요.')
      return
    }
    if (!/^\d{11}$/.test(newPhone.trim())) {
      Alert.alert('입력 오류', '핸드폰번호는 숫자 11자리로 입력해주세요.\n예) 01012345678')
      return
    }
    if (students.some(s => s.phone === newPhone.trim())) {
      Alert.alert('중복 오류', '이미 등록된 핸드폰번호입니다.')
      return
    }
    setAddLoading(true)
    try {
      // TODO: 실제 API 연동 — POST /api/students
      await new Promise(r => setTimeout(r, 600))
      const added: Student = {
        id: `s${Date.now()}`,
        name: newName.trim(), phone: newPhone.trim(),
        school: newSchool.trim(), grade: newGrade.trim(),
        level: 1, currentMission: 'concept_learning', lastActive: '방금',
        comprehension: 0, reasoning: 0, calculation: 0,
      }
      setStudents(prev => [...prev, added])
      resetForm()
      setShowAddModal(false)
      Alert.alert('등록 완료', `${added.name} 학생이 등록되었습니다.\n아이디: ${added.phone}\n초기 비밀번호: math1234`)
    } catch {
      Alert.alert('오류', '학생 등록에 실패했습니다.')
    } finally {
      setAddLoading(false)
    }
  }

  const handleResetPassword = (student: Student) => {
    Alert.alert(
      '비밀번호 초기화',
      `${student.name} 학생의 비밀번호를\nmath1234로 초기화할까요?`,
      [
        { text: '취소', style: 'cancel' },
        {
          text: '초기화',
          style: 'destructive',
          onPress: async () => {
            // TODO: 실제 API 연동 — POST /api/students/[id]/reset-password
            await new Promise(r => setTimeout(r, 400))
            Alert.alert('완료', `${student.name} 학생의 비밀번호가\nmath1234로 초기화되었습니다.`)
          },
        },
      ]
    )
  }

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.topBar}>
        <Text style={styles.pageTitle}>학생 관리</Text>
        <TouchableOpacity style={styles.addBtn} onPress={() => setShowAddModal(true)}>
          <Text style={styles.addBtnText}>+ 학생 등록</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.countRow}>
        <Text style={styles.countText}>
          총 {students.length}명<Text style={styles.countMax}> / {APP_LIMITS.maxStudents}명</Text>
        </Text>
      </View>

      <TextInput
        style={styles.search}
        placeholder="이름, 학교, 미션 검색"
        placeholderTextColor={Colors.subtext}
        value={search}
        onChangeText={setSearch}
      />

      <FlatList
        data={filtered}
        keyExtractor={(i) => i.id}
        contentContainerStyle={styles.list}
        showsVerticalScrollIndicator={false}
        renderItem={({ item }) => (
          <View style={styles.card}>
            <View style={styles.cardTop}>
              <LevelBadge level={item.level} size="sm" />
              <View style={styles.cardInfo}>
                <Text style={styles.cardName}>{item.name}</Text>
                <Text style={styles.cardSub}>{item.school} · {item.grade}</Text>
                <Text style={[styles.cardMission, { color: Colors.mission[item.currentMission] }]}>
                  {MISSION_LABELS[item.currentMission]}
                </Text>
              </View>
              <View style={styles.cardRight}>
                <Text style={styles.lastActive}>{item.lastActive}</Text>
                <TouchableOpacity style={styles.resetBtn} onPress={() => handleResetPassword(item)}>
                  <Text style={styles.resetBtnText}>비밀번호{'\n'}초기화</Text>
                </TouchableOpacity>
              </View>
            </View>
            <View style={styles.abilityRow}>
              {[
                { label: '이해력', value: item.comprehension, color: Colors.ability.comprehension },
                { label: '추론력', value: item.reasoning,     color: Colors.ability.reasoning },
                { label: '계산력', value: item.calculation,   color: Colors.ability.calculation },
              ].map(({ label, value, color }) => (
                <View key={label} style={styles.abilityStat}>
                  <Text style={[styles.abilityValue, { color }]}>{value}</Text>
                  <Text style={styles.abilityLabel}>{label}</Text>
                </View>
              ))}
            </View>
            <Text style={styles.phoneText}>📱 {item.phone}</Text>
          </View>
        )}
        ListEmptyComponent={<Text style={styles.empty}>검색 결과가 없습니다.</Text>}
      />

      {/* 학생 등록 모달 */}
      <Modal visible={showAddModal} animationType="slide" transparent>
        <View style={styles.modalOverlay}>
          <View style={styles.modalBox}>
            <ScrollView showsVerticalScrollIndicator={false}>
              <Text style={styles.modalTitle}>학생 등록</Text>
              <Text style={styles.modalDesc}>등록 후 초기 비밀번호: math1234</Text>

              <Text style={styles.modalLabel}>이름 *</Text>
              <TextInput style={styles.modalInput} placeholder="학생 이름" placeholderTextColor={Colors.subtext}
                value={newName} onChangeText={setNewName} />

              <Text style={styles.modalLabel}>핸드폰번호 (아이디) *</Text>
              <TextInput style={styles.modalInput} placeholder="01012345678" placeholderTextColor={Colors.subtext}
                value={newPhone} onChangeText={setNewPhone} keyboardType="number-pad" maxLength={11} />

              <Text style={styles.modalLabel}>학교 *</Text>
              <TextInput style={styles.modalInput} placeholder="예) 오성중학교" placeholderTextColor={Colors.subtext}
                value={newSchool} onChangeText={setNewSchool} />

              <Text style={styles.modalLabel}>학년 *</Text>
              <View style={styles.gradeRow}>
                {GRADE_OPTIONS.map(g => (
                  <TouchableOpacity
                    key={g}
                    style={[styles.gradeChip, newGrade === g && styles.gradeChipActive]}
                    onPress={() => setNewGrade(g)}
                  >
                    <Text style={[styles.gradeChipText, newGrade === g && styles.gradeChipTextActive]}>{g}</Text>
                  </TouchableOpacity>
                ))}
              </View>

              <View style={styles.modalBtns}>
                <TouchableOpacity style={styles.cancelBtn} onPress={() => { resetForm(); setShowAddModal(false) }}>
                  <Text style={styles.cancelText}>취소</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.confirmBtn} onPress={handleAddStudent} disabled={addLoading}>
                  {addLoading
                    ? <ActivityIndicator color={Colors.white} />
                    : <Text style={styles.confirmText}>등록 완료</Text>}
                </TouchableOpacity>
              </View>
            </ScrollView>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: Colors.bg },
  topBar: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 20, paddingTop: 20, marginBottom: 4 },
  pageTitle: { color: Colors.white, fontSize: 22, fontWeight: '800' },
  addBtn: { backgroundColor: Colors.primary, borderRadius: 8, paddingVertical: 8, paddingHorizontal: 14 },
  addBtnText: { color: Colors.white, fontSize: 13, fontWeight: '700' },
  countRow: { paddingHorizontal: 20, marginBottom: 12 },
  countText: { color: Colors.subtext, fontSize: 13 },
  countMax: { color: Colors.border },
  search: { backgroundColor: Colors.card, color: Colors.white, borderRadius: 10, padding: 12, marginHorizontal: 20, marginBottom: 16, borderWidth: 1, borderColor: Colors.border },
  list: { paddingHorizontal: 20, paddingBottom: 32 },
  card: { backgroundColor: Colors.card, borderRadius: 14, padding: 16, marginBottom: 10 },
  cardTop: { flexDirection: 'row', alignItems: 'flex-start', marginBottom: 12 },
  cardInfo: { flex: 1, marginLeft: 12 },
  cardName: { color: Colors.white, fontSize: 15, fontWeight: '700' },
  cardSub: { color: Colors.subtext, fontSize: 12, marginTop: 2 },
  cardMission: { fontSize: 12, marginTop: 2 },
  cardRight: { alignItems: 'flex-end', gap: 6 },
  lastActive: { color: Colors.subtext, fontSize: 12 },
  resetBtn: { backgroundColor: '#2a1a1a', borderRadius: 6, paddingVertical: 4, paddingHorizontal: 8, borderWidth: 1, borderColor: '#ff4444' },
  resetBtnText: { color: '#ff6666', fontSize: 10, fontWeight: '700', textAlign: 'center' },
  abilityRow: { flexDirection: 'row', justifyContent: 'space-around', marginBottom: 8 },
  abilityStat: { alignItems: 'center' },
  abilityValue: { fontSize: 20, fontWeight: '900' },
  abilityLabel: { color: Colors.subtext, fontSize: 11, marginTop: 2 },
  phoneText: { color: Colors.subtext, fontSize: 12, textAlign: 'right' },
  empty: { color: Colors.subtext, textAlign: 'center', marginTop: 40 },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'flex-end' },
  modalBox: { backgroundColor: Colors.card, borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 24, maxHeight: '85%' },
  modalTitle: { color: Colors.white, fontSize: 20, fontWeight: '800', marginBottom: 4 },
  modalDesc: { color: Colors.secondary, fontSize: 13, marginBottom: 20 },
  modalLabel: { color: Colors.subtext, fontSize: 13, marginBottom: 6, marginTop: 14 },
  modalInput: { backgroundColor: Colors.bg, color: Colors.white, borderRadius: 10, padding: 14, fontSize: 15, borderWidth: 1, borderColor: Colors.border },
  gradeRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 4 },
  gradeChip: { borderRadius: 8, paddingVertical: 8, paddingHorizontal: 16, backgroundColor: Colors.bg, borderWidth: 1, borderColor: Colors.border },
  gradeChipActive: { backgroundColor: Colors.primary, borderColor: Colors.primary },
  gradeChipText: { color: Colors.subtext, fontSize: 14, fontWeight: '600' },
  gradeChipTextActive: { color: Colors.white },
  modalBtns: { flexDirection: 'row', gap: 12, marginTop: 28, marginBottom: 8 },
  cancelBtn: { flex: 1, borderRadius: 10, padding: 14, alignItems: 'center', backgroundColor: Colors.bg, borderWidth: 1, borderColor: Colors.border },
  cancelText: { color: Colors.subtext, fontSize: 15, fontWeight: '700' },
  confirmBtn: { flex: 2, borderRadius: 10, padding: 14, alignItems: 'center', backgroundColor: Colors.primary },
  confirmText: { color: Colors.white, fontSize: 15, fontWeight: '700' },
})
