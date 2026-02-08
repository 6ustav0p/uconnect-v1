# Flujo de carga PEP (Front) con Textract + S3

## Objetivo
Permitir subir PDFs del PEP, procesarlos con Textract y guardar el `rawText` asociado a un programa académico en la base de datos.

---

## Flujo esperado
1. Seleccionar uno o varios PDF.
2. Llamar `POST /api/admin/pep-uploads/init` con `files[]` para recibir URLs presignadas.
3. Subir cada PDF directamente a S3 usando la URL presignada.
4. Mostrar lista de archivos cargados.
5. Permitir elegir el **programa académico** (`programaId`) para cada archivo.
6. Enviar `POST /api/admin/pep-uploads/complete` con `uploadId` + `mappings[]`.
7. Mostrar estado con `GET /api/admin/pep-uploads/:uploadId`.

---

## Endpoint 1: Inicializar upload
**POST** `/api/admin/pep-uploads/init`

### Body
```json
{
  "files": [
    { "fileName": "PEP_ambiental.pdf", "contentType": "application/pdf" }
  ]
}
```

### Respuesta
```json
{
  "data": {
    "uploadId": "uuid",
    "items": [
      {
        "fileName": "PEP_ambiental.pdf",
        "contentType": "application/pdf",
        "s3Key": "ingenierias/<uploadId>/pdf/PEP_ambiental.pdf",
        "uploadUrl": "https://s3-presigned-url"
      }
    ]
  }
}
```

---

## Subida a S3
Para cada archivo:
- Hacer `PUT` a `uploadUrl`
- Enviar el PDF en el body
- Header: `Content-Type: application/pdf`

---

## Endpoint 2: Completar upload (mapeo de programa)
**POST** `/api/admin/pep-uploads/complete`

### Body
```json
{
  "uploadId": "uuid",
  "mappings": [
    {
      "s3Key": "ingenierias/<uploadId>/pdf/PEP_ambiental.pdf",
      "programaId": "16"
    }
  ]
}
```

---

## Endpoint 3: Estado del procesamiento
**GET** `/api/admin/pep-uploads/:uploadId`

### Estado por archivo
- `queued`
- `processing`
- `done`
- `failed`

---

## UI sugerida
- Tabla con columnas: Archivo, Programa (select), Estado.
- Botón “Procesar” → llama `complete`.
- Polling cada 5s a `/pep-uploads/:uploadId` hasta `completed`.

---

## Notas
- El backend guarda el texto completo (`rawText`) en Mongo y en S3.
- El `programaId` se asigna antes de procesar.
