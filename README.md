# Analisis automatico de nomina

Aplicacion web con frontend y backend separados para importar nominas Excel/CSV, limpiar datos, validar calidad, calcular metricas y exportar resultados a Excel.

## Stack

- Frontend: React + Vite + Recharts
- Backend: FastAPI + Pandas
- Exportacion: Excel con openpyxl
- Base inicial: SQLite via SQLAlchemy, configurable para PostgreSQL con `DATABASE_URL`

## Estructura

```text
backend/
  app/
    api/routes.py
    core/columns.py
    db/
    services/
frontend/
  src/
    components/
    pages/
```

## Ejecutar backend

```bash
cd backend
python -m venv .venv
.venv\Scripts\activate
pip install -r requirements.txt
uvicorn app.main:app --reload
```

La API queda en `http://localhost:8000`.

## Ejecutar frontend

```bash
cd frontend
npm install
npm run dev
```

La app queda en `http://localhost:5173`.

## Ejecutar local completo

Backend:

```bash
cd backend
uvicorn app.main:app --reload --port 8000
```

Frontend:

```bash
cd frontend
npm run dev
```

Si el backend usa otro puerto, crear `frontend/.env.local`:

```env
VITE_API_URL=http://localhost:8001
```

## Desplegar en Vercel

El repo incluye `vercel.json`, `api/index.py` y `requirements.txt` para publicar el frontend y montar FastAPI en `/api`.

1. Importar este repositorio en Vercel.
2. Agregar la variable de entorno:

```env
VITE_API_URL=/api
```

3. Deploy.

Vercel ejecuta:

```bash
cd frontend && npm ci && npm run build
```

Nota: Vercel usa funciones serverless. Los archivos subidos y la base SQLite no quedan persistidos entre instancias; para uso productivo conviene mover almacenamiento y base de datos a servicios externos. Para uso local sigue funcionando con `backend/storage`.

## Desplegar en GitHub Pages

GitHub Pages publica solo el frontend estatico. Para uso local, el frontend de Pages puede conectarse a la API que cada usuario levanta en su propia computadora.

1. En GitHub, ir a `Settings > Pages` y elegir `GitHub Actions`.
2. Si se quiere usar API local, no hace falta crear ninguna variable: el frontend usa por defecto:

```env
VITE_API_URL=http://localhost:8000
```

3. Hacer push a `main`. El workflow `.github/workflows/deploy-pages.yml` compila el frontend con la ruta base del repositorio y lo publica en Pages.
4. En la computadora de cada usuario, ejecutar:

```powershell
.\start-api-local.ps1
```

5. Abrir el link de GitHub Pages y usar el dashboard normalmente. Los archivos se cargan contra `localhost`, por lo que se procesan en la maquina del usuario.

Si en algun momento la API vive en un servidor, crear la variable del repo `VITE_API_URL` con la URL publicada, por ejemplo:

```env
VITE_API_URL=https://TU-PROYECTO.vercel.app/api
```

## Configuracion de columnas

La configuracion central esta en `backend/app/core/columns.py`:

- `CORE_COLUMNS`
- `OPTIONAL_COLUMNS`
- `USER_COLUMNS`
- `INCLUDE_USER_COLUMNS = False`

En V1 las columnas de usuarios se excluyen. Para incluirlas mas adelante, cambiar `INCLUDE_USER_COLUMNS` a `True`; el pipeline usa `active_columns()` para evitar tocar la logica principal.

## Rutas principales

- `POST /upload`
- `GET /dashboard`
- `GET /validations`
- `POST /dynamic-analysis`
- `GET /export`
- `GET /columns`
