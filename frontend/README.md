# audit-chart-frontend — the MedCode AI coder web app

React + TypeScript + Vite UI for the medical-coding audit dashboard: case list,
case review with ICD-10/ICD-9 code columns, approve/reopen, AI suggestions,
analytics, agent chat, and the admin/training surface. It talks to
**medcode-api** only; the API contract lives in that repo
(`docs/api-contract.md` + `docs/types.ts`).

## Run it

**With Docker, whole system, one command** — the root [`docker-compose.yml`](../docker-compose.yml) runs this UI
(built and served by nginx, with `/api` proxied to the backend) plus the two
backends, RAG and Postgres. From this folder:

```bash
cd .. && cp .env.example .env && docker compose up -d --build
```

The app comes up on <http://localhost:8080>.

**Natively**, against a backend you run yourself:

```bash
npm install --legacy-peer-deps   # see the note below
npm run dev                      # :5173
```

`VITE_API_BASE_URL` (in `.env`) must include the `/api` prefix — e.g.
`http://localhost:8001/api`. The Docker image is built with the relative `/api`
instead, so one image works in every environment.

> **`--legacy-peer-deps` is required**: `eslint-plugin-jsx-a11y@6.10.2`
> peer-requires eslint ≤9 while devDependencies pin eslint 10. It affects lint
> only — `tsc` and vite build fine.

---

The rest of this file is the original Vite template documentation.

## React + TypeScript + Vite

This template provides a minimal setup to get React working in Vite with HMR and some ESLint rules.

Currently, two official plugins are available:

- [@vitejs/plugin-react](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react) uses [Oxc](https://oxc.rs)
- [@vitejs/plugin-react-swc](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react-swc) uses [SWC](https://swc.rs/)

## React Compiler

The React Compiler is not enabled on this template because of its impact on dev & build performances. To add it, see [this documentation](https://react.dev/learn/react-compiler/installation).

## Expanding the ESLint configuration

If you are developing a production application, we recommend updating the configuration to enable type-aware lint rules:

```js
export default defineConfig([
  globalIgnores(['dist']),
  {
    files: ['**/*.{ts,tsx}'],
    extends: [
      // Other configs...

      // Remove tseslint.configs.recommended and replace with this
      tseslint.configs.recommendedTypeChecked,
      // Alternatively, use this for stricter rules
      tseslint.configs.strictTypeChecked,
      // Optionally, add this for stylistic rules
      tseslint.configs.stylisticTypeChecked,

      // Other configs...
    ],
    languageOptions: {
      parserOptions: {
        project: ['./tsconfig.node.json', './tsconfig.app.json'],
        tsconfigRootDir: import.meta.dirname,
      },
      // other options...
    },
  },
])

```

You can also install [eslint-plugin-react-x](https://github.com/Rel1cx/eslint-react/tree/main/packages/plugins/eslint-plugin-react-x) and [eslint-plugin-react-dom](https://github.com/Rel1cx/eslint-react/tree/main/packages/plugins/eslint-plugin-react-dom) for React-specific lint rules:

```js
// eslint.config.js
import reactX from 'eslint-plugin-react-x'
import reactDom from 'eslint-plugin-react-dom'

export default defineConfig([
  globalIgnores(['dist']),
  {
    files: ['**/*.{ts,tsx}'],
    extends: [
      // Other configs...
      // Enable lint rules for React
      reactX.configs['recommended-typescript'],
      // Enable lint rules for React DOM
      reactDom.configs.recommended,
    ],
    languageOptions: {
      parserOptions: {
        project: ['./tsconfig.node.json', './tsconfig.app.json'],
        tsconfigRootDir: import.meta.dirname,
      },
      // other options...
    },
  },
])

```
