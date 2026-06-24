const { getDefaultConfig } = require('expo/metro-config')
const path = require('path')

const projectRoot = __dirname
const monorepoRoot = path.resolve(projectRoot, '../..')

const config = getDefaultConfig(projectRoot)

// 모노레포 루트의 packages/* 를 Metro가 감시하도록 설정
config.watchFolders = [monorepoRoot]

// node_modules 탐색 경로: 앱 로컬 → 모노레포 루트 순서로
config.resolver.nodeModulesPaths = [
  path.resolve(projectRoot, 'node_modules'),
  path.resolve(monorepoRoot, 'node_modules'),
]

module.exports = config
