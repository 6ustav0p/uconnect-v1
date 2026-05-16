# Guia de despliegue en VPS con Docker

Este proyecto ya esta dockerizado. La VPS solo necesita tener Docker instalado,
recibir las credenciales del equipo de desarrollo y ejecutar `docker compose`.

## Requisitos en la VPS

- Docker Engine instalado.
- Docker Compose disponible con el comando `docker compose`.
- Acceso al repositorio del backend.
- Acceso al repositorio del frontend.
- Puertos abiertos para la aplicacion:
  - `3000` para el backend API.
  - `3001` para el frontend.

Si se usara Nginx, Apache, Cloudflare o un proxy reverso, estos puertos pueden
quedar internos y exponerse por dominio.

## Repositorios necesarios

Backend:

```bash
git clone <URL_DEL_REPO_BACKEND> uconnect-v1
```

Frontend:

```bash
git clone <URL_DEL_REPO_FRONTEND> microfrontuconnectv1
```

La estructura recomendada es que ambos repos queden en la misma carpeta padre:

```text
/opt/uconnect/
  uconnect-v1/
  microfrontuconnectv1/
```

## Variables de entorno

El archivo `.env` real NO se sube al repositorio. El equipo de desarrollo debe
entregar las credenciales y valores productivos.

En la VPS, dentro del repo backend:

```bash
cd /opt/uconnect/uconnect-v1
cp .env.example .env
```

Luego pegar en `.env` los valores entregados por desarrollo.

Variables importantes:

```env
NODE_ENV=production
PORT=3000
CORS_ORIGIN=https://DOMINIO_DEL_FRONTEND

MONGODB_URI=mongodb://mongo:27017/uconnect

OPENAI_API_KEY=
OPENAI_VECTOR_STORE_ID=

AWS_REGION=
AWS_ACCESS_KEY_ID=
AWS_SECRET_ACCESS_KEY=
TEXTRACT_S3_BUCKET=
TEXTRACT_S3_PREFIX=

ADMIN_AUTH_MODE=firebase
FIREBASE_SERVICE_ACCOUNT_BASE64=
ADMIN_EMAIL_ALLOWLIST=
ADMIN_UID_ALLOWLIST=

NEXT_PUBLIC_API_URL=https://DOMINIO_DEL_BACKEND/api
NEXT_PUBLIC_API_BASE_URL=https://DOMINIO_DEL_BACKEND/api
NEXT_PUBLIC_FIREBASE_API_KEY=
NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=
NEXT_PUBLIC_FIREBASE_PROJECT_ID=
NEXT_PUBLIC_FIREBASE_APP_ID=
```

Para pruebas sin dominio, se puede usar:

```env
CORS_ORIGIN=http://IP_DE_LA_VPS:3001
NEXT_PUBLIC_API_URL=http://IP_DE_LA_VPS:3000/api
NEXT_PUBLIC_API_BASE_URL=http://IP_DE_LA_VPS:3000/api
```

## Levantar la aplicacion

Desde el repo backend:

```bash
cd /opt/uconnect/uconnect-v1
export FRONTEND_CONTEXT=/opt/uconnect/microfrontuconnectv1
docker compose up --build -d
```

Esto construye y levanta:

- `mongo`: base de datos MongoDB con volumen persistente.
- `api`: backend Node/Express en el puerto `3000`.
- `web`: frontend Next.js en el puerto `3001`.

## Verificar que todo este corriendo

```bash
docker compose ps
```

Probar backend:

```bash
curl http://localhost:3000/api/health
```

Probar frontend:

```bash
curl -I http://localhost:3001
```

URLs:

```text
Backend:  http://IP_DE_LA_VPS:3000/api/health
Frontend: http://IP_DE_LA_VPS:3001
```

## Logs

Ver todos los logs:

```bash
docker compose logs -f
```

Ver logs solo del backend:

```bash
docker compose logs -f api
```

Ver logs solo del frontend:

```bash
docker compose logs -f web
```

## Reiniciar servicios

```bash
docker compose restart
```

Reiniciar solo backend:

```bash
docker compose restart api
```

## Actualizar despliegue

Cuando haya cambios nuevos:

```bash
cd /opt/uconnect/uconnect-v1
git pull

cd /opt/uconnect/microfrontuconnectv1
git pull

cd /opt/uconnect/uconnect-v1
export FRONTEND_CONTEXT=/opt/uconnect/microfrontuconnectv1
docker compose up --build -d
```

Importante: si cambia `NEXT_PUBLIC_API_URL`, `NEXT_PUBLIC_API_BASE_URL` o alguna
variable `NEXT_PUBLIC_FIREBASE_*`, se debe reconstruir el frontend con
`docker compose up --build -d`.

## Apagar la aplicacion

```bash
docker compose down
```

Esto detiene los contenedores, pero conserva el volumen de MongoDB.

Para borrar tambien la base de datos local creada por Docker:

```bash
docker compose down -v
```

Usar `-v` solo si se quiere eliminar la data persistida.

## Notas de seguridad

- No subir `.env` al repositorio.
- Las credenciales reales las entrega el equipo de desarrollo.
- En produccion, usar dominios HTTPS para frontend y backend.
- Si se usa un proxy reverso, configurar `CORS_ORIGIN` con el dominio publico del frontend.
- Mantener backups si se usa el MongoDB local del compose como base productiva.
