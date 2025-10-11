---
applyTo: '**'
---
This project goal was to build simple Chat Based Banking System that interacts with MCP for tool Calling and DialogueFlow for NLU and Agent AI Orchestration for responding to Customer Queries. The system is designed to demonstrate a basic banking workflow with security and compliance features.

Code Location:

POC ChatBot UI: 'poc-frontend'
POC ChatBot Backend: 'poc-chat-backend'
POC Bank Backend: 'poc-banking-service'
POC AI Orchestration: 'poc-ai-orchestrator'
POC MCP Service/Host: 'poc-mcp-service'
POC NLU Service: 'poc-nlu-service'



Any new modules should be created using convention 'poc-<module-name>'.

Coding Standards:
- TypeScript and JavaScript as primary languages.
- Frontend uses React with Material-UI.
- Frontend Components should be following Atomic Design principles.
- Backend uses Node.js with Express.


Create Deployment Scripts in folder 'deployment-scripts' for easy setup.


Use absolute path when running commands from root folder.
Prefer running in a single command vs multiple commands, using '&&' to chain commands.