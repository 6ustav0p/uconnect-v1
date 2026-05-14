# Docker deployment

This repository contains the backend image and the compose file for backend,
frontend and MongoDB.

## 1. Prepare environment files

Backend:

```bash
cp .env.example .env
```

Fill the real values in `.env`. Keep `.env` out of git.

Frontend variables are passed during the Docker build from the same `.env` file:

```bash
NEXT_PUBLIC_API_URL=http://localhost:3000/api
NEXT_PUBLIC_API_BASE_URL=http://localhost:3000/api
NEXT_PUBLIC_FIREBASE_API_KEY=
NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=
NEXT_PUBLIC_FIREBASE_PROJECT_ID=
NEXT_PUBLIC_FIREBASE_APP_ID=
```

## 2. Point compose to the frontend repo

If both repos are cloned under the same parent folder, the default frontend
context works:

```bash
docker compose up --build
```

If the frontend is elsewhere, set `FRONTEND_CONTEXT`:

```bash
FRONTEND_CONTEXT="C:/Users/fabra/Documents/GitHub/microfrontuconnectv1" docker compose up --build
```

On PowerShell:

```powershell
$env:FRONTEND_CONTEXT="C:/Users/fabra/Documents/GitHub/microfrontuconnectv1"
docker compose up --build
```

## 3. Services

- Backend API: `http://localhost:3000/api/health`
- Frontend: `http://localhost:3001`
- MongoDB data volume: `mongo-data`

For production, set `NEXT_PUBLIC_API_URL` and `CORS_ORIGIN` to the real public
domains before building the frontend image.
