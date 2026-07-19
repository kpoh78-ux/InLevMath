import { Tabs } from 'expo-router'
import { Colors } from '../../constants/colors'

export default function StudentLayout() {
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarStyle: { backgroundColor: Colors.card, borderTopColor: Colors.border },
        tabBarActiveTintColor: Colors.primary,
        tabBarInactiveTintColor: Colors.subtext,
      }}
    >
      <Tabs.Screen name="index"     options={{ title: '대시보드', tabBarIcon: () => null }} />
      <Tabs.Screen name="mission"   options={{ title: '미션 입력', tabBarIcon: () => null }} />
      <Tabs.Screen name="inventory" options={{ title: '🎒 보관창고', tabBarIcon: () => null }} />
      <Tabs.Screen name="history"   options={{ title: '이력',      tabBarIcon: () => null }} />
    </Tabs>
  )
}
