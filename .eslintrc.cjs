module.exports = {
  extends: 'standard-with-typescript',
  ignorePatterns: [
    'dist/**/*',
    'coverage/**/*',
    'node_modules/**/*'
  ],
  parserOptions: {
    project: './tsconfig.eslint.json'
  }
}
