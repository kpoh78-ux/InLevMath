import { Tabs } from 'expo-router'
import { Colors } from '../../constants/colors'

export default function TeacherLayout() {
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarStyle: { backgroundColor: Colors.card, borderTopColor: Colors.border },
        tabBarActiveTintColor: Colors.secondary,
        tabBarInactiveTintColor: Colors.subtext,
      }}
    >
      <Tabs.Screen name="index"    options={{ title: '대시보드' }} />
      <Tabs.Screen name="students" options={{ title: '학생 관리' }} />
    </Tabs>
  )
}
