import js from '@eslint/js';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    // tech-design.md 铁律：领域层禁止任何 IO / 环境依赖 import
    files: ['src/domain/**/*.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['@tauri-apps/*', '../io/*', '../io', 'node:*', 'fs', 'path', 'os'],
              message: 'Domain layer is pure: no IO, no Tauri, no Node builtins (tech-design.md).',
            },
          ],
        },
      ],
      'no-restricted-globals': [
        'error',
        { name: 'fetch', message: 'Domain layer is pure.' },
        { name: 'localStorage', message: 'Domain layer is pure.' },
      ],
    },
  },
  {
    ignores: ['dist/**', 'src-tauri/**', 'prototypes/**'],
  },
);
