// ESLint 配置：Vue 3 + Node.js 环境
module.exports = {
  root: true,
  ignorePatterns: ['dist-*/', 'release/', 'node_modules/'],
  env: {
    browser: true,
    node: true,
    es2022: true
  },
  extends: [
    'eslint:recommended',
    'plugin:vue/vue3-recommended'
  ],
  parserOptions: {
    ecmaVersion: 2022,
    sourceType: 'module'
  },
  rules: {
    'vue/multi-word-component-names': 'off',
    'no-unused-vars': ['warn', { argsIgnorePattern: '^_' }],
    'no-console': 'off'
  },
  // Electron 主进程与 shared 使用 CommonJS
  overrides: [
    {
      files: ['src-electron/**/*.js', 'shared/**/*.js'],
      env: { node: true, commonjs: true, browser: false }
    }
  ]
}
