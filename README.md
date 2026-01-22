# Langflow VS Code Plugin

Browse Langflow projects and flows, inspect flow components, and edit component Python code directly from VS Code.

<img width="1234" height="980" alt="Screenshot 2026-01-21 at 23 47 24" src="https://github.com/user-attachments/assets/98e1cc1b-5436-478d-a81c-ebad3aa33473" />


## Usage

1. Use the "Connection" view in the Langflow sidebar to set the base URL and API key.
2. Set `Langflow > Base Url` in settings if you prefer to manage it via Settings.
3. Expand the "Projects & Flows" view to select a project, then expand the flow to see components.
4. Pick a component under the flow to open its Python code.
5. Save the file to push changes back to Langflow.

## Testing locally

1. Run `npm install`.
2. Run `npm run compile`.
3. Open this folder in VS Code and press `F5` to launch the Extension Development Host.
4. In the Dev Host:
   - Run `Langflow: Connect` and enter your API key.
   - Set `langflow.baseUrl` in Settings if needed.
   - Expand the "Projects & Flows" view, select a project and expand a flow.
   - Click a component under the flow to open code.
   - Edit and save to push updates back to Langflow.

Notes:
- You need a reachable Langflow instance and a valid API key.
- There are no automated tests yet; this is manual validation via the Dev Host.

## Notes

- The extension uses Langflow DevOps API endpoints (`/api/v1/...`).
- If your Langflow instance uses different endpoints, adjust the client in `src/langflowClient.ts`.
