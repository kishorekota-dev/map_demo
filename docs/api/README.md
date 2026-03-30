# API Overview

The active API documentation in this repository is split between service-owned route definitions and the OpenAPI artifacts under `docs/api/openapi/`.

## Primary Entry Points

- API Gateway: `http://localhost:3001/api`
- Chat Backend: `http://localhost:3006/api`
- Banking Service: `http://localhost:3005/api/v1`
- NLU Service: `http://localhost:3003/api/nlu`
- NLU compatibility endpoints for legacy NLP callers: `http://localhost:3003/api/process` and `http://localhost:3003/api/nlp/process`

## Notes

- The customer frontend uses the API gateway for chat and session REST calls during the standard local workflow.
- Login remains a direct call from the frontend to the banking service.
- Service-specific OpenAPI files, when present, live under `docs/api/openapi/`.