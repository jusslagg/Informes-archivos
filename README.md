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
