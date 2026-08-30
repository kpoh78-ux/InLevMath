import { Tabs } from 'expo-router'
import { Colors } from '../../constants/colors'

export default function StudentLayout() {
  return (
    // 미션 결과 입력은 선생님 웹으로 옮겼다. 문제 수와 맞은 개수를 학생이 스스로
    // 적으면 확인할 방법이 없어, 선생님이 옆에서 본 것을 적는 쪽이 맞다.
    // 학생이 하는 채점은 학습지·교재뿐이고 그것은 저장된 정답으로 자동 채점된다.
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarStyle: { backgroundColor: Colors.card, borderTopColor: Colors.border },
        tabBarActiveTintColor: Colors.primary,
        tabBarInactiveTintColor: Colors.subtext,
      }}
    >
      <Tabs.Screen name="index"     options={{ title: '대시보드', tabBarIcon: () => null }} />
      <Tabs.Screen name="inventory" options={{ title: '🎒 보관창고', tabBarIcon: () => null }} />
      <Tabs.Screen name="history"   options={{ title: '이력',      tabBarIcon: () => null }} />

      {/* 탭이 아니라 화면 안에서 열리는 경로 — 선언하지 않으면 expo-router가
          파일명 그대로("worksheet-omr" 등)를 탭으로 자동 추가한다 */}
      <Tabs.Screen name="worksheet-omr"   options={{ href: null }} />
      <Tabs.Screen name="textbook-omr"    options={{ href: null }} />
      <Tabs.Screen name="change-password" options={{ href: null }} />
    </Tabs>
  )
}
